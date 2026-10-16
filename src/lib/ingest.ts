import { createHash } from "crypto";
import {
  Prisma,
  type PrismaClient,
  PackagingLevel as PL,
  CodeType as CT,
  UploadStatus,
  UploadRowStatus,
  IssueSeverity,
  PoolStatus,
} from "@prisma/client";
import { prisma } from "./prisma";
import { parseOffersWorkbook } from "./excel";
import { validateRow } from "./validation";
import { toText } from "./parse";

type Db = PrismaClient | Prisma.TransactionClient;

const PRICE_ANOMALY_PCT = 40;

export type ImportSummary = {
  uploadId: string;
  filename: string;
  status: UploadStatus;
  rowCount: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  matchedRows: number;
  unmatchedRows: number;
  duplicateOf: string | null;
  unknownHeaders: string[];
  message: string;
};

export async function importOffersWorkbook(
  data: ArrayBuffer | Buffer,
  opts: { filename: string; uploadedBy?: string | null },
): Promise<ImportSummary> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  const parsed = await parseOffersWorkbook(buffer);

  // Rule: re-importing the same file must not create duplicate records.
  const existing = await prisma.uploadFile.findFirst({
    where: { sha256, status: { not: UploadStatus.FAILED } },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    const summary: ImportSummary = {
      uploadId: existing.id,
      filename: opts.filename,
      status: UploadStatus.DUPLICATE,
      rowCount: 0,
      validRows: 0,
      invalidRows: 0,
      duplicateRows: 0,
      matchedRows: 0,
      unmatchedRows: 0,
      duplicateOf: existing.id,
      unknownHeaders: parsed.unknownHeaders,
      message: `This exact file was already imported on ${existing.createdAt.toISOString()} — no new records were created.`,
    };
    const dup = await prisma.uploadFile.create({
      data: {
        filename: opts.filename,
        sha256,
        fileSize: buffer.byteLength,
        status: UploadStatus.DUPLICATE,
        message: summary.message,
        uploadedBy: opts.uploadedBy ?? null,
        rowCount: 0,
      },
    });
    await prisma.auditLog.create({
      data: {
        actor: opts.uploadedBy ?? null,
        action: "upload.duplicate",
        entityType: "UploadFile",
        entityId: dup.id,
        uploadFileId: dup.id,
        details: `Duplicate of ${existing.id}`,
      },
    });
    summary.uploadId = dup.id;
    return summary;
  }

  const upload = await prisma.uploadFile.create({
    data: {
      filename: opts.filename,
      sha256,
      fileSize: buffer.byteLength,
      uploadedBy: opts.uploadedBy ?? null,
      status: UploadStatus.PENDING,
    },
  });

  const summary: ImportSummary = {
    uploadId: upload.id,
    filename: opts.filename,
    status: UploadStatus.VALIDATED,
    rowCount: parsed.rows.length,
    validRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    matchedRows: 0,
    unmatchedRows: 0,
    duplicateOf: null,
    unknownHeaders: parsed.unknownHeaders,
    message: "",
  };

  if (parsed.unknownHeaders.length > 0) {
    await prisma.validationIssue.create({
      data: {
        uploadFileId: upload.id,
        code: "UNKNOWN_COLUMNS",
        message: `Ignored unrecognised column(s): ${parsed.unknownHeaders.join(", ")}. Use the published template.`,
        severity: IssueSeverity.WARNING,
      },
    });
  }

  const seenKeys = new Set<string>();

  for (const row of parsed.rows) {
    const v = validateRow(row.values);
    let rowStatus: UploadRowStatus = UploadRowStatus.OK;
    const issues: {
      code: string;
      message: string;
      severity: IssueSeverity;
      field?: string;
    }[] = v.issues.map((i) => ({
      code: i.code,
      message: i.message,
      severity: i.severity as IssueSeverity,
      field: i.field,
    }));

    const dedupeKey = [
      v.supplierName.toLowerCase(),
      v.originalCode || v.internalSku || "",
      v.normalized.packagingLevel,
      v.normalized.price ?? "",
    ].join("|");

    let isDuplicate = false;
    if (seenKeys.has(dedupeKey)) {
      isDuplicate = true;
      rowStatus = UploadRowStatus.DUPLICATE;
      issues.push({
        code: "DUPLICATE_ROW",
        message: "Same supplier, code, packaging level and price as an earlier row in this file.",
        severity: IssueSeverity.WARNING,
      });
    } else {
      seenKeys.add(dedupeKey);
    }

    const hasError = issues.some((i) => i.severity === IssueSeverity.ERROR);
    if (hasError) rowStatus = UploadRowStatus.EXCEPTION;

    const rawJson = Object.fromEntries(
      Object.entries(row.values).map(([k, val]) => [k, toText(val)]),
    ) as Prisma.InputJsonValue;

    const uploadRow = await prisma.uploadRow.create({
      data: {
        uploadFileId: upload.id,
        rowNumber: row.rowNumber,
        rawJson,
        status: rowStatus,
      },
    });

    // Persist every issue against the row.
    for (const issue of issues) {
      await prisma.validationIssue.create({
        data: {
          uploadFileId: upload.id,
          uploadRowId: uploadRow.id,
          code: issue.code,
          message: issue.message,
          severity: issue.severity,
          field: issue.field,
        },
      });
    }

    if (hasError || isDuplicate) {
      if (hasError) summary.invalidRows++;
      if (isDuplicate) summary.duplicateRows++;
      continue; // no offer created
    }

    // --- Resolve related entities ---
    const supplier = await prisma.supplier.upsert({
      where: { name: v.supplierName },
      update: {},
      create: { name: v.supplierName },
    });

    const stockOwner = v.normalized.stockOwnerName
      ? await prisma.stockOwner.upsert({
          where: { name: v.normalized.stockOwnerName },
          update: {},
          create: { name: v.normalized.stockOwnerName },
        })
      : null;

    const productId = await findProductId(prisma, v);

    // Group this offer into a physical stock pool (§11.1) so several brokers
    // offering the same owner's lot are counted once, not summed.
    const lotRef =
      v.normalized.batchOrLotRef ?? v.normalized.uniqueLotReference ?? null;
    const pool = await resolveStockPool(prisma, productId, stockOwner, lotRef);

    if (!productId && (v.originalCode || v.internalSku)) {
      summary.unmatchedRows++;
      await prisma.validationIssue.create({
        data: {
          uploadFileId: upload.id,
          uploadRowId: uploadRow.id,
          code: "UNMATCHED_PRODUCT",
          message: `No product master match for "${
            v.originalCode || v.internalSku
          }". Resolve in the exception queue.`,
          severity: IssueSeverity.WARNING,
          field: "original_code",
        },
      });
    } else if (productId) {
      summary.matchedRows++;
    }

    // Price anomaly vs previous offer for same product+supplier.
    if (
      productId &&
      v.normalized.price !== null &&
      v.normalized.price > 0
    ) {
      const prev = await prisma.offer.findFirst({
        where: {
          productId,
          supplierId: supplier.id,
          price: { not: null },
        },
        orderBy: { createdAt: "desc" },
      });
      if (prev?.price) {
        const prevPrice = Number(prev.price);
        const change = ((v.normalized.price - prevPrice) / prevPrice) * 100;
        if (Math.abs(change) >= PRICE_ANOMALY_PCT) {
          await prisma.validationIssue.create({
            data: {
              uploadFileId: upload.id,
              uploadRowId: uploadRow.id,
              code: "PRICE_ANOMALY",
              message: `Price ${change > 0 ? "+" : ""}${change.toFixed(
                1,
              )}% vs last known ${prevPrice} ${prev.currency ?? ""}.`,
              severity: IssueSeverity.WARNING,
              field: "price",
            },
          });
        }
      }
    }

    const offer = await prisma.offer.create({
      data: {
        status:
          v.normalized.validUntil && v.normalized.validUntil < new Date()
            ? "EXPIRED"
            : "ACTIVE",
        offerId: v.normalized.supplierOfferId,
        supplierId: supplier.id,
        productId,
        stockOwnerId: stockOwner?.id ?? null,
        poolId: pool?.id ?? null,
        listDate: v.normalized.listDate,
        validUntil: v.normalized.validUntil,
        lastStockConfirmation: v.normalized.lastStockConfirmation,
        sourceFileId: upload.id,
        sourceRow: row.rowNumber,
        originalCode: v.originalCode || v.internalSku || "UNKNOWN",
        originalCodeType: v.codeType as CT,
        brand: v.normalized.brand,
        fragranceName: v.normalized.fragranceName,
        concentration: v.normalized.concentration,
        sizeMl: v.normalized.sizeMl,
        genderOrCategory: v.normalized.genderOrCategory,
        setContents: v.normalized.setContents,
        packagingLevel: (PL as Record<string, PL>)[v.normalized.packagingLevel as string] ?? PL.UNKNOWN,
        hasCap: v.normalized.hasCap,
        hasBox: v.normalized.hasBox,
        sealed: v.normalized.sealed,
        damageStatus: v.normalized.damageStatus,
        batchOrLotRef: v.normalized.batchOrLotRef,
        manufactureDate: v.normalized.manufactureDate,
        currency: v.normalized.currency,
        price:
          v.normalized.price === null
            ? null
            : new Prisma.Decimal(v.normalized.price),
        priceBasis: v.normalized.priceBasis
          ? ((PL as Record<string, PL>)[v.normalized.priceBasis] ?? null)
          : null,
        unitsPerCase: v.normalized.unitsPerCase,
        availableQuantity:
          v.normalized.availableQuantity === null
            ? null
            : new Prisma.Decimal(v.normalized.availableQuantity),
        quantityUnit: v.normalized.quantityUnit,
        moq: v.normalized.moq,
        orderMultiple: v.normalized.orderMultiple,
        priceTierMin: v.normalized.priceTierMin,
        priceTierMax: v.normalized.priceTierMax,
        stockCountry: v.normalized.stockCountry,
        warehouse: v.normalized.warehouse,
        countryOfOrigin: v.normalized.countryOfOrigin,
        incoterm: v.normalized.incoterm,
        namedPlace: v.normalized.namedPlace,
        readyDate: v.normalized.readyDate,
        leadTimeDays: v.normalized.leadTimeDays,
        paymentTerms: v.normalized.paymentTerms,
        freightInclusions: v.normalized.freightInclusions,
        permittedDestinations: v.normalized.permittedDestinations,
        permittedChannels: v.normalized.permittedChannels,
        usSuitability: v.normalized.usSuitability,
        authenticityDocs: v.normalized.authenticityDocs,
        stockOwnerRef: v.normalized.stockOwnerRef,
        uniqueLotReference: v.normalized.uniqueLotReference,
        stockConfidence: v.normalized.stockConfidence,
      },
    });

    await prisma.uploadRow.update({
      where: { id: uploadRow.id },
      data: { offerId: offer.id },
    });

    summary.validRows++;
  }

  const status =
    summary.validRows > 0 ? UploadStatus.VALIDATED : UploadStatus.FAILED;
  const message =
    summary.validRows > 0
      ? `Imported ${summary.validRows} offer(s). ${summary.invalidRows} invalid, ${summary.duplicateRows} duplicate, ${summary.unmatchedRows} unmatched.`
      : `No valid offers were imported. ${summary.invalidRows} invalid row(s), ${summary.duplicateRows} duplicate row(s).`;

  await prisma.uploadFile.update({
    where: { id: upload.id },
    data: {
      status,
      rowCount: summary.rowCount,
      validRows: summary.validRows,
      invalidRows: summary.invalidRows + summary.duplicateRows,
      message,
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: opts.uploadedBy ?? null,
      action: "upload.imported",
      entityType: "UploadFile",
      entityId: upload.id,
      uploadFileId: upload.id,
      details: message,
    },
  });

  summary.status = status;
  summary.message = message;
  return summary;
}

