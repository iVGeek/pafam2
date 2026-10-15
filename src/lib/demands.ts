// Demand pipeline segmentation (§13).
//
// The brief is explicit: confirmed unfilled orders, current wishlists and
// probability-weighted opportunities must be kept SEPARATE and never added
// blindly. This module reports each bucket on its own so a reader can see how
// any total was formed.
//
// Demands are already deduplicated when notes are turned into requirements
// (repeated notes merge into one live demand), so each open row is one dated
// requirement. Expired rows are excluded from every open bucket.

import { prisma } from "./prisma";

export const OPEN_DEMAND_STAGES = ["WISHLIST", "REQUEST", "QUOTE", "CONFIRMED"] as const;
export type OpenDemandStage = (typeof OPEN_DEMAND_STAGES)[number];

// Documented, editable weighting rules for the probability-weighted bucket.
// Stage probability reflects how far the requirement has progressed; the
// certainty factor discounts explicitly *inferred* interest.
export const STAGE_PROBABILITY: Record<OpenDemandStage, number> = {
  WISHLIST: 0.2,
  REQUEST: 0.4,
  QUOTE: 0.6,
  CONFIRMED: 1,
};

export const CERTAINTY_FACTOR: Record<string, number> = {
  EXACT: 1,
  INFERRED: 0.5,
};

export type DemandBucket = {
  demandCount: number;
  units: number;
  /** Indicative value from target price, where captured. */
  valueUsd: number;
  /** Only populated for the probability-weighted bucket. */
  weightedUnits: number;
  weightedValueUsd: number;
};

export type DemandPipeline = {
  confirmedUnfilled: DemandBucket;
  currentWishlists: DemandBucket;
  probabilityWeighted: DemandBucket;
  expired: { demandCount: number; units: number };
  asOf: string;
};

export type DemandScope = { customerId?: string; productId?: string };

function emptyBucket(): DemandBucket {
  return { demandCount: 0, units: 0, valueUsd: 0, weightedUnits: 0, weightedValueUsd: 0 };
}

function addToBucket(
  bucket: DemandBucket,
  quantity: number,
  targetPrice: number | null,
  weightedUnits: number,
  weightedValueUsd: number,
): void {
  bucket.demandCount += 1;
  bucket.units += quantity;
  if (targetPrice !== null) bucket.valueUsd += quantity * targetPrice;
  bucket.weightedUnits += weightedUnits;
  bucket.weightedValueUsd += weightedValueUsd;
}

/**
 * Segment open approved demand into confirmed orders, wishlists and a
 * probability-weighted remainder. `scope` narrows to one customer/product
 * (used by the verification script and future per-account views).
 */
export async function getDemandPipeline(
  now = new Date(),
  scope: DemandScope = {},
): Promise<DemandPipeline> {
  const demands = await prisma.demand.findMany({
    where: {
      status: { in: [...OPEN_DEMAND_STAGES, "EXPIRED"] },
      ...(scope.customerId ? { customerId: scope.customerId } : {}),
      ...(scope.productId ? { productId: scope.productId } : {}),
    },
    select: {
      status: true,
      certainty: true,
      quantity: true,
      targetPrice: true,
      expiryDate: true,
    },
  });

  const confirmedUnfilled = emptyBucket();
  const currentWishlists = emptyBucket();
  const probabilityWeighted = emptyBucket();
  const expired = { demandCount: 0, units: 0 };

  for (const d of demands) {
    const quantity = d.quantity === null ? 0 : Number(d.quantity);
    const targetPrice = d.targetPrice === null ? null : Number(d.targetPrice);

    // Explicitly expired, or live-but-past-expiry: not open demand.
    if (
      d.status === "EXPIRED" ||
      (d.expiryDate && d.expiryDate.getTime() < now.getTime())
    ) {
      expired.demandCount += 1;
      expired.units += quantity;
      continue;
    }

    const stage = d.status as OpenDemandStage;
    if (stage === "CONFIRMED") {
      // Committed and not yet fulfilled; weighted at 100%.
      addToBucket(confirmedUnfilled, quantity, targetPrice, quantity, targetPrice === null ? 0 : quantity * targetPrice);
    } else if (stage === "WISHLIST") {
      addToBucket(currentWishlists, quantity, targetPrice, 0, 0);
    } else {
      // REQUEST / QUOTE -> probability-weighted only, never added to the
      // confirmed or wishlist buckets.
      const probability = STAGE_PROBABILITY[stage] * (CERTAINTY_FACTOR[d.certainty] ?? 1);
      addToBucket(
        probabilityWeighted,
        quantity,
        targetPrice,
        quantity * probability,
        targetPrice === null ? 0 : quantity * targetPrice * probability,
      );
    }
  }

  return {
    confirmedUnfilled,
    currentWishlists,
    probabilityWeighted,
    expired,
    asOf: now.toISOString().slice(0, 10),
  };
}
