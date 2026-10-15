// Opportunity ranking (§18).
//
// "Rank opportunities by contribution, credible sell-through, cash cycle,
// customer credit and concentration risk." An opportunity is the best
// executable supplier offer for a single live, approved customer requirement.
// Each is scored 0-100 from five documented dimensions so a reader can see
// exactly why one deal ranks above another — cheapest offer alone is not enough.

import { prisma } from "./prisma";
import { computeDeal, getTradingSettings, type TradingSettings } from "./deals";
import { CERTAINTY_FACTOR, STAGE_PROBABILITY } from "./demands";

export type OpportunityDimension =
  | "contribution"
  | "sellThrough"
  | "cashCycle"
  | "credit"
  | "concentration";

// Documented ranking weights (sum to 1.0) so a manager can audit the rule.
export const OPPORTUNITY_WEIGHTS: Record<OpportunityDimension, number> = {
  contribution: 0.3,
  sellThrough: 0.2,
  cashCycle: 0.15,
  credit: 0.15,
  concentration: 0.2,
};

export const OPPORTUNITY_DIMENSIONS: { key: OpportunityDimension; label: string; detail: string }[] = [
  { key: "contribution", label: "Contribution", detail: "Deal contribution across opportunities (relative)." },
  { key: "sellThrough", label: "Credible sell-through", detail: "Demand stage probability × certainty (exact vs inferred)." },
  { key: "cashCycle", label: "Cash cycle", detail: "Shorter cash cycle scores higher (30d best, 210d worst)." },
  { key: "credit", label: "Customer credit", detail: "Cash requirement against the customer's credit limit." },
  { key: "concentration", label: "Concentration risk", detail: "How much of the open book this customer already represents." },
];

export type OpportunityRow = {
  offerId: string;
  demandId: string;
  supplierName: string;
  customerId: string;
  customerName: string;
  productId: string;
  internalSku: string;
  brand: string | null;
  quantity: number;
  targetPriceUsd: number;
  landedUnitCost: number;
  contribution: number;
  contributionMarginPct: number;
  cashRequirement: number;
  cashCycleDays: number;
  stage: string;
  certainty: string;
  creditLimitUsd: number | null;
  /** This customer's share of total committed open-deal exposure (0-1). */
  customerShare: number;
  score: number;
  components: Record<OpportunityDimension, number>;
  flags: string[];
  incomplete: boolean;
};

