import { prisma } from "@/lib/prisma";
import { listClaims } from "@/lib/receipts";
import { dateStr, qty, usd } from "@/lib/format";
import { ClaimForm, ClaimStatusControl } from "./claim-tools";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  OPEN: "text-amber-700 dark:text-amber-400",
  RESOLVED: "text-emerald-700 dark:text-emerald-400",
  REJECTED: "text-zinc-500",
};

export default async function ClaimsPage() {
  const [claims, suppliers] = await Promise.all([
    listClaims(),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const open = claims.filter((c) => c.status === "OPEN");
  const openValue = open.reduce((s, c) => s + (c.amountUsd === null ? 0 : Number(c.amountUsd)), 0);
  const totalValue = claims.reduce((s, c) => s + (c.amountUsd === null ? 0 : Number(c.amountUsd)), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Supplier claims &amp; returns</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Log shortages, damage, quality issues, late deliveries and returns. Claims count against
          the supplier on the scorecard (§18).
        </p>
      </div>
      <SearchBar placeholder="Search…" />

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-white p-5 text-sm sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Stat label="Claims" value={qty(claims.length)} />
        <Stat label="Open" value={qty(open.length)} />
        <Stat label="Open value" value={usd(openValue)} />
        <Stat label="Total value" value={usd(totalValue)} />
      </div>

      <ClaimForm suppliers={suppliers} />

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">Opened</th>
              <th className="px-4 py-2">Supplier</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2 text-right">Units</th>
              <th className="px-4 py-2 text-right">Value</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {claims.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  No claims recorded.
                </td>
              </tr>
            ) : (
              claims.map((c) => (
                <tr key={c.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-2 text-xs">{dateStr(c.openedDate)}</td>
                  <td className="px-4 py-2">{c.supplier.name}</td>
                  <td className="px-4 py-2 text-xs">{c.type}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {c.units === null ? "—" : qty(c.units)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {c.amountUsd === null ? "—" : usd(Number(c.amountUsd))}
                  </td>
                  <td className="px-4 py-2 text-xs">{c.description}</td>
                  <td className={`px-4 py-2 ${STATUS_STYLE[c.status] ?? ""}`}>
                    <ClaimStatusControl id={c.id} status={c.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}
