// Supplier scorecard (§18).
//
// The brief requires ranking suppliers on more than price: executable landed
// cost, fill rate, on-time delivery, claims, authenticity evidence, payment
// terms and confirmation accuracy. Only some dimensions have data today; the
// rest are reported as explicitly *unavailable* rather than guessed, so a
// reader can see exactly why a supplier ranks where it does.

import { prisma } from "./prisma";
import { getSupplierDeliveryMetrics } from "./receipts";

export type ScorecardDimension = {
  key: string;
  label: string;
  measured: boolean;
  detail: string;
};

export type SupplierScorecard = {
  supplierId: string;
  name: string;
  country: string | null;
  active: boolean;

  offerCount: number;
  activeOfferCount: number;
  /** Active offers with a landed cost we could compute (price + FX). */
  pricedOfferCount: number;
  minLandedUsd: number | null;
  medianLandedUsd: number | null;
  confirmedSupplyUnits: number;

  staleCount: number;
  stalePct: number | null;
  avgDaysSinceConfirmation: number | null;

  authenticityPct: number | null;
  usSuitablePct: number | null;
  medianLeadTimeDays: number | null;
  paymentTerms: string | null;

  wonDeals: number;
  wonContributionUsd: number;

  // Delivery record (§18): measurable once goods receipts and claims exist.
  receiptCount: number;
  receiptsWithExpected: number;
  fillRatePct: number | null;
  onTimePct: number | null;
  claimCount: number;
  openClaimCount: number;
  claimUnits: number;
  claimAmountUsd: number;
  /** 0-1 delivery component; null when nothing measurable is on record. */
  deliveryScore: number | null;

  /** 0-100 composite of the *measurable* dimensions only. Null if unpriced. */
  score: number | null;
  rank: number | null;
};

export type SupplierScorecardResult = {
  suppliers: SupplierScorecard[];
  dimensions: ScorecardDimension[];
  asOf: string;
};

// Weights for the composite score. Documented so a manager can see the rule.
// `delivery` only contributes when a supplier has receipts/claims on record, so
// a supplier with no delivery history is scored on cost, freshness and evidence
// alone (as before). See `getSupplierScorecard`.
const WEIGHTS = { cost: 0.5, freshness: 0.3, evidence: 0.2, delivery: 0.3 } as const;
const STALE_DAYS = 14;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export const SCORECARD_DIMENSIONS: ScorecardDimension[] = [
  { key: "cost", label: "Executable landed cost", measured: true, detail: "USD landed/unit from active offers, via dated FX." },
  { key: "confirmation", label: "Confirmation accuracy", measured: true, detail: "Share of active offers reconfirmed within the freshness window." },
  { key: "authenticity", label: "Authenticity evidence", measured: true, detail: "Share of active offers carrying authenticity documentation." },
  { key: "terms", label: "Payment terms", measured: true, detail: "Most common terms across the supplier's offers." },
  { key: "leadtime", label: "Lead time", measured: true, detail: "Median lead time across the supplier's offers." },
  { key: "fillrate", label: "Fill rate", measured: true, detail: "Units received vs units ordered across goods receipts; a supplier with no receipts shows as *pending*." },
  { key: "ontime", label: "On-time delivery", measured: true, detail: "Share of receipts arriving on or before the promised date; needs receipts with a promised date." },
  { key: "claims", label: "Claims", measured: true, detail: "Count and value of claims/returns raised against the supplier." },
];

