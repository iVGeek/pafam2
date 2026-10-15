// DB-backed helpers for the trading engine: trading settings, dated FX,
// deal input normalisation, profitability computation, persistence and the
// §10 buying-recommendation projection.

import type { Offer } from "@prisma/client";
import { prisma } from "./prisma";
import {
  computeProfitability,
  round,
  type CostLineInput,
  type ProfitabilityInput,
  type ProfitabilityResult,
} from "./pricing";
import { DEFAULT_SCENARIOS, runScenarios, type ScenarioName, type ScenarioResult } from "./scenarios";

export type TradingSettings = {
  minContributionMarginPct: number;
  maxDealCapitalUsd: number;
  defaultCurrency: string;
  defaultCashCycleDays: number;
};

const SETTING_DEFAULTS: TradingSettings = {
  minContributionMarginPct: 10,
  maxDealCapitalUsd: 50000,
  defaultCurrency: "USD",
  defaultCashCycleDays: 60,
};

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

export async function getTradingSettings(): Promise<TradingSettings> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    minContributionMarginPct: asNumber(
      map.get("min_contribution_margin_pct"),
      SETTING_DEFAULTS.minContributionMarginPct,
    ),
    maxDealCapitalUsd: asNumber(map.get("max_deal_capital_usd"), SETTING_DEFAULTS.maxDealCapitalUsd),
    defaultCurrency:
      typeof map.get("default_currency") === "string"
        ? (map.get("default_currency") as string)
        : SETTING_DEFAULTS.defaultCurrency,
    defaultCashCycleDays: asNumber(
      map.get("default_cash_cycle_days"),
      SETTING_DEFAULTS.defaultCashCycleDays,
    ),
  };
}

export type ResolvedFx = {
  rate: number;
  rateDate: Date | null;
  source: string | null;
};

/** Latest USD-per-currency observation on or before `on`. USD is always 1. */
export async function resolveFxRate(
  currency: string | null | undefined,
  on: Date = new Date(),
): Promise<ResolvedFx> {
  const code = (currency ?? "USD").toUpperCase();
  if (code === "USD") return { rate: 1, rateDate: on, source: "fixed" };
  const row = await prisma.fxRate.findFirst({
    where: { baseCurrency: code, quoteCurrency: "USD", rateDate: { lte: on } },
    orderBy: { rateDate: "desc" },
  });
  if (!row) return { rate: 0, rateDate: null, source: null };
  return { rate: Number(row.rate), rateDate: row.rateDate, source: row.source };
}

// ---------------------------------------------------------------------------
// Input normalisation
// ---------------------------------------------------------------------------

export type RawCostLine = {
  category?: string;
  label?: string;
  amount?: number | string;
  currency?: string;
  recoverable?: boolean;
  perUnit?: boolean;
};

export type RawDealInput = {
  quantity?: number | string;
  buyCurrency?: string;
  buyPrice?: number | string;
  buyPriceBasis?: string;
  unitsPerCase?: number | string | null;
  fxRate?: number | string | null;
  sellingPriceUsd?: number | string;
  discountPct?: number | string;
  returnsAllowancePct?: number | string;
  rebatePerUnit?: number | string;
  otherDeductionsPerUnit?: number | string;
  inboundCosts?: RawCostLine[];
  outboundCosts?: RawCostLine[];
  inboundCostsComplete?: boolean;
  cashCycleDays?: number | string | null;
  deployedCapitalUsd?: number | string | null;
  sellThroughFactor?: number | string | null;
  defaultPctOnReceivable?: number | string | null;
  requiredContributionMarginPct?: number | string | null;
  moq?: number | string | null;
  orderMultiple?: number | string | null;
  priceTierMin?: number | string | null;
  priceTierMax?: number | string | null;
};

const COST_CATEGORIES = new Set([
  "FREIGHT",
  "INSURANCE",
  "DUTY",
  "BROKERAGE",
  "HANDLING",
  "TAX",
  "RECOVERABLE",
  "OUTBOUND",
  "COMMISSION",
  "FEES",
  "STORAGE",
  "FINANCING",
  "CREDIT_LOSS",
  "OTHER",
]);

function normalizeCostLines(raw: RawCostLine[] | undefined): CostLineInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((line) => {
      const category = (line.category ?? "OTHER").toUpperCase();
      return {
        category: (COST_CATEGORIES.has(category) ? category : "OTHER") as CostLineInput["category"],
        label: line.label,
        amount: asNumber(line.amount, 0),
        currency: line.currency,
        recoverable: Boolean(line.recoverable),
        perUnit: Boolean(line.perUnit),
      };
    })
    .filter((line) => line.amount !== 0 || line.label);
}

function pctToFraction(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = asNumber(value, 0);
  // Accept both "5" and "5%" style input as a percentage.
  return n / 100;
}

