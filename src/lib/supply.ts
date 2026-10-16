// Observed available supply (§11.1).
//
// Supplier stock must never be summed blindly. Several brokers can list the
// same owner's lot; counting every offer double-counts one physical parcel.
// This module groups active offers into *stock pools* and reports each pool's
// quantity once, keeping the availability types the brief demands separate:
//
//   firm stock · indicative availability · incoming shipments · on request
//
// and, where ownership is unknown, a possible-overlap *range* shown separately
// rather than added to the firm total. A pool eligible for more than one
// territory is still one physical pool and is counted once.

import { prisma } from "./prisma";

/** Availability type. Mirrors the separate buckets the brief requires. */
export type SupplyConfidence =
  | "FIRM"
  | "INDICATIVE"
  | "INCOMING"
  | "ON_REQUEST"
  | "UNKNOWN";

export type PoolStatusName = "CONFIRMED" | "POSSIBLE" | "UNVERIFIED";

export type SupplyPool = {
  key: string;
  poolId: string | null;
  productId: string | null;
  stockOwnerId: string | null;
  stockOwnerName: string | null;
  lotReference: string | null;
  label: string;
  status: PoolStatusName;
  /** Latest reported quantity for the pool (one physical parcel). */
  reportedQuantity: number | null;
  /** Range across the offers that report this pool, for transparency. */
  quantityMin: number | null;
  quantityMax: number | null;
  sourceCount: number;
  supplierNames: string[];
  confirmationDate: string | null;
  ageDays: number | null;
  fresh: boolean;
  locations: string[];
  destinations: string[];
  usSuitable: boolean | null;
  confidence: SupplyConfidence;
};

export type ProductSupply = {
  productId: string;
  internalSku: string;
  brand: string | null;
  fragranceName: string | null;
  /** Deduplicated firm confirmed quantity (each pool counted once). */
  confirmedQuantity: number;
  indicativeQuantity: number;
  incomingQuantity: number;
  onRequestQuantity: number;
  /** Possible overstock: owner known but lot unknown, shown as a range. */
  possibleOverlapMin: number;
  possibleOverlapMax: number;
  /** Unverified: ownership unknown, shown as a range, never summed. */
  unverifiedMin: number;
  unverifiedMax: number;
  sourceCount: number;
  ownerCount: number;
  poolCount: number;
  newestConfirmation: string | null;
  pools: SupplyPool[];
};

export type ObservedSupply = {
  asOf: string;
  /** Offers confirmed within this many days are counted "fresh". */
  freshnessDays: number;
  products: ProductSupply[];
  totals: {
    /** Deduplicated firm confirmed quantity across all products. */
    confirmedQuantity: number;
    /** Naive sum of every active offer's quantity, for the dedup comparison. */
    rawOfferQuantity: number;
    /** rawOfferQuantity − (all counted pool quantities). */
    dedupedSaving: number;
    poolCount: number;
    unverifiedPoolCount: number;
    sourceCount: number;
    distinctOwners: number;
  };
  coverage: {
    /** Products with at least one confirmed firm pool. */
    productsWithConfirmed: number;
    /** Products whose only supply is unverified (possible overlap). */
    productsWithUnverifiedOnly: number;
  };
};

export const SUPPLY_FRESHNESS_DAYS = 14;

const CONFIDENCE_PRIORITY: Record<SupplyConfidence, number> = {
  FIRM: 5,
  INDICATIVE: 4,
  INCOMING: 3,
  ON_REQUEST: 2,
  UNKNOWN: 1,
};

/** Normalise the free-text stock confidence column into the required buckets. */
export function normalizeConfidence(raw: string | null | undefined): SupplyConfidence {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "UNKNOWN";
  if (s.includes("confirm") || s.includes("firm") || s.includes("available")) return "FIRM";
  if (s.includes("indicativ") || s.includes("estimate") || s.includes("approx")) return "INDICATIVE";
  if (s.includes("incoming") || s.includes("transit") || s.includes("inbound") || s.includes("on the way"))
    return "INCOMING";
  if (s.includes("request") || s.includes("enquir") || s.includes("inquiry")) return "ON_REQUEST";
  return "UNKNOWN";
}

