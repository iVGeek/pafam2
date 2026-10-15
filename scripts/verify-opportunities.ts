// Verifies §18 opportunity ranking: the best executable offer per live
// approved requirement is scored across contribution, credible sell-through,
// cash cycle, customer credit and concentration risk, and incomplete
// profitability / missing credit limits are flagged.
// Run: npx tsx scripts/verify-opportunities.ts (requires the dev DB running)
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
  const { getOpportunityRanking } = await import("../src/lib/opportunities");

  const now = new Date();
  const sku = `VERIFY-OPP-${stamp}`;

  const product = await prisma.product.create({ data: { internalSku: sku, brand: "OppBrand" } });
  const supplier = await prisma.supplier.create({ data: { name: `OppSupplier-${stamp}` } });
  const c1 = await prisma.customer.create({
    data: { name: `OppCust-Good-${stamp}`, creditLimit: 100000 },
  });
  const c2 = await prisma.customer.create({ data: { name: `OppCust-Nolimit-${stamp}` } });

  await prisma.offer.create({
    data: {
      status: "ACTIVE",
      supplierId: supplier.id,
      productId: product.id,
      originalCode: `OPP-${stamp}`,
      currency: "USD",
      price: 10,
      priceBasis: "UNIT",
      availableQuantity: 100,
      listDate: now,
      lastStockConfirmation: now,
    },
  });

  // Give customer 2 a big open position so it dominates the open book.
  const deal2 = await prisma.deal.create({
    data: {
      status: "DRAFT",
      supplierId: supplier.id,
      productId: product.id,
      customerId: c2.id,
      quantity: 1,
      buyCurrency: "USD",
      buyPrice: 1,
      cashRequirement: 10000,
    },
  });

  // Customer 1: confirmed + exact target 20.
  await prisma.demand.create({
    data: {
      customerId: c1.id,
      productId: product.id,
      status: "CONFIRMED",
      certainty: "EXACT",
      approved: true,
      quantity: 100,
      targetPrice: 20,
      currency: "USD",
    },
  });
  // Customer 2: wishlist + inferred target 18.
  await prisma.demand.create({
    data: {
      customerId: c2.id,
      productId: product.id,
      status: "WISHLIST",
      certainty: "INFERRED",
      approved: true,
      quantity: 100,
      targetPrice: 18,
      currency: "USD",
    },
  });

  const { opportunities, weights } = await getOpportunityRanking(now);

  const o1 = opportunities.find((o) => o.customerId === c1.id);
  const o2 = opportunities.find((o) => o.customerId === c2.id);

  assert("both customers produce an opportunity", Boolean(o1 && o2));
  assert("credible-sell-through: confirmed exact beats wishlist inferred", (o1?.components.sellThrough ?? 0) > (o2?.components.sellThrough ?? 0));
  assert("credit: within-limit customer scores 1", o1?.components.credit === 1);
  assert("credit: no-limit customer scores 0.5", o2?.components.credit === 0.5);
  assert("no-limit customer flagged", (o2?.flags ?? []).some((f) => f.includes("No credit limit")));
  assert("concentration: dominating customer scores 0", o2?.components.concentration === 0);
  assert("concentration: dominating customer flagged", (o2?.flags ?? []).some((f) => f.includes("Concentrated")));
  assert("incomplete profitability flagged without inbound costs", (o1?.incomplete ?? false) && (o1?.flags ?? []).some((f) => f.includes("Inbound costs not confirmed")));
  assert("higher-scoring opportunity ranks first (c1)", opportunities[0]?.customerId === c1.id);
  assert("weights sum to 1.0", Math.abs(weights.contribution + weights.sellThrough + weights.cashCycle + weights.credit + weights.concentration - 1) < 1e-9);

  await prisma.demand.deleteMany({ where: { productId: product.id } });
  await prisma.deal.deleteMany({ where: { supplierId: supplier.id } });
  await prisma.offer.deleteMany({ where: { supplierId: supplier.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.customer.deleteMany({ where: { id: { in: [c1.id, c2.id] } } });
  await prisma.supplier.delete({ where: { id: supplier.id } });

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
