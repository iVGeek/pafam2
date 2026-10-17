// KPI panel (§18).
//
// "Track quote conversion, lost-sale reasons, realised versus expected margin,
// supplier fill rate, customer repeat purchases, overdue debt and cash
// deployment. Tie each KPI to a named owner."
//
// Only the KPIs whose inputs exist today are computed; the rest are reported as
// explicitly *pending* with the data source they need (Phase 4 accounting /
// goods receipts) so nothing is faked. Every KPI carries a named owner, seeded
// from the §19 role ownership and overridable through Settings.

import { prisma } from "./prisma";
import { getExposure } from "./exposure";
import { getInventoryAnalytics } from "./inventory";
import { getSupplierDeliveryMetrics } from "./receipts";
import { getOutstandingSummary } from "./cashflow";

export type KpiStatus = "measured" | "pending";

export type Kpi = {
  key: string;
  label: string;
  /** Named owner (person or role). Overridable via the `kpi_owners` setting. */
  owner: string;
  value: string;
  status: KpiStatus;
  detail: string;
  href?: string;
};

// Default owners come straight from the §19 ownership table.
export const KPI_OWNER_DEFAULTS: Record<string, string> = {
  quote_conversion: "Sales",
  lost_sale_reasons: "Sales",
  customer_repeat_purchases: "Sales",
  supplier_fill_rate: "Purchasing",
  realised_vs_expected_margin: "Accounts",
  overdue_debt: "Accounts",
  cash_deployment: "Accounts",
  exposure_over_cap: "Manager",
  stock_turn: "Warehouse",
};

export function parseKpiOwners(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && raw.trim()) out[key] = raw.trim();
  }
  return out;
}

export async function getKpiOwners(): Promise<Record<string, string>> {
  const row = await prisma.setting.findUnique({ where: { key: "kpi_owners" } });
  return { ...KPI_OWNER_DEFAULTS, ...parseKpiOwners(row?.value ?? null) };
}

function pct(value: number): string {
  return `${Math.round(value * 10) / 10}%`;
}

export type KpiResult = {
  kpis: Kpi[];
  asOf: string;
};

