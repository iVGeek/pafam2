// Profitability and cash-deployment engine (§7, §8, §9, §10, §18).
//
// Pure functions: no database access. Every figure is derived from explicit
// inputs so a recommendation can always be traced back to its assumptions.
//
// Currency rule: all comparison happens in USD. Supplier prices are converted
// with a *dated* rate expressed as USD per one unit of the source currency.

export type CostCategoryName =
  | "FREIGHT"
  | "INSURANCE"
  | "DUTY"
  | "BROKERAGE"
  | "HANDLING"
  | "TAX"
  | "RECOVERABLE"
  | "OUTBOUND"
  | "COMMISSION"
  | "FEES"
  | "STORAGE"
  | "FINANCING"
  | "CREDIT_LOSS"
  | "OTHER";

export const INBOUND_CATEGORIES: CostCategoryName[] = [
  "FREIGHT",
  "INSURANCE",
  "DUTY",
  "BROKERAGE",
  "HANDLING",
  "TAX",
  "RECOVERABLE",
  "OTHER",
];

export const OUTBOUND_CATEGORIES: CostCategoryName[] = [
  "OUTBOUND",
  "COMMISSION",
  "FEES",
  "STORAGE",
  "FINANCING",
  "CREDIT_LOSS",
];

export type CostLineInput = {
  category: CostCategoryName;
  label?: string;
  /** Amount in `currency`. Total for the deal, or per unit when `perUnit`. */
  amount: number;
  currency?: string;
  /** Recoverable taxes affect cash funding but are not a permanent cost (§8.2). */
  recoverable?: boolean;
  /** When true, `amount` is per bottle rather than a deal total. */
  perUnit?: boolean;
  driver?: string;
};

export type ProfitabilityInput = {
  quantity: number;

  // Purchase
  buyPrice: number;
  buyPriceBasis?: "UNIT" | "CASE";
  unitsPerCase?: number | null;
  buyCurrency: string;
  /** USD per one unit of buyCurrency. Required unless buyCurrency is USD. */
  fxRate?: number | null;

  // Selling
  sellingPriceUsd: number;

  // Price deductions applied per unit (ordered application).
  discountPct?: number | null;
  returnsAllowancePct?: number | null;
  rebatePerUnit?: number | null;
  otherDeductionsPerUnit?: number | null;

  // Deal costs. Inbound feeds landed cost, outbound feeds contribution.
  inboundCosts?: CostLineInput[];
  outboundCosts?: CostLineInput[];
  // Caller confirms whether material inbound costs are known (§8.3).
  inboundCostsComplete?: boolean;

  // Cash and capital
  cashCycleDays?: number | null;
  deployedCapitalUsd?: number | null;

  // Stress / scenario controls (§8.5)
  sellThroughFactor?: number | null; // fraction of purchased units that sells
  defaultPctOnReceivable?: number | null; // portion of net receivable never collected

  // Manager-set rules (§10, §18)
  requiredContributionMarginPct?: number | null;

  // Supplier ordering constraints (§7.1 quantity tiers / MOQ / order multiple)
  moq?: number | null;
  orderMultiple?: number | null;
  priceTierMin?: number | null;
  priceTierMax?: number | null;
};

export type ProfitabilityResult = {
  quantity: number;
  fxRate: number;
  buyUnitPriceUsd: number;

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
  maxBuyPriceSourceCurrency: number | null;
  minSellPriceUsd: number | null;
  meetsRequiredContribution: boolean | null;

  recoverableInboundTotal: number;

  incomplete: boolean;
  missingInputs: string[];
  warnings: string[];
};

const MONEY = 2;
const UNIT = 4;
const PCT = 4;

export function round(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  const r = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(r, -0) ? 0 : r;
}

function lineTotal(line: CostLineInput, quantity: number): number {
  return line.perUnit ? line.amount * quantity : line.amount;
}

function sumLines(lines: CostLineInput[] | undefined, quantity: number): number {
  if (!lines?.length) return 0;
  return lines.reduce((acc, line) => acc + lineTotal(line, quantity), 0);
}

/**
 * Compute the full profitability picture for a proposed deal.
 * Never returns NaN/Infinity: blockers are surfaced via `incomplete` +
 * `missingInputs` instead of a false zero-cost result (§8.3).
 */
