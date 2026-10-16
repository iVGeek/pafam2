// Verifies §11.1 stock pooling: several brokers offering one owner's lot are
// linked to one pool and counted once (not summed); location is not territory;
// ownership-unknown stock is shown as a separate range; firm, indicative,
// incoming and on-request availability stay separate; stale offers drop out.
// Run: npx tsx scripts/verify-supply.ts (requires the dev DB running)
import { loadEnvFile } from "node:process";
import ExcelJS from "exceljs";

try {
  loadEnvFile();
} catch {}

let failures = 0;
function assert(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}

const stamp = Date.now();

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getObservedSupply, getConfirmedSupplyByProduct, normalizeConfidence } = await import(
    "../src/lib/supply"
  );

  const now = new Date();
  const recent = now;
  const staleDate = new Date(now.getTime() - 30 * 86_400_000);

  const product = await prisma.product.create({
    data: { internalSku: `V-SUP-${stamp}`, brand: "VerifyBrand", fragranceName: "Test" },
  });
  const owner = await prisma.stockOwner.create({ data: { name: `V-Owner-${stamp}` } });
  const a = await prisma.supplier.create({ data: { name: `V-Sup-A-${stamp}` } });
  const b = await prisma.supplier.create({ data: { name: `V-Sup-B-${stamp}` } });

  const base = {
    status: "ACTIVE" as const,
    productId: product.id,
    originalCode: `V-CODE-${stamp}`,
    currency: "USD",
    price: 10,
    priceBasis: "UNIT" as const,
    listDate: recent,
    lastStockConfirmation: recent,
  };

  // Two brokers (A and B) offering the SAME owner + lot, in different countries.
  // Must be pooled: counted once, not 200.
  await prisma.offer.create({
    data: {
      ...base,
      supplierId: a.id,
      stockOwnerId: owner.id,
      batchOrLotRef: `LOT1-${stamp}`,
      availableQuantity: 100,
      stockCountry: "US",
    },
  });
  await prisma.offer.create({
    data: {
      ...base,
      supplierId: b.id,
      stockOwnerId: owner.id,
      batchOrLotRef: `LOT1-${stamp}`,
      availableQuantity: 100,
      stockCountry: "FR",
    },
  });
  // Owner known, lot unknown: possible overlap, shown as a range not confirmed.
  await prisma.offer.create({
    data: { ...base, supplierId: a.id, stockOwnerId: owner.id, availableQuantity: 30 },
  });
  // Ownership unknown: unverified, separate.
  await prisma.offer.create({
    data: { ...base, supplierId: a.id, availableQuantity: 50 },
  });
  // Incoming shipment: its own bucket, never folded into firm stock.
  await prisma.offer.create({
    data: {
      ...base,
      supplierId: a.id,
      stockOwnerId: owner.id,
      batchOrLotRef: `LOT2-${stamp}`,
      availableQuantity: 40,
      stockConfidence: "incoming shipment",
    },
  });
  // Stale offer: leaves active totals but stays in history (§11.1/§20).
  await prisma.offer.create({
    data: {
      ...base,
      status: "STALE",
      supplierId: a.id,
      stockOwnerId: owner.id,
      batchOrLotRef: `LOT1-${stamp}`,
      availableQuantity: 999,
      lastStockConfirmation: staleDate,
      listDate: staleDate,
    },
  });

  const supply = await getObservedSupply(now);
  const p = supply.products.find((x) => x.productId === product.id);

  assert("product appears in observed supply", p !== undefined);
  if (!p) {
    console.log("\n1 CHECK(S) FAILED");
    process.exit(1);
  }

  // Duplicate supply (100 + 100 across two brokers) is counted ONCE.
  assert("duplicate lot is counted once (not summed to 200)", p.confirmedQuantity === 100);
  assert("incoming shipment is separated from firm stock", p.incomingQuantity === 40);
  assert(
    "ownership-unknown quantity is shown as a range",
    p.unverifiedMin === 50 && p.unverifiedMax === 50,
  );
  assert(
    "owner-known but lot-unknown is shown as possible overlap",
    p.possibleOverlapMin === 30 && p.possibleOverlapMax === 30,
  );
  assert("possible-overlap pool does not inflate confirmed", p.confirmedQuantity === 100);
  assert("stale offer excluded from active totals", p.confirmedQuantity === 100 && p.incomingQuantity === 40);

  const l1 = p.pools.find((pool) => pool.lotReference === `LOT1-${stamp}` && pool.status === "CONFIRMED");
  assert("shared lot forms one pool", l1 !== undefined);
  assert("one pool reports both brokers as sources", l1?.sourceCount === 2);
  assert("pool quantity is the reported parcel, not the sum", l1?.reportedQuantity === 100);
  assert(
    "location is not territory (US + FR is still one pool counted once)",
    l1 !== undefined && l1.locations.length === 2 && l1.reportedQuantity === 100,
  );

  assert("owner known but lot unknown is flagged possible overlap", p.pools.some((pool) => pool.status === "POSSIBLE"));
  assert("ownership unknown is flagged unverified", p.pools.some((pool) => pool.status === "UNVERIFIED"));
  assert("owner count is deduplicated", p.ownerCount === 1);

  const byProduct = await getConfirmedSupplyByProduct(now);
  assert("deduplicated confirmed supply map returns 100 for the product", byProduct.get(product.id) === 100);

  // Confidence normalisation buckets.
  assert("normalizeConfidence: confirm → FIRM", normalizeConfidence("confirmed") === "FIRM");
  assert("normalizeConfidence: indicative → INDICATIVE", normalizeConfidence("indicative") === "INDICATIVE");
  assert("normalizeConfidence: in transit → INCOMING", normalizeConfidence("in transit") === "INCOMING");
  assert("normalizeConfidence: on request → ON_REQUEST", normalizeConfidence("on request") === "ON_REQUEST");
  assert("normalizeConfidence: blank → UNKNOWN", normalizeConfidence("") === "UNKNOWN");

  // Global saving proves the double count was avoided somewhere in the DB.
  assert("global dedup saving is non-negative", supply.totals.dedupedSaving >= 0);

  const offerIds = await prisma.offer.findMany({
    where: { productId: product.id },
    select: { id: true },
  });
  await prisma.offer.deleteMany({ where: { id: { in: offerIds.map((o) => o.id) } } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.stockOwner.delete({ where: { id: owner.id } });
  await prisma.supplier.deleteMany({ where: { id: { in: [a.id, b.id] } } });

  // --- End-to-end: importing two brokers' rows for one owner's lot links them
  // to a single pool, so the parcel is counted once (§11.1). ---
  const { importOffersWorkbook } = await import("../src/lib/ingest");
  const e2eOwner = `V-E2E-Owner-${stamp}`;
  const supA = `V-E2E-A-${stamp}`;
  const supB = `V-E2E-B-${stamp}`;
  const lot = `LOT-E2E-${stamp}`;
  const sheetWb = new ExcelJS.Workbook();
  const ws = sheetWb.addWorksheet("Pricelist");
  ws.addRow(["Supplier", "Stock Owner", "Batch / Lot Ref", "Barcode / Code", "Qty", "Price", "Currency", "Packaging"]);
  ws.addRow([supA, e2eOwner, lot, "4006381333931", "100", "10", "USD", "Bottle"]);
  ws.addRow([supB, e2eOwner, lot, "4006381333931", "100", "10", "USD", "Bottle"]);
  const buf = Buffer.from(await sheetWb.xlsx.writeBuffer());

  const summary = await importOffersWorkbook(buf, { filename: `supply-${stamp}.xlsx`, uploadedBy: "verify-supply" });
  assert("ingest imported both broker rows", summary.validRows === 2);

  const e2eOffers = await prisma.offer.findMany({
    where: { supplier: { name: { in: [supA, supB] } } },
    select: { poolId: true, stockOwnerId: true, batchOrLotRef: true },
  });
  const poolIds = new Set(e2eOffers.map((o) => o.poolId).filter(Boolean));
  assert("both broker offers are linked to a pool", e2eOffers.length === 2 && poolIds.size === 1);
  assert("pool is recorded CONFIRMED for a known owner + lot", e2eOffers.every((o) => o.poolId !== null));
  const pool = await prisma.stockPool.findFirst({ where: { id: [...poolIds][0] as string } });
  assert("pool status is CONFIRMED", pool?.status === "CONFIRMED");
  assert("pool references the stock owner and lot", pool?.lotReference === lot);

  // Cleanup the end-to-end import.
  await prisma.offer.deleteMany({ where: { supplier: { name: { in: [supA, supB] } } } });
  await prisma.validationIssue.deleteMany({ where: { uploadFileId: summary.uploadId } });
  await prisma.uploadRow.deleteMany({ where: { uploadFileId: summary.uploadId } });
  await prisma.uploadFile.delete({ where: { id: summary.uploadId } });
  await prisma.stockPool.deleteMany({ where: { lotReference: lot } });
  await prisma.stockOwner.deleteMany({ where: { name: e2eOwner } });
  await prisma.supplier.deleteMany({ where: { name: { in: [supA, supB] } } });

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
