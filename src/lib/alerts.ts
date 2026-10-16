// Alert engine (§13). Alerts are derived from live records, each with the
// evidence behind it and a suggested action. Thresholds are configurable
// through Settings (see getAlertSettings).

import { prisma } from "./prisma";
import { getTradingSettings } from "./deals";
import { getExposure } from "./exposure";
import { getConfirmedSupplyByProduct } from "./supply";
import { usd, qty } from "./format";

export type AlertSeverity = "high" | "warn" | "info";

export type AlertType =
  | "OFFER_MATCHES_DEMAND"
  | "PRICE_MOVE"
  | "DEMAND_VS_SUPPLY"
  | "STALE_OFFER"
  | "MARGIN_DROP"
  | "AGED_INVENTORY"
  | "DEMAND_EXPIRING"
  | "EXPOSURE_CAP";

export type Alert = {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  evidence: string[];
  suggestedAction: string;
  href?: string;
};

export type AlertSettings = {
  priceMovePct: number;
  staleDays: number;
  agedInventoryDays: number;
  expiringDays: number;
  marginDropPct: number;
};

const ALERT_DEFAULTS: AlertSettings = {
  priceMovePct: 10,
  staleDays: 14,
  agedInventoryDays: 60,
  expiringDays: 14,
  marginDropPct: 5,
};

/** Per-brand / per-SKU threshold overrides (§13). */
export type AlertOverrides = {
  brands: Record<string, Partial<AlertSettings>>;
  skus: Record<string, Partial<AlertSettings>>;
};

const EMPTY_OVERRIDES: AlertOverrides = { brands: {}, skus: {} };

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseSettings(raw: unknown): Partial<AlertSettings> {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out: Partial<AlertSettings> = {};
  if (asNumber(src.priceMovePct, NaN) >= 0) out.priceMovePct = asNumber(src.priceMovePct, 0);
  if (asNumber(src.staleDays, NaN) >= 0) out.staleDays = asNumber(src.staleDays, 0);
  if (asNumber(src.agedInventoryDays, NaN) >= 0) out.agedInventoryDays = asNumber(src.agedInventoryDays, 0);
  if (asNumber(src.expiringDays, NaN) >= 0) out.expiringDays = asNumber(src.expiringDays, 0);
  if (asNumber(src.marginDropPct, NaN) >= 0) out.marginDropPct = asNumber(src.marginDropPct, 0);
  return out;
}

/** Parse the stored `alert_overrides` value defensively. */
export function parseAlertOverrides(value: unknown): AlertOverrides {
  if (!value || typeof value !== "object") return EMPTY_OVERRIDES;
  const src = value as Record<string, unknown>;
  const map = (bucket: unknown): Record<string, Partial<AlertSettings>> => {
    if (!bucket || typeof bucket !== "object") return {};
    const out: Record<string, Partial<AlertSettings>> = {};
    for (const [key, val] of Object.entries(bucket as Record<string, unknown>)) {
      const parsed = parseSettings(val);
      if (Object.keys(parsed).length) out[key] = parsed;
    }
    return out;
  };
  return { brands: map(src.brands), skus: map(src.skus) };
}

export async function getAlertOverrides(): Promise<AlertOverrides> {
  const row = await prisma.setting.findUnique({ where: { key: "alert_overrides" } });
  return parseAlertOverrides(row?.value ?? null);
}

/** Effective thresholds for a product: base overridden by brand, then SKU. */
export function resolveAlertSettings(
  base: AlertSettings,
  overrides: AlertOverrides,
  scope: { brand?: string | null; sku?: string | null },
): AlertSettings {
  const brand = scope.brand ? overrides.brands[scope.brand] : undefined;
  const sku = scope.sku ? overrides.skus[scope.sku] : undefined;
  return { ...base, ...brand, ...sku };
}

