import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTradingSettings } from "@/lib/deals";
import { ProductSuppliers } from "./product-suppliers";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, settings, fxRates] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        aliases: true,
        offers: {
          include: { supplier: { select: { name: true, country: true } } },
          orderBy: [{ status: "asc" }, { listDate: "desc" }, { createdAt: "desc" }],
        },
      },
    }),
    getTradingSettings(),
    prisma.fxRate.findMany({
      where: { quoteCurrency: "USD" },
      orderBy: { rateDate: "desc" },
      select: { baseCurrency: true, rate: true },
    }),
  ]);
  if (!product) notFound();

  const fxLatest: Record<string, number> = { USD: 1 };
  for (const rate of fxRates) {
    if (fxLatest[rate.baseCurrency] === undefined) {
      fxLatest[rate.baseCurrency] = Number(rate.rate);
    }
  }

  const pricedOffers = product.offers.filter((o) => o.price !== null && o.status === "ACTIVE");

  const title =
    [product.brand, product.fragranceName, product.concentration].filter(Boolean).join(" ") ||
    product.internalSku;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/products" className="text-xs text-zinc-500 hover:underline">
          ← Products
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {product.internalSku}
          {product.sizeMl ? ` · ${product.sizeMl} ml` : ""}
          {product.genderOrCategory ? ` · ${product.genderOrCategory}` : ""}
          {product.gtin14 ? ` · GTIN ${product.gtin14}` : ""}
        </p>
      </div>

      {pricedOffers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
          No active priced offers for this product yet.
        </p>
      ) : (
        <ProductSuppliers
          defaultMargin={settings.minContributionMarginPct}
          fxLatest={fxLatest}
          offers={pricedOffers.map((o) => ({
            id: o.id,
            supplierId: o.supplierId,
            supplierName: o.supplier.name,
            supplierCountry: o.supplier.country,
            originalCode: o.originalCode,
            price: o.price === null ? 0 : Number(o.price),
            currency: (o.currency ?? "USD").toUpperCase(),
            priceBasis: o.priceBasis,
            unitsPerCase: o.unitsPerCase,
            availableQuantity: o.availableQuantity === null ? null : Number(o.availableQuantity),
            moq: o.moq,
            orderMultiple: o.orderMultiple,
            leadTimeDays: o.leadTimeDays,
            paymentTerms: o.paymentTerms,
            stockCountry: o.stockCountry,
            incoterm: o.incoterm,
            listDate: o.listDate ? o.listDate.toISOString().slice(0, 10) : null,
            lastStockConfirmation: o.lastStockConfirmation
              ? o.lastStockConfirmation.toISOString().slice(0, 10)
              : null,
            usSuitability: o.usSuitability,
          }))}
        />
      )}
    </div>
  );
}