export function computeProfitability(input: ProfitabilityInput): ProfitabilityResult {
  const quantity = input.quantity > 0 ? input.quantity : 0;
  const missingInputs: string[] = [];
  const warnings: string[] = [];

  // --- Supplier ordering constraints (quantity tiers, MOQ, order multiple) ---
  const moq = input.moq && input.moq > 0 ? input.moq : null;
  const orderMultiple = input.orderMultiple && input.orderMultiple > 0 ? input.orderMultiple : null;
  const tierMin = input.priceTierMin && input.priceTierMin > 0 ? input.priceTierMin : null;
  const tierMax = input.priceTierMax && input.priceTierMax > 0 ? input.priceTierMax : null;
  if (quantity > 0) {
    if (moq && quantity < moq) {
      warnings.push(`Quantity ${quantity} is below the supplier MOQ of ${moq}; order at least ${moq}.`);
    }
    if (orderMultiple && quantity % orderMultiple !== 0) {
      const roundedUp = Math.ceil(quantity / orderMultiple) * orderMultiple;
      warnings.push(
        `Quantity should be a multiple of ${orderMultiple} (nearest valid: ${roundedUp}).`,
      );
    }
    if (tierMax && quantity > tierMax) {
      warnings.push(
        `Quantity ${quantity} exceeds this price tier (${tierMin ?? "?"}-${tierMax}); the quoted price may not apply.`,
      );
    }
    if (tierMin && quantity < tierMin) {
      warnings.push(`Quantity ${quantity} is below this price tier minimum of ${tierMin}.`);
    }
  }

  // --- FX ---
  let fxRate = 1;
  const isUsd = (input.buyCurrency || "USD").toUpperCase() === "USD";
  if (isUsd) {
    fxRate = input.fxRate ?? 1;
  } else if (input.fxRate && input.fxRate > 0) {
    fxRate = input.fxRate;
  } else {
    missingInputs.push(`FX rate (USD per 1 ${input.buyCurrency})`);
    fxRate = 0;
  }

  // --- Buy price per bottle, converted to USD ---
  const unitsPerCase = input.unitsPerCase && input.unitsPerCase > 0 ? input.unitsPerCase : null;
  let buyUnitPriceSource = input.buyPrice;
  if (input.buyPriceBasis === "CASE") {
    if (!unitsPerCase) {
      missingInputs.push("Units per case (price is quoted per case)");
      buyUnitPriceSource = 0;
    } else {
      buyUnitPriceSource = input.buyPrice / unitsPerCase;
    }
  }
  const buyUnitPriceUsd = round(buyUnitPriceSource * fxRate, UNIT);

  // --- Sell-through: we buy `quantity` but may only sell a share of it ---
  const sellThroughFactor = clamp01(input.sellThroughFactor ?? 1);
  const soldQty = quantity * sellThroughFactor;
  if (sellThroughFactor < 1) {
    warnings.push(
      `Sell-through assumed at ${round(sellThroughFactor * 100, 1)}%; unsold units stay in inventory.`,
    );
  }

  // --- Inbound costs (defined once; recoverable split out) ---
  const inboundTotal = sumLines(input.inboundCosts, quantity);
  const recoverableInboundTotal = round(
    (input.inboundCosts ?? [])
      .filter((l) => l.recoverable)
      .reduce((acc, l) => acc + lineTotal(l, quantity), 0),
    MONEY,
  );
  const permanentInboundTotal = inboundTotal - recoverableInboundTotal;
  const inboundPerUnit = quantity > 0 ? permanentInboundTotal / quantity : 0;

  if (!input.inboundCostsComplete) {
    missingInputs.push("Inbound costs not confirmed (freight, duty, brokerage, handling)");
  }
  if (input.inboundCostsComplete && !input.inboundCosts?.length) {
    warnings.push("No inbound cost lines supplied; landed cost equals the supplier price.");
  }

  const landedUnitCost = round(buyUnitPriceUsd + inboundPerUnit, UNIT);
  const landedCostTotal = round(landedUnitCost * quantity, MONEY);

  // --- Selling price and deductions ---
  const discountPct = clamp01(input.discountPct ?? 0);
  const returnsPct = clamp01(input.returnsAllowancePct ?? 0);
  const rebatePerUnit = input.rebatePerUnit ?? 0;
  const otherDeductionsPerUnit = input.otherDeductionsPerUnit ?? 0;

  const sellingPriceUsd = input.sellingPriceUsd;
  if (!(sellingPriceUsd > 0)) {
    missingInputs.push("Selling price");
  }

  const deductionFactor = 1 - discountPct - returnsPct;
  const netUnitRevenue = round(
    sellingPriceUsd * deductionFactor - rebatePerUnit - otherDeductionsPerUnit,
    UNIT,
  );
  const netRevenueTotal = round(netUnitRevenue * soldQty, MONEY);

  // --- Gross profit and margin ---
  const grossProfit = round(netRevenueTotal - landedCostTotal, MONEY);
  const grossMarginPct = netRevenueTotal !== 0 ? round((grossProfit / netRevenueTotal) * 100, PCT) : 0;
  const markupOnCostPct = landedCostTotal !== 0 ? round((grossProfit / landedCostTotal) * 100, PCT) : 0;

  // --- Deal contribution (outbound + other deal costs, each counted once) ---
  const outboundTotal = sumLines(input.outboundCosts, soldQty);
  const defaultPct = clamp01(input.defaultPctOnReceivable ?? 0);
  const creditLoss = round(netRevenueTotal * defaultPct, MONEY);
  if (defaultPct > 0) {
    warnings.push(`Customer default assumed on ${round(defaultPct * 100, 1)}% of the receivable.`);
  }
  const dealContribution = round(grossProfit - outboundTotal - creditLoss, MONEY);
  const contributionMarginPct =
    netRevenueTotal !== 0 ? round((dealContribution / netRevenueTotal) * 100, PCT) : 0;

  // --- Cash and capital ---
  // Cash committed up front = purchase + all inbound (incl. recoverable) + outbound.
  const cashRequirement = round(landedCostTotal + recoverableInboundTotal + outboundTotal, MONEY);
  const deployedCapital =
    input.deployedCapitalUsd && input.deployedCapitalUsd > 0
      ? input.deployedCapitalUsd
      : cashRequirement;
  const capitalEfficiencyPct =
    deployedCapital > 0 ? round((dealContribution / deployedCapital) * 100, PCT) : null;

  const cashCycleDays = input.cashCycleDays && input.cashCycleDays > 0 ? input.cashCycleDays : null;
  if (!cashCycleDays) {
    warnings.push("Cash cycle days unknown; annualised return not shown.");
  }
  const annualisedReturnPct =
    capitalEfficiencyPct !== null && cashCycleDays
      ? round(capitalEfficiencyPct * (365 / cashCycleDays), PCT)
      : null;

  // --- Break-even and price limits ---
  const breakEvenSellingPriceUsd = round(
    deductionFactor > 0 ? (landedUnitCost + rebatePerUnit + otherDeductionsPerUnit) / deductionFactor : 0,
    UNIT,
  );

  const minMargin = input.requiredContributionMarginPct;
  let minSellPriceUsd: number | null = null;
  let maxBuyPriceUsd: number | null = null;
  let maxBuyPriceSourceCurrency: number | null = null;
  let meetsRequiredContribution: boolean | null = null;

  if (minMargin !== null && minMargin !== undefined) {
    const m = clamp01(minMargin / 100);
    // Target unit revenue so that contribution margin equals m.
    if (m < 1 && soldQty > 0) {
      const outboundPerUnit = outboundTotal / soldQty;
      const targetNetUnit = (landedUnitCost + outboundPerUnit) / (1 - m);
      const targetGrossUnit =
        deductionFactor > 0
          ? (targetNetUnit + rebatePerUnit + otherDeductionsPerUnit) / deductionFactor
          : targetNetUnit;
      minSellPriceUsd = round(targetGrossUnit, UNIT);

      // Max buy price: hold selling price, absorb costs, still hit m.
      const maxLandedUnit = netUnitRevenue - (m * netUnitRevenue + outboundPerUnit);
      const maxInboundPerUnit = quantity > 0 ? permanentInboundTotal / quantity : 0;
      const maxBuyUnitUsd = maxLandedUnit - maxInboundPerUnit;
      maxBuyPriceUsd = round(maxBuyUnitUsd, UNIT);
      maxBuyPriceSourceCurrency = fxRate > 0 ? round(maxBuyUnitUsd / fxRate, UNIT) : null;
    }
    meetsRequiredContribution = contributionMarginPct >= minMargin;
  }

  const incomplete = missingInputs.length > 0;

  return {
    quantity,
    fxRate,
    buyUnitPriceUsd,
    landedUnitCost,
    landedCostTotal,
    netUnitRevenue,
    netRevenueTotal,
    grossProfit,
    grossMarginPct,
    markupOnCostPct,
    dealContribution,
    contributionMarginPct,
    cashRequirement,
    cashCycleDays,
    capitalEfficiencyPct,
    annualisedReturnPct,
    breakEvenSellingPriceUsd,
    maxBuyPriceUsd,
    maxBuyPriceSourceCurrency,
    minSellPriceUsd,
    meetsRequiredContribution,
    recoverableInboundTotal,
    incomplete,
    missingInputs,
    warnings,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
