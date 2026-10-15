// Customer-specific minimum sell price (§18, §16).
//
// "Calculate the customer-specific minimum sell price consistently." The price
// to hit a required contribution margin is derived through the SAME pricing
// engine used for every deal, so it cannot drift from the deal calculators.
// The only customer-specific inputs are the required margin (a per-customer
// override, else a default, else the global manager minimum) and the cash
// cycle implied by that customer's payment terms.

import { prisma } from "./prisma";
import { computeDeal, getTradingSettings, type RawDealInput } from "./deals";

export type CustomerPricingConfig = {
  defaultMarginPct: number | null;
  overrides: Record<string, number>;
};

export const EMPTY_CUSTOMER_PRICING: CustomerPricingConfig = { defaultMarginPct: null, overrides: {} };

function asPct(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Parse the stored `customer_pricing` value defensively. */
export function parseCustomerPricing(value: unknown): CustomerPricingConfig {
  if (!value || typeof value !== "object") return EMPTY_CUSTOMER_PRICING;
  const src = value as Record<string, unknown>;
  const overrides: Record<string, number> = {};
  if (src.overrides && typeof src.overrides === "object") {
    for (const [key, raw] of Object.entries(src.overrides as Record<string, unknown>)) {
      const pct = asPct(raw);
      if (pct !== null) overrides[key] = pct;
    }
  }
  return { defaultMarginPct: asPct(src.defaultMarginPct), overrides };
}

export async function getCustomerPricingConfig(): Promise<CustomerPricingConfig> {
  const row = await prisma.setting.findUnique({ where: { key: "customer_pricing" } });
  return parseCustomerPricing(row?.value ?? null);
}

/**
 * Turn free-text payment terms into an implied cash-cycle in days. Returns
 * null when no period can be read, so the caller falls back to the default
 * rather than inventing a value.
 */
export function parsePaymentTermDays(terms: string | null | undefined): number | null {
  if (!terms) return null;
  const s = terms.trim().toLowerCase();
  if (!s) return null;
  const net = s.match(/net[\s-]*(\d{1,3})/);
  if (net) return clampDays(Number(net[1]));
  const days = s.match(/(\d{1,3})\s*(?:days?|d)\b/);
  if (days) return clampDays(Number(days[1]));
  const bare = s.match(/^(\d{1,3})$/);
  if (bare) return clampDays(Number(bare[1]));
  if (/\b(cod|prepay|prepaid|cash on delivery|advance)\b/.test(s)) return 0;
  return null;
}

function clampDays(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(365, Math.round(n)));
}

export type MarginResolution = {
  marginPct: number;
  source: "override" | "default" | "global";
};

export function resolveCustomerMarginPct(
  cfg: CustomerPricingConfig,
  customerId: string,
  globalMinPct: number,
): MarginResolution {
  const override = cfg.overrides[customerId];
  if (typeof override === "number") return { marginPct: override, source: "override" };
  if (typeof cfg.defaultMarginPct === "number") return { marginPct: cfg.defaultMarginPct, source: "default" };
  return { marginPct: globalMinPct, source: "global" };
}

export type CustomerMinSellPrice = {
  customerId: string;
  marginPct: number;
  marginSource: MarginResolution["source"];
  paymentTerms: string | null;
  cashCycleDays: number;
  cashCycleDaysSource: "terms" | "default";
  minSellPriceUsd: number | null;
  breakEvenSellingPriceUsd: number;
  maxBuyPriceUsd: number | null;
  cashRequirement: number;
  incomplete: boolean;
  missingInputs: string[];
};

/**
 * Minimum sell price for a customer, computed through the shared pricing engine
 * with that customer's required margin and payment-term cash cycle applied.
 */
export async function getCustomerMinSellPrice(
  customerId: string,
  raw: RawDealInput,
): Promise<CustomerMinSellPrice> {
  const [customer, cfg, settings] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    getCustomerPricingConfig(),
    getTradingSettings(),
  ]);

  const { marginPct, source } = resolveCustomerMarginPct(cfg, customerId, settings.minContributionMarginPct);
  const termsDays = parsePaymentTermDays(customer?.paymentTerms);
  const cashCycleDays = termsDays ?? settings.defaultCashCycleDays;

  const { result } = computeDeal({
    ...raw,
    requiredContributionMarginPct: marginPct,
    cashCycleDays,
  });

  return {
    customerId,
    marginPct,
    marginSource: source,
    paymentTerms: customer?.paymentTerms ?? null,
    cashCycleDays,
    cashCycleDaysSource: termsDays === null ? "default" : "terms",
    minSellPriceUsd: result.minSellPriceUsd,
    breakEvenSellingPriceUsd: result.breakEvenSellingPriceUsd,
    maxBuyPriceUsd: result.maxBuyPriceUsd,
    cashRequirement: result.cashRequirement,
    incomplete: result.incomplete,
    missingInputs: result.missingInputs,
  };
}