// Resolve (or create) the physical stock pool an offer belongs to (§11.1).
// A known owner + lot is a CONFIRMED pool; a known owner without a lot is
// POSSIBLE (the same owner may hold several parcels). No owner means the offer
// is left unpooled and reported separately as possible overlap.
async function resolveStockPool(
  db: Db,
  productId: string | null,
  stockOwner: { id: string; name: string } | null,
  lotReference: string | null,
): Promise<{ id: string; status: PoolStatus } | null> {
  if (!stockOwner) return null;
  const status = lotReference ? PoolStatus.CONFIRMED : PoolStatus.POSSIBLE;
  const existing = await db.stockPool.findFirst({
    where: { productId, stockOwnerId: stockOwner.id, lotReference },
    select: { id: true, status: true },
  });
  if (existing) return { id: existing.id, status: existing.status };
  const label = lotReference
    ? `${stockOwner.name} · ${lotReference}`
    : `${stockOwner.name} (lot unknown)`;
  const created = await db.stockPool.create({
    data: {
      productId,
      stockOwnerId: stockOwner.id,
      lotReference,
      label,
      status,
    },
    select: { id: true, status: true },
  });
  return { id: created.id, status: created.status };
}

async function findProductId(
  db: Db,
  v: { internalSku: string | null; originalCode: string; gtin14: string | null },
): Promise<string | null> {
  if (v.internalSku) {
    const p = await db.product.findUnique({
      where: { internalSku: v.internalSku },
      select: { id: true },
    });
    if (p) return p.id;
  }
  if (v.gtin14) {
    const p = await db.product.findUnique({
      where: { gtin14: v.gtin14 },
      select: { id: true },
    });
    if (p) return p.id;
  }
  const codes = [v.originalCode, v.gtin14].filter(Boolean) as string[];
  if (codes.length > 0) {
    const alias = await db.barcodeAlias.findFirst({
      where: { code: { in: codes } },
      select: { productId: true },
    });
    if (alias) return alias.productId;
  }
  return null;
}
