import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTradingSettings, recommendationForOffer } from "@/lib/deals";
import { getCustomerMinSellPrice } from "@/lib/customer-pricing";
import { daysAgo, money, pct, qty, usd, dateStr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OfferRecommendationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      supplier: true,
      product: true,
      sourceFile: { select: { filename: true } },
    },
  });
  if (!offer) notFound();

  const rec = await recommendationForOffer(offer);
  const settings = await getTradingSettings();

  // §18: customer-specific minimum sell price, computed through the shared
  // pricing engine with each customer's required margin and payment-term cycle.
  const customerPricing = await Promise.all(
    rec.customerMatches.map((m) =>
      getCustomerMinSellPrice(m.customerId, {
        quantity: m.quantity ?? rec.executableQuantity,
        buyCurrency: offer.currency ?? "USD",
        buyPrice: Number(offer.price ?? 0),
        buyPriceBasis: offer.priceBasis === "CASE" ? "CASE" : "UNIT",
        unitsPerCase: offer.unitsPerCase,
        fxRate: rec.fxRate || null,
        inboundCosts: [],
        inboundCostsComplete: false,
      }),
    ),
  );
  const minSellByDemand = new Map(customerPricing.map((p) => [p.customerId, p]));

  const facts: { label: string; value: string }[] = [
    { label: "Original code (kept as text)", value: offer.originalCode },
    { label: "Code type", value: offer.originalCodeType },
    { label: "Packaging level", value: offer.packagingLevel },
    { label: "Brand", value: offer.brand ?? "—" },
    { label: "Fragrance", value: offer.fragranceName ?? "—" },
    { label: "Concentration", value: offer.concentration ?? "—" },
    { label: "Size", value: offer.sizeMl ? `${offer.sizeMl} ml` : "—" },
    { label: "Currency / price", value: offer.price ? `${money(Number(offer.price), offer.currency ?? "USD")}` : "—" },
    { label: "Price basis", value: offer.priceBasis ?? "UNIT" },
    { label: "Units per case", value: offer.unitsPerCase ? String(offer.unitsPerCase) : "—" },
    { label: "Available quantity", value: offer.availableQuantity ? qty(Number(offer.availableQuantity)) : "?" },
    { label: "MOQ / order multiple", value: [offer.moq, offer.orderMultiple].filter((v) => v !== null).join(" / ") || "—" },
    { label: "Incoterm", value: [offer.incoterm, offer.namedPlace].filter(Boolean).join(" ") || "—" },
    { label: "Stock location", value: [offer.warehouse, offer.stockCountry].filter(Boolean).join(", ") || "—" },
    { label: "Payment terms", value: offer.paymentTerms ?? "—" },
    { label: "Lead time", value: offer.leadTimeDays ? `${offer.leadTimeDays} days` : "—" },
    { label: "US suitability", value: offer.usSuitability ?? "—" },
    { label: "Permitted destinations", value: offer.permittedDestinations ?? "—" },
    { label: "Stock confidence", value: offer.stockConfidence ?? "—" },
    { label: "Last stock confirmation", value: daysAgo(offer.lastStockConfirmation) },
    { label: "List date", value: dateStr(offer.listDate) },
    { label: "Valid until", value: dateStr(offer.validUntil) },
    { label: "Source file", value: offer.sourceFile?.filename ?? "—" },
    { label: "Source row", value: offer.sourceRow ? String(offer.sourceRow) : "—" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/offers" className="text-xs text-zinc-500 hover:underline">
          ← Offers
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {offer.brand ?? ""} {offer.fragranceName ?? "Untitled offer"}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {offer.supplier.name}
          {offer.product ? ` · ${offer.product.internalSku}` : " · unlinked to product master"}
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Buying recommendation</h2>
          <Link
            href={`/deals/new?offer=${offer.id}`}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Build deal
          </Link>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Manager threshold applied: minimum contribution margin{" "}
          {pct(settings.minContributionMarginPct)}. Estimates only — not a forecast.
        </p>

        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Supplier" value={rec.supplierName} />
          <Item label="Exact SKU" value={rec.product?.internalSku ?? "— unlinked product —"} />
          <Item label="Executable quantity" value={`${qty(rec.executableQuantity)} units`} />
          <Item label="Customer matches" value={rec.demandStatus} />
          <Item label="Landed cost (USD/unit)" value={usd(rec.landedUnitCost, 4)} />
          <Item
            label="Suggested selling price"
            value={usd(rec.suggestedSellingPriceUsd)}
          />
          <Item
            label="Max buy price (USD/unit)"
            value={
              rec.maxBuyPriceUsd === null
                ? "—"
                : `${usd(rec.maxBuyPriceUsd, 4)}${
                    rec.maxBuyPriceSourceCurrency !== null
                      ? ` (${rec.maxBuyPriceSourceCurrency} ${offer.currency ?? "USD"})`
                      : ""
                  }`
            }
          />
          <Item label="Contribution" value={usd(rec.contribution)} />
          <Item label="Cash requirement" value={usd(rec.cashRequirement)} />
          <Item label="Expected collection date" value={rec.expectedCollectionDate ?? "—"} />
          <Item
            label="FX"
            value={rec.fxRate ? `${rec.fxRate} ${rec.fxRateDate ? `(${rec.fxRateDate})` : ""}` : "missing"}
          />
          <Item label="FX source" value={rec.fxSource ?? "—"} />
          <Item
            label="Data quality"
            value={rec.incomplete ? "Incomplete profitability" : "Complete"}
          />
        </dl>

        {rec.customerMatches.length ? (
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-1">Customer</th>
                <th className="py-1">Status</th>
                <th className="py-1 text-right">Target price</th>
                <th className="py-1 text-right">Min sell price</th>
                <th className="py-1 text-right">Quantity</th>
                <th className="py-1">Needed by</th>
              </tr>
            </thead>
            <tbody>
              {rec.customerMatches.map((m) => {
                const cmin = minSellByDemand.get(m.customerId);
                const min = cmin?.minSellPriceUsd ?? null;
                const below = min !== null && m.targetPrice !== null && m.targetPrice < min;
                return (
                  <tr key={m.demandId} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5">{m.customerName}</td>
                    <td className="py-1.5 text-xs">{m.status}</td>
                    <td className="py-1.5 text-right tabular-nums">{usd(m.targetPrice)}</td>
                    <td className={`py-1.5 text-right tabular-nums ${below ? "text-amber-600 dark:text-amber-400" : ""}`}>
                      {usd(min ?? null)}
                      {cmin && min !== null && cmin.marginSource !== "global" ? (
                        <span className="ml-1 text-[10px] text-zinc-400">
                          ({cmin.marginPct}% · {cmin.marginSource})
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {m.quantity ? qty(m.quantity) : "—"}
                    </td>
                    <td className="py-1.5 text-xs">{m.neededBy ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">
            No approved customer demand matches this SKU yet. Create demand in{" "}
            <Link href="/demands" className="underline">
              Customer demand
            </Link>
            .
          </p>
        )}

        <div className="mt-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <span className="font-medium">Missing assumptions: </span>
          {rec.missingAssumptions.length ? rec.missingAssumptions.join("; ") : "none"}
          {!offer.productId
            ? " · Product is not linked to the product master, so demand cannot be matched."
            : ""}
        </div>

        {rec.warnings.length ? (
          <div className="mt-2 rounded-md bg-sky-50 p-3 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-300">
            <span className="font-medium">Quantity constraints: </span>
            {rec.warnings.join("; ")}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-medium">Offer facts</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label} className="flex justify-between gap-3 border-b border-zinc-100 py-1 dark:border-zinc-800">
              <dt className="text-xs text-zinc-500">{f.label}</dt>
              <dd className="text-right">{f.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
