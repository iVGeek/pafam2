// Exposure and speculative-buying caps (§18).
//
// "Cap speculative buying and exposure per SKU, brand, supplier and customer."
// Exposure is the cash we have committed to *open* deals (draft / reviewed /
// approved) — won, lost and fulfilled deals are excluded. A deal is
// "speculative" when it is not backed by an approved, unexpired customer
// demand for the same product (and customer, when the deal names one).

import { prisma } from "./prisma";

export const EXPOSURE_DIMENSIONS = ["sku", "brand", "supplier", "customer"] as const;
export type ExposureDimension = (typeof EXPOSURE_DIMENSIONS)[number];

export type ExposureCaps = {
  overrides: Record<ExposureDimension, Record<string, number>>;
  defaults: Record<ExposureDimension, number>;
};

export const EMPTY_EXPOSURE_CAPS: ExposureCaps = {
  overrides: { sku: {}, brand: {}, supplier: {}, customer: {} },
  defaults: { sku: 0, brand: 0, supplier: 0, customer: 0 },
};

const OPEN_DEAL_STATUSES = ["DRAFT", "REVIEWED", "APPROVED"] as const;

function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Parse the stored `exposure_caps` value defensively. */
export function parseExposureCaps(value: unknown): ExposureCaps {
  if (!value || typeof value !== "object") return EMPTY_EXPOSURE_CAPS;
  const src = value as Record<string, unknown>;
  const overrides = { sku: {}, brand: {}, supplier: {}, customer: {} } as ExposureCaps["overrides"];
  for (const dim of EXPOSURE_DIMENSIONS) {
    const bucket = src[dim];
    if (bucket && typeof bucket === "object") {
      for (const [key, raw] of Object.entries(bucket as Record<string, unknown>)) {
        overrides[dim][key] = num(raw);
      }
    }
  }
  const defaultsSrc = (src.defaults && typeof src.defaults === "object" ? src.defaults : {}) as Record<string, unknown>;
  const defaults = {
    sku: num(defaultsSrc.sku),
    brand: num(defaultsSrc.brand),
    supplier: num(defaultsSrc.supplier),
    customer: num(defaultsSrc.customer),
  };
  return { overrides, defaults };
}

export async function getExposureCaps(): Promise<ExposureCaps> {
  const row = await prisma.setting.findUnique({ where: { key: "exposure_caps" } });
  return parseExposureCaps(row?.value ?? null);
}

export function resolveCap(caps: ExposureCaps, dimension: ExposureDimension, key: string): number {
  const override = caps.overrides[dimension][key];
  if (typeof override === "number") return override;
  return caps.defaults[dimension];
}

export type ExposureRow = {
  dimension: ExposureDimension;
  /** Machine key: internalSku, brand name, supplier name or customer name. */
  key: string;
  openDealCount: number;
  committedUsd: number;
  speculativeUsd: number;
  capUsd: number;
  overCap: boolean;
};

export type ExposureResult = {
  rows: ExposureRow[];
  totals: { committedUsd: number; speculativeUsd: number; overCapCount: number };
  asOf: string;
};

type Mutable = {
  openDealCount: number;
  committedUsd: number;
  speculativeUsd: number;
};

/**
 * Compute open exposure grouped by SKU, brand, supplier and customer, and
 * compare each group against its configured cap. Rows are sorted with
 * over-cap groups first, then by committed exposure.
 */
export async function getExposure(now = new Date()): Promise<ExposureResult> {
  const [caps, deals, demands] = await Promise.all([
    getExposureCaps(),
    prisma.deal.findMany({
      where: { status: { in: [...OPEN_DEAL_STATUSES] } },
      select: {
        productId: true,
        customerId: true,
        cashRequirement: true,
        product: { select: { internalSku: true, brand: true } },
        supplier: { select: { name: true } },
        customer: { select: { name: true } },
      },
    }),
    prisma.demand.findMany({
      where: {
        approved: true,
        status: { in: ["WISHLIST", "REQUEST", "QUOTE", "CONFIRMED"] },
        productId: { not: null },
        OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
      },
      select: { productId: true, customerId: true },
    }),
  ]);

  // Demand backing: by product alone, and by product+customer pair.
  const byProduct = new Set<string>();
  const byPair = new Set<string>();
  for (const d of demands) {
    if (!d.productId) continue;
    byProduct.add(d.productId);
    byPair.add(`${d.productId}::${d.customerId}`);
  }

  const groups = new Map<string, Map<string, Mutable>>();
  for (const dim of EXPOSURE_DIMENSIONS) groups.set(dim, new Map());

  function add(dimension: ExposureDimension, key: string, committed: number, speculative: boolean) {
    const map = groups.get(dimension)!;
    const entry = map.get(key) ?? { openDealCount: 0, committedUsd: 0, speculativeUsd: 0 };
    entry.openDealCount += 1;
    entry.committedUsd += committed;
    if (speculative) entry.speculativeUsd += committed;
    map.set(key, entry);
  }

  for (const deal of deals) {
    const committed = num(deal.cashRequirement === null ? 0 : Number(deal.cashRequirement));
    const sku = deal.product?.internalSku ?? "(unlinked)";
    const brandKey = deal.product?.brand?.trim() || "(no brand)";
    const supplierKey = deal.supplier.name;
    const customerKey = deal.customer?.name ?? "(no customer)";

    // A deal is backed if there is an approved open demand for its product and,
    // when the deal names a customer, for that same customer. Without a linked
    // product the deal cannot be backed by demand.
    const backed = !deal.productId
      ? false
      : deal.customerId
        ? byPair.has(`${deal.productId}::${deal.customerId}`)
        : byProduct.has(deal.productId);
    const speculative = !backed;

    add("sku", sku, committed, speculative);
    add("brand", brandKey, committed, speculative);
    add("supplier", supplierKey, committed, speculative);
    add("customer", customerKey, committed, speculative);
  }

  const rows: ExposureRow[] = [];
  for (const dim of EXPOSURE_DIMENSIONS) {
    for (const [key, agg] of groups.get(dim)!) {
      const capUsd = resolveCap(caps, dim, key);
      rows.push({
        dimension: dim,
        key,
        openDealCount: agg.openDealCount,
        committedUsd: round2(agg.committedUsd),
        speculativeUsd: round2(agg.speculativeUsd),
        capUsd,
        overCap: capUsd > 0 && agg.committedUsd > capUsd,
      });
    }
  }

  rows.sort((a, b) => {
    if (a.overCap !== b.overCap) return a.overCap ? -1 : 1;
    return b.committedUsd - a.committedUsd;
  });

  const totals = {
    committedUsd: round2(rows.filter((r) => r.dimension === "sku").reduce((s, r) => s + r.committedUsd, 0)),
    speculativeUsd: round2(rows.filter((r) => r.dimension === "sku").reduce((s, r) => s + r.speculativeUsd, 0)),
    overCapCount: rows.filter((r) => r.overCap).length,
  };

  return { rows, totals, asOf: now.toISOString().slice(0, 10) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