type OfferRow = {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string | null;
  poolId: string | null;
  stockOwnerId: string | null;
  stockOwnerName: string | null;
  lotReference: string | null;
  quantity: number | null;
  confirmation: Date | null;
  listDate: Date | null;
  createdAt: Date;
  stockCountry: string | null;
  warehouse: string | null;
  destinations: string | null;
  usSuitable: string | null;
  confidence: SupplyConfidence;
};

type Acc = {
  key: string;
  poolId: string | null;
  productId: string | null;
  stockOwnerId: string | null;
  stockOwnerName: string | null;
  lotReference: string | null;
  status: PoolStatusName;
  label: string;
  quantities: number[];
  suppliers: Set<string>;
  supplierNames: Set<string>;
  confirmation: Date | null;
  locations: Set<string>;
  destinations: Set<string>;
  usSuitable: boolean | null;
  confidence: SupplyConfidence;
};

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(((a.getTime() - b.getTime()) / 86_400_000) * 10) / 10;
}

function accToPool(acc: Acc, now: Date): SupplyPool {
  const quantities = acc.quantities.filter((q) => q !== null);
  const sorted = [...quantities].sort((a, b) => a - b);
  const confirmationDate = acc.confirmation ? acc.confirmation.toISOString().slice(0, 10) : null;
  const ageDays = acc.confirmation ? daysBetween(now, acc.confirmation) : null;
  return {
    key: acc.key,
    poolId: acc.poolId,
    productId: acc.productId,
    stockOwnerId: acc.stockOwnerId,
    stockOwnerName: acc.stockOwnerName,
    lotReference: acc.lotReference,
    label: acc.label,
    status: acc.status,
    // "Latest reported quantity": with a confirmation date we take the newest
    // report; without one we take the largest, and always expose the range.
    reportedQuantity: sorted.length ? sorted[sorted.length - 1] : null,
    quantityMin: sorted.length ? round(sorted[0]) : null,
    quantityMax: sorted.length ? round(sorted[sorted.length - 1]) : null,
    sourceCount: acc.suppliers.size,
    supplierNames: [...acc.supplierNames].sort(),
    confirmationDate,
    ageDays,
    fresh: ageDays !== null && ageDays <= SUPPLY_FRESHNESS_DAYS,
    locations: [...acc.locations].sort(),
    destinations: [...acc.destinations].sort(),
    usSuitable: acc.usSuitable,
    confidence: acc.confidence,
  };
}

/**
 * Build the deduplicated observed-supply view. Only ACTIVE offers are counted
 * (stale/expired offers leave active totals but remain in history — §11.1/§20).
 */