export async function getKpis(now = new Date()): Promise<KpiResult> {
  const [owners, quoteGroups, lostGroups, wonByCustomer, wonAgg, openAgg, exposure, inv, delivery] =
    await Promise.all([
      getKpiOwners(),
      prisma.quote.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.deal.groupBy({ by: ["lostReason"], where: { status: "LOST" }, _count: { _all: true } }),
      prisma.deal.groupBy({
        by: ["customerId"],
        where: { status: "WON", customerId: { not: null } },
        _count: { _all: true },
      }),
      prisma.deal.aggregate({
        where: { status: "WON" },
        _sum: { dealContribution: true, cashRequirement: true },
        _count: { _all: true },
      }),
      prisma.deal.aggregate({
        where: { status: { in: ["DRAFT", "REVIEWED", "APPROVED"] } },
        _sum: { cashRequirement: true, dealContribution: true },
        _count: { _all: true },
      }),
      getExposure(now),
      getInventoryAnalytics(now),
      getSupplierDeliveryMetrics(),
    ]);

  const quotes = new Map<string, number>(quoteGroups.map((q) => [String(q.status), q._count._all]));
  const sent = ["SENT", "ACCEPTED", "DECLINED", "EXPIRED"].reduce((s, k) => s + (quotes.get(k) ?? 0), 0);
  const accepted = quotes.get("ACCEPTED") ?? 0;

  const kpis: Kpi[] = [];

  // 1. Quote conversion.
  kpis.push({
    key: "quote_conversion",
    label: "Quote conversion",
    owner: owners.quote_conversion,
    value: sent > 0 ? pct((accepted / sent) * 100) : "—",
    status: "measured",
    detail:
      sent > 0
        ? `${accepted} accepted of ${sent} sent/closed quotes.`
        : "No sent quotes yet.",
    href: "/quotes",
  });

  // 2. Lost-sale reasons.
  const lostTotal = lostGroups.reduce((s, g) => s + g._count._all, 0);
  const reasons = lostGroups
    .map((g) => `${g.lostReason?.trim() || "unspecified"} ×${g._count._all}`)
    .sort();
  kpis.push({
    key: "lost_sale_reasons",
    label: "Lost-sale reasons",
    owner: owners.lost_sale_reasons,
    value: String(lostTotal),
    status: "measured",
    detail: lostTotal > 0 ? reasons.join(", ") : "No lost deals recorded.",
    href: "/deals",
  });

  // 3. Realised vs expected margin — needs sale/collection records.
  kpis.push({
    key: "realised_vs_expected_margin",
    label: "Realised vs expected margin",
    owner: owners.realised_vs_expected_margin,
    value: "—",
    status: "pending",
    detail: "Awaiting sale and collection records (Phase 4 accounting) to compare realised to expected.",
  });

  // 4. Supplier fill rate — measured once goods receipts exist.
  let totalOrdered = 0;
  let totalReceived = 0;
  for (const m of delivery.values()) {
    totalOrdered += m.orderedUnits;
    totalReceived += m.receivedUnits;
  }
  const fillRate = totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : null;
  kpis.push({
    key: "supplier_fill_rate",
    label: "Supplier fill rate",
    owner: owners.supplier_fill_rate,
    value: fillRate === null ? "—" : pct(fillRate),
    status: fillRate === null ? "pending" : "measured",
    detail:
      fillRate === null
        ? "No goods-receipt records yet; record receipts on a purchase order to measure fill rate."
        : `${totalReceived} units received of ${totalOrdered} ordered across ${delivery.size} supplier${delivery.size === 1 ? "" : "s"}.`,
    href: "/suppliers",
  });

  // 5. Customer repeat purchases.
  const repeat = wonByCustomer.filter((c) => c._count._all >= 2).length;
  const buyingCustomers = wonByCustomer.length;
  kpis.push({
    key: "customer_repeat_purchases",
    label: "Customer repeat purchases",
    owner: owners.customer_repeat_purchases,
    value: buyingCustomers > 0 ? pct((repeat / buyingCustomers) * 100) : "—",
    status: "measured",
    detail:
      buyingCustomers > 0
        ? `${repeat} of ${buyingCustomers} buying customers have more than one won deal.`
        : "No won deals yet.",
    href: "/customers",
  });

  // 6. Overdue debt — customer invoices past their due date with a balance.
  const outstanding = await getOutstandingSummary();
  const hasInvoices = outstanding.receivableUsd > 0 || outstanding.payableUsd > 0 || outstanding.overdueReceivableUsd > 0 || outstanding.overduePayableUsd > 0;
  kpis.push({
    key: "overdue_debt",
    label: "Overdue debt",
    owner: owners.overdue_debt,
    value: hasInvoices ? `$${Math.round(outstanding.overdueReceivableUsd).toLocaleString("en-US")}` : "—",
    status: hasInvoices ? "measured" : "pending",
    detail: hasInvoices
      ? `Overdue customer debt $${Math.round(outstanding.overdueReceivableUsd).toLocaleString("en-US")} of $${Math.round(outstanding.receivableUsd).toLocaleString("en-US")} receivable. We owe $${Math.round(outstanding.overduePayableUsd).toLocaleString("en-US")} overdue of $${Math.round(outstanding.payableUsd).toLocaleString("en-US")} payable.`
      : "No invoices recorded yet — record invoices to measure overdue debt.",
    href: "/cashflow",
  });

  // 7. Cash deployment.
  const openCash = openAgg._sum.cashRequirement === null ? 0 : Number(openAgg._sum.cashRequirement);
  const wonCash = wonAgg._sum.cashRequirement === null ? 0 : Number(wonAgg._sum.cashRequirement);
  const wonContribution = wonAgg._sum.dealContribution === null ? 0 : Number(wonAgg._sum.dealContribution);
  kpis.push({
    key: "cash_deployment",
    label: "Cash deployment",
    owner: owners.cash_deployment,
    value: `$${Math.round(openCash).toLocaleString("en-US")}`,
    status: "measured",
    detail: `${openAgg._count._all} open deal(s). Won deals used $${Math.round(wonCash).toLocaleString("en-US")} for $${Math.round(wonContribution).toLocaleString("en-US")} contribution.`,
    href: "/exposure",
  });

  // 8. Exposure over cap.
  kpis.push({
    key: "exposure_over_cap",
    label: "Exposure over cap",
    owner: owners.exposure_over_cap,
    value: String(exposure.totals.overCapCount),
    status: "measured",
    detail: `${exposure.totals.overCapCount} group(s) over configured SKU/brand/supplier/customer caps.`,
    href: "/exposure",
  });

  // 9. Stock turn.
  kpis.push({
    key: "stock_turn",
    label: `Stock turn (${inv.windowDays}d)`,
    owner: owners.stock_turn,
    value: inv.stockTurn === null ? "—" : `${inv.stockTurn}×`,
    status: "measured",
    detail: `Won-deal COGS $${Math.round(inv.cogsUsd).toLocaleString("en-US")} against current stock value $${Math.round(inv.currentStockValueUsd).toLocaleString("en-US")}.`,
    href: "/inventory",
  });

  return { kpis, asOf: now.toISOString().slice(0, 10) };
}
