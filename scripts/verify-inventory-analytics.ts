// Verifies §18 inventory analytics: stock turn (won-deal COGS ÷ current stock
// value), markdown exposure of aged usable stock, and unrealised profit by lot
// using the best live demand target as the sell basis.
// Run: npx tsx scripts/verify-inventory-analytics.ts (requires the dev DB running)
import { loadEnvFile } from "node:process";

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
  const { getInventoryAnalytics } = await import("../src/lib/inventory");

  const now = new Date();
  const sku = `VERIFY-INV-${stamp}`;
  const agedDate = new Date(now.getTime() - 200 * 86_400_000);

  const product = await prisma.product.create({ data: { internalSku: sku, brand: "InvBrand" } });
  const supplier = await prisma.supplier.create({ data: { name: `InvSupplier-${stamp}` } });
  const customer = await prisma.customer.create({ data: { name: `InvCust-${stamp}` } });

  // Fresh usable stock: 100 @ $10.
  await prisma.inventoryItem.create({
    data: {
      productId: product.id,
      status: "USABLE",
      quantity: 100,
      unitCostUsd: 10,
      acquiredDate: now,
      lotRef: `LOT-NEW-${stamp}`,
    },
  });
  // Aged usable stock: 50 @ $10 (held 200 days).
  await prisma.inventoryItem.create({
    data: {
      productId: product.id,
      status: "USABLE",
      quantity: 50,
      unitCostUsd: 10,
      acquiredDate: agedDate,
      lotRef: `LOT-OLD-${stamp}`,
    },
  });

  // A won deal inside the window: COGS = 10 × 100 = 1000.
  await prisma.deal.create({
    data: {
      status: "WON",
      supplierId: supplier.id,
      productId: product.id,
      customerId: customer.id,
      quantity: 100,
      buyCurrency: "USD",
      buyPrice: 10,
      landedUnitCost: 10,
      createdAt: now,
    },
  });

  // Live approved demand target = $25.
  await prisma.demand.create({
    data: {
      customerId: customer.id,
      productId: product.id,
      status: "REQUEST",
      certainty: "EXACT",
      approved: true,
      quantity: 150,
      targetPrice: 25,
      currency: "USD",
    },
  });

  const a = await getInventoryAnalytics(now);

  assert("COGS in window includes the won deal (>=1000)", a.cogsUsd >= 1000);
  assert("stock turn is a number when stock value > 0", a.stockTurn !== null);
  assert("markdown units include the aged lot (>=50)", a.markdown.units >= 50);
  assert("markdown value includes the aged lot (>=500)", a.markdown.valueUsd >= 500);
  assert("markdown threshold is 180 days", a.markdown.thresholdDays === 180);

  const newLot = a.lots.find((l) => l.lotRef === `LOT-NEW-${stamp}`);
  const oldLot = a.lots.find((l) => l.lotRef === `LOT-OLD-${stamp}`);
  assert("new lot present with 100 units", newLot?.units === 100);
  assert("old lot present with 50 units", oldLot?.units === 50);
  assert("reference sell comes from demand target ($25)", newLot?.referenceSellUsd === 25 && newLot?.referenceSource === "demand-target");
  assert("potential profit = (25-10) × 100 = 1500", newLot?.potentialProfitUsd === 1500);
  assert("potential margin = 60%", newLot?.potentialMarginPct === 60);

  await prisma.demand.deleteMany({ where: { productId: product.id } });
  await prisma.deal.deleteMany({ where: { supplierId: supplier.id } });
  await prisma.inventoryItem.deleteMany({ where: { productId: product.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
  await prisma.supplier.delete({ where: { id: supplier.id } });
  await prisma.product.delete({ where: { id: product.id } });

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