export type OpportunityResult = {
  opportunities: OpportunityRow[];
  weights: Record<OpportunityDimension, number>;
  dimensions: typeof OPPORTUNITY_DIMENSIONS;
  asOf: string;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

const OPEN_DEAL_STATUSES = ["DRAFT", "REVIEWED", "APPROVED", "WON"] as const;

export async function getOpportunityRanking(
  now = new Date(),
  limit = 100,
  settings?: TradingSettings,
): Promise<OpportunityResult> {
  const cfg = settings ?? (await getTradingSettings());
  const [demands, offers, openDeals, rates] = await Promise.all([
    prisma.demand.findMany({
      where: {
        approved: true,
        status: { in: ["WISHLIST", "REQUEST", "QUOTE", "CONFIRMED"] },
        productId: { not: null },
        OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
      },
      include: {
        customer: { select: { id: true, name: true, creditLimit: true } },
        product: { select: { internalSku: true, brand: true } },
      },
    }),
    prisma.offer.findMany({
      where: { status: "ACTIVE", price: { not: null }, productId: { not: null } },
      include: { supplier: { select: { name: true } } },
    }),
    prisma.deal.findMany({
      where: { status: { in: [...OPEN_DEAL_STATUSES] }, customerId: { not: null } },
      select: { customerId: true, cashRequirement: true },
    }),
    prisma.fxRate.findMany({ select: { baseCurrency: true, rate: true, rateDate: true } }),
  ]);

  const rateList = rates.map((r) => ({ base: r.baseCurrency, rate: Number(r.rate), date: r.rateDate }));
  function usdRate(currency: string | null, on: Date): number | null {
    const code = (currency ?? "USD").toUpperCase();
    if (code === "USD") return 1;
    const candidates = rateList.filter((r) => r.base === code).sort((a, b) => a.date.getTime() - b.date.getTime());
    if (!candidates.length) return null;
    let chosen: (typeof candidates)[number] | null = null;
    for (const r of candidates) if (r.date.getTime() <= on.getTime()) chosen = r;
    return (chosen ?? candidates[0]).rate;
  }
  function unitUsd(price: number, basis: string | null, unitsPerCase: number | null, currency: string | null, on: Date): number | null {
    const rate = usdRate(currency, on);
    if (rate === null) return null;
    const perUnit = basis === "CASE" ? (unitsPerCase && unitsPerCase > 0 ? price / unitsPerCase : null) : price;
    return perUnit === null ? null : perUnit * rate;
  }

  const offersByProduct = new Map<string, typeof offers>();
  for (const o of offers) {
    if (!o.productId) continue;
    const list = offersByProduct.get(o.productId) ?? [];
    list.push(o);
    offersByProduct.set(o.productId, list);
  }

  // Existing open exposure per customer (for concentration risk).
  const exposureByCustomer = new Map<string, number>();
  let totalExposure = 0;
  for (const d of openDeals) {
    if (!d.customerId) continue;
    const amount = d.cashRequirement === null ? 0 : Number(d.cashRequirement);
    exposureByCustomer.set(d.customerId, (exposureByCustomer.get(d.customerId) ?? 0) + amount);
    totalExposure += amount;
  }

  type Candidate = {
    row: OpportunityRow;
    marginPct: number;
  };
  const candidates: Candidate[] = [];

  for (const demand of demands) {
    if (!demand.productId || !demand.targetPrice) continue;
    const target = Number(demand.targetPrice);
    if (!(target > 0)) continue;

    const productOffers = offersByProduct.get(demand.productId) ?? [];
    let best: { offer: (typeof offers)[number]; landed: number } | null = null;
    for (const o of productOffers) {
      const on = o.listDate ?? o.createdAt;
      const landed = unitUsd(Number(o.price), o.priceBasis, o.unitsPerCase, o.currency, on);
      if (landed === null) continue;
      if (!best || landed < best.landed) best = { offer: o, landed };
    }
    if (!best) continue;

    const offerQty = best.offer.availableQuantity === null ? null : Number(best.offer.availableQuantity);
    const demandQty = demand.quantity === null ? null : Number(demand.quantity);
    const quantity = Math.min(offerQty ?? demandQty ?? 0, demandQty ?? offerQty ?? 0);
    if (!(quantity > 0)) continue;

    const { result } = computeDeal({
      quantity,
      buyCurrency: best.offer.currency ?? "USD",
      buyPrice: Number(best.offer.price),
      buyPriceBasis: best.offer.priceBasis === "CASE" ? "CASE" : "UNIT",
      unitsPerCase: best.offer.unitsPerCase,
      fxRate: usdRate(best.offer.currency, best.offer.listDate ?? best.offer.createdAt),
      sellingPriceUsd: target,
      inboundCosts: [],
      inboundCostsComplete: false,
      cashCycleDays: cfg.defaultCashCycleDays,
      requiredContributionMarginPct: cfg.minContributionMarginPct,
    });

    const stage = demand.status;
    const creditLimit = demand.customer.creditLimit === null ? null : Number(demand.customer.creditLimit);
    const customerShare = totalExposure > 0 ? (exposureByCustomer.get(demand.customer.id) ?? 0) / totalExposure : 0;
    const cashCycleDays = result.cashCycleDays ?? cfg.defaultCashCycleDays;

    const flags: string[] = [];
    if (result.incomplete) flags.push("Inbound costs not confirmed");
    if (creditLimit === null || creditLimit <= 0) flags.push("No credit limit on file");
    else if (result.cashRequirement > creditLimit) flags.push("Cash requirement exceeds credit limit");
    if (customerShare > 0.5) flags.push(`Concentrated: ${Math.round(customerShare * 100)}% of open book`);

    candidates.push({
      marginPct: result.contributionMarginPct,
      row: {
        offerId: best.offer.id,
        demandId: demand.id,
        supplierName: best.offer.supplier.name,
        customerId: demand.customer.id,
        customerName: demand.customer.name,
        productId: demand.productId,
        internalSku: demand.product?.internalSku ?? "—",
        brand: demand.product?.brand ?? null,
        quantity,
        targetPriceUsd: target,
        landedUnitCost: result.landedUnitCost,
        contribution: result.dealContribution,
        contributionMarginPct: result.contributionMarginPct,
        cashRequirement: result.cashRequirement,
        cashCycleDays,
        stage,
        certainty: demand.certainty,
        creditLimitUsd: creditLimit,
        customerShare: Math.round(customerShare * 1000) / 1000,
        score: 0,
        components: { contribution: 0, sellThrough: 0, cashCycle: 0, credit: 0, concentration: 0 },
        flags,
        incomplete: result.incomplete,
      },
    });
  }

  // Relative contribution score: min-max over the candidate set.
  const contributions = candidates.map((c) => c.row.contribution);
  const minContribution = contributions.length ? Math.min(...contributions) : 0;
  const maxContribution = contributions.length ? Math.max(...contributions) : 0;

  for (const c of candidates) {
    const r = c.row;
    const contributionScore =
      maxContribution > minContribution ? (r.contribution - minContribution) / (maxContribution - minContribution) : 1;
    const sellThroughScore = clamp01(
      (STAGE_PROBABILITY[r.stage as keyof typeof STAGE_PROBABILITY] ?? 0) * (CERTAINTY_FACTOR[r.certainty] ?? 1),
    );
    const creditLimit = r.creditLimitUsd;
    const creditScore =
      creditLimit === null || creditLimit <= 0
        ? 0.5
        : r.cashRequirement >= creditLimit
          ? clamp01(creditLimit / r.cashRequirement)
          : 1;
    const cashCycleScore = clamp01(1 - (r.cashCycleDays - 30) / 180);
    const concentrationScore = clamp01(1 - r.customerShare);

    const components: Record<OpportunityDimension, number> = {
      contribution: round3(contributionScore),
      sellThrough: round3(sellThroughScore),
      cashCycle: round3(cashCycleScore),
      credit: round3(creditScore),
      concentration: round3(concentrationScore),
    };
    r.components = components;
    const weighted =
      OPPORTUNITY_WEIGHTS.contribution * contributionScore +
      OPPORTUNITY_WEIGHTS.sellThrough * sellThroughScore +
      OPPORTUNITY_WEIGHTS.cashCycle * cashCycleScore +
      OPPORTUNITY_WEIGHTS.credit * creditScore +
      OPPORTUNITY_WEIGHTS.concentration * concentrationScore;
    r.score = Math.round(weighted * 1000) / 10;
  }

  candidates.sort((a, b) => b.row.score - a.row.score);

  return {
    opportunities: candidates.slice(0, limit).map((c) => c.row),
    weights: OPPORTUNITY_WEIGHTS,
    dimensions: OPPORTUNITY_DIMENSIONS,
    asOf: now.toISOString().slice(0, 10),
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