export async function getObservedSupply(now = new Date()): Promise<ObservedSupply> {
  const offers = await prisma.offer.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      supplierId: true,
      supplier: { select: { name: true } },
      productId: true,
      poolId: true,
      stockOwnerId: true,
      stockOwner: { select: { name: true } },
      batchOrLotRef: true,
      uniqueLotReference: true,
      availableQuantity: true,
      lastStockConfirmation: true,
      listDate: true,
      createdAt: true,
      stockCountry: true,
      warehouse: true,
      permittedDestinations: true,
      usSuitability: true,
      stockConfidence: true,
    },
  });

  const productIds = [
    ...new Set(offers.map((o) => o.productId).filter((id): id is string => id !== null)),
  ];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, internalSku: true, brand: true, fragranceName: true },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const rows: OfferRow[] = offers.map((o) => {
    const lotReference = (o.batchOrLotRef ?? o.uniqueLotReference ?? "").trim() || null;
    const confirmation = o.lastStockConfirmation ?? o.listDate;
    return {
      id: o.id,
      supplierId: o.supplierId,
      supplierName: o.supplier.name,
      productId: o.productId,
      poolId: o.poolId,
      stockOwnerId: o.stockOwnerId,
      stockOwnerName: o.stockOwner?.name ?? null,
      lotReference,
      quantity: o.availableQuantity === null ? null : Number(o.availableQuantity),
      confirmation,
      listDate: o.listDate,
      createdAt: o.createdAt,
      stockCountry: o.stockCountry,
      warehouse: o.warehouse,
      destinations: o.permittedDestinations,
      usSuitable: o.usSuitability,
      confidence: normalizeConfidence(o.stockConfidence),
    };
  });

  const accs = new Map<string, Acc>();
  for (const r of rows) {
    // Resolve the pool key: a stored pool wins; otherwise a synthetic key that
    // keeps ownership-unknown offers separate (possible overlap) never pooled.
    let key: string;
    let status: PoolStatusName;
    let label: string;
    if (r.poolId) {
      key = `pool:${r.poolId}`;
      status = r.lotReference ? "CONFIRMED" : "POSSIBLE";
      label = r.stockOwnerName
        ? r.lotReference
          ? `${r.stockOwnerName} · ${r.lotReference}`
          : `${r.stockOwnerName} (lot unknown)`
        : r.lotReference ?? "Pooled stock";
    } else if (r.stockOwnerId) {
      key = `owner:${r.productId ?? "?"}:${r.stockOwnerId}:${r.lotReference ?? ""}`;
      status = r.lotReference ? "CONFIRMED" : "POSSIBLE";
      label = `${r.stockOwnerName ?? "Unknown owner"}${r.lotReference ? ` · ${r.lotReference}` : " (lot unknown)"}`;
    } else {
      // No ownership information: cannot pool. Group per product + supplier so a
      // single broker's unknown-owner offers are one line, never merged.
      key = `unverified:${r.productId ?? "?"}:${r.supplierId}`;
      status = "UNVERIFIED";
      label = `${r.stockOwnerName ?? "Ownership unknown"} · via ${r.supplierName}`;
    }

    let acc = accs.get(key);
    if (!acc) {
      acc = {
        key,
        poolId: r.poolId,
        productId: r.productId,
        stockOwnerId: r.stockOwnerId,
        stockOwnerName: r.stockOwnerName,
        lotReference: r.lotReference,
        status,
        label,
        quantities: [],
        suppliers: new Set(),
        supplierNames: new Set(),
        confirmation: null,
        locations: new Set(),
        destinations: new Set(),
        usSuitable: null,
        confidence: "UNKNOWN",
      };
      accs.set(key, acc);
    }
    if (r.quantity !== null) acc.quantities.push(r.quantity);
    acc.suppliers.add(r.supplierId);
    acc.supplierNames.add(r.supplierName);
    if (r.confirmation && (!acc.confirmation || r.confirmation > acc.confirmation)) {
      acc.confirmation = r.confirmation;
    }
    for (const loc of [r.stockCountry, r.warehouse]) if (loc && loc.trim()) acc.locations.add(loc.trim());
    if (r.destinations && r.destinations.trim()) acc.destinations.add(r.destinations.trim());
    if (r.usSuitable && r.usSuitable.trim()) acc.usSuitable = true;
    if (CONFIDENCE_PRIORITY[r.confidence] > CONFIDENCE_PRIORITY[acc.confidence]) {
      acc.confidence = r.confidence;
    }
  }

  const pools = [...accs.values()].map((a) => accToPool(a, now));

  const byProduct = new Map<string, ProductSupply>();
  const rawOfferQuantity = rows.reduce((s, r) => s + (r.quantity ?? 0), 0);
  let countedQuantity = 0;

  for (const pool of pools) {
    if (!pool.productId) continue;
    const meta = productById.get(pool.productId);
    if (!meta) continue;
    let ps = byProduct.get(pool.productId);
    if (!ps) {
      ps = {
        productId: pool.productId,
        internalSku: meta.internalSku,
        brand: meta.brand,
        fragranceName: meta.fragranceName,
        confirmedQuantity: 0,
        indicativeQuantity: 0,
        incomingQuantity: 0,
        onRequestQuantity: 0,
        possibleOverlapMin: 0,
        possibleOverlapMax: 0,
        unverifiedMin: 0,
        unverifiedMax: 0,
        sourceCount: 0,
        ownerCount: 0,
        poolCount: 0,
        newestConfirmation: null,
        pools: [],
      };
      byProduct.set(pool.productId, ps);
    }
    ps.pools.push(pool);
    ps.poolCount += 1;
    ps.sourceCount += pool.sourceCount;
    const q = pool.reportedQuantity ?? 0;
    countedQuantity += q;

    if (pool.status === "CONFIRMED") {
      if (pool.confidence === "INDICATIVE") ps.indicativeQuantity += q;
      else if (pool.confidence === "INCOMING") ps.incomingQuantity += q;
      else if (pool.confidence === "ON_REQUEST") ps.onRequestQuantity += q;
      else ps.confirmedQuantity += q; // FIRM or UNKNOWN treated as available
    } else if (pool.status === "POSSIBLE") {
      // Owner known, lot unknown: possible overlap, shown as a range.
      ps.possibleOverlapMin += pool.quantityMin ?? 0;
      ps.possibleOverlapMax += pool.quantityMax ?? 0;
    } else {
      // Ownership unknown: unverified, shown as a range, never summed.
      ps.unverifiedMin += pool.quantityMin ?? 0;
      ps.unverifiedMax += pool.quantityMax ?? 0;
    }
    if (pool.confirmationDate && (!ps.newestConfirmation || pool.confirmationDate > ps.newestConfirmation)) {
      ps.newestConfirmation = pool.confirmationDate;
    }
  }

  const list = [...byProduct.values()].map((ps) => {
    ps.pools.sort((a, b) => (b.reportedQuantity ?? 0) - (a.reportedQuantity ?? 0));
    ps.ownerCount = new Set(ps.pools.map((p) => p.stockOwnerId).filter(Boolean)).size;
    ps.confirmedQuantity = round(ps.confirmedQuantity);
    ps.indicativeQuantity = round(ps.indicativeQuantity);
    ps.incomingQuantity = round(ps.incomingQuantity);
    ps.onRequestQuantity = round(ps.onRequestQuantity);
    ps.possibleOverlapMin = round(ps.possibleOverlapMin);
    ps.possibleOverlapMax = round(ps.possibleOverlapMax);
    ps.unverifiedMin = round(ps.unverifiedMin);
    ps.unverifiedMax = round(ps.unverifiedMax);
    return ps;
  });
  list.sort((a, b) => b.confirmedQuantity - a.confirmedQuantity || a.internalSku.localeCompare(b.internalSku));

  const distinctOwners = new Set(pools.map((p) => p.stockOwnerId).filter(Boolean)).size;
  const unverifiedPoolCount = pools.filter((p) => p.status === "UNVERIFIED").length;

  return {
    asOf: now.toISOString().slice(0, 10),
    freshnessDays: SUPPLY_FRESHNESS_DAYS,
    products: list,
    totals: {
      confirmedQuantity: round(list.reduce((s, p) => s + p.confirmedQuantity, 0)),
      rawOfferQuantity: round(rawOfferQuantity),
      dedupedSaving: round(rawOfferQuantity - countedQuantity),
      poolCount: pools.length,
      unverifiedPoolCount,
      sourceCount: new Set(rows.map((r) => r.supplierId)).size,
      distinctOwners,
    },
    coverage: {
      productsWithConfirmed: list.filter((p) => p.confirmedQuantity > 0).length,
      productsWithUnverifiedOnly: list.filter(
        (p) =>
          p.confirmedQuantity === 0 &&
          (p.unverifiedMax > 0 || p.possibleOverlapMax > 0 || p.indicativeQuantity > 0),
      ).length,
    },
  };
}

/**
 * Deduplicated firm confirmed quantity per product id. Used by demand-vs-supply
 * alerts and the supplier scorecard so they stop double-counting shared lots.
 */
export async function getConfirmedSupplyByProduct(now = new Date()): Promise<Map<string, number>> {
  const supply = await getObservedSupply(now);
  const map = new Map<string, number>();
  for (const p of supply.products) {
    if (p.confirmedQuantity > 0) map.set(p.productId, p.confirmedQuantity);
  }
  return map;
}
