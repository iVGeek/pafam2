import { prisma } from "@/lib/prisma";
import { dateStr } from "@/lib/format";
import { FxForm } from "./fx-form";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function FxPage() {
  const rates = await prisma.fxRate.findMany({
    orderBy: [{ baseCurrency: "asc" }, { rateDate: "desc" }],
    take: 200,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exchange rates</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Dated rates expressed as USD per one unit of the source currency. The latest rate on or
          before the deal date is used; the original currency and source are always retained.
        </p>
      </div>
      <SearchBar placeholder="Search…" />

      <FxForm />

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">Currency</th>
              <th className="px-4 py-2">Quote</th>
              <th className="px-4 py-2 text-right">Rate (USD per 1)</th>
              <th className="px-4 py-2">Rate date</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Booked</th>
            </tr>
          </thead>
          <tbody>
            {rates.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No rates yet. USD is always treated as 1.
                </td>
              </tr>
            ) : (
              rates.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-2 font-mono text-xs">{r.baseCurrency}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.quoteCurrency}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(r.rate).toFixed(6)}</td>
                  <td className="px-4 py-2 text-xs">{dateStr(r.rateDate)}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{r.source ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{r.booked ? "yes" : "no"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
