// Verifies §18 delivery records: goods receipts (fill rate, partial deliveries,
// rejected units, on-time) and supplier claims, plus the Excel receipt import
// and their effect on the supplier scorecard.
// Run: npx tsx scripts/verify-receipts.ts (requires the dev DB running)
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
const DAY = 86_400_000;

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { createOrder } = await import("../src/lib/orders");
  const {
    createReceipt,
    getOrderReceipts,
    orderFillRate,
    getSupplierDeliveryMetrics,
    importReceiptWorkbook,
    createClaim,
    updateClaimStatus,
  } = await import("../src/lib/receipts");
  const { getSupplierScorecard } = await import("../src/lib/suppliers");

  const supplier = await prisma.supplier.create({
    data: { name: `V-Rcpt-Sup-${stamp}`, country: "AE" },
  });

  const codeA = `12345678901${(stamp % 10)}`;
  const codeB = `98765432109${(stamp % 10)}`;

  const order = await createOrder({
    supplierId: supplier.id,
    currency: "USD",
    lines: [
      { originalCode: codeA, fragranceName: "Line A", cases: 100, unitsPerCase: 1, unitCost: 10 },
      { originalCode: codeB, fragranceName: "Line B", cases: 50, unitsPerCase: 1, unitCost: 20 },
    ],
  });
  const lineA = order.lines.find((l) => l.originalCode === codeA)!;
  const lineB = order.lines.find((l) => l.originalCode === codeB)!;

  const now = new Date();

  // --- Partial receipt: only line A, 40 of 100. ---
  await createReceipt({
    orderId: order.id,
    receiptDate: new Date(now.getTime() - 2 * DAY),
    expectedDate: new Date(now.getTime() - 3 * DAY), // promised earlier => late
    lines: [{ orderLineId: lineA.id, receivedUnits: 40, rejectedUnits: 0 }],
  });

  let receipts = await getOrderReceipts(order.id);
  let fill = orderFillRate(150, receipts);
  assert("partial receipt: received 40 of 150", fill.receivedUnits === 40);
  assert("partial receipt: fill rate 26.7%", fill.fillRatePct === 26.7);

  // --- Second receipt completes the order; 5 of A rejected, not received. ---
  await createReceipt({
    orderId: order.id,
    receiptDate: now,
    expectedDate: new Date(now.getTime() + 5 * DAY), // promised later => on time
    lines: [
      { orderLineId: lineA.id, receivedUnits: 60, rejectedUnits: 5 },
      { orderLineId: lineB.id, receivedUnits: 50, rejectedUnits: 0 },
    ],
  });

  receipts = await getOrderReceipts(order.id);
  fill = orderFillRate(150, receipts);
  assert("second receipt accumulates to 150 received", fill.receivedUnits === 150);
  assert("rejected units are not counted as received", fill.rejectedUnits === 5);
  assert("fill rate reaches 100%", fill.fillRatePct === 100);

  // --- Claims: one resolved shortage, one open damage. ---
  const shortage = await createClaim({
    supplierId: supplier.id,
    type: "SHORTAGE",
    units: 5,
    amountUsd: 100,
    description: "5 units short on first delivery",
  });
  await updateClaimStatus(shortage.id, "RESOLVED", "verify");
  await createClaim({
    supplierId: supplier.id,
    type: "DAMAGE",
    units: 2,
    amountUsd: 40.5,
    description: "2 units arrived damaged",
  });

  const metrics = await getSupplierDeliveryMetrics();
  const m = metrics.get(supplier.id);
  assert("delivery metrics recorded for supplier", m !== undefined);
  assert("two receipts counted", m?.receiptCount === 2);
  assert("ordered units counted once (150)", m?.orderedUnits === 150);
  assert("received units 150", m?.receivedUnits === 150);
  assert("fill rate 100%", m?.fillRatePct === 100);
  assert("on-time 50% (one late, one on time)", m?.onTimePct === 50);
  assert("two claims counted", m?.claimCount === 2);
  assert("one open claim", m?.openClaimCount === 1);
  assert("claim value sums to 140.5", m?.claimAmountUsd === 140.5);

  // --- Scorecard surfaces the delivery dimensions. ---
  const { suppliers } = await getSupplierScorecard(now);
  const card = suppliers.find((s) => s.supplierId === supplier.id);
  assert("scorecard shows fill rate", card?.fillRatePct === 100);
  assert("scorecard shows on-time", card?.onTimePct === 50);
  assert("scorecard shows claim count", card?.claimCount === 2);
  assert("scorecard computes a delivery component", card?.deliveryScore !== null);

  // --- Excel receipt import matches by code and records a receipt. ---
  const order2 = await createOrder({
    supplierId: supplier.id,
    currency: "USD",
    lines: [
      { originalCode: codeA, fragranceName: "Import A", cases: 10, unitsPerCase: 1 },
      { originalCode: codeB, fragranceName: "Import B", cases: 10, unitsPerCase: 1 },
    ],
  });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Receipt");
  ws.addRow(["Code", "Received units", "Rejected units", "Receipt date"]);
  ws.addRow([codeA, 10, 0, now.toISOString().slice(0, 10)]);
  ws.addRow([codeB, 8, 2, now.toISOString().slice(0, 10)]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  const summary = await importReceiptWorkbook(order2.id, buffer, { receivedBy: "verify" });
  assert("import matched both order lines", summary.matched === 2);
  assert("import received units 18", summary.receivedUnits === 18);
  assert("import rejected units 2", summary.rejectedUnits === 2);

  const imported = await getOrderReceipts(order2.id);
  const importedFill = orderFillRate(20, imported);
  assert("import fill rate 90% (18 of 20)", importedFill.fillRatePct === 90);

  // --- Cleanup. ---
  await prisma.supplierClaim.deleteMany({ where: { supplierId: supplier.id } });
  await prisma.goodsReceipt.deleteMany({ where: { supplierId: supplier.id } });
  await prisma.orderLine.deleteMany({ where: { orderId: { in: [order.id, order2.id] } } });
  await prisma.purchaseOrder.deleteMany({ where: { id: { in: [order.id, order2.id] } } });
  await prisma.supplier.delete({ where: { id: supplier.id } });

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