export function normalizeDealInput(raw: RawDealInput): ProfitabilityInput {
  return {
    quantity: asNumber(raw.quantity, 0),
    buyCurrency: (raw.buyCurrency ?? "USD").toUpperCase(),
    buyPrice: asNumber(raw.buyPrice, 0),
    buyPriceBasis: raw.buyPriceBasis === "CASE" ? "CASE" : "UNIT",
    unitsPerCase: raw.unitsPerCase ? asNumber(raw.unitsPerCase, 0) : null,
    fxRate: raw.fxRate === null || raw.fxRate === undefined || raw.fxRate === "" ? null : asNumber(raw.fxRate, 0),
    sellingPriceUsd: asNumber(raw.sellingPriceUsd, 0),
    discountPct: pctToFraction(raw.discountPct) ?? 0,
    returnsAllowancePct: pctToFraction(raw.returnsAllowancePct) ?? 0,
    rebatePerUnit: asNumber(raw.rebatePerUnit, 0),
    otherDeductionsPerUnit: asNumber(raw.otherDeductionsPerUnit, 0),
    inboundCosts: normalizeCostLines(raw.inboundCosts),
    outboundCosts: normalizeCostLines(raw.outboundCosts),
    inboundCostsComplete: raw.inboundCostsComplete === true,
    cashCycleDays:
      raw.cashCycleDays === null || raw.cashCycleDays === undefined || raw.cashCycleDays === ""
        ? null
        : asNumber(raw.cashCycleDays, 0),
    deployedCapitalUsd:
      raw.deployedCapitalUsd === null || raw.deployedCapitalUsd === undefined || raw.deployedCapitalUsd === ""
        ? null
        : asNumber(raw.deployedCapitalUsd, 0),
    sellThroughFactor:
      raw.sellThroughFactor === null || raw.sellThroughFactor === undefined
        ? null
        : pctToFraction(raw.sellThroughFactor),
    defaultPctOnReceivable:
      raw.defaultPctOnReceivable === null || raw.defaultPctOnReceivable === undefined
        ? null
        : pctToFraction(raw.defaultPctOnReceivable),
    requiredContributionMarginPct:
      raw.requiredContributionMarginPct === null || raw.requiredContributionMarginPct === undefined
        ? null
        : asNumber(raw.requiredContributionMarginPct, 0),
    moq: raw.moq === null || raw.moq === undefined || raw.moq === "" ? null : asNumber(raw.moq, 0),
    orderMultiple:
      raw.orderMultiple === null || raw.orderMultiple === undefined || raw.orderMultiple === ""
        ? null
        : asNumber(raw.orderMultiple, 0),
    priceTierMin:
      raw.priceTierMin === null || raw.priceTierMin === undefined || raw.priceTierMin === ""
        ? null
        : asNumber(raw.priceTierMin, 0),
    priceTierMax:
      raw.priceTierMax === null || raw.priceTierMax === undefined || raw.priceTierMax === ""
        ? null
        : asNumber(raw.priceTierMax, 0),
  };
}

