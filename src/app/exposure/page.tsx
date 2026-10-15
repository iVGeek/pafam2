import { getExposure, getExposureCaps } from "@/lib/exposure";
import { usd } from "@/lib/format";
import { ExposureCapsForm } from "./exposure-caps-form";

export const dynamic = "force-dynamic";

const DIMENSION_LABEL: Record<string, string> = {
  sku: "SKU",
  brand: "Brand",
  supplier: "Supplier",
  customer: "Customer",
};

export default async function ExposurePage() {
  const [{ rows, totals, asOf }, caps] = await Promise.all([getExposure(), getExposureCaps()]);

  const stats = [
    { label: "Committed (open deals)", value: usd(totals.committedUsd) },
    { label: "Speculative", value: usd(totals.speculativeUsd) },
    { label: "Over-cap groups", value: String(totals.overCapCount) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exposure &amp; caps</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Committed cash on open deals (draft / reviewed / approved), grouped by SKU, brand,
            supplier and customer. Speculative exposure is spend with no approved demand backing.
          </p>
          <p className="mt-1 text-xs text-zinc-500">As of {asOf}</p>
        </div>
        <ExposureCapsForm caps={JSON.stringify(caps, null, 2)} />
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="text-xs text-zinc-500">{s.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </section>

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">Dimension</th>
              <th className="px-4 py-2">Group</th>
              <th className="px-4 py-2 text-right">Open deals</th>
              <th className="px-4 py-2 text-right">Committed</th>
              <th className="px-4 py-2 text-right">Speculative</th>
              <th className="px-4 py-2 text-right">Cap</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                  No open deals; no exposure.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={`${r.dimension}:${r.key}`}
                  className={`border-t border-zinc-100 dark:border-zinc-800 ${
                    r.overCap ? "bg-red-50 dark:bg-red-950/30" : ""
                  }`}
                >
                  <td className="px-4 py-2 text-xs text-zinc-500">{DIMENSION_LABEL[r.dimension]}</td>
                  <td className="px-4 py-2">{r.key}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.openDealCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{usd(r.committedUsd)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.speculativeUsd > 0 ? usd(r.speculativeUsd) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.capUsd > 0 ? usd(r.capUsd) : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {r.capUsd === 0 ? (
                      <span className="text-zinc-400">No cap set</span>
                    ) : r.overCap ? (
                      <span className="font-medium text-red-600 dark:text-red-400">Over cap</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">Within cap</span>
                    )}
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
