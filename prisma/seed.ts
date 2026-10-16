import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.appUser.upsert({
    where: { email: "admin@pafam2.local" },
    update: {},
    create: {
      email: "admin@pafam2.local",
      name: "Administrator",
      role: "ADMIN",
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD ?? "change-me"),
    },
  });

  // Bootstrap a password for any pre-existing user that has none, without ever
  // overwriting a password the operator has since changed.
  if (!admin.passwordHash) {
    await prisma.appUser.update({
      where: { id: admin.id },
      data: { passwordHash: hashPassword(process.env.ADMIN_PASSWORD ?? "change-me") },
    });
  }

  const defaults: { key: string; value: unknown }[] = [
    { key: "price_anomaly_pct", value: 40 },
    { key: "stale_offer_days", value: 14 },
    { key: "default_currency", value: "USD" },
    { key: "default_country", value: "US" },
    { key: "min_contribution_margin_pct", value: 10 },
    { key: "max_deal_capital_usd", value: 50000 },
    { key: "default_cash_cycle_days", value: 60 },
    { key: "alert_price_move_pct", value: 10 },
    { key: "alert_stale_days", value: 14 },
    { key: "alert_aged_inventory_days", value: 60 },
    { key: "alert_expiring_days", value: 14 },
    { key: "alert_margin_drop_pct", value: 5 },
    { key: "alert_overrides", value: { brands: {}, skus: {} } },
    { key: "exposure_caps", value: { sku: {}, brand: {}, supplier: {}, customer: {}, defaults: { sku: 0, brand: 0, supplier: 0, customer: 0 } } },
    { key: "customer_pricing", value: { defaultMarginPct: null, overrides: {} } },
    { key: "kpi_owners", value: {} },
  ];

  for (const setting of defaults) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value as object, updatedBy: "seed" },
    });
  }

  // Illustrative dated FX (USD per 1 unit) so non-USD offers can be compared.
  const today = new Date();
  const fx: { base: string; rate: number; source: string }[] = [
    { base: "EUR", rate: 1.08, source: "seed-illustrative" },
    { base: "GBP", rate: 1.27, source: "seed-illustrative" },
    { base: "CHF", rate: 1.12, source: "seed-illustrative" },
    { base: "AED", rate: 0.2723, source: "seed-illustrative" },
  ];
  for (const { base, rate, source } of fx) {
    const existing = await prisma.fxRate.findFirst({
      where: { baseCurrency: base, quoteCurrency: "USD", source },
    });
    if (!existing) {
      await prisma.fxRate.create({
        data: {
          baseCurrency: base,
          quoteCurrency: "USD",
          rate,
          rateDate: today,
          source,
          booked: false,
        },
      });
    }
  }

  console.log(`Seed complete. Admin user: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
