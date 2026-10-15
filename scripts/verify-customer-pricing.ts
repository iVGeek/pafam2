// Verifies §18 customer-specific minimum sell price: payment-term parsing,
// margin resolution (override > default > global), and that the minimum sell
// price rises with the required margin and reflects the customer's cash cycle.
// Run: npx tsx scripts/verify-customer-pricing.ts (requires the dev DB running)
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
  const {
    getCustomerMinSellPrice,
    parseCustomerPricing,
    parsePaymentTermDays,
    resolveCustomerMarginPct,
  } = await import("../src/lib/customer-pricing");

  // --- Pure parsing checks ---
  assert("Net 30 -> 30 days", parsePaymentTermDays("Net 30") === 30);
  assert("net-45 -> 45 days", parsePaymentTermDays("net-45") === 45);
  assert("'30 days' -> 30", parsePaymentTermDays("30 days") === 30);
  assert("'2/10 Net 30' -> 30 (net period)", parsePaymentTermDays("2/10 Net 30") === 30);
  assert("COD -> 0 days", parsePaymentTermDays("COD") === 0);
  assert("unparseable -> null", parsePaymentTermDays("on account") === null);

  const cfg = parseCustomerPricing({ defaultMarginPct: 12, overrides: { abc: 20 } });
  assert("override wins", resolveCustomerMarginPct(cfg, "abc", 10).marginPct === 20);
  assert("default used when no override", resolveCustomerMarginPct(cfg, "xyz", 10).marginPct === 12);
  assert("global fallback when no config", resolveCustomerMarginPct(parseCustomerPricing(null), "xyz", 10).marginPct === 10);

  // --- DB-backed checks ---
  const product = await prisma.product.create({
    data: { internalSku: `VERIFY-CUSTPRICE-${stamp}`, brand: "PriceBrand" },
  });
  const supplier = await prisma.supplier.create({ data: { name: `PriceSupplier-${stamp}` } });
  const customer = await prisma.customer.create({
    data: { name: `PriceCust-${stamp}`, paymentTerms: "Net 60" },
  });

  const raw = {
    quantity: 100,
    buyCurrency: "USD",
    buyPrice: 10,
    buyPriceBasis: "UNIT" as const,
    unitsPerCase: null,
    fxRate: null,
    sellingPriceUsd: 0,
    inboundCosts: [],
    inboundCostsComplete: true,
  };

  await prisma.setting.deleteMany({ where: { key: "customer_pricing" } });
  const base = await getCustomerMinSellPrice(customer.id, raw);
  assert("global margin applied (10%)", base.marginPct === 10 && base.marginSource === "global");
  assert("cash cycle from 'Net 60' terms", base.cashCycleDays === 60 && base.cashCycleDaysSource === "terms");
  assert("min sell price computed", base.minSellPriceUsd !== null && base.minSellPriceUsd > base.breakEvenSellingPriceUsd);

  // Per-customer override to 25% must raise the minimum sell price.
  await prisma.setting.create({
    data: { key: "customer_pricing", value: { defaultMarginPct: null, overrides: { [customer.id]: 25 } }, updatedBy: "verify" },
  });
  const overridden = await getCustomerMinSellPrice(customer.id, raw);
  assert("override margin applied (25%)", overridden.marginPct === 25 && overridden.marginSource === "override");
  assert(
    "higher required margin raises the minimum sell price",
    (overridden.minSellPriceUsd ?? 0) > (base.minSellPriceUsd ?? 0),
  );

  await prisma.setting.deleteMany({ where: { key: "customer_pricing" } });
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
