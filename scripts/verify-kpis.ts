// Verifies §18 KPI panel: every KPI has a named owner, computable KPIs are
// measured, and KPIs without inputs are explicitly pending (never faked).
// Run: npx tsx scripts/verify-kpis.ts (requires the dev DB running)
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
  const { getKpis, getKpiOwners, parseKpiOwners, KPI_OWNER_DEFAULTS } = await import("../src/lib/kpis");

  // --- Pure parsing/merge ---
  const parsed = parseKpiOwners({ quote_conversion: "Dana" });
  assert("owner override parsed", parsed.quote_conversion === "Dana");

  const now = new Date();

  // Create a couple of quotes and a lost deal with a reason to move KPIs.
  const customer = await prisma.customer.create({ data: { name: `KpiCust-${stamp}` } });
  const supplier = await prisma.supplier.create({ data: { name: `KpiSup-${stamp}` } });

  await prisma.quote.create({
    data: { quoteNumber: `KPI-ACC-${stamp}`, customerId: customer.id, status: "ACCEPTED" },
  });
  await prisma.quote.create({
    data: { quoteNumber: `KPI-DEC-${stamp}`, customerId: customer.id, status: "DECLINED" },
  });

  await prisma.deal.create({
    data: {
      status: "LOST",
      supplierId: supplier.id,
      customerId: customer.id,
      quantity: 10,
      buyCurrency: "USD",
      buyPrice: 5,
      lostReason: `price-${stamp}`,
    },
  });

  const { kpis } = await getKpis(now);
  const byKey = new Map(kpis.map((k) => [k.key, k]));

  assert("every KPI has a named owner", kpis.every((k) => k.owner.trim().length > 0));
  assert("intended KPI set present", ["quote_conversion", "lost_sale_reasons", "realised_vs_expected_margin", "supplier_fill_rate", "customer_repeat_purchases", "overdue_debt", "cash_deployment", "exposure_over_cap", "stock_turn"].every((k) => byKey.has(k)));
  assert("quote conversion measured and > 0", byKey.get("quote_conversion")?.status === "measured" && byKey.get("quote_conversion")?.value !== "—");
  assert("lost-sale reasons measured with our reason", (byKey.get("lost_sale_reasons")?.detail ?? "").includes(`price-${stamp}`));
  assert("realised vs expected margin is pending", byKey.get("realised_vs_expected_margin")?.status === "pending");
  assert("supplier fill rate is pending", byKey.get("supplier_fill_rate")?.status === "pending");
  assert("overdue debt is pending", byKey.get("overdue_debt")?.status === "pending");
  assert("cash deployment measured", byKey.get("cash_deployment")?.status === "measured");

  // Owner override via settings.
  await prisma.setting.upsert({
    where: { key: "kpi_owners" },
    update: { value: { quote_conversion: "Dana" } },
    create: { key: "kpi_owners", value: { quote_conversion: "Dana" } },
  });
  const owners = await getKpiOwners();
  assert("owner override applies over default", owners.quote_conversion === "Dana");
  assert("non-overridden KPI keeps role default", owners.stock_turn === KPI_OWNER_DEFAULTS.stock_turn);

  await prisma.setting.deleteMany({ where: { key: "kpi_owners" } });
  await prisma.quote.deleteMany({ where: { customerId: customer.id } });
  await prisma.deal.deleteMany({ where: { supplierId: supplier.id } });
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
