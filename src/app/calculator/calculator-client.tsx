"use client";

import { useMemo, useState } from "react";
import { computeProfitability, type CostLineInput } from "@/lib/pricing";

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "CHF", "CAD", "AUD", "SEK", "DKK", "JPY", "CNY", "HKD", "SGD"];

function n(value: string): number {
  const v = Number(value);
  return Number.isFinite(v) ? v : 0;
}

function usd(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function pct(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

export function CalculatorClient({
  defaultFx,
  defaultMargin,
}: {
  defaultFx: Record<string, number>;
  defaultMargin: number;
}) {
  const [costPrice, setCostPrice] = useState("50");
  const [currency, setCurrency] = useState("USD");
  const [basis, setBasis] = useState<"UNIT" | "CASE">("UNIT");
  const [unitsPerCase, setUnitsPerCase] = useState("12");
  const [fx, setFx] = useState(String(defaultFx["USD"] ?? 1));
  const [freightPerUnit, setFreightPerUnit] = useState("0");
  const [dutyPct, setDutyPct] = useState("0");
  const [otherPerUnit, setOtherPerUnit] = useState("0");
  const [targetMargin, setTargetMargin] = useState(String(defaultMargin));
  const [sellPrice, setSellPrice] = useState("0");

  function onCurrency(next: string) {
    setCurrency(next);
    const rate = defaultFx[next];
    if (rate !== undefined) setFx(String(rate));
  }

  const result = useMemo(() => {
    const upc = Math.max(1, Math.trunc(n(unitsPerCase)));
    const fxRate = currency.toUpperCase() === "USD" ? n(fx) || 1 : n(fx);
    const cp = n(costPrice);
    const buyUnitUsd = basis === "CASE" ? (cp / upc) * fxRate : cp * fxRate;

    const inboundCosts: CostLineInput[] = [];
    if (n(freightPerUnit) > 0) {
      inboundCosts.push({ category: "FREIGHT", amount: n(freightPerUnit), perUnit: true });
    }
    if (n(dutyPct) > 0) {
      inboundCosts.push({ category: "DUTY", amount: (buyUnitUsd * n(dutyPct)) / 100, perUnit: true });
    }
    if (n(otherPerUnit) > 0) {
      inboundCosts.push({ category: "OTHER", amount: n(otherPerUnit), perUnit: true });
    }

    return computeProfitability({
      quantity: 1,
      buyPrice: cp,
      buyPriceBasis: basis,
      unitsPerCase: basis === "CASE" ? upc : null,
      buyCurrency: currency.toUpperCase(),
      fxRate,
      sellingPriceUsd: n(sellPrice),
      inboundCosts,
      inboundCostsComplete: true,
      requiredContributionMarginPct: n(targetMargin),
    });
  }, [costPrice, currency, basis, unitsPerCase, fx, freightPerUnit, dutyPct, otherPerUnit, targetMargin, sellPrice]);

  const input =
    "w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-medium">Inputs</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>Cost price (CP)</span>
            <input type="number" min={0} step="0.0001" className={input} value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Currency</span>
            <input list="currencies" className={input} value={currency} onChange={(e) => onCurrency(e.target.value.toUpperCase())} />
            <datalist id="currencies">
              {CURRENCIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Price basis</span>
            <select className={input} value={basis} onChange={(e) => setBasis(e.target.value as "UNIT" | "CASE")}>
              <option value="UNIT">Per unit / bottle</option>
              <option value="CASE">Per case</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Units / case</span>
            <input type="number" min={1} className={input} value={unitsPerCase} onChange={(e) => setUnitsPerCase(e.target.value)} disabled={basis !== "CASE"} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>FX (USD per 1 {currency})</span>
            <input type="number" min={0} step="0.0001" className={input} value={fx} onChange={(e) => setFx(e.target.value)} disabled={currency.toUpperCase() === "USD"} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Target margin %</span>
            <input type="number" min={0} max={99} step="0.1" className={input} value={targetMargin} onChange={(e) => setTargetMargin(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Freight / unit (USD)</span>
            <input type="number" min={0} step="0.01" className={input} value={freightPerUnit} onChange={(e) => setFreightPerUnit(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Duty % of CP</span>
            <input type="number" min={0} step="0.1" className={input} value={dutyPct} onChange={(e) => setDutyPct(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Other cost / unit (USD)</span>
            <input type="number" min={0} step="0.01" className={input} value={otherPerUnit} onChange={(e) => setOtherPerUnit(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Selling price (SP, USD)</span>
            <input type="number" min={0} step="0.01" className={input} value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-medium">CP → SP</h2>
          <p className="mt-1 text-xs text-zinc-500">What you must charge to hit the target margin.</p>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <Row label="Cost price / unit (USD)" value={usd(result.buyUnitPriceUsd, 4)} />
            <Row label="Landed cost / unit" value={usd(result.landedUnitCost, 4)} />
            <Row label="Break-even selling price" value={usd(result.breakEvenSellingPriceUsd, 2)} />
            <Row
              label={`Selling price for ${n(targetMargin)}% margin`}
              value={result.minSellPriceUsd === null ? "—" : usd(result.minSellPriceUsd, 2)}
              emphasize
            />
          </dl>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="font-medium">SP → margin</h2>
          <p className="mt-1 text-xs text-zinc-500">The margin an actual selling price produces.</p>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <Row label="Selling price" value={usd(n(sellPrice), 2)} />
            <Row label="Net revenue / unit" value={usd(result.netUnitRevenue, 4)} />
            <Row label="Gross margin" value={pct(result.grossMarginPct)} />
            <Row label="Markup on cost" value={pct(result.markupOnCostPct)} />
            <Row
              label="Contribution margin"
              value={pct(result.contributionMarginPct)}
              emphasize
            />
            {result.meetsRequiredContribution !== null ? (
              <Row
                label={`Meets ${n(targetMargin)}% target`}
                value={result.meetsRequiredContribution ? "yes" : "no"}
                tone={result.meetsRequiredContribution ? "good" : "bad"}
              />
            ) : null}
          </dl>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  emphasize,
  tone,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  tone?: "good" | "bad";
}) {
  const valueClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "bad"
        ? "text-red-600 dark:text-red-400"
        : emphasize
          ? "font-semibold"
          : "";
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 pb-1 dark:border-zinc-800">
      <dt className="text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className={`tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}
