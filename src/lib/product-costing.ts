// Per-product costing: turn each supplier offer into a landed unit cost and a
// suggested selling price, so the best supplier can be chosen on landed cost
// (price converted by FX, plus freight and duty) rather than sticker price.
//
// Pure functions — safe to import in client components. FX is resolved per
// offer currency from a rate map, so mixed-currency offer lists are handled.

import { computeProfitability, type CostLineInput } from "./pricing";

export type OfferCostInput = {
  price: number;
  currency: string;
  priceBasis: string | null;
  unitsPerCase: number | null;
};

export type CostAssumptions = {
  /** USD per one unit of each source currency. USD resolves to 1. */
  fxByCurrency: Record<string, number>;
  /** Freight (and similar inbound cost) per unit, USD. */
  freightPerUnitUsd: number;
  /** Duty as a percentage of the supplier buy price. */
  dutyPct: number;
  /** Required contribution margin used to derive a suggested selling price. */
  targetMarginPct: number;
};

export type OfferCost = {
  hasFx: boolean;
  fx: number;
  buyUnitUsd: number;
  freightPerUnitUsd: number;
  dutyPerUnitUsd: number;
  landedUnitCost: number;
  breakEvenSellingPriceUsd: number;
  minSellPriceUsd: number | null;
};

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** USD per one unit of `currency`; 0 means "no rate known". USD is always 1. */
export function offerFx(currency: string, fxByCurrency: Record<string, number>): number {
  const code = (currency ?? "USD").toUpperCase();
  if (code === "USD") return 1;
  const rate = fxByCurrency[code];
  return rate && rate > 0 ? rate : 0;
}

export function offerUnitUsd(offer: OfferCostInput, fx: number): number {
  const upc = offer.unitsPerCase && offer.unitsPerCase > 0 ? offer.unitsPerCase : null;
  const perUnit = offer.priceBasis === "CASE" && upc ? offer.price / upc : offer.price;
  return round(perUnit * fx, 4);
}

function buildInbound(buyUnitUsd: number, assumptions: CostAssumptions): {
  inbound: CostLineInput[];
  freight: number;
  duty: number;
} {
  const freight = Math.max(0, assumptions.freightPerUnitUsd);
  const duty = round((buyUnitUsd * Math.max(0, assumptions.dutyPct)) / 100, 4);
  const inbound: CostLineInput[] = [];
  if (freight > 0) inbound.push({ category: "FREIGHT", amount: freight, perUnit: true });
  if (duty > 0) inbound.push({ category: "DUTY", amount: duty, perUnit: true });
  return { inbound, freight, duty };
}

export function landOffer(offer: OfferCostInput, assumptions: CostAssumptions): OfferCost {
  const fx = offerFx(offer.currency, assumptions.fxByCurrency);
  const hasFx = fx > 0;
  const buyUnitUsd = hasFx ? offerUnitUsd(offer, fx) : 0;
  const { inbound, freight, duty } = buildInbound(buyUnitUsd, assumptions);

  const result = computeProfitability({
    quantity: 1,
    buyPrice: offer.price,
    buyPriceBasis: offer.priceBasis === "CASE" ? "CASE" : "UNIT",
    unitsPerCase: offer.unitsPerCase,
    buyCurrency: offer.currency,
    fxRate: hasFx ? fx : 0,
    sellingPriceUsd: 0,
    inboundCosts: inbound,
    inboundCostsComplete: true,
    requiredContributionMarginPct: assumptions.targetMarginPct,
  });

  return {
    hasFx,
    fx,
    buyUnitUsd,
    freightPerUnitUsd: freight,
    dutyPerUnitUsd: duty,
    landedUnitCost: result.landedUnitCost,
    breakEvenSellingPriceUsd: result.breakEvenSellingPriceUsd,
    minSellPriceUsd: result.minSellPriceUsd,
  };
}

export type RankedOffer<T extends OfferCostInput> = {
  offer: T;
  cost: OfferCost;
};

/** Offers ranked by landed unit cost, cheapest first; no-FX offers last. */
export function rankOffersByLanded<T extends OfferCostInput>(
  offers: T[],
  assumptions: CostAssumptions,
): RankedOffer<T>[] {
  return offers
    .map((offer) => ({ offer, cost: landOffer(offer, assumptions) }))
    .sort((a, b) => {
      if (a.cost.hasFx !== b.cost.hasFx) return a.cost.hasFx ? -1 : 1;
      return a.cost.landedUnitCost - b.cost.landedUnitCost;
    });
}

/** Contribution margin at an actual selling price (USD), for a landed cost. */
export function marginAtSellPrice(
  offer: OfferCostInput,
  assumptions: CostAssumptions,
  sellPriceUsd: number,
): { grossMarginPct: number; contributionMarginPct: number; netUnitRevenue: number } {
  const fx = offerFx(offer.currency, assumptions.fxByCurrency);
  const hasFx = fx > 0;
  const buyUnitUsd = hasFx ? offerUnitUsd(offer, fx) : 0;
  const { inbound } = buildInbound(buyUnitUsd, assumptions);
  const result = computeProfitability({
    quantity: 1,
    buyPrice: offer.price,
    buyPriceBasis: offer.priceBasis === "CASE" ? "CASE" : "UNIT",
    unitsPerCase: offer.unitsPerCase,
    buyCurrency: offer.currency,
    fxRate: hasFx ? fx : 0,
    sellingPriceUsd: sellPriceUsd,
    inboundCosts: inbound,
    inboundCostsComplete: true,
    requiredContributionMarginPct: assumptions.targetMarginPct,
  });
  return {
    grossMarginPct: result.grossMarginPct,
    contributionMarginPct: result.contributionMarginPct,
    netUnitRevenue: result.netUnitRevenue,
  };
}
