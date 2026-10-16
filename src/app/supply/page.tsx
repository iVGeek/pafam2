import { getObservedSupply } from "@/lib/supply";
import { qty } from "@/lib/format";

export const dynamic = "force-dynamic";

function confBadge(confidence: string) {
  const map: Record<string, string> = {
    FIRM: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    INDICATIVE: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    INCOMING: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
    ON_REQUEST: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
    UNKNOWN: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  };
  return map[confidence] ?? map.UNKNOWN;
}

export default async function SupplyPage() {
  const supply = await getObservedSupply();
  const { totals, coverage } = supply;
  const fresh = supply.products.reduce(
    (n, p) => n + p.pools.filter((pool) => pool.fresh).length,
    0,
  );
  const allPools = supply.products.reduce((n, p) => n + p.pools.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Observed available supply</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Latest confirmed quantity per distinct stock owner and lot. Several brokers offering
          one owner&apos;s lot are linked to a single pool and counted once — never summed.
          Ownership-unknown stock is shown as a range separately. Firm, indicative, incoming
          and on-request availability are kept apart.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          As of {supply.asOf} · confirmed within {supply.freshnessDays} days counts as fresh
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Confirmed (deduplicated)" value={qty(totals.confirmedQuantity)} />
        <Stat label="Stock pools" value={qty(totals.poolCount)} />
        <Stat label="Sources" value={qty(totals.sourceCount)} />
        <Stat label="Distinct owners" value={qty(totals.distinctOwners)} />
        <Stat label="Fresh pools" value={`${fresh} / ${allPools}`} />
        <Stat label="Unverified pools" value={qty(totals.unverifiedPoolCount)} />
        <Stat label="Raw offer sum" value={qty(totals.rawOfferQuantity)} />
        <Stat
          label="Double-count avoided"
          value={qty(totals.dedupedSaving)}
          hint="Raw sum minus deduplicated pools"
        />
      </section>

      <p className="text-xs text-zinc-500">
        Coverage: {coverage.productsWithConfirmed} product(s) with confirmed supply ·{" "}
        {coverage.productsWithUnverifiedOnly} product(s) with only unverified/indicative stock.
        An estimate of total territory stock would need independent coverage evidence and a
        documented method; it is not extrapolated from supplier counts alone.
      </p>

      {supply.products.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No active offers yet. Import a supplier price list to build observed supply.
        </p>
      ) : (
        supply.products.map((p) => (
          <section key={p.productId}>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-lg font-medium">{p.internalSku}</h2>
              <span className="text-sm text-zinc-500">
                {[p.brand, p.fragranceName].filter(Boolean).join(" · ")}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Confirmed {qty(p.confirmedQuantity)} units · pools {p.poolCount} · sources{" "}
              {p.sourceCount} · owners {p.ownerCount}
              {p.indicativeQuantity > 0 ? ` · indicative ${qty(p.indicativeQuantity)}` : ""}
              {p.incomingQuantity > 0 ? ` · incoming ${qty(p.incomingQuantity)}` : ""}
              {p.onRequestQuantity > 0 ? ` · on request ${qty(p.onRequestQuantity)}` : ""}
              {p.possibleOverlapMax > 0
                ? ` · possible overlap ${qty(p.possibleOverlapMin)}–${qty(p.possibleOverlapMax)}`
                : ""}
              {p.unverifiedMax > 0
                ? ` · unverified ${qty(p.unverifiedMin)}–${qty(p.unverifiedMax)}`
                : ""}
            </p>
            <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
                  <tr>
                    <th className="px-3 py-2">Pool</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Availability</th>
                    <th className="px-3 py-2 text-right">Quantity</th>
                    <th className="px-3 py-2 text-right">Sources</th>
                    <th className="px-3 py-2">Confirmed</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Destinations</th>
                  </tr>
                </thead>
                <tbody>
                  {p.pools.map((pool) => (
                    <tr key={pool.key} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2">{pool.label}</td>
                      <td className="px-3 py-2 text-xs">
                        {pool.status === "CONFIRMED"
                          ? "Confirmed"
                          : pool.status === "POSSIBLE"
                            ? "Possible overlap"
                            : "Unverified"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${confBadge(pool.confidence)}`}>
                          {pool.confidence.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {pool.reportedQuantity === null ? "—" : qty(pool.reportedQuantity)}
                        {pool.quantityMin !== null &&
                          pool.quantityMax !== null &&
                          pool.quantityMin !== pool.quantityMax && (
                            <span className="text-xs text-zinc-500">
                              {" "}
                              ({qty(pool.quantityMin)}–{qty(pool.quantityMax)})
                            </span>
                          )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{pool.sourceCount}</td>
                      <td className="px-3 py-2 text-xs">
                        {pool.confirmationDate ?? "—"}
                        {pool.ageDays !== null && (
                          <span className={pool.fresh ? "text-emerald-600" : "text-amber-600"}>
                            {" "}
                            ({pool.ageDays}d{pool.fresh ? "" : " stale"})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">{pool.locations.join(", ") || "—"}</td>
                      <td className="px-3 py-2 text-xs">{pool.destinations.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="text-xs uppercase text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}
