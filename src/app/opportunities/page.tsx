import { getOpportunityRanking, OPPORTUNITY_DIMENSIONS } from "@/lib/opportunities";
import { pct, qty, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const { opportunities, asOf } = await getOpportunityRanking();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Opportunity ranking</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          The best executable offer for each live approved requirement, scored by contribution,
          credible sell-through, cash cycle, customer credit and concentration risk. Estimates
          only — cheapest price alone is not enough.
        </p>
        <p className="mt-1 text-xs text-zinc-500">As of {asOf}</p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium">How the score is built</h2>
        <ul className="mt-2 grid grid-cols-1 gap-2 text-xs text-zinc-600 sm:grid-cols-2 lg:grid-cols-3 dark:text-zinc-400">
          {OPPORTUNITY_DIMENSIONS.map((d) => (
            <li key={d.key} className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
              <div className="font-medium text-zinc-800 dark:text-zinc-200">{d.label}</div>
              <div>{d.detail}</div>
              <div className="mt-1 text-zinc-400">
                Component basis 0–100. Contributions are scored relative to the other opportunities.
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Supplier → Customer</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Landed</th>
              <th className="px-3 py-2 text-right">Target</th>
              <th className="px-3 py-2 text-right">Contribution</th>
              <th className="px-3 py-2 text-right">Margin</th>
              <th className="px-3 py-2 text-right">Cash</th>
              <th className="px-3 py-2 text-right">Cycle</th>
              <th className="px-3 py-2">Credit</th>
              <th className="px-3 py-2">Flags</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-zinc-500">
                  No matched opportunities yet. Add approved demand and active offers for the same SKU.
                </td>
              </tr>
            ) : (
              opportunities.map((o) => (
                <tr
                  key={`${o.offerId}:${o.demandId}`}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{(o.score / 10).toFixed(1)}</td>
                  <td className="px-3 py-2">
                    <div className="font-mono text-xs">{o.internalSku}</div>
                    <div className="text-xs text-zinc-500">{o.brand ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {o.supplierName}
                    <span className="text-zinc-400"> → </span>
                    {o.customerName}
                    <div className="text-zinc-500">
                      {o.stage}
                      {o.certainty === "INFERRED" ? " · inferred" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{qty(o.quantity)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(o.landedUnitCost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(o.targetPriceUsd)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(o.contribution)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(o.contributionMarginPct)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(o.cashRequirement)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.cashCycleDays}</td>
                  <td className="px-3 py-2 text-xs">
                    {o.creditLimitUsd === null ? (
                      <span className="text-amber-600 dark:text-amber-400">No limit</span>
                    ) : o.cashRequirement > o.creditLimitUsd ? (
                      <span className="text-red-600 dark:text-red-400">Over limit</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">Within limit</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {o.flags.length ? o.flags.join("; ") : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
