// Per-SKU market price and supply trends (§12).
//
// Every series is kept separate and only real observations are plotted: days
// without data are left as gaps rather than being interpolated. Supplier asks
// come from dated offers, our own trades from won deals, customer targets from
// demand, and public retail from manually recorded market prices.

import { prisma } from "./prisma";

export type TrendPoint = { date: string; value: number };
export type AskBucket = {
  date: string;
  min: number;
  median: number;
  max: number;
  count: number;
  owners: number;
};

export type SkuTrend = {
  product: {
    id: string;
    internalSku: string;
    brand: string | null;
    fragranceName: string | null;
    sizeMl: number | null;
  };
  windowDays: number;
  from: string;
  to: string;
  ask: AskBucket[];
  retail: TrendPoint[];
  targets: TrendPoint[];
  purchases: TrendPoint[];
  sales: TrendPoint[];
  stats: {
    observationDays: number;
    independentOwners: number;
    activeOffers: number;
    latestMedianAsk: number | null;
    medianAskWindow: number | null;
    changePct: number | null;
    inboundUnits: number;
    onHandUnits: number;
    approvedDemandQty: number;
  };
};

export const TREND_WINDOWS = [7, 30, 90, 180] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];

export const TREND_SERIES = ["ask", "retail", "targets", "purchases", "sales"] as const;
export type TrendSeries = (typeof TREND_SERIES)[number];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(m * 10000) / 10000;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function buildSkuTrend(
  productId: string,
  windowDays: TrendWindow = 30,
  now = new Date(),
): Promise<SkuTrend | null> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return null;

  const from = new Date(now);
  from.setDate(from.getDate() - windowDays);
  const to = dayKey(now);

  const [offers, rates, marketPrices, demands, deals, inventory] = await Promise.all([
    prisma.offer.findMany({
      where: {
        productId,
        price: { not: null },
        OR: [{ listDate: { gte: from } }, { listDate: null, createdAt: { gte: from } }],
      },
      select: {
        listDate: true,
        createdAt: true,
        price: true,
        priceBasis: true,
        unitsPerCase: true,
        currency: true,
        supplierId: true,
        stockOwnerId: true,
        status: true,
      },
    }),
    prisma.fxRate.findMany({ select: { baseCurrency: true, rate: true, rateDate: true } }),
    prisma.marketPrice.findMany({
      where: { productId, observedDate: { gte: from } },
      orderBy: { observedDate: "asc" },
    }),
    prisma.demand.findMany({
      where: { productId, targetPrice: { not: null }, createdAt: { gte: from } },
      select: { targetPrice: true, currency: true, createdAt: true },
    }),
    prisma.deal.findMany({
      where: { productId, status: "WON", createdAt: { gte: from } },
      select: {
        buyPrice: true,
        buyPriceBasis: true,
        unitsPerCase: true,
        fxRate: true,
        sellingPriceUsd: true,
        createdAt: true,
      },
    }),
    prisma.inventoryItem.findMany({
      where: { productId },
      select: { quantity: true, status: true, reservations: { where: { status: "ACTIVE" }, select: { quantity: true } } },
    }),
  ]);

  const rateList = rates.map((r) => ({ base: r.baseCurrency, rate: Number(r.rate), date: r.rateDate }));
  function usdRate(currency: string | null, on: Date): number | null {
    const code = (currency ?? "USD").toUpperCase();
    if (code === "USD") return 1;
    const candidates = rateList
      .filter((r) => r.base === code)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    if (candidates.length === 0) return null;
    let chosen: (typeof candidates)[number] | null = null;
    for (const r of candidates) {
      if (r.date.getTime() <= on.getTime()) chosen = r;
    }
    return (chosen ?? candidates[0]).rate;
  }

  function unitUsd(price: number, basis: string | null, unitsPerCase: number | null, currency: string | null, on: Date): number | null {
    const rate = usdRate(currency, on);
    if (rate === null) return null;
    const perUnit = basis === "CASE" ? (unitsPerCase && unitsPerCase > 0 ? price / unitsPerCase : null) : price;
    if (perUnit === null) return null;
    return Math.round(perUnit * rate * 10000) / 10000;
  }

  // --- Supplier ask buckets by day ---
  const byDay = new Map<string, { values: number[]; owners: Set<string> }>();
  let activeOffers = 0;
  const allOwners = new Set<string>();
  for (const o of offers) {
    if (o.status === "ACTIVE") activeOffers++;
    const on = o.listDate ?? o.createdAt;
    const usd = unitUsd(Number(o.price), o.priceBasis, o.unitsPerCase, o.currency, on);
    if (usd === null) continue;
    const key = dayKey(on);
    const bucket = byDay.get(key) ?? { values: [], owners: new Set<string>() };
    bucket.values.push(usd);
    const owner = o.stockOwnerId ?? o.supplierId;
    bucket.owners.add(owner);
    allOwners.add(owner);
    byDay.set(key, bucket);
  }
  const ask: AskBucket[] = [...byDay.entries()]
    .map(([date, b]) => ({
      date,
      min: Math.min(...b.values),
      median: median(b.values),
      max: Math.max(...b.values),
      count: b.values.length,
      owners: b.owners.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const retail: TrendPoint[] = marketPrices
    .map((m) => {
      const usd = unitUsd(Number(m.price), "UNIT", null, m.currency, m.observedDate);
      return usd === null ? null : { date: dayKey(m.observedDate), value: usd };
    })
    .filter((p): p is TrendPoint => p !== null);

  const targets: TrendPoint[] = demands
    .map((d) => {
      const usd = unitUsd(Number(d.targetPrice), "UNIT", null, d.currency, d.createdAt);
      return usd === null ? null : { date: dayKey(d.createdAt), value: usd };
    })
    .filter((p): p is TrendPoint => p !== null);

  const purchases: TrendPoint[] = deals
    .map((d) => {
      const perUnit = d.buyPriceBasis === "CASE" ? (d.unitsPerCase ? Number(d.buyPrice) / d.unitsPerCase : null) : Number(d.buyPrice);
      if (perUnit === null) return null;
      const rate = Number(d.fxRate ?? 1) || 1;
      return { date: dayKey(d.createdAt), value: Math.round(perUnit * rate * 10000) / 10000 };
    })
    .filter((p): p is TrendPoint => p !== null);

  const sales: TrendPoint[] = deals
    .filter((d) => d.sellingPriceUsd !== null)
    .map((d) => ({ date: dayKey(d.createdAt), value: Number(d.sellingPriceUsd) }));

  // --- Supply snapshot ---
  let inboundUnits = 0;
  let onHandUnits = 0;
  for (const item of inventory) {
    if (item.status === "IN_TRANSIT") inboundUnits += Number(item.quantity);
    if (item.status === "USABLE") {
      const reserved = item.reservations.reduce((s, r) => s + Number(r.quantity), 0);
      onHandUnits += Number(item.quantity) - reserved;
    }
  }

  const approvedDemand = await prisma.demand.aggregate({
    where: { productId, approved: true, status: { in: ["WISHLIST", "REQUEST", "QUOTE", "CONFIRMED"] } },
    _sum: { quantity: true },
  });

  const medians = ask.map((a) => a.median);
  const latestMedianAsk = medians.length ? medians[medians.length - 1] : null;
  const medianAskWindow = medians.length ? median(medians) : null;
  const changePct =
    medians.length >= 2 && medians[0] !== 0
      ? Math.round(((medians[medians.length - 1] - medians[0]) / medians[0]) * 10000) / 100
      : null;

  return {
    product: {
      id: product.id,
      internalSku: product.internalSku,
      brand: product.brand,
      fragranceName: product.fragranceName,
      sizeMl: product.sizeMl,
    },
    windowDays,
    from: dayKey(from),
    to,
    ask,
    retail,
    targets,
    purchases,
    sales,
    stats: {
      observationDays: ask.length,
      independentOwners: allOwners.size,
      activeOffers,
      latestMedianAsk,
      medianAskWindow,
      changePct,
      inboundUnits,
      onHandUnits,
      approvedDemandQty: Number(approvedDemand._sum.quantity ?? 0),
    },
  };
}