export async function getSupplierScorecard(now = new Date()): Promise<SupplierScorecardResult> {
  const [suppliers, offers, deals, rates, delivery] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    prisma.offer.findMany({
      select: {
        supplierId: true,
        productId: true,
        status: true,
        price: true,
        currency: true,
        priceBasis: true,
        unitsPerCase: true,
        listDate: true,
        createdAt: true,
        lastStockConfirmation: true,
        availableQuantity: true,
        // To avoid double-counting a supplier's own duplicate listings of one
        // owner's lot (§11.1), supply is deduplicated by stock pool below.
        poolId: true,
        stockOwnerId: true,
        batchOrLotRef: true,
        uniqueLotReference: true,
        authenticityDocs: true,
        usSuitability: true,
        paymentTerms: true,
        leadTimeDays: true,
      },
    }),
    prisma.deal.findMany({
      where: { status: "WON" },
      select: { supplierId: true, dealContribution: true },
    }),
    prisma.fxRate.findMany({ select: { baseCurrency: true, rate: true, rateDate: true } }),
    getSupplierDeliveryMetrics(),
  ]);

  const rateList = rates.map((r) => ({ base: r.baseCurrency, rate: Number(r.rate), date: r.rateDate }));
  function unitUsd(
    price: number,
    basis: string | null,
    unitsPerCase: number | null,
    currency: string | null,
    on: Date,
  ): number | null {
    const code = (currency ?? "USD").toUpperCase();
    let rate = 1;
    if (code !== "USD") {
      const candidates = rateList
        .filter((r) => r.base === code)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      if (!candidates.length) return null;
      let chosen: (typeof candidates)[number] | null = null;
      for (const r of candidates) if (r.date.getTime() <= on.getTime()) chosen = r;
      rate = (chosen ?? candidates[0]).rate;
    }
    const perUnit =
      basis === "CASE" ? (unitsPerCase && unitsPerCase > 0 ? price / unitsPerCase : null) : price;
    return perUnit === null ? null : Math.round(perUnit * rate * 10000) / 10000;
  }

  const offersBySupplier = new Map<string, typeof offers>();
  for (const o of offers) {
    const list = offersBySupplier.get(o.supplierId) ?? [];
    list.push(o);
    offersBySupplier.set(o.supplierId, list);
  }
  const dealsBySupplier = new Map<string, { count: number; contribution: number }>();
  for (const d of deals) {
    const entry = dealsBySupplier.get(d.supplierId) ?? { count: 0, contribution: 0 };
    entry.count += 1;
    entry.contribution += d.dealContribution === null ? 0 : Number(d.dealContribution);
    dealsBySupplier.set(d.supplierId, entry);
  }

  const staleBefore = new Date(now.getTime() - STALE_DAYS * 86_400_000);

  const scorecards: SupplierScorecard[] = suppliers.map((s) => {
    const supOffers = offersBySupplier.get(s.id) ?? [];
    const active = supOffers.filter((o) => o.status === "ACTIVE");

    const landed: number[] = [];
    for (const o of active) {
      if (o.price === null) continue;
      const on = o.listDate ?? o.createdAt;
      const value = unitUsd(Number(o.price), o.priceBasis, o.unitsPerCase, o.currency, on);
      if (value !== null) landed.push(value);
    }

    let staleCount = 0;
    let confirmationAgeSum = 0;
    let confirmationAgeN = 0;
    for (const o of active) {
      const confirmed = o.lastStockConfirmation ?? o.listDate;
      if (!confirmed || confirmed < staleBefore) staleCount += 1;
      if (confirmed) {
        confirmationAgeSum += (now.getTime() - confirmed.getTime()) / 86_400_000;
        confirmationAgeN += 1;
      }
    }

    const withDocs = active.filter((o) => (o.authenticityDocs ?? "").trim().length > 0).length;
    const usSuitable = active.filter((o) => (o.usSuitability ?? "").trim().length > 0).length;
    const terms = mostCommon(
      active.map((o) => (o.paymentTerms ?? "").trim()).filter((t) => t.length > 0),
    );
    const leadTimes = active
      .map((o) => o.leadTimeDays)
      .filter((d): d is number => d !== null && d > 0);
    // Deduplicate this supplier's supply by physical stock pool (§11.1): one
    // owner's lot listed more than once must count once, not once per listing.
    const poolQty = new Map<string, number>();
    for (const o of active) {
      if (o.availableQuantity === null) continue;
      const q = Number(o.availableQuantity);
      const lot = (o.batchOrLotRef ?? o.uniqueLotReference ?? "").trim();
      const key = o.poolId ?? `${o.productId ?? "?"}|${o.stockOwnerId ?? "?"}|${lot}`;
      poolQty.set(key, Math.max(poolQty.get(key) ?? 0, q));
    }
    const supply = [...poolQty.values()].reduce((sum, v) => sum + v, 0);
    const dealAgg = dealsBySupplier.get(s.id) ?? { count: 0, contribution: 0 };

    const dm = delivery.get(s.id);
    // Delivery component: blend whatever is measurable. Missing pieces are
    // ignored rather than assumed good. Null when there is no delivery history.
    let deliveryScore: number | null = null;
    if (dm && (dm.receiptCount > 0 || dm.claimCount > 0)) {
      const parts: number[] = [];
      if (dm.fillRatePct !== null) parts.push(Math.min(dm.fillRatePct, 100) / 100);
      if (dm.onTimePct !== null) parts.push(Math.min(dm.onTimePct, 100) / 100);
      // Claims: penalise proportionally to receipts (capped at 1 claim/receipt).
      if (dm.receiptCount > 0) {
        parts.push(1 - Math.min(dm.claimCount / dm.receiptCount, 1));
      } else {
        parts.push(1 - Math.min(dm.claimCount, 1));
      }
      deliveryScore = parts.reduce((s, p) => s + p, 0) / parts.length;
    }

    return {
      supplierId: s.id,
      name: s.name,
      country: s.country,
      active: s.active,
      offerCount: supOffers.length,
      activeOfferCount: active.length,
      pricedOfferCount: landed.length,
      minLandedUsd: landed.length ? Math.min(...landed) : null,
      medianLandedUsd: median(landed),
      confirmedSupplyUnits: supply,
      staleCount,
      stalePct: active.length ? Math.round((staleCount / active.length) * 1000) / 10 : null,
      avgDaysSinceConfirmation: confirmationAgeN
        ? Math.round((confirmationAgeSum / confirmationAgeN) * 10) / 10
        : null,
      authenticityPct: active.length ? Math.round((withDocs / active.length) * 1000) / 10 : null,
      usSuitablePct: active.length ? Math.round((usSuitable / active.length) * 1000) / 10 : null,
      medianLeadTimeDays: median(leadTimes),
      paymentTerms: terms,
      wonDeals: dealAgg.count,
      wonContributionUsd: Math.round(dealAgg.contribution * 100) / 100,
      receiptCount: dm?.receiptCount ?? 0,
      receiptsWithExpected: dm?.receiptsWithExpected ?? 0,
      fillRatePct: dm?.fillRatePct ?? null,
      onTimePct: dm?.onTimePct ?? null,
      claimCount: dm?.claimCount ?? 0,
      openClaimCount: dm?.openClaimCount ?? 0,
      claimUnits: dm?.claimUnits ?? 0,
      claimAmountUsd: dm?.claimAmountUsd ?? 0,
      deliveryScore,
      score: null,
      rank: null,
    };
  });

  // Composite score across suppliers that have at least one priced offer.
  const priced = scorecards.filter((s) => s.medianLandedUsd !== null && s.pricedOfferCount > 0);
  if (priced.length) {
    const costs = priced.map((s) => s.medianLandedUsd as number);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    for (const s of priced) {
      const cost = s.medianLandedUsd as number;
      const costScore = maxCost > minCost ? 1 - (cost - minCost) / (maxCost - minCost) : 1;
      const freshnessScore = s.stalePct === null ? 0 : 1 - s.stalePct / 100;
      const evidenceScore = s.authenticityPct === null ? 0 : s.authenticityPct / 100;
      // Delivery only counts when there is history; otherwise the score stays
      // exactly as it was on cost, freshness and evidence alone.
      const deliveryScore = s.deliveryScore ?? 0;
      const totalWeight = WEIGHTS.cost + WEIGHTS.freshness + WEIGHTS.evidence + (s.deliveryScore === null ? 0 : WEIGHTS.delivery);
      const weighted =
        WEIGHTS.cost * costScore +
        WEIGHTS.freshness * freshnessScore +
        WEIGHTS.evidence * evidenceScore +
        (s.deliveryScore === null ? 0 : WEIGHTS.delivery * deliveryScore);
      s.score = Math.round((weighted / totalWeight) * 1000) / 10;
    }
    priced.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    priced.forEach((s, i) => {
      s.rank = i + 1;
    });
  }

  const ranked = [...priced, ...scorecards.filter((s) => !priced.includes(s))];

  return {
    suppliers: ranked,
    dimensions: SCORECARD_DIMENSIONS,
    asOf: now.toISOString().slice(0, 10),
  };
}

export { WEIGHTS as SUPPLIER_SCORE_WEIGHTS, STALE_DAYS as SUPPLIER_STALE_DAYS };