export function computeDeal(raw: RawDealInput): {
  input: ProfitabilityInput;
  result: ProfitabilityResult;
  scenarios: ScenarioResult[];
} {
  const input = normalizeDealInput(raw);
  const result = computeProfitability(input);
  const scenarios = runScenarios(input, DEFAULT_SCENARIOS);
  return { input, result, scenarios };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export type SaveDealPayload = RawDealInput & {
  supplierId: string;
  productId?: string | null;
  customerId?: string | null;
  offerId?: string | null;
  owner?: string | null;
  notes?: string | null;
  status?: string;
};

const DEAL_STATUSES = new Set(["DRAFT", "REVIEWED", "APPROVED", "WON", "LOST"]);

export async function saveDeal(payload: SaveDealPayload) {
  const { input, result } = computeDeal(payload);
  const status = (payload.status ?? "DRAFT").toUpperCase();
  const dealStatus = (DEAL_STATUSES.has(status) ? status : "DRAFT") as
    | "DRAFT"
    | "REVIEWED"
    | "APPROVED"
    | "WON"
    | "LOST";

  const fx = await resolveFxRate(input.buyCurrency, new Date());

  const deal = await prisma.deal.create({
    data: {
      status: dealStatus,
      supplierId: payload.supplierId,
      productId: payload.productId ?? null,
      customerId: payload.customerId ?? null,
      offerId: payload.offerId ?? null,
      quantity: input.quantity,
      buyCurrency: input.buyCurrency,
      buyPrice: input.buyPrice,
      buyPriceBasis: input.buyPriceBasis === "CASE" ? "CASE" : "UNIT",
      unitsPerCase: input.unitsPerCase ?? null,
      fxRate: result.fxRate,
      fxRateDate: fx.rateDate,
      fxSource: fx.source,
      sellingPriceUsd: input.sellingPriceUsd,
      landedUnitCost: result.landedUnitCost,
      netUnitRevenue: result.netUnitRevenue,
      grossProfit: result.grossProfit,
      grossMarginPct: result.grossMarginPct,
      dealContribution: result.dealContribution,
      contributionMarginPct: result.contributionMarginPct,
      cashRequirement: result.cashRequirement,
      cashCycleDays: result.cashCycleDays,
      capitalEfficiencyPct: result.capitalEfficiencyPct,
      annualisedReturnPct: result.annualisedReturnPct,
      suggestedSellPrice: result.minSellPriceUsd,
      incomplete: result.incomplete,
      missingInputs: result.missingInputs as unknown as object,
      owner: payload.owner ?? null,
      notes: payload.notes ?? null,
      costs: {
        create: [...(input.inboundCosts ?? []), ...(input.outboundCosts ?? [])].map((line) => ({
          category: line.category,
          label: line.label ?? line.category,
          amount: line.amount,
          currency: line.currency ?? "USD",
          recoverable: Boolean(line.recoverable),
        })),
      },
    },
    include: { costs: true },
  });

  await prisma.auditLog.create({
    data: {
      actor: payload.owner ?? "web",
      action: "deal.created",
      entityType: "Deal",
      entityId: deal.id,
      after: {
        contribution: result.dealContribution,
        contributionMarginPct: result.contributionMarginPct,
        incomplete: result.incomplete,
      },
    },
  });

  return { deal, result };
}

export async function updateDealStatus(
  id: string,
  status: string,
  owner?: string | null,
  lostReason?: string | null,
) {
  const next = status.toUpperCase();
  if (!DEAL_STATUSES.has(next)) throw new Error(`Unknown deal status: ${status}`);
  const deal = await prisma.deal.update({
    where: { id },
    data: {
      status: next as "DRAFT" | "REVIEWED" | "APPROVED" | "WON" | "LOST",
      ...(next === "LOST"
        ? { lostReason: lostReason?.trim() ? lostReason.trim() : null }
        : {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      actor: owner ?? "web",
      action: "deal.status_changed",
      entityType: "Deal",
      entityId: id,
      after: next === "LOST" ? { status: next, lostReason: deal.lostReason } : { status: next },
    },
  });
  return deal;
}

export async function listDeals(limit = 100) {
  return prisma.deal.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      supplier: { select: { name: true } },
      product: { select: { internalSku: true, brand: true, fragranceName: true } },
      customer: { select: { name: true } },
    },
  });
}

export async function getDeal(id: string) {
  return prisma.deal.findUnique({
    where: { id },
    include: {
      costs: true,
      supplier: true,
      product: true,
      customer: true,
      offer: true,
      quoteLines: { include: { quote: true } },
    },
  });
}

/** Rebuild a ProfitabilityInput from a persisted deal (for scenario replay). */
export function dealToInput(deal: {
  quantity: unknown;
  buyCurrency: string;
  buyPrice: unknown;
  buyPriceBasis: string;
  unitsPerCase: number | null;
  fxRate: unknown;
  sellingPriceUsd: unknown;
  cashCycleDays: number | null;
  costs: { category: string; amount: unknown; recoverable: boolean }[];
}): ProfitabilityInput {
  const inbound = deal.costs.filter((c) =>
    ["FREIGHT", "INSURANCE", "DUTY", "BROKERAGE", "HANDLING", "TAX", "RECOVERABLE", "OTHER"].includes(c.category),
  );
  const outbound = deal.costs.filter((c) => !inbound.includes(c));
  const map = (c: { category: string; amount: unknown; recoverable: boolean }): CostLineInput => ({
    category: c.category as CostLineInput["category"],
    amount: Number(c.amount),
    recoverable: c.recoverable,
  });
  return {
    quantity: Number(deal.quantity),
    buyCurrency: deal.buyCurrency,
    buyPrice: Number(deal.buyPrice),
    buyPriceBasis: deal.buyPriceBasis === "CASE" ? "CASE" : "UNIT",
    unitsPerCase: deal.unitsPerCase,
    fxRate: Number(deal.fxRate),
    sellingPriceUsd: Number(deal.sellingPriceUsd),
    inboundCosts: inbound.map(map),
    outboundCosts: outbound.map(map),
    inboundCostsComplete: true,
    cashCycleDays: deal.cashCycleDays,
  };
}

export function scenarioNote(name: ScenarioName): string {
  const s = DEFAULT_SCENARIOS.find((x) => x.name === name);
  return s ? s.label : name;
}

// ---------------------------------------------------------------------------
// §10 Buying recommendation
// ---------------------------------------------------------------------------

export type CustomerMatch = {
  demandId: string;
  customerId: string;
  customerName: string;
  targetPrice: number | null;
  quantity: number | null;
  neededBy: string | null;
  status: string;
};

