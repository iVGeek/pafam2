"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, pct, qty, usd } from "@/lib/format";

type Option = { id: string; label: string; supplierId?: string };
type CostRow = { key: number; category: string; amount: string; recoverable: boolean; perUnit: boolean };

type Result = {
  buyUnitPriceUsd: number;
  fxRate: number;
  landedUnitCost: number;
  landedCostTotal: number;
  netUnitRevenue: number;
  netRevenueTotal: number;
  grossProfit: number;
  grossMarginPct: number;
  markupOnCostPct: number;
  dealContribution: number;
  contributionMarginPct: number;
  cashRequirement: number;
  cashCycleDays: number | null;
  capitalEfficiencyPct: number | null;
  annualisedReturnPct: number | null;
  breakEvenSellingPriceUsd: number;
  maxBuyPriceUsd: number | null;
  minSellPriceUsd: number | null;
  meetsRequiredContribution: boolean | null;
  incomplete: boolean;
  missingInputs: string[];
  warnings: string[];
};

type ScenarioRow = {
  scenario: { name: string; label: string };
  result: {
    dealContribution: number;
    contributionMarginPct: number;
    grossProfit: number;
    cashRequirement: number;
    annualisedReturnPct: number | null;
    capitalEfficiencyPct: number | null;
  };
};

const INBOUND_CATEGORIES = [
  "FREIGHT",
  "INSURANCE",
  "DUTY",
  "BROKERAGE",
  "HANDLING",
  "TAX",
  "RECOVERABLE",
  "OTHER",
];
const OUTBOUND_CATEGORIES = [
  "OUTBOUND",
  "COMMISSION",
  "FEES",
  "STORAGE",
  "FINANCING",
  "CREDIT_LOSS",
  "OTHER",
];

let rowSeq = 1;
function newRow(category: string): CostRow {
  return { key: rowSeq++, category, amount: "", recoverable: false, perUnit: false };
}

function rowsPayload(rows: CostRow[]) {
  return rows
    .filter((r) => r.amount !== "" && Number.isFinite(Number(r.amount)))
    .map((r) => ({
      category: r.category,
      amount: Number(r.amount),
      recoverable: r.recoverable,
      perUnit: r.perUnit,
    }));
}

function fxFor(code: string, map: Record<string, number>): string {
  const c = code.trim().toUpperCase();
  if (c === "USD") return "1";
  const latest = map[c];
  return latest ? String(latest) : "";
}

