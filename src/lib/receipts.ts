// Goods receipts and supplier claims (§18).
//
// The brief ranks suppliers on fill rate, on-time delivery and claims as well as
// price. Those dimensions need physical records, not estimates: what actually
// arrived against an order, when it arrived versus the promised date, and what
// went wrong. This module owns those records and the metrics derived from them.

import { prisma } from "./prisma";
import type { ClaimStatus, ClaimType } from "@prisma/client";

export const CLAIM_TYPES = [
  "SHORTAGE",
  "DAMAGE",
  "QUALITY",
  "LATE",
  "RETURN",
  "OTHER",
] as const satisfies readonly ClaimType[];

export const CLAIM_STATUSES = ["OPEN", "RESOLVED", "REJECTED"] as const satisfies readonly ClaimStatus[];

export type ReceiptLineInput = {
  orderLineId?: string | null;
  orderedUnits?: number | string | null;
  receivedUnits?: number | string | null;
  rejectedUnits?: number | string | null;
  notes?: string | null;
};

export type CreateReceiptInput = {
  orderId: string;
  receiptDate: Date | string;
  expectedDate?: Date | string | null;
  reference?: string | null;
  carrier?: string | null;
  notes?: string | null;
  receivedBy?: string | null;
  lines: ReceiptLineInput[];
};

export type CreateClaimInput = {
  supplierId: string;
  orderId?: string | null;
  receiptId?: string | null;
  type?: string | null;
  units?: number | string | null;
  amountUsd?: number | string | null;
  description: string;
  openedDate?: Date | string | null;
  createdBy?: string | null;
};

function toInt(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function toNum(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function claimType(value: string | null | undefined): ClaimType {
  const v = (value ?? "OTHER").toUpperCase();
  return (CLAIM_TYPES as readonly string[]).includes(v) ? (v as ClaimType) : "OTHER";
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

export async function createReceipt(input: CreateReceiptInput) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: input.orderId },
    include: { lines: true },
  });
  if (!order) throw new Error("Unknown order for this receipt.");

  const receiptDate = toDate(input.receiptDate);
  if (!receiptDate) throw new Error("A receipt needs an arrival date.");

  const lineById = new Map(order.lines.map((l) => [l.id, l]));
  const lines = (input.lines ?? [])
    .map((l) => {
      const source = l.orderLineId ? lineById.get(l.orderLineId) : undefined;
      const orderedUnits =
        l.orderedUnits === null || l.orderedUnits === undefined
          ? (source?.units ?? 0)
          : toInt(l.orderedUnits, 0);
      const receivedUnits = Math.max(0, toInt(l.receivedUnits, 0));
      const rejectedUnits = Math.max(0, toInt(l.rejectedUnits, 0));
      return {
        orderLineId: l.orderLineId ?? null,
        orderedUnits: Math.max(0, orderedUnits),
        receivedUnits,
        rejectedUnits,
        notes: l.notes?.trim() || null,
      };
    })
    .filter((l) => l.receivedUnits > 0 || l.rejectedUnits > 0 || l.orderLineId !== null);

  if (lines.length === 0) {
    throw new Error("A receipt needs at least one line with received or rejected units.");
  }

  const expectedDate = toDate(input.expectedDate) ?? order.expectedDate;

  const receipt = await prisma.goodsReceipt.create({
    data: {
      orderId: order.id,
      supplierId: order.supplierId,
      reference: input.reference?.trim() || null,
      receiptDate,
      expectedDate,
      carrier: input.carrier?.trim() || null,
      notes: input.notes?.trim() || null,
      receivedBy: input.receivedBy ?? null,
      lines: { create: lines },
    },
    include: { lines: true },
  });

  await prisma.auditLog.create({
    data: {
      actor: input.receivedBy ?? "web",
      action: "receipt.created",
      entityType: "GoodsReceipt",
      entityId: receipt.id,
      after: {
        order: order.reference,
        receiptDate: receiptDate.toISOString().slice(0, 10),
        receivedUnits: lines.reduce((s, l) => s + l.receivedUnits, 0),
        rejectedUnits: lines.reduce((s, l) => s + l.rejectedUnits, 0),
      },
    },
  });

  return receipt;
}

export async function listReceipts(limit = 200) {
  return prisma.goodsReceipt.findMany({
    orderBy: { receiptDate: "desc" },
    take: limit,
    include: {
      supplier: { select: { name: true } },
      order: { select: { reference: true } },
      _count: { select: { lines: true } },
    },
  });
}

export async function getOrderReceipts(orderId: string) {
  return prisma.goodsReceipt.findMany({
    where: { orderId },
    orderBy: { receiptDate: "asc" },
    include: { lines: true },
  });
}

export type OrderReceiptSummary = {
  orders: {
    orderId: string;
    reference: string;
    expectedDate: Date | null;
    orderedUnits: number;
    receivedUnits: number;
    rejectedUnits: number;
    fillRatePct: number | null;
    receiptCount: number;
    onTime: boolean | null;
  }[];
};