export type Recommendation = {
  offerId: string;
  supplierName: string;
  product: { id: string; internalSku: string; brand: string | null; fragranceName: string | null; sizeMl: number | null } | null;
  executableQuantity: number;
  customerMatches: CustomerMatch[];
  demandStatus: string;
  landedUnitCost: number;
  suggestedSellingPriceUsd: number | null;
  maxBuyPriceUsd: number | null;
  maxBuyPriceSourceCurrency: number | null;
  contribution: number;
  contributionMarginPct: number;
  cashRequirement: number;
  expectedCollectionDate: string | null;
  missingAssumptions: string[];
  warnings: string[];
  fxRate: number;
  fxRateDate: string | null;
  fxSource: string | null;
  incomplete: boolean;
};

/** Build a buying recommendation for a single offer, honouring settings. */
export async function recommendationForOffer(offer: Offer, settings?: TradingSettings): Promise<Recommendation> {
  const cfg = settings ?? (await getTradingSettings());
  const [supplier, fx] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: offer.supplierId } }),
    resolveFxRate(offer.currency),
  ]);

  let product: Recommendation["product"] = null;
  const matches: CustomerMatch[] = [];
  if (offer.productId) {
    const p = await prisma.product.findUnique({ where: { id: offer.productId } });
    if (p) {
      product = {
        id: p.id,
        internalSku: p.internalSku,
        brand: p.brand,
        fragranceName: p.fragranceName,
        sizeMl: p.sizeMl,
      };
    }
    const demands = await prisma.demand.findMany({
      where: {
        productId: offer.productId,
        approved: true,
        status: { in: ["WISHLIST", "REQUEST", "QUOTE", "CONFIRMED"] },
        OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
      },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    for (const d of demands) {
      matches.push({
        demandId: d.id,
        customerId: d.customerId,
        customerName: d.customer.name,
        targetPrice: d.targetPrice === null ? null : Number(d.targetPrice),
        quantity: d.quantity === null ? null : Number(d.quantity),
        neededBy: d.neededBy ? d.neededBy.toISOString().slice(0, 10) : null,
        status: d.status,
      });
    }
  }

  const quantity = Number(offer.availableQuantity ?? 0);
  const sellingTarget = targetOrEstimate(matches);
  const raw: RawDealInput = {
    quantity,
    buyCurrency: offer.currency ?? "USD",
    buyPrice: offer.price ? Number(offer.price) : 0,
    buyPriceBasis: offer.priceBasis === "CASE" ? "CASE" : "UNIT",
    unitsPerCase: offer.unitsPerCase,
    fxRate: fx.rate || null,
    sellingPriceUsd: sellingTarget,
    inboundCosts: [],
    inboundCostsComplete: false,
    cashCycleDays: cfg.defaultCashCycleDays,
    requiredContributionMarginPct: cfg.minContributionMarginPct,
    moq: offer.moq,
    orderMultiple: offer.orderMultiple,
    priceTierMin: offer.priceTierMin,
    priceTierMax: offer.priceTierMax,
  };

  const { result } = computeDeal(raw);
  const expected = new Date();
  expected.setDate(
    expected.getDate() + (offer.leadTimeDays ?? 0) + (result.cashCycleDays ?? cfg.defaultCashCycleDays),
  );

  return {
    offerId: offer.id,
    supplierName: supplier?.name ?? "Unknown supplier",
    product,
    executableQuantity: result.quantity,
    customerMatches: matches,
    demandStatus: matches.length
      ? `${matches.length} approved demand(s)`
      : "No approved customer demand",
    landedUnitCost: result.landedUnitCost,
    suggestedSellingPriceUsd: result.minSellPriceUsd ?? (sellingTarget || null),
    // Max buy price is only meaningful against a real sell basis (a customer
    // demand target). Without one it would read as a misleading $0.
    maxBuyPriceUsd: sellingTarget > 0 ? result.maxBuyPriceUsd : null,
    maxBuyPriceSourceCurrency: sellingTarget > 0 ? result.maxBuyPriceSourceCurrency : null,
    contribution: result.dealContribution,
    contributionMarginPct: result.contributionMarginPct,
    cashRequirement: result.cashRequirement,
    expectedCollectionDate: expected.toISOString().slice(0, 10),
    missingAssumptions: result.missingInputs,
    warnings: result.warnings,
    fxRate: fx.rate,
    fxRateDate: fx.rateDate ? fx.rateDate.toISOString().slice(0, 10) : null,
    fxSource: fx.source,
    incomplete: result.incomplete,
  };
}

function targetOrEstimate(matches: CustomerMatch[]): number {
  const prices = matches.map((m) => m.targetPrice).filter((p): p is number => p !== null && p > 0);
  if (prices.length) return Math.max(...prices);
  return 0;
}

export { round };
