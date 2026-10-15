import Link from "next/link";
import { notFound } from "next/navigation";
import { dealToInput, getDeal, recommendationForOffer } from "@/lib/deals";
import { money, pct, qty, usd, dateStr } from "@/lib/format";
import { runScenarios } from "@/lib/scenarios";
import { DealActions } from "./deal-actions";

export const dynamic = "force-dynamic";

const n = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal) notFound();

  const scenarios = runScenarios(dealToInput(deal));
  const recommendation = deal.offer ? await recommendationForOffer(deal.offer) : null;
  const existingQuote = deal.quoteLines[0]?.quote ?? null;
  const missingInputs: string[] = Array.isArray(deal.missingInputs)
    ? (deal.missingInputs as string[])
    : [];

  const label = deal.product
    ? `${deal.product.internalSku} · ${deal.product.brand ?? ""} ${deal.product.fragranceName ?? ""}`
    : "Unspecified product";

  const sellingPrice = n(deal.sellingPriceUsd) ?? n(deal.suggestedSellPrice);
  const quoteLine =
    sellingPrice && sellingPrice > 0
      ? {
          quantity: Number(deal.quantity),
          unitPrice: sellingPrice,
          description: `${label} — ${qty(Number(deal.quantity))} units at ${money(sellingPrice)}`,
        }
      : null;

  const metrics: { label: string; value: string; tone?: "good" | "bad" }[] = [
    { label: "Buy unit price (USD)", value: usd(Number(deal.buyPrice), 4) },
    { label: "FX rate", value: deal.fxRate ? `${n(deal.fxRate)}${deal.fxSource ? ` (${deal.fxSource})` : ""}` : "—" },
    { label: "Landed unit cost", value: usd(n(deal.landedUnitCost), 4) },
    { label: "Net unit revenue", value: usd(n(deal.netUnitRevenue), 4) },
    { label: "Gross profit", value: usd(n(deal.grossProfit)) },
    { label: "Gross margin", value: pct(n(deal.grossMarginPct)) },
    { label: "Deal contribution", value: usd(n(deal.dealContribution)) },
    {
      label: "Contribution margin",
      value: pct(n(deal.contributionMarginPct)),
      tone: "good",
    },
    { label: "Cash requirement", value: usd(n(deal.cashRequirement)) },
    { label: "Cash cycle (days)", value: deal.cashCycleDays ? String(deal.cashCycleDays) : "—" },
    { label: "Capital efficiency", value: pct(n(deal.capitalEfficiencyPct)) },
    { label: "Simple annualised return (estimate)", value: pct(n(deal.annualisedReturnPct)) },
    { label: "Suggested sell price", value: usd(n(deal.suggestedSellPrice)) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/deals" className="text-xs text-zinc-500 hover:underline">
            ← Deals
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{label}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {deal.supplier.name}
            {deal.customer ? ` → ${deal.customer.name}` : ""}
            {" · "}
            {qty(Number(deal.quantity))} units in {deal.buyCurrency}
            {" · "}
            created {dateStr(deal.createdAt)}
          </p>
        </div>
        <span
          className={`rounded px-2 py-1 text-xs ${
            deal.incomplete
              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {deal.status}
          {deal.incomplete ? " · incomplete profitability" : ""}
        </span>
      </div>

      <DealActions
        dealId={deal.id}
        status={deal.status}
        customerId={deal.customerId}
        quoteNumber={existingQuote?.quoteNumber ?? null}
        existingQuoteId={existingQuote?.id ?? null}
        quoteLine={quoteLine}
        lostReason={deal.lostReason}
      />

      {missingInputs.length > 0 ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
          <h2 className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Incomplete profitability — assumptions missing
          </h2>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-800 dark:text-amber-300">
            {missingInputs.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-medium">Profitability</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {metrics.map((m) => (
              <div key={m.label}>
                <dt className="text-xs text-zinc-500">{m.label}</dt>
                <dd className="tabular-nums">{m.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-medium">Cost lines</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Each cost is defined once. Recoverable amounts affect cash, not permanent cost.
          </p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="py-1">Category</th>
                <th className="py-1">Label</th>
                <th className="py-1 text-right">Amount</th>
                <th className="py-1 text-right">Recoverable</th>
              </tr>
            </thead>
            <tbody>
              {deal.costs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-zinc-500">
                    No cost lines recorded on this deal.
                  </td>
                </tr>
              ) : (
                deal.costs.map((c) => (
                  <tr key={c.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5">{c.category}</td>
                    <td className="py-1.5 text-zinc-600 dark:text-zinc-400">{c.label}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {money(Number(c.amount), c.currency)}
                    </td>
                    <td className="py-1.5 text-right text-xs">
                      {c.recoverable ? "yes" : "no"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-medium">Scenarios</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Conservative, base and upside, plus price-drop and customer-default stress. Estimates
          only — never a guaranteed return.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="py-1">Scenario</th>
              <th className="py-1 text-right">Gross profit</th>
              <th className="py-1 text-right">Contribution</th>
              <th className="py-1 text-right">Margin</th>
              <th className="py-1 text-right">Capital efficiency</th>
              <th className="py-1 text-right">Annualised</th>
              <th className="py-1 text-right">Cash</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map(({ scenario, result }) => (
              <tr key={scenario.name} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-1.5">{scenario.label}</td>
                <td className="py-1.5 text-right tabular-nums">{usd(result.grossProfit)}</td>
                <td className="py-1.5 text-right tabular-nums">{usd(result.dealContribution)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {pct(result.contributionMarginPct)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {pct(result.capitalEfficiencyPct)}
                </td>
                <td className="py-1.5 text-right tabular-nums">{pct(result.annualisedReturnPct)}</td>
                <td className="py-1.5 text-right tabular-nums">{usd(result.cashRequirement)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {recommendation ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Buying recommendation (§10)</h2>
            <Link href={`/offers/${recommendation.offerId}`} className="text-sm hover:underline">
              View offer →
            </Link>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Item label="Supplier" value={recommendation.supplierName} />
            <Item
              label="Exact SKU"
              value={recommendation.product?.internalSku ?? "— unlinked product —"}
            />
            <Item label="Executable quantity" value={qty(recommendation.executableQuantity)} />
            <Item label="Customer matches" value={recommendation.demandStatus} />
            <Item label="Landed cost" value={usd(recommendation.landedUnitCost, 4)} />
            <Item
              label="Suggested selling price"
              value={usd(recommendation.suggestedSellingPriceUsd)}
            />
            <Item label="Contribution" value={usd(recommendation.contribution)} />
            <Item label="Cash requirement" value={usd(recommendation.cashRequirement)} />
            <Item label="Expected collection date" value={recommendation.expectedCollectionDate ?? "—"} />
            <Item label="FX used" value={`${recommendation.fxRate || "—"} (${recommendation.fxSource ?? "no rate"})`} />
          </dl>
          {recommendation.customerMatches.length ? (
            <ul className="mt-3 list-disc pl-5 text-xs text-zinc-600 dark:text-zinc-400">
              {recommendation.customerMatches.map((m) => (
                <li key={m.demandId}>
                  {m.customerName} — target {usd(m.targetPrice)} for{" "}
                  {m.quantity ? qty(m.quantity) : "quantity"} units
                  {m.neededBy ? ` by ${m.neededBy}` : ""} ({m.status})
                </li>
              ))}
            </ul>
          ) : null}
          {recommendation.missingAssumptions.length ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
              Missing assumptions: {recommendation.missingAssumptions.join("; ")}
            </p>
          ) : null}
        </section>
      ) : null}
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