export async function getAlertSettings(): Promise<AlertSettings> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    priceMovePct: asNumber(map.get("alert_price_move_pct"), ALERT_DEFAULTS.priceMovePct),
    staleDays: asNumber(map.get("alert_stale_days"), ALERT_DEFAULTS.staleDays),
    agedInventoryDays: asNumber(map.get("alert_aged_inventory_days"), ALERT_DEFAULTS.agedInventoryDays),
    expiringDays: asNumber(map.get("alert_expiring_days"), ALERT_DEFAULTS.expiringDays),
    marginDropPct: asNumber(map.get("alert_margin_drop_pct"), ALERT_DEFAULTS.marginDropPct),
  };
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { high: 0, warn: 1, info: 2 };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function computeAlerts(now = new Date()): Promise<Alert[]> {
  const [settings, overrides, trading, rates] = await Promise.all([
    getAlertSettings(),
    getAlertOverrides(),
    getTradingSettings(),
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

  const alerts: Alert[] = [];
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  // --- Load shared data ---
  // Only *live* approved demands take part in matching. Expired demands must
  // not trigger coverage/supply alerts (§20); they are handled separately by
  // the DEMAND_EXPIRING alert below.
  const openDemands = await prisma.demand.findMany({
    where: {
      approved: true,
      status: { in: ["WISHLIST", "REQUEST", "QUOTE", "CONFIRMED"] },
      productId: { not: null },
      OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
    },
    include: { customer: { select: { name: true } }, product: { select: { internalSku: true, brand: true } } },
  });

  const activeOffers = await prisma.offer.findMany({
    where: { status: "ACTIVE", price: { not: null } },
    include: { supplier: { select: { name: true } }, product: { select: { internalSku: true, brand: true } } },
  });

  // 1. Active offer that satisfies an approved demand at target price/margin.
  for (const d of openDemands) {
    const target = d.targetPrice ? Number(d.targetPrice) : null;
    if (target === null || !d.productId) continue;
    const candidates = activeOffers.filter((o) => o.productId === d.productId);
    let best: { offer: (typeof activeOffers)[number]; landed: number } | null = null;
    for (const o of candidates) {
      const on = o.listDate ?? o.createdAt;
      const landed = unitUsd(Number(o.price), o.priceBasis, o.unitsPerCase, o.currency, on);
      if (landed === null) continue;
      if (!best || landed < best.landed) best = { offer: o, landed };
    }
    if (!best) continue;
    const marginPct = ((target - best.landed) / target) * 100;
    if (marginPct >= trading.minContributionMarginPct) {
      alerts.push({
        id: `offer-demand:${d.id}:${best.offer.id}`,
        type: "OFFER_MATCHES_DEMAND",
        severity: marginPct >= trading.minContributionMarginPct * 2 ? "high" : "warn",
        title: `${d.customer.name} demand can be covered by ${best.offer.supplier.name}`,
        detail: `Target ${usd(target)} vs best ask ${usd(best.landed)}/unit gives about ${qty(Math.round(marginPct * 10) / 10)}% before inbound costs.`,
        evidence: [
          `Demand status ${d.status}${d.certainty === "INFERRED" ? " (inferred)" : ""}, qty ${d.quantity ? qty(Number(d.quantity)) : "?"}`,
          `Offer SKU ${best.offer.product?.internalSku ?? best.offer.originalCode} from ${best.offer.supplier.name}`,
          `Ask ${best.offer.price ? usd(Number(best.offer.price)) : "—"} ${best.offer.currency ?? "USD"} (${best.offer.priceBasis ?? "UNIT"})`,
        ],
        suggestedAction: "Open the deal calculator preloaded with this offer and confirm inbound costs.",
        href: `/deals/new?offer=${best.offer.id}`,
      });
    }
  }

  // 2. Price movement per product (30d median ask vs the prior 30-90d).
  const recentFrom = daysAgo(30);
  const priorFrom = daysAgo(90);
  const byProduct = new Map<string, { recent: number[]; prior: number[] }>();
  for (const o of activeOffers) {
    if (!o.productId) continue;
    const on = o.listDate ?? o.createdAt;
    if (on < priorFrom) continue;
    const value = unitUsd(Number(o.price), o.priceBasis, o.unitsPerCase, o.currency, on);
    if (value === null) continue;
    const bucket = byProduct.get(o.productId) ?? { recent: [], prior: [] };
    if (on >= recentFrom) bucket.recent.push(value);
    else bucket.prior.push(value);
    byProduct.set(o.productId, bucket);
  }
  for (const d of openDemands) {
    if (!d.productId) continue;
    const bucket = byProduct.get(d.productId);
    if (!bucket || bucket.recent.length === 0 || bucket.prior.length === 0) continue;
    const recent = median(bucket.recent);
    const prior = median(bucket.prior);
    if (prior === 0) continue;
    const changePct = ((recent - prior) / prior) * 100;
    const eff = resolveAlertSettings(settings, overrides, {
      brand: d.product?.brand,
      sku: d.product?.internalSku,
    });
    if (Math.abs(changePct) >= eff.priceMovePct) {
      const up = changePct > 0;
      alerts.push({
        id: `price:${d.productId}`,
        type: "PRICE_MOVE",
        severity: "warn",
        title: `${d.product?.internalSku ?? d.productId} ask ${up ? "up" : "down"} ${qty(Math.round(Math.abs(changePct) * 10) / 10)}% in 30 days`,
        detail: `Median ask moved from ${usd(prior)} to ${usd(recent)} against an open demand from ${d.customer.name}.`,
        evidence: [
          `Prior 30-90d median ${usd(prior)} (${bucket.prior.length} obs.)`,
          `Last 30d median ${usd(recent)} (${bucket.recent.length} obs.)`,
          `Threshold ${eff.priceMovePct}%${
            eff.priceMovePct !== settings.priceMovePct ? " (brand/SKU override)" : ""
          }`,
        ],
        suggestedAction: up
          ? "Re-check demand target and consider locking stock before it rises further."
          : "Buy on the dip to cover the open demand if quality is confirmed.",
        href: `/trends/${d.productId}`,
      });
    }
  }

  // 3. Demand outpacing confirmed supply.
  const openByProduct = new Map<string, number>();
  for (const d of openDemands) {
    if (!d.productId) continue;
    openByProduct.set(d.productId, (openByProduct.get(d.productId) ?? 0) + (d.quantity ? Number(d.quantity) : 0));
  }
  // Deduplicated confirmed supply: several brokers offering one owner's lot
  // count once, not once each (§11.1).
  const supplyByProduct = await getConfirmedSupplyByProduct(now);
  for (const [productId, demandQty] of openByProduct) {
    if (demandQty <= 0) continue;
    const supply = supplyByProduct.get(productId) ?? 0;
    if (supply < demandQty) {
      const d = openDemands.find((x) => x.productId === productId);
      alerts.push({
        id: `supply:${productId}`,
        type: "DEMAND_VS_SUPPLY",
        severity: supply === 0 ? "high" : "warn",
        title: `Open demand exceeds confirmed supply${d?.product ? ` for ${d.product.internalSku}` : ""}`,
        detail: `Approved demand ${qty(demandQty)} vs confirmed available ${qty(supply)} units.`,
        evidence: [
          `Approved open demand ${qty(demandQty)} units`,
          `Confirmed available (deduplicated stock pools) ${qty(supply)} units`,
        ],
        suggestedAction: supply === 0
          ? "Source new confirmed stock; there is no active confirmed supply."
          : "Source additional confirmed stock to cover the gap.",
        href: `/trends/${productId}`,
      });
    }
  }

  // 4. Stale supplier stock confirmations.
  for (const o of activeOffers) {
    const confirmed = o.lastStockConfirmation ?? o.listDate;
    const eff = resolveAlertSettings(settings, overrides, {
      brand: o.product?.brand,
      sku: o.product?.internalSku,
    });
    const staleBefore = daysAgo(eff.staleDays);
    if (!confirmed || confirmed >= staleBefore) continue;
    const days = Math.round((now.getTime() - confirmed.getTime()) / 86_400_000);
    alerts.push({
      id: `stale:${o.id}`,
      type: "STALE_OFFER",
      severity: days >= eff.staleDays * 2 ? "warn" : "info",
      title: `Stock not reconfirmed for ${days} days (${o.supplier.name})`,
      detail: `${o.product?.internalSku ?? o.originalCode} still shows as available without a recent confirmation.`,
      evidence: [
        `Last confirmation ${confirmed.toISOString().slice(0, 10)}`,
        `Stale threshold ${eff.staleDays} days${
          eff.staleDays !== settings.staleDays ? " (brand/SKU override)" : ""
        }`,
        `Supplier ${o.supplier.name}`,
      ],
      suggestedAction: "Ask the supplier to reconfirm quantity and validity, then update the offer.",
      href: `/offers/${o.id}`,
    });
  }

  // 5. Won deals closed below the target contribution margin.
  const wonDeals = await prisma.deal.findMany({
    where: { status: "WON", contributionMarginPct: { not: null }, createdAt: { gte: daysAgo(90) } },
    select: {
      id: true,
      quantity: true,
      contributionMarginPct: true,
      createdAt: true,
      product: { select: { internalSku: true, brand: true } },
    },
  });
  for (const deal of wonDeals) {
    const margin = Number(deal.contributionMarginPct);
    const eff = resolveAlertSettings(settings, overrides, {
      brand: deal.product?.brand,
      sku: deal.product?.internalSku,
    });
    // Only alert when the shortfall is material (the configured point gap).
    if (trading.minContributionMarginPct - margin < eff.marginDropPct) continue;
    alerts.push({
      id: `margin:${deal.id}`,
      type: "MARGIN_DROP",
      severity: "warn",
      title: `Won deal closed at ${qty(Math.round(margin * 100) / 100)}% margin`,
      detail: `Below the ${trading.minContributionMarginPct}% target by ${qty(Math.round((trading.minContributionMarginPct - margin) * 100) / 100)} points.`,
      evidence: [
        `Deal ${deal.id.slice(0, 8)} on ${deal.createdAt.toISOString().slice(0, 10)}`,
        `Quantity ${qty(Number(deal.quantity))}`,
        `Target margin ${trading.minContributionMarginPct}%`,
        `Drop threshold ${eff.marginDropPct} point(s)${
          eff.marginDropPct !== settings.marginDropPct ? " (brand/SKU override)" : ""
        }`,
      ],
      suggestedAction: "Review pricing assumptions and cost capture on this deal.",
      href: `/deals/${deal.id}`,
    });
  }

  // 6. Aged inventory still sitting usable.
  const items = await prisma.inventoryItem.findMany({
    where: { status: "USABLE", quantity: { gt: 0 } },
    include: { product: { select: { internalSku: true, brand: true } } },
  });
  for (const item of items) {
    const eff = resolveAlertSettings(settings, overrides, {
      brand: item.product?.brand,
      sku: item.product?.internalSku,
    });
    const agedBefore = daysAgo(eff.agedInventoryDays);
    const acquired = item.acquiredDate ?? item.createdAt;
    if (acquired >= agedBefore) continue;
    const days = Math.round((now.getTime() - acquired.getTime()) / 86_400_000);
    alerts.push({
      id: `aged:${item.id}`,
      type: "AGED_INVENTORY",
      severity: days >= eff.agedInventoryDays * 2 ? "warn" : "info",
      title: `${item.product.internalSku} stock held ${days} days`,
      detail: `${qty(Number(item.quantity))} units still usable${item.warehouse ? ` in ${item.warehouse}` : ""}.`,
      evidence: [
        `Acquired ${acquired.toISOString().slice(0, 10)}`,
        `Aged threshold ${eff.agedInventoryDays} days${
          eff.agedInventoryDays !== settings.agedInventoryDays ? " (brand/SKU override)" : ""
        }`,
      ],
      suggestedAction: "Move aged stock onto a demand or discount it, and check for expiry.",
      href: `/inventory`,
    });
  }

  // 7. Approved demand nearing expiry.
  // Query with the widest window across base + overrides, then filter per SKU.
  const maxExpiringWindowDays = Math.max(
    settings.expiringDays,
    ...Object.values(overrides.brands).map((o) => o.expiringDays ?? 0),
    ...Object.values(overrides.skus).map((o) => o.expiringDays ?? 0),
  );
  const expiring = await prisma.demand.findMany({
    where: {
      approved: true,
      status: { in: ["WISHLIST", "REQUEST", "QUOTE", "CONFIRMED"] },
      expiryDate: { not: null, lte: new Date(now.getTime() + maxExpiringWindowDays * 86_400_000) },
    },
    include: { customer: { select: { name: true } }, product: { select: { internalSku: true, brand: true } } },
  });
  for (const d of expiring) {
    if (!d.expiryDate) continue;
    const eff = resolveAlertSettings(settings, overrides, {
      brand: d.product?.brand,
      sku: d.product?.internalSku,
    });
    const days = Math.ceil((d.expiryDate.getTime() - now.getTime()) / 86_400_000);
    if (days > eff.expiringDays) continue;
    alerts.push({
      id: `expiring:${d.id}`,
      type: "DEMAND_EXPIRING",
      severity: days <= 0 ? "high" : "warn",
      title: `${d.customer.name} demand ${days <= 0 ? "expired" : `expires in ${days} day(s)`}`,
      detail: `Approved demand${d.quantity ? ` for ${qty(Number(d.quantity))} units` : ""} needs attention before the wishlist expires.`,
      evidence: [
        `Expiry ${d.expiryDate.toISOString().slice(0, 10)}`,
        `Status ${d.status}`,
        `Window ${eff.expiringDays} day(s)${
          eff.expiringDays !== settings.expiringDays ? " (brand/SKU override)" : ""
        }`,
      ],
      suggestedAction: days <= 0 ? "Confirm whether the demand is still live or close it." : "Reconfirm the demand before it expires.",
      href: `/demands`,
    });
  }

  // 8. Exposure over a configured cap (speculative buying control).
  const exposure = await getExposure(now);
  for (const row of exposure.rows) {
    if (!row.overCap) continue;
    const over = Math.round((row.committedUsd - row.capUsd) * 100) / 100;
    const speculativeNote =
      row.speculativeUsd > 0
        ? ` ${usd(row.speculativeUsd)} of this is speculative (no approved demand backing).`
        : "";
    alerts.push({
      id: `exposure:${row.dimension}:${row.key}`,
      type: "EXPOSURE_CAP",
      severity: row.speculativeUsd > 0 ? "high" : "warn",
      title: `${row.dimension} ${row.key} exposure ${usd(row.committedUsd)} over cap ${usd(row.capUsd)}`,
      detail: `Open deals commit ${usd(row.committedUsd)} against a ${row.dimension} cap of ${usd(row.capUsd)} (${usd(over)} over).${speculativeNote}`,
      evidence: [
        `${row.openDealCount} open deal(s) counted`,
        `Committed ${usd(row.committedUsd)} · speculative ${usd(row.speculativeUsd)}`,
        `Cap ${usd(row.capUsd)} (${row.dimension})`,
      ],
      suggestedAction:
        row.speculativeUsd > 0
          ? "Stop or reduce speculative buying and resolve ahead of the cap."
          : "Reduce exposure or raise the cap with manager approval.",
      href: `/exposure`,
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
