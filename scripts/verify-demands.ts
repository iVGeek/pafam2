// Verifies §13 demand segmentation: confirmed unfilled orders, current
// wishlists and probability-weighted opportunities are reported separately and
// never added blindly; expired records are excluded from every open bucket.
// Run: npx tsx scripts/verify-demands.ts   (requires the dev DB running)
import { loadEnvFile } from "node:process";

try {
  loadEnvFile();
} catch {
  // .env optional; DATABASE_URL may already be in the environment.
}

let failures = 0;
function assert(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}

const stamp = Date.now();

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getDemandPipeline } = await import("../src/lib/demands");

  const now = new Date();
  const past = new Date(now.getTime() - 86_400_000);

  const customer = await prisma.customer.create({ data: { name: `Verify Pipeline ${stamp}` } });
  const product = await prisma.product.create({ data: { internalSku: `VERIFY-PIPE-${stamp}` } });

  const mk = (
    status: "WISHLIST" | "REQUEST" | "QUOTE" | "CONFIRMED" | "EXPIRED",
    quantity: number,
    targetPrice: number,
    certainty: "EXACT" | "INFERRED",
    expiryDate: Date | null = null,
  ) =>
    prisma.demand.create({
      data: {
        customerId: customer.id,
        productId: product.id,
        status,
        certainty,
        quantity,
        targetPrice,
        currency: "USD",
        expiryDate,
      },
    });

  await mk("CONFIRMED", 100, 50, "EXACT");
  await mk("WISHLIST", 80, 40, "EXACT");
  await mk("REQUEST", 200, 30, "EXACT");
  await mk("QUOTE", 100, 60, "INFERRED");
  await mk("EXPIRED", 50, 20, "EXACT");
  await mk("REQUEST", 10, 20, "EXACT", past);

  const p = await getDemandPipeline(now, { customerId: customer.id });

  // Confirmed: committed, weighted at 100%.
  assert("confirmed unfilled counts only CONFIRMED", p.confirmedUnfilled.demandCount === 1);
  assert("confirmed unfilled units", p.confirmedUnfilled.units === 100);
  assert("confirmed unfilled indicative value", p.confirmedUnfilled.valueUsd === 5000);
  assert("confirmed weighted at 100%", p.confirmedUnfilled.weightedUnits === 100);

  // Wishlists: separate, unweighted.
  assert("wishlists count only WISHLIST", p.currentWishlists.demandCount === 1);
  assert("wishlist units", p.currentWishlists.units === 80);
  assert("wishlist not probability-weighted", p.currentWishlists.weightedUnits === 0);

  // Probability-weighted: requests + quotes only.
  assert("weighted bucket excludes confirmed/wishlist", p.probabilityWeighted.demandCount === 2);
  assert("weighted bucket units (raw)", p.probabilityWeighted.units === 300);
  // 200*0.4 + 100*0.6*0.5 = 80 + 30 = 110
  assert("weighted units applied", p.probabilityWeighted.weightedUnits === 110);
  // 200*30*0.4 + 100*60*0.3 = 2400 + 1800 = 4200
  assert("weighted value applied", p.probabilityWeighted.weightedValueUsd === 4200);

  // Expired excluded from all open buckets.
  assert("expired records counted separately", p.expired.demandCount === 2);
  assert("expired units", p.expired.units === 60);

  await prisma.demand.deleteMany({ where: { customerId: customer.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.customer.delete({ where: { id: customer.id } });

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
