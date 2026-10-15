import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { qty } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TrendsIndexPage() {
  const products = await prisma.product.findMany({
    orderBy: [{ brand: "asc" }, { fragranceName: "asc" }, { internalSku: "asc" }],
    take: 500,
    include: {
      _count: { select: { offers: true, demands: true, deals: true, marketPrices: true } },
    },
  });

  const withData = products.filter(
    (p) => p._count.offers + p._count.demands + p._count.deals + p._count.marketPrices > 0,
  );
  const listed = withData.length ? withData : products;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Price &amp; supply trends</h1>
        <p className="text-xs text-zinc-500">Per exact SKU, 7/30/90/180-day windows.</p>
      </div>

      {listed.length === 0 ? (
        <p className="text-sm text-zinc-500">No products yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">SKU</th>
                <th className="px-4 py-2 font-medium">Brand / fragrance</th>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 text-right font-medium">Offers</th>
                <th className="px-4 py-2 text-right font-medium">Demands</th>
                <th className="px-4 py-2 text-right font-medium">Deals</th>
                <th className="px-4 py-2 text-right font-medium">Market</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-900">
              {listed.map((p) => (
                <tr key={p.id} className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60">
                  <td className="px-4 py-1.5">
                    <Link className="text-blue-600 hover:underline dark:text-blue-400" href={`/trends/${p.id}`}>
                      {p.internalSku}
                    </Link>
                  </td>
                  <td className="px-4 py-1.5">
                    {p.brand ?? "—"}
                    {p.fragranceName ? ` · ${p.fragranceName}` : ""}
                  </td>
                  <td className="px-4 py-1.5">{p.sizeMl ? `${p.sizeMl} ml` : "—"}</td>
                  <td className="px-4 py-1.5 text-right">{qty(p._count.offers)}</td>
                  <td className="px-4 py-1.5 text-right">{qty(p._count.demands)}</td>
                  <td className="px-4 py-1.5 text-right">{qty(p._count.deals)}</td>
                  <td className="px-4 py-1.5 text-right">{qty(p._count.marketPrices)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
