import { prisma } from "@/lib/prisma";
import { NewProductForm } from "./new-product-form";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { internalSku: "asc" },
    take: 200,
    include: { _count: { select: { aliases: true, offers: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Product master
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {products.length} product(s). Barcodes map to these records via the
            alias table.
          </p>
        </div>
      </div>

      <NewProductForm />

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">GTIN-14</th>
              <th className="px-4 py-2">Brand</th>
              <th className="px-4 py-2">Fragrance</th>
              <th className="px-4 py-2">Size</th>
              <th className="px-4 py-2 text-right">Aliases</th>
              <th className="px-4 py-2 text-right">Offers</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  No products yet. Add one, or create products from the
                  exception queue.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-2 font-mono text-xs">{p.internalSku}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {p.gtin14 ?? "—"}
                  </td>
                  <td className="px-4 py-2">{p.brand ?? "—"}</td>
                  <td className="px-4 py-2">{p.fragranceName ?? "—"}</td>
                  <td className="px-4 py-2 tabular-nums">
                    {p.sizeMl ? `${p.sizeMl} ml` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {p._count.aliases}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {p._count.offers}
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
