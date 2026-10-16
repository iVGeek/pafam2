"use client";

import { useMemo, useState } from "react";
import {
  landOffer,
  marginAtSellPrice,
  type CostAssumptions,
  type OfferCostInput,
} from "@/lib/product-costing";

type Offer = OfferCostInput & {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierCountry: string | null;
  originalCode: string;
  availableQuantity: number | null;
  moq: number | null;
  orderMultiple: number | null;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  stockCountry: string | null;
  incoterm: string | null;
  listDate: string | null;
  lastStockConfirmation: string | null;
  usSuitability: string | null;
};

function usd(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 4 }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

function n(value: string): number {
  const v = Number(value);
  return Number.isFinite(v) ? v : 0;
}

export function ProductSuppliers({
  offers,
  fxLatest,
  defaultMargin,
}: {
  offers: Offer[];
  fxLatest: Record<string, number>;
  defaultMargin: number;
}) {
  const [targetMargin, setTargetMargin] = useState(String(defaultMargin));
  const [freightPerUnit, setFreightPerUnit] = useState("0");
  const [dutyPct, setDutyPct] = useState("0");
  const [sellPrice, setSellPrice] = useState("0");

  const ranked = useMemo(() => {
    const assumptions: CostAssumptions = {
      fxByCurrency: fxLatest,
      freightPerUnitUsd: n(freightPerUnit),
      dutyPct: n(dutyPct),
      targetMarginPct: n(targetMargin),
    };
    return offers
      .map((offer) => ({ offer, assumptions, cost: landOffer(offer, assumptions) }))
      .sort((a, b) => {
        if (a.cost.hasFx !== b.cost.hasFx) return a.cost.hasFx ? -1 : 1;
        return a.cost.landedUnitCost - b.cost.landedUnitCost;
      });
  }, [offers, fxLatest, targetMargin, freightPerUnit, dutyPct]);

  const best = ranked.find((r) => r.cost.hasFx) ?? null;
  const bestMargin =
    best && n(sellPrice) > 0
      ? marginAtSellPrice(best.offer, best.assumptions, n(sellPrice))
      : null;

  const input =
    "rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-sm">
          <span>Target margin %</span>
          <input type="number" min={0} max={99} step="0.1" className={`${input} w-28`} value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Freight / unit (USD)</span>
          <input type="number" min={0} step="0.01" className={`${input} w-28`} value={freightPerUnit} onChange={(e) => setFreightPerUnit(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Duty % of CP</span>
          <input type="number" min={0} step="0.1" className={`${input} w-24`} value={dutyPct} onChange={(e) => setDutyPct(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Selling price (USD)</span>
          <input type="number" min={0} step="0.01" className={`${input} w-28`} value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
        </label>
        <p className="text-xs text-zinc-500">
          Landed cost = supplier price (converted at the latest dated FX) + freight + duty.
        </p>
      </div>

      {best && best.cost ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950">
          <div className="flex items-center gap-2">
            <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
              BEST SUPPLIER
            </span>
            <span className="font-medium">{best.offer.supplierName}</span>
            {best.offer.supplierCountry ? (
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{best.offer.supplierCountry}</span>
            ) : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <Metric label="Buy price" value={money(best.offer.price, best.offer.currency) + (best.offer.priceBasis === "CASE" ? " /case" : "")} />
            <Metric label="Buy / unit (USD)" value={usd(best.cost.buyUnitUsd, 4)} />
            <Metric label="Freight / unit" value={usd(best.cost.freightPerUnitUsd)} />
            <Metric label="Duty / unit" value={usd(best.cost.dutyPerUnitUsd)} />
            <Metric label="Landed / unit" value={usd(best.cost.landedUnitCost, 4)} emphasize />
            <Metric label="Break-even SP" value={usd(best.cost.breakEvenSellingPriceUsd)} />
            <Metric
              label={`SP for ${n(targetMargin)}% margin`}
              value={best.cost.minSellPriceUsd === null ? "—" : usd(best.cost.minSellPriceUsd)}
              emphasize
            />
            {bestMargin ? (
              <Metric label="Margin at your SP" value={`${bestMargin.grossMarginPct.toFixed(2)}%`} />
            ) : null}
          </dl>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            {best.offer.availableQuantity !== null ? `${best.offer.availableQuantity} units available` : "Availability unknown"}
            {best.offer.moq ? ` · MOQ ${best.offer.moq}` : ""}
            {best.offer.orderMultiple ? ` · order multiple ${best.offer.orderMultiple}` : ""}
            {best.offer.leadTimeDays ? ` · lead time ${best.offer.leadTimeDays}d` : ""}
            {best.offer.paymentTerms ? ` · ${best.offer.paymentTerms}` : ""}
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2 text-right">Buy price</th>
              <th className="px-3 py-2 text-right">Buy/unit USD</th>
              <th className="px-3 py-2 text-right">Landed/unit</th>
              <th className="px-3 py-2 text-right">Suggested SP</th>
              <th className="px-3 py-2 text-right">Avail.</th>
              <th className="px-3 py-2">Terms</th>
              <th className="px-3 py-2">List date</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => (
              <tr
                key={row.offer.id}
                className={`border-t border-zinc-100 dark:border-zinc-800 ${
                  row.cost.hasFx && row.offer.id === best?.offer.id ? "bg-emerald-50/60 dark:bg-emerald-950/40" : ""
                }`}
              >
                <td className="px-3 py-2">
                  {row.offer.supplierName}
                  {row.offer.supplierCountry ? (
                    <span className="block text-xs text-zinc-500">{row.offer.supplierCountry}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{row.offer.originalCode}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {money(row.offer.price, row.offer.currency)}
                  {row.offer.priceBasis === "CASE" ? <span className="text-xs text-zinc-500"> /case</span> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.cost.hasFx ? usd(row.cost.buyUnitUsd, 4) : "no FX"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {row.cost.hasFx ? usd(row.cost.landedUnitCost, 4) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.cost.hasFx && row.cost.minSellPriceUsd !== null ? usd(row.cost.minSellPriceUsd) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.offer.availableQuantity === null ? "—" : row.offer.availableQuantity}
                </td>
                <td className="px-3 py-2 text-xs">{row.offer.paymentTerms ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">{row.offer.listDate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`tabular-nums ${emphasize ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}