/**
 * Fill rate for one order: units received divided by units ordered, across all
 * receipts. Partial deliveries accumulate, so three receipts of 40/100 units
 * yield a 100% fill only when all 100 have arrived. Rejected units do not count
 * as received.
 */
export function orderFillRate(
  orderedUnits: number,
  receipts: { lines: { receivedUnits: number; rejectedUnits: number }[] }[],
): { receivedUnits: number; rejectedUnits: number; fillRatePct: number | null } {
  let receivedUnits = 0;
  let rejectedUnits = 0;
  for (const r of receipts) {
    for (const l of r.lines) {
      receivedUnits += l.receivedUnits;
      rejectedUnits += l.rejectedUnits;
    }
  }
  const fillRatePct =
    orderedUnits > 0 ? Math.round((receivedUnits / orderedUnits) * 1000) / 10 : null;
  return { receivedUnits, rejectedUnits, fillRatePct };
}

function dayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export type SupplierDeliveryMetrics = {
  receiptCount: number;
  /** Receipts with a known promised date, i.e. those measurable for on-time. */
  receiptsWithExpected: number;
  onTimeCount: number;
  orderedUnits: number;
  receivedUnits: number;
  rejectedUnits: number;
  /** null when nothing measurable is on record yet. */
  onTimePct: number | null;
  fillRatePct: number | null;
  claimCount: number;
  openClaimCount: number;
  claimAmountUsd: number;
  claimUnits: number;
};

/**
 * Delivery metrics per supplier across all recorded receipts and claims. Orders
 * are collapsed so an order's ordered units are counted once even when it is
 * received in several partial deliveries.
 */
export async function getSupplierDeliveryMetrics(): Promise<Map<string, SupplierDeliveryMetrics>> {
  const [receipts, claims] = await Promise.all([
    prisma.goodsReceipt.findMany({
      select: {
        supplierId: true,
        orderId: true,
        receiptDate: true,
        expectedDate: true,
        lines: { select: { receivedUnits: true, rejectedUnits: true } },
      },
    }),
    prisma.supplierClaim.findMany({
      select: { supplierId: true, status: true, units: true, amountUsd: true },
    }),
  ]);

  // Ordered units per order, counted once.
  const orderIds = [...new Set(receipts.map((r) => r.orderId))];
  const orderLines = orderIds.length
    ? await prisma.orderLine.findMany({
        where: { orderId: { in: orderIds } },
        select: { orderId: true, units: true },
      })
    : [];
  const orderedByOrder = new Map<string, number>();
  for (const l of orderLines) orderedByOrder.set(l.orderId, (orderedByOrder.get(l.orderId) ?? 0) + l.units);

  const metrics = new Map<string, SupplierDeliveryMetrics>();
  const orderedCounted = new Map<string, Set<string>>();
  function entry(supplierId: string): SupplierDeliveryMetrics {
    let e = metrics.get(supplierId);
    if (!e) {
      e = {
        receiptCount: 0,
        receiptsWithExpected: 0,
        onTimeCount: 0,
        orderedUnits: 0,
        receivedUnits: 0,
        rejectedUnits: 0,
        onTimePct: null,
        fillRatePct: null,
        claimCount: 0,
        openClaimCount: 0,
        claimAmountUsd: 0,
        claimUnits: 0,
      };
      metrics.set(supplierId, e);
    }
    return e;
  }

  for (const r of receipts) {
    const e = entry(r.supplierId);
    e.receiptCount += 1;
    // Count this order's ordered units once per supplier.
    const seen = orderedCounted.get(r.supplierId) ?? new Set<string>();
    if (!seen.has(r.orderId)) {
      seen.add(r.orderId);
      orderedCounted.set(r.supplierId, seen);
      e.orderedUnits += orderedByOrder.get(r.orderId) ?? 0;
    }
    for (const l of r.lines) {
      e.receivedUnits += l.receivedUnits;
      e.rejectedUnits += l.rejectedUnits;
    }
    const promised = r.expectedDate;
    if (promised) {
      e.receiptsWithExpected += 1;
      if (dayStart(r.receiptDate) <= dayStart(promised)) e.onTimeCount += 1;
    }
  }

  for (const c of claims) {
    const e = entry(c.supplierId);
    e.claimCount += 1;
    if (c.status === "OPEN") e.openClaimCount += 1;
    if (c.units !== null) e.claimUnits += c.units;
    if (c.amountUsd !== null) e.claimAmountUsd += Number(c.amountUsd);
  }

  for (const e of metrics.values()) {
    e.onTimePct = e.receiptsWithExpected
      ? Math.round((e.onTimeCount / e.receiptsWithExpected) * 1000) / 10
      : null;
    e.fillRatePct = e.orderedUnits > 0 ? Math.round((e.receivedUnits / e.orderedUnits) * 1000) / 10 : null;
    e.claimAmountUsd = Math.round(e.claimAmountUsd * 100) / 100;
  }

  return metrics;
}

