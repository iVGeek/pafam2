import { prisma } from "@/lib/prisma";
import { getTradingSettings } from "@/lib/deals";
import { money, qty } from "@/lib/format";
import { DealCalculator } from "./deal-calculator";

export const dynamic = "force-dynamic";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ offer?: string }>;
}) {
  const { offer: initialOfferId } = await searchParams;
  const [suppliers, offers, products, customers, settings, fxRates] = await Promise.all([
    prisma.supplier.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.offer.findMany({
      where: { status: "ACTIVE", price: { not: null } },
      orderBy: [{ listDate: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        supplierId: true,
        productId: true,
        brand: true,
        fragranceName: true,
        concentration: true,
        sizeMl: true,
        currency: true,
        price: true,
        priceBasis: true,
        unitsPerCase: true,
        availableQuantity: true,
        moq: true,
        orderMultiple: true,
        priceTierMin: true,
        priceTierMax: true,
        originalCode: true,
      },
    }),
    prisma.product.findMany({
      orderBy: { internalSku: "asc" },
      select: { id: true, internalSku: true, brand: true, fragranceName: true },
    }),
    prisma.customer.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getTradingSettings(),
    prisma.fxRate.findMany({
      where: { quoteCurrency: "USD" },
      orderBy: { rateDate: "desc" },
      select: { baseCurrency: true, rate: true, rateDate: true },
    }),
  ]);

  const supplierNames = new Map(suppliers.map((s) => [s.id, s.name]));
  const fxLatest: Record<string, number> = {};
  for (const rate of fxRates) {
    if (fxLatest[rate.baseCurrency] === undefined) {
      fxLatest[rate.baseCurrency] = Number(rate.rate);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Deal calculator</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Prices are converted to USD with a dated rate. Case prices are converted to bottle
          prices before comparison, and every result traces back to the inputs above.
        </p>
      </div>

      <DealCalculator
        suppliers={suppliers.map((s) => ({ id: s.id, label: s.name }))}
        offers={offers.map((o) => ({
          id: o.id,
          supplierId: o.supplierId,
          label:
            `${supplierNames.get(o.supplierId) ?? "Unknown"} — ` +
            `${o.brand ?? ""} ${o.fragranceName ?? ""}`.trim() +
            `${o.sizeMl ? ` ${o.sizeMl}ml` : ""}` +
            `${o.concentration ? ` ${o.concentration}` : ""}` +
            ` · ${o.price ? money(Number(o.price), o.currency ?? "USD") : "—"}` +
            `${o.priceBasis === "CASE" ? "/case" : ""}` +
            ` · ${o.availableQuantity ? qty(Number(o.availableQuantity)) : "?"} units` +
            ` · ${o.originalCode}`,
          currency: o.currency,
          price: o.price === null ? null : Number(o.price),
          priceBasis: o.priceBasis,
          unitsPerCase: o.unitsPerCase,
          availableQuantity: o.availableQuantity === null ? null : Number(o.availableQuantity),
          productId: o.productId,
          brand: o.brand,
          fragranceName: o.fragranceName,
          moq: o.moq,
          orderMultiple: o.orderMultiple,
          priceTierMin: o.priceTierMin,
          priceTierMax: o.priceTierMax,
        }))}
        products={products.map((p) => ({
          id: p.id,
          label: `${p.internalSku} ${p.brand ?? ""} ${p.fragranceName ?? ""}`.trim(),
        }))}
        customers={customers.map((c) => ({ id: c.id, label: c.name }))}
        fxLatest={fxLatest}
        minContributionMarginPct={settings.minContributionMarginPct}
        defaultCashCycleDays={settings.defaultCashCycleDays}
        initialOfferId={initialOfferId}
      />
    </div>
  );
}
