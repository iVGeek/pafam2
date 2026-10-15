import Link from "next/link";
import { listDeals } from "@/lib/deals";
import { dateStr, pct, qty, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const deals = await listDeals(200);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deals</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Landed cost, contribution and cash return for each proposed buy. Saved figures are
            recomputed from inputs on every save.
          </p>
        </div>
        <Link
          href="/deals/new"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          New deal
        </Link>
      </div>

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Supplier</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Landed unit</th>
              <th className="px-4 py-2 text-right">Contribution</th>
              <th className="px-4 py-2 text-right">Margin</th>
              <th className="px-4 py-2 text-right">Cash</th>
              <th className="px-4 py-2 text-right">Annualised</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-zinc-500">
                  No deals yet. Build one from an offer in the{" "}
                  <Link href="/deals/new" className="underline">
                    deal calculator
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              deals.map((d) => (
                <tr
                  key={d.id}
                  className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        d.status === "APPROVED" || d.status === "WON"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : d.status === "LOST"
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {d.status}
                    </span>
                    {d.incomplete ? (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        incomplete
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/deals/${d.id}`} className="hover:underline">
                      {d.supplier.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {d.product
                      ? `${d.product.internalSku} · ${d.product.brand ?? ""} ${d.product.fragranceName ?? ""}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">{d.customer?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{qty(Number(d.quantity))}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {usd(d.landedUnitCost === null ? null : Number(d.landedUnitCost))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {usd(d.dealContribution === null ? null : Number(d.dealContribution))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {pct(d.contributionMarginPct === null ? null : Number(d.contributionMarginPct))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {usd(d.cashRequirement === null ? null : Number(d.cashRequirement))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {d.annualisedReturnPct === null ? "—" : pct(Number(d.annualisedReturnPct))}
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{dateStr(d.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
