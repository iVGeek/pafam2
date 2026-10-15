// Verifies the alert engine against §13/§20 rules:
//  - expired approved demands must NOT trigger coverage or supply alerts
//  - live approved demands DO trigger a buy opportunity
//  - expiring/expired demands surface a DEMAND_EXPIRING alert
//  - per-brand / per-SKU threshold overrides resolve correctly
// Run: npx tsx scripts/verify-alerts.ts   (requires the dev DB running)
import { loadEnvFile } from "node:process";
import type { AlertSettings } from "../src/lib/alerts";

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
const sku = `VERIFY-ALERT-${stamp}`;
const custName = `Verify Customer ${stamp}`;
const supName = `Verify Supplier ${stamp}`;

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { computeAlerts, resolveAlertSettings } = await import("../src/lib/alerts");
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const in30 = new Date(now.getTime() + 30 * 86_400_000);

  const product = await prisma.product.create({
    data: { internalSku: sku, brand: "VerifyBrand", fragranceName: "Verify" },
  });
  const customer = await prisma.customer.create({ data: { name: custName } });
  const supplier = await prisma.supplier.create({ data: { name: supName } });

  // An ACTIVE offer that beats the demand target (landed 30 vs target 50).
  const offer = await prisma.offer.create({
    data: {
      status: "ACTIVE",
      supplierId: supplier.id,
      productId: product.id,
      originalCode: sku,
      currency: "USD",
      price: 30,
      priceBasis: "UNIT",
      availableQuantity: 500,
      lastStockConfirmation: now,
      listDate: now,
    },
  });

  // An EXPIRED approved demand.
  const expired = await prisma.demand.create({
    data: {
      customerId: customer.id,
      productId: product.id,
      status: "REQUEST",
      approved: true,
      quantity: 100,
      targetPrice: 50,
      currency: "USD",
      expiryDate: yesterday,
    },
  });

  const alertsExpiredOnly = await computeAlerts(now);
  const offerAlertForExpired = alertsExpiredOnly.some(
    (a) => a.type === "OFFER_MATCHES_DEMAND" && a.id.includes(expired.id),
  );
  const supplyAlert = alertsExpiredOnly.some(
    (a) => a.type === "DEMAND_VS_SUPPLY" && a.id === `supply:${product.id}`,
  );
  const expiringAlert = alertsExpiredOnly.find((a) => a.id === `expiring:${expired.id}`);

  assert("expired demand does not trigger OFFER_MATCHES_DEMAND", !offerAlertForExpired);
  assert("expired demand does not count toward DEMAND_VS_SUPPLY", !supplyAlert);
  assert("expired demand surfaces a DEMAND_EXPIRING alert", Boolean(expiringAlert));
  assert("expired demand alert is high severity", expiringAlert?.severity === "high");

  // Now a LIVE approved demand for the same product should match the offer.
  const live = await prisma.demand.create({
    data: {
      customerId: customer.id,
      productId: product.id,
      status: "REQUEST",
      approved: true,
      quantity: 100,
      targetPrice: 50,
      currency: "USD",
      expiryDate: in30,
    },
  });

  const alertsLive = await computeAlerts(now);
  const offerAlertForLive = alertsLive.some(
    (a) => a.type === "OFFER_MATCHES_DEMAND" && a.id.includes(live.id),
  );
  assert("live demand triggers OFFER_MATCHES_DEMAND", offerAlertForLive);

  // Per-brand / per-SKU override resolution.
  const base: AlertSettings = {
    priceMovePct: 10,
    staleDays: 14,
    agedInventoryDays: 60,
    expiringDays: 14,
    marginDropPct: 5,
  };
  const overrides = {
    brands: { VerifyBrand: { priceMovePct: 5 } },
    skus: { [sku]: { priceMovePct: 20, agedInventoryDays: 30 } },
  };
  const brandOnly = resolveAlertSettings(base, overrides, { brand: "VerifyBrand", sku: null });
  const skuWins = resolveAlertSettings(base, overrides, { brand: "VerifyBrand", sku });
  assert("brand override applied", brandOnly.priceMovePct === 5);
  assert("SKU override overrides brand", skuWins.priceMovePct === 20);
  assert("SKU override keeps unrelated fields", skuWins.agedInventoryDays === 30);
  assert("un-overridden field falls back to base", skuWins.marginDropPct === 5);

  // Cleanup.
  await prisma.demand.deleteMany({ where: { productId: product.id } });
  await prisma.offer.delete({ where: { id: offer.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
  await prisma.supplier.delete({ where: { id: supplier.id } });

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
