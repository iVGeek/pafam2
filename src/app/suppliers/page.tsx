import { getSupplierScorecard } from "@/lib/suppliers";
import { pct, qty, usd } from "@/lib/format";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const { suppliers, dimensions, asOf } = await getSupplierScorecard();

  const ranked = suppliers.filter((s) => s.rank !== null);
  const others = suppliers.filter((s) => s.rank === null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Supplier scorecard</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Ranking is based on executable landed cost, confirmation freshness, authenticity
          evidence and — where receipts exist — fill rate, on-time delivery and claims. Cheapest
          price alone is not sufficient; dimensions with no data yet are shown as *pending* and
          do not affect the score.
        </p>
        <p className="mt-1 text-xs text-zinc-500">As of {asOf}</p>
      </div>
      <SearchBar placeholder="Search…" />

      <section>
        <h2 className="text-lg font-medium">Ranking (suppliers with priced, active offers)</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-2">Rank</th>
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2">Country</th>
                <th className="px-4 py-2 text-right">Active offers</th>
                <th className="px-4 py-2 text-right">Priced offers</th>
                <th className="px-4 py-2 text-right">Min landed</th>
                <th className="px-4 py-2 text-right">Median landed</th>
                <th className="px-4 py-2 text-right">Stale</th>
                <th className="px-4 py-2 text-right">Freshness</th>
                <th className="px-4 py-2 text-right">Auth. evidence</th>
                <th className="px-4 py-2 text-right">Fill rate</th>
                <th className="px-4 py-2 text-right">On-time</th>
                <th className="px-4 py-2 text-right">Claims</th>
                <th className="px-4 py-2 text-right">Score (0-100)</th>
                <th className="px-4 py-2">Payment terms</th>
              </tr>
            </thead>
            <tbody>
              {ranked.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-4 py-8 text-center text-zinc-500">
                    No priced active offers yet; scorecard cannot rank by landed cost.
                  </td>
                </tr>
              ) : (
                ranked.map((s) => (
                  <tr key={s.supplierId} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2 tabular-nums">{s.rank ?? "—"}</td>
                    <td className="px-4 py-2">{s.name}</td>
                    <td className="px-4 py-2 text-xs">{s.country ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{qty(s.activeOfferCount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{qty(s.pricedOfferCount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(s.minLandedUsd, 4)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(s.medianLandedUsd, 4)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.staleCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.stalePct === null ? "—" : pct(100 - s.stalePct)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.authenticityPct === null ? "—" : pct(s.authenticityPct)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.fillRatePct === null ? <span className="text-zinc-400">pending</span> : pct(s.fillRatePct)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.onTimePct === null ? <span className="text-zinc-400">pending</span> : pct(s.onTimePct)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.claimCount === 0 ? (
                        <span className="text-zinc-400">—</span>
                      ) : (
                        <span title={`${usd(s.claimAmountUsd)} claimed`}>{s.claimCount}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{s.score ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{s.paymentTerms ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">Other suppliers</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2">Country</th>
                <th className="px-4 py-2 text-right">Active offers</th>
                <th className="px-4 py-2 text-right">Priced offers</th>
                <th className="px-4 py-2 text-right">Stale %</th>
                <th className="px-4 py-2 text-right">Auth. %</th>
                <th className="px-4 py-2 text-right">US suitable %</th>
                <th className="px-4 py-2 text-right">Median lead time</th>
                <th className="px-4 py-2 text-right">Fill rate</th>
                <th className="px-4 py-2 text-right">On-time</th>
                <th className="px-4 py-2 text-right">Claims</th>
                <th className="px-4 py-2 text-right">Won deals</th>
                <th className="px-4 py-2 text-right">Won contribution</th>
              </tr>
            </thead>
            <tbody>
              {others.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-zinc-500">
                    No other suppliers to show.
                  </td>
                </tr>
              ) : (
                others.map((s) => (
                  <tr key={s.supplierId} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2">{s.name}</td>
                    <td className="px-4 py-2 text-xs">{s.country ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{qty(s.activeOfferCount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{qty(s.pricedOfferCount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.stalePct === null ? "—" : pct(s.stalePct)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.authenticityPct === null ? "—" : pct(s.authenticityPct)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.usSuitablePct === null ? "—" : pct(s.usSuitablePct)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.medianLeadTimeDays === null ? "—" : `${s.medianLeadTimeDays} d`}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.fillRatePct === null ? <span className="text-zinc-400">pending</span> : pct(s.fillRatePct)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.onTimePct === null ? <span className="text-zinc-400">pending</span> : pct(s.onTimePct)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.claimCount === 0 ? "—" : s.claimCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{qty(s.wonDeals)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(s.wonContributionUsd)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">Dimensional coverage</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-2">Dimension</th>
                <th className="px-4 py-2">Measured</th>
                <th className="px-4 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((d) => (
                <tr key={d.key} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-2">{d.label}</td>
                  <td className="px-4 py-2 text-xs">{d.measured ? "Yes" : "No — unavailable"}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{d.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
