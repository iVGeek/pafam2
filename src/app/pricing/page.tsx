import { prisma } from "@/lib/prisma";
import { getTradingSettings } from "@/lib/deals";
import {
  getCustomerPricingConfig,
  parsePaymentTermDays,
  resolveCustomerMarginPct,
} from "@/lib/customer-pricing";
import { pct } from "@/lib/format";
import { CustomerPricingForm } from "./customer-pricing-form";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const [customers, settings, config] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, take: 300 }),
    getTradingSettings(),
    getCustomerPricingConfig(),
  ]);

  const rows = customers.map((c) => {
    const { marginPct, source } = resolveCustomerMarginPct(config, c.id, settings.minContributionMarginPct);
    const termDays = parsePaymentTermDays(c.paymentTerms);
    return {
      id: c.id,
      name: c.name,
      paymentTerms: c.paymentTerms,
      marginPct,
      source,
      termDays,
      cashCycleDays: termDays ?? settings.defaultCashCycleDays,
      cashCycleSource: termDays === null ? "default" : "terms",
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customer pricing</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            The minimum sell price for a customer is computed through the same pricing engine as
            every deal. Only the required contribution margin and the cash cycle implied by the
            customer&apos;s payment terms change per customer.
          </p>
        </div>
        <CustomerPricingForm config={JSON.stringify(config, null, 2)} />
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card label="Global minimum margin" value={pct(settings.minContributionMarginPct)} />
        <Card
          label="Default customer margin"
          value={config.defaultMarginPct === null ? "— (uses global)" : pct(config.defaultMarginPct)}
        />
        <Card label="Per-customer overrides" value={String(Object.keys(config.overrides).length)} />
      </section>

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Payment terms</th>
              <th className="px-4 py-2 text-right">Required margin</th>
              <th className="px-4 py-2">Margin source</th>
              <th className="px-4 py-2 text-right">Cash cycle (days)</th>
              <th className="px-4 py-2">Cycle source</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No customers yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{r.paymentTerms ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{pct(r.marginPct)}</td>
                  <td className="px-4 py-2 text-xs">
                    {r.source === "override" ? (
                      <span className="text-emerald-600 dark:text-emerald-400">override</span>
                    ) : r.source === "default" ? (
                      <span className="text-sky-600 dark:text-sky-400">default</span>
                    ) : (
                      <span className="text-zinc-500">global</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.cashCycleDays}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{r.cashCycleSource}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
