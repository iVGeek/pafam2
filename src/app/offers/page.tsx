import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { daysAgo, money, qty } from "@/lib/format";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const offers = await prisma.offer.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ listDate: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      supplier: { select: { name: true } },
      product: { select: { internalSku: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Supplier offers</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Observed supply and prices over time. Each row is a dated observation from one supplier
          file, not our own stock.
        </p>
      </div>
      <SearchBar placeholder="Search…" />

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">Supplier</th>
              <th className="px-4 py-2">Product / code</th>
              <th className="px-4 py-2">Pack</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-right">Available</th>
              <th className="px-4 py-2">Terms</th>
              <th className="px-4 py-2">Listed</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {offers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                  No active offers. Import a supplier file first.
                </td>
              </tr>
            ) : (
              offers.map((o) => (
                <tr
                  key={o.id}
                  className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-2">{o.supplier.name}</td>
                  <td className="px-4 py-2">
                    <div className="font-mono text-xs">{o.originalCode}</div>
                    <div className="text-xs text-zinc-500">
                      {(o.product?.internalSku ??
                        `${o.brand ?? ""} ${o.fragranceName ?? ""}`.trim()) ||
                        "— unlinked —"}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs">{o.packagingLevel}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {o.price ? money(Number(o.price), o.currency ?? "USD") : "—"}
                    {o.priceBasis === "CASE" ? "/case" : ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {o.availableQuantity ? qty(Number(o.availableQuantity)) : "?"}
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-500">
                    {[o.incoterm, o.stockCountry, o.paymentTerms].filter(Boolean).join(" · ") ||
                      "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-500">
                    {daysAgo(o.listDate ?? o.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/offers/${o.id}`} className="text-xs hover:underline">
                      Recommend →
                    </Link>
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
