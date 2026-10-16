// Verifies §18 supplier scorecard: computes landed cost from offers (via FX),
// freshness, authenticity evidence, ranks priced suppliers; explicitly lists
// unavailable dimensions (fill rate, on-time delivery, claims).
// Run: npx tsx scripts/verify-suppliers.ts (requires the dev DB running)
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
  const { getSupplierScorecard } = await import("../src/lib/suppliers");

  const now = new Date();

  const s1 = await prisma.supplier.create({ data: { name: `V-Sup-A-${stamp}`, country: "US" } });
  const s2 = await prisma.supplier.create({ data: { name: `V-Sup-B-${stamp}`, country: "FR" } });

  // Supplier A: more expensive landed cost, but fresher and has auth docs.
  await prisma.offer.create({
    data: {
      status: "ACTIVE",
      supplierId: s1.id,
      originalCode: `A1-${stamp}`,
      currency: "USD",
      price: 30,
      priceBasis: "UNIT",
      availableQuantity: 500,
      lastStockConfirmation: now,
      listDate: now,
      authenticityDocs: "COA provided",
      usSuitability: "suitable",
      leadTimeDays: 10,
      paymentTerms: "Net 30",
    },
  });

  // Supplier B: cheaper landed, but stale (no recent confirmation) and no auth docs.
  const stale = new Date(now.getTime() - 30 * 86_400_000);
  await prisma.offer.create({
    data: {
      status: "ACTIVE",
      supplierId: s2.id,
      originalCode: `B1-${stamp}`,
      currency: "USD",
      price: 20,
      priceBasis: "UNIT",
      availableQuantity: 500,
      lastStockConfirmation: stale,
      listDate: stale,
      usSuitability: "suitable",
      leadTimeDays: 15,
      paymentTerms: "Net 30",
    },
  });

  const { suppliers, dimensions } = await getSupplierScorecard(now);

  const a = suppliers.find((x) => x.supplierId === s1.id);
  const b = suppliers.find((x) => x.supplierId === s2.id);

  assert("Supplier A median landed is 30.0", a?.medianLandedUsd === 30.0);
  assert("Supplier B median landed is 20.0", b?.medianLandedUsd === 20.0);
  assert("Supplier A has stale count 0", a?.staleCount === 0);
  assert("Supplier B is stale (>=1)", (b?.staleCount ?? 0) >= 1);
  assert("Supplier A has authenticityPct 100", a?.authenticityPct === 100);
  assert("Supplier B has authenticityPct 0", b?.authenticityPct === 0);

  // Suppliers with priced offers get ranks.
  assert("Priced suppliers receive a rank", (a?.rank ?? null) !== null && (b?.rank ?? null) !== null);
  assert("Composite score is assigned to priced suppliers", a?.score !== null && b?.score !== null);
  // Price alone must not decide: the cheaper but stale/no-evidence supplier
  // must not outrank the fresher, documented one.
  assert(
    "cheaper-but-stale supplier does not outrank fresh+evidence supplier",
    (a?.rank ?? 99) <= (b?.rank ?? 99),
  );

  const measured = dimensions.filter((d) => d.measured).map((d) => d.key);
  assert(
    "Lists fill rate/on-time/claims as measurable dimensions",
    ["fillrate", "ontime", "claims"].every((k) => measured.includes(k)),
  );

  await prisma.offer.deleteMany({ where: { supplierId: { in: [s1.id, s2.id] } } });
  await prisma.supplier.deleteMany({ where: { id: { in: [s1.id, s2.id] } } });

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