export function DealCalculator(props: {
  suppliers: Option[];
  offers: (Option & {
    currency: string | null;
    price: number | null;
    priceBasis: string | null;
    unitsPerCase: number | null;
    availableQuantity: number | null;
    productId: string | null;
    brand: string | null;
    fragranceName: string | null;
    moq: number | null;
    orderMultiple: number | null;
    priceTierMin: number | null;
    priceTierMax: number | null;
  })[];
  products: Option[];
  customers: Option[];
  fxLatest: Record<string, number>;
  minContributionMarginPct: number;
  defaultCashCycleDays: number;
  initialOfferId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialOffer =
    props.offers.find((o) => o.id === (props.initialOfferId ?? "")) ?? null;

  const [supplierId, setSupplierId] = useState(initialOffer?.supplierId ?? "");
  const [offerId, setOfferId] = useState(props.initialOfferId ?? "");
  const [productId, setProductId] = useState(initialOffer?.productId ?? "");
  const [customerId, setCustomerId] = useState("");
  const [quantity, setQuantity] = useState(
    initialOffer?.availableQuantity ? String(initialOffer.availableQuantity) : "1000",
  );
  const [buyCurrency, setBuyCurrency] = useState(
    initialOffer?.currency ? initialOffer.currency.toUpperCase() : "USD",
  );
  const [buyPrice, setBuyPrice] = useState(
    initialOffer && initialOffer.price !== null ? String(initialOffer.price) : "",
  );
  const [buyPriceBasis, setBuyPriceBasis] = useState<"UNIT" | "CASE">(
    initialOffer?.priceBasis === "CASE" ? "CASE" : "UNIT",
  );
  const [unitsPerCase, setUnitsPerCase] = useState(
    initialOffer?.unitsPerCase ? String(initialOffer.unitsPerCase) : "",
  );
  const [fxRate, setFxRate] = useState(fxFor(initialOffer?.currency ?? "USD", props.fxLatest));
  const [sellingPriceUsd, setSellingPriceUsd] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [returnsPct, setReturnsPct] = useState("");
  const [inboundComplete, setInboundComplete] = useState(true);
  const [cashCycleDays, setCashCycleDays] = useState(String(props.defaultCashCycleDays));
  const [deployedCapital, setDeployedCapital] = useState("");
  const [requiredMargin, setRequiredMargin] = useState(String(props.minContributionMarginPct));
  const [constraints, setConstraints] = useState({
    moq: initialOffer?.moq != null ? String(initialOffer.moq) : "",
    orderMultiple: initialOffer?.orderMultiple != null ? String(initialOffer.orderMultiple) : "",
    priceTierMin: initialOffer?.priceTierMin != null ? String(initialOffer.priceTierMin) : "",
    priceTierMax: initialOffer?.priceTierMax != null ? String(initialOffer.priceTierMax) : "",
  });
  const [inbound, setInbound] = useState<CostRow[]>([
    { key: rowSeq++, category: "FREIGHT", amount: "", recoverable: false, perUnit: false },
    { key: rowSeq++, category: "DUTY", amount: "", recoverable: false, perUnit: false },
  ]);
  const [outbound, setOutbound] = useState<CostRow[]>([
    { key: rowSeq++, category: "OUTBOUND", amount: "", recoverable: false, perUnit: false },
    { key: rowSeq++, category: "COMMISSION", amount: "", recoverable: false, perUnit: false },
  ]);

  const [result, setResult] = useState<Result | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyOffer(id: string) {
    setOfferId(id);
    const o = props.offers.find((x) => x.id === id);
    if (!o) return;
    const currency = o.currency ? o.currency.toUpperCase() : "USD";
    if (o.currency) setBuyCurrency(currency);
    if (o.price !== null) setBuyPrice(String(o.price));
    if (o.priceBasis) setBuyPriceBasis(o.priceBasis === "CASE" ? "CASE" : "UNIT");
    if (o.unitsPerCase) setUnitsPerCase(String(o.unitsPerCase));
    if (o.availableQuantity) setQuantity(String(o.availableQuantity));
    if (o.productId) setProductId(o.productId);
    if (o.supplierId) setSupplierId(o.supplierId);
    setFxRate(fxFor(currency, props.fxLatest));
    setConstraints({
      moq: o.moq != null ? String(o.moq) : "",
      orderMultiple: o.orderMultiple != null ? String(o.orderMultiple) : "",
      priceTierMin: o.priceTierMin != null ? String(o.priceTierMin) : "",
      priceTierMax: o.priceTierMax != null ? String(o.priceTierMax) : "",
    });
  }

  function changeCurrency(value: string) {
    setBuyCurrency(value);
    setFxRate(fxFor(value, props.fxLatest));
  }

  const payload = useMemo(() => {
    return {
      quantity,
      buyCurrency,
      buyPrice,
      buyPriceBasis,
      unitsPerCase,
      fxRate,
      sellingPriceUsd,
      discountPct,
      returnsAllowancePct: returnsPct,
      inboundCosts: rowsPayload(inbound),
      outboundCosts: rowsPayload(outbound),
      inboundCostsComplete: inboundComplete,
      cashCycleDays,
      deployedCapitalUsd: deployedCapital,
      requiredContributionMarginPct: requiredMargin,
      moq: constraints.moq,
      orderMultiple: constraints.orderMultiple,
      priceTierMin: constraints.priceTierMin,
      priceTierMax: constraints.priceTierMax,
    };
  }, [
    quantity,
    buyCurrency,
    buyPrice,
    buyPriceBasis,
    unitsPerCase,
    fxRate,
    sellingPriceUsd,
    discountPct,
    returnsPct,
    inbound,
    outbound,
    inboundComplete,
    cashCycleDays,
    deployedCapital,
    requiredMargin,
    constraints,
  ]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch("/api/deals/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as {
          result?: Result;
          scenarios?: ScenarioRow[];
          error?: string;
        };
        if (res.ok && json.result) {
          setResult(json.result);
          setScenarios(json.scenarios ?? []);
          setError(null);
        } else if (json.error) {
          setError(json.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Calculation failed.");
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [payload]);

  async function saveDeal() {
    if (!supplierId) {
      setError("Select a supplier before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          productId: productId || null,
          customerId: customerId || null,
          offerId: offerId || null,
          ...payload,
        }),
      });
      const json = (await res.json()) as { deal?: { id: string }; error?: string };
      if (!res.ok || !json.deal) {
        setError(json.error ?? `Failed (${res.status}).`);
      } else {
        router.push(`/deals/${json.deal.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const input =
    "rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950";
  const label = "flex flex-col gap-1 text-sm";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Deal inputs</h2>
            <span className={`text-xs ${busy ? "text-amber-600" : "text-zinc-500"}`}>
              {busy ? "calculating…" : "live"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className={`${label} col-span-2 sm:col-span-3`}>
              <span className="text-zinc-600 dark:text-zinc-400">Supplier *</span>
              <select className={input} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select supplier…</option>
                {props.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={`${label} col-span-2 sm:col-span-3`}>
              <span className="text-zinc-600 dark:text-zinc-400">
                Start from an offer (optional)
              </span>
              <select
                className={input}
                value={offerId}
                onChange={(e) => applyOffer(e.target.value)}
              >
                <option value="">Blank deal</option>
                {props.offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Quantity</span>
              <input className={input} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Buy currency</span>
              <input
                className={input}
                value={buyCurrency}
                onChange={(e) => changeCurrency(e.target.value)}
                maxLength={3}
              />
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Buy price</span>
              <input className={input} value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} />
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Price basis</span>
              <select
                className={input}
                value={buyPriceBasis}
                onChange={(e) => setBuyPriceBasis(e.target.value as "UNIT" | "CASE")}
              >
                <option value="UNIT">Per unit</option>
                <option value="CASE">Per case</option>
              </select>
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Units per case</span>
              <input
                className={input}
                value={unitsPerCase}
                onChange={(e) => setUnitsPerCase(e.target.value)}
                placeholder={buyPriceBasis === "CASE" ? "required" : ""}
              />
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">FX (USD per 1 unit)</span>
              <input className={input} value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Selling price (USD)</span>
              <input
                className={input}
                value={sellingPriceUsd}
                onChange={(e) => setSellingPriceUsd(e.target.value)}
              />
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Discount %</span>
              <input className={input} value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Returns allowance %</span>
              <input className={input} value={returnsPct} onChange={(e) => setReturnsPct(e.target.value)} />
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Cash cycle (days)</span>
              <input
                className={input}
                value={cashCycleDays}
                onChange={(e) => setCashCycleDays(e.target.value)}
              />
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Deployed capital (USD)</span>
              <input
                className={input}
                value={deployedCapital}
                onChange={(e) => setDeployedCapital(e.target.value)}
                placeholder="defaults to cash required"
              />
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Min contribution margin %</span>
              <input
                className={input}
                value={requiredMargin}
                onChange={(e) => setRequiredMargin(e.target.value)}
              />
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Product (optional)</span>
              <select className={input} value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Unspecified</option>
                {props.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={label}>
              <span className="text-zinc-600 dark:text-zinc-400">Customer (optional)</span>
              <select className={input} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">None</option>
                {props.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={inboundComplete}
                onChange={(e) => setInboundComplete(e.target.checked)}
              />
              Inbound costs confirmed
            </label>
          </div>

          <CostLinesEditor
            title="Inbound costs (into landed cost)"
            categories={INBOUND_CATEGORIES}
            rows={inbound}
            onChange={setInbound}
            showRecoverable
          />
          <CostLinesEditor
            title="Outbound and deal costs (into contribution)"
            categories={OUTBOUND_CATEGORIES}
            rows={outbound}
            onChange={setOutbound}
          />
        </section>

        <section className="flex flex-col gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Result</h2>
              <button
                onClick={saveDeal}
                disabled={saving || !supplierId}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {saving ? "Saving…" : "Save deal"}
              </button>
            </div>
            {error ? (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : null}
            {result ? (
              <>
                {result.incomplete ? (
                  <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                    <div className="font-medium">Incomplete profitability</div>
                    <ul className="mt-1 list-disc pl-5 text-xs">
                      {result.missingInputs.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <Metric label="Buy unit price (USD)" value={usd(result.buyUnitPriceUsd)} />
                  <Metric label="Landed unit cost" value={usd(result.landedUnitCost)} />
                  <Metric label="Net unit revenue" value={usd(result.netUnitRevenue)} />
                  <Metric label="Gross profit" value={usd(result.grossProfit)} />
                  <Metric label="Gross margin" value={pct(result.grossMarginPct)} />
                  <Metric label="Markup on cost" value={pct(result.markupOnCostPct)} />
                  <Metric label="Deal contribution" value={usd(result.dealContribution)} strong />
                  <Metric
                    label="Contribution margin"
                    value={pct(result.contributionMarginPct)}
                    strong
                    tone={
                      result.meetsRequiredContribution === false ? "bad" : "good"
                    }
                  />
                  <Metric label="Cash requirement" value={usd(result.cashRequirement)} />
                  <Metric label="Cash cycle (days)" value={result.cashCycleDays ?? "—"} />
                  <Metric label="Capital efficiency" value={pct(result.capitalEfficiencyPct)} />
                  <Metric
                    label="Simple annualised return (estimate)"
                    value={pct(result.annualisedReturnPct)}
                  />
                  <Metric label="Break-even sell price" value={usd(result.breakEvenSellingPriceUsd)} />
                  <Metric
                    label="Max buy price for target margin"
                    value={result.maxBuyPriceUsd === null ? "—" : usd(result.maxBuyPriceUsd)}
                  />
                  <Metric
                    label="Min sell price for target margin"
                    value={result.minSellPriceUsd === null ? "—" : usd(result.minSellPriceUsd)}
                  />
                  <Metric label="Total landed cost" value={usd(result.landedCostTotal)} />
                </dl>
                {result.warnings.length ? (
                  <ul className="mt-4 list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">Calculating…</p>
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-medium">Scenarios</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Conservative, base and upside cases plus price-drop and customer-default stress
              cases. Estimates only — not a forecast.
            </p>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="py-1">Scenario</th>
                  <th className="py-1 text-right">Contribution</th>
                  <th className="py-1 text-right">Margin</th>
                  <th className="py-1 text-right">Annualised</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.scenario.name} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5">{s.scenario.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{usd(s.result.dealContribution)}</td>
                    <td className="py-1.5 text-right tabular-nums">{pct(s.result.contributionMarginPct)}</td>
                    <td className="py-1.5 text-right tabular-nums">{pct(s.result.annualisedReturnPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <p className="text-xs text-zinc-500">
        Totals across the deal: {qty(Number(quantity))} units ·{" "}
        {money(result?.netRevenueTotal ?? null)} net revenue ·{" "}
        {money(result?.landedCostTotal ?? null)} landed cost.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "bad" ? "text-red-600 dark:text-red-400" : tone === "good" ? "text-emerald-700 dark:text-emerald-400" : "";
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""} ${color}`}>{value}</dd>
    </div>
  );
}

function CostLinesEditor({
  title,
  categories,
  rows,
  onChange,
  showRecoverable,
}: {
  title: string;
  categories: string[];
  rows: CostRow[];
  onChange: (rows: CostRow[]) => void;
  showRecoverable?: boolean;
}) {
  const input =
    "rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  function update(key: number, patch: Partial<CostRow>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <button
          type="button"
          onClick={() => onChange([...rows, newRow(categories[0])])}
          className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
        >
          + Add line
        </button>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center gap-2">
            <select
              className={input}
              value={row.category}
              onChange={(e) => update(row.key, { category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className={`${input} w-32`}
              placeholder="amount"
              value={row.amount}
              onChange={(e) => update(row.key, { amount: e.target.value })}
            />
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={row.perUnit}
                onChange={(e) => update(row.key, { perUnit: e.target.checked })}
              />
              per unit
            </label>
            {showRecoverable ? (
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={row.recoverable}
                  onChange={(e) => update(row.key, { recoverable: e.target.checked })}
                />
                recoverable
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
              className="text-xs text-zinc-500 hover:text-red-600"
            >
              remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