// ---------------------------------------------------------------------------
// Import a receipt from a workbook
// ---------------------------------------------------------------------------

function normCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const digits = String(code).replace(/\D/g, "");
  return digits.length >= 5 ? digits : null;
}

export type ReceiptImportSummary = {
  receiptId: string;
  matched: number;
  unmatched: { rowNumber: number; code: string | null }[];
  receivedUnits: number;
  rejectedUnits: number;
  receiptDate: string;
};

/**
 * Match a parsed receipt workbook to an order's lines by code and record a
 * receipt. Rows whose code matches no order line are reported back rather than
 * silently dropped.
 */
export async function importReceiptWorkbook(
  orderId: string,
  data: ArrayBuffer | Buffer,
  options: { receivedBy?: string | null; reference?: string | null; receiptDate?: Date | null } = {},
): Promise<ReceiptImportSummary> {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: orderId },
    include: { lines: true },
  });
  if (!order) throw new Error("Unknown order for this receipt.");

  const { parseReceiptWorkbook } = await import("./receipt-import");
  const parsed = await parseReceiptWorkbook(data);

  const lineByCode = new Map<string, (typeof order.lines)[number]>();
  for (const l of order.lines) {
    const c = normCode(l.originalCode);
    if (c && !lineByCode.has(c)) lineByCode.set(c, l);
  }

  const lines: ReceiptLineInput[] = [];
  const unmatched: { rowNumber: number; code: string | null }[] = [];
  const used = new Set<string>();
  for (const row of parsed.rows) {
    const c = normCode(row.code);
    const line = c ? lineByCode.get(c) : undefined;
    if (!line || used.has(line.id)) {
      unmatched.push({ rowNumber: row.rowNumber, code: row.code });
      continue;
    }
    used.add(line.id);
    lines.push({
      orderLineId: line.id,
      orderedUnits: line.units,
      receivedUnits: row.receivedUnits,
      rejectedUnits: row.rejectedUnits,
      notes: row.notes,
    });
  }

  if (lines.length === 0) {
    throw new Error("No rows in the file matched an order line by code.");
  }

  const receipt = await createReceipt({
    orderId,
    receiptDate: options.receiptDate ?? parsed.receiptDate ?? new Date(),
    expectedDate: parsed.expectedDate ?? order.expectedDate,
    reference: options.reference ?? null,
    receivedBy: options.receivedBy ?? null,
    lines,
  });

  return {
    receiptId: receipt.id,
    matched: lines.length,
    unmatched,
    receivedUnits: lines.reduce((s, l) => s + (Number(l.receivedUnits) || 0), 0),
    rejectedUnits: lines.reduce((s, l) => s + (Number(l.rejectedUnits) || 0), 0),
    receiptDate: receipt.receiptDate.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------
export async function createClaim(input: CreateClaimInput) {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw new Error("Unknown supplier for this claim.");
  const description = input.description?.trim();
  if (!description) throw new Error("A claim needs a description.");

  const claim = await prisma.supplierClaim.create({
    data: {
      supplierId: input.supplierId,
      orderId: input.orderId?.trim() || null,
      receiptId: input.receiptId?.trim() || null,
      type: claimType(input.type),
      units: input.units === null || input.units === undefined || input.units === "" ? null : toInt(input.units),
      amountUsd: toNum(input.amountUsd),
      description,
      openedDate: toDate(input.openedDate) ?? new Date(),
      createdBy: input.createdBy ?? null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: input.createdBy ?? "web",
      action: "claim.opened",
      entityType: "SupplierClaim",
      entityId: claim.id,
      after: { supplier: supplier.name, type: claim.type, amountUsd: claim.amountUsd?.toString() ?? null },
    },
  });

  return claim;
}

export async function listClaims(supplierId?: string, limit = 200) {
  return prisma.supplierClaim.findMany({
    where: supplierId ? { supplierId } : undefined,
    orderBy: { openedDate: "desc" },
    take: limit,
    include: { supplier: { select: { name: true } } },
  });
}

export async function updateClaimStatus(
  id: string,
  status: string,
  actor?: string | null,
) {
  const next = status.toUpperCase();
  if (!(CLAIM_STATUSES as readonly string[]).includes(next)) {
    throw new Error(`Unknown claim status: ${status}`);
  }
  const resolved = next !== "OPEN";
  const claim = await prisma.supplierClaim.update({
    where: { id },
    data: {
      status: next as ClaimStatus,
      resolvedDate: resolved ? new Date() : null,
      resolvedBy: resolved ? actor ?? "web" : null,
    },
  });
  await prisma.auditLog.create({
    data: {
      actor: actor ?? "web",
      action: "claim.status_changed",
      entityType: "SupplierClaim",
      entityId: id,
      after: { status: next },
    },
  });
  return claim;
}
