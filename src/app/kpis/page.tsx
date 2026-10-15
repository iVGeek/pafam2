import Link from "next/link";
import { getKpiOwners, getKpis, KPI_OWNER_DEFAULTS } from "@/lib/kpis";
import { KpiOwnersForm } from "./kpi-owners-form";

export const dynamic = "force-dynamic";

export default async function KpisPage() {
  const [{ kpis, asOf }, owners] = await Promise.all([getKpis(), getKpiOwners()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">KPIs</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Quote conversion, lost-sale reasons, customer repeat purchases, cash deployment, exposure
            and stock turn. KPIs whose inputs do not exist yet are marked pending with the data source
            they need — never shown as zero.
          </p>
          <p className="mt-1 text-xs text-zinc-500">As of {asOf}</p>
        </div>
        <KpiOwnersForm owners={JSON.stringify({ ...KPI_OWNER_DEFAULTS, ...owners }, null, 2)} />
      </div>

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">KPI</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2 text-right">Value</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((k) => (
              <tr key={k.key} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-2">
                  {k.href ? (
                    <Link href={k.href} className="hover:underline">
                      {k.label}
                    </Link>
                  ) : (
                    k.label
                  )}
                </td>
                <td className="px-4 py-2 text-xs">{k.owner}</td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">{k.value}</td>
                <td className="px-4 py-2 text-xs">
                  {k.status === "measured" ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      measured
                    </span>
                  ) : (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      pending
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-zinc-500">{k.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
