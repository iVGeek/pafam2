// Own-stock visibility and reservations (§11.1).
// Available to sell = usable on hand - active reservations. In-transit,
// quarantined and damaged units are shown separately and never counted as
// available until they become usable stock.

import { prisma } from "./prisma";

export const INVENTORY_STATUSES = ["USABLE", "IN_TRANSIT", "QUARANTINED", "DAMAGED"] as const;
export type InventoryStatusName = (typeof INVENTORY_STATUSES)[number];

export type InventoryItemInput = {
  productId?: string;
  status?: string;
  warehouse?: string | null;
  territory?: string | null;
  lotRef?: string | null;
  batchRef?: string | null;
  quantity?: number | string | null;
  unitCostUsd?: number | string | null;
  acquiredDate?: string | null;
  dealId?: string | null;
  notes?: string | null;
};

export type ReservationInput = {
  inventoryItemId?: string;
  quantity?: number | string | null;
  demandId?: string | null;
  dealId?: string | null;
  customerId?: string | null;
  note?: string | null;
  createdBy?: string | null;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function emptyToNull(value: unknown): string | null {
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s === "" ? null : s;
}

function normaliseStatus(value: string | undefined): InventoryStatusName {
  const s = (value ?? "USABLE").toUpperCase();
  return (INVENTORY_STATUSES as readonly string[]).includes(s) ? (s as InventoryStatusName) : "USABLE";
}

async function reservedByItemIds(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const rows = await prisma.inventoryReservation.groupBy({
    by: ["inventoryItemId"],
    where: { inventoryItemId: { in: ids }, status: "ACTIVE" },
    _sum: { quantity: true },
  });
  for (const row of rows) map.set(row.inventoryItemId, Number(row._sum.quantity ?? 0));
  return map;
}

/** Age buckets (§18): how long usable stock has been held. */
export const AGE_BUCKETS = ["0-30", "31-90", "91-180", "181-365", "365+"] as const;
export type AgeBucketName = (typeof AGE_BUCKETS)[number];

export function ageBucketFor(days: number): AgeBucketName {
  if (days <= 30) return "0-30";
  if (days <= 90) return "31-90";
  if (days <= 180) return "91-180";
  if (days <= 365) return "181-365";
  return "365+";
}

export type InventoryRow = {
  id: string;
  productId: string;
  internalSku: string;
  description: string;
  status: InventoryStatusName;
  warehouse: string | null;
  territory: string | null;
  lotRef: string | null;
  quantity: number;
  reserved: number;
  available: number;
  unitCostUsd: number | null;
  valueUsd: number | null;
  acquiredDate: string | null;
  daysHeld: number;
  ageBucket: AgeBucketName;
};

export async function listInventory(now = new Date()): Promise<InventoryRow[]> {
  const items = await prisma.inventoryItem.findMany({
    orderBy: [{ productId: "asc" }, { warehouse: "asc" }, { createdAt: "desc" }],
    include: {
      product: { select: { internalSku: true, brand: true, fragranceName: true, sizeMl: true } },
    },
  });
  const reserved = await reservedByItemIds(items.map((i) => i.id));
  return items.map((i) => {
    const quantity = Number(i.quantity);
    const res = reserved.get(i.id) ?? 0;
    const unitCostUsd = i.unitCostUsd === null ? null : Number(i.unitCostUsd);
    const acquired = i.acquiredDate ?? i.createdAt;
    const daysHeld = Math.max(0, Math.floor((now.getTime() - acquired.getTime()) / 86_400_000));
    return {
      id: i.id,
      productId: i.productId,
      internalSku: i.product.internalSku,
      description: [i.product.brand, i.product.fragranceName, i.product.sizeMl ? `${i.product.sizeMl}ml` : null]
        .filter(Boolean)
        .join(" "),
      status: i.status as InventoryStatusName,
      warehouse: i.warehouse,
      territory: i.territory,
      lotRef: i.lotRef,
      quantity,
      reserved: res,
      available: i.status === "USABLE" ? quantity - res : 0,
      unitCostUsd,
      valueUsd: unitCostUsd === null ? null : Math.round(quantity * unitCostUsd * 100) / 100,
      acquiredDate: isoDate(i.acquiredDate),
      daysHeld,
      ageBucket: ageBucketFor(daysHeld),
    };
  });
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export type AgingBucket = {
  bucket: AgeBucketName;
  units: number;
  valueUsd: number;
};

/** Usable-stock aging profile: units and carrying value per age bucket (§18). */
export function summariseAging(rows: InventoryRow[]): AgingBucket[] {
  const map = new Map<AgeBucketName, AgingBucket>();
  for (const name of AGE_BUCKETS) map.set(name, { bucket: name, units: 0, valueUsd: 0 });
  for (const r of rows) {
    if (r.status !== "USABLE") continue;
    const entry = map.get(r.ageBucket)!;
    entry.units += r.quantity;
    if (r.valueUsd !== null) entry.valueUsd += r.valueUsd;
  }
  return AGE_BUCKETS.map((name) => map.get(name)!);
}

export type SkuCover = {
  productId: string;
  internalSku: string;
  available: number;
  soldUnits: number;
  windowDays: number;
  /** null when there were no sales in the window (cover cannot be estimated). */
  daysOfCover: number | null;
};

/**
 * Days of cover per SKU: usable available units ÷ average daily sales velocity,
 * where velocity comes from won deals in the window (§18). A SKU with no sales
 * in the window reports null cover rather than a false infinite number.
 */
export async function getCoverBySku(windowDays = 90, now = new Date()): Promise<SkuCover[]> {
  const [rows, sold] = await Promise.all([
    listInventory(now),
    prisma.deal.groupBy({
      by: ["productId"],
      where: {
        status: "WON",
        productId: { not: null },
        createdAt: { gte: new Date(now.getTime() - windowDays * 86_400_000) },
      },
      _sum: { quantity: true },
    }),
  ]);

  const soldByProduct = new Map<string, number>();
  for (const row of sold) {
    if (row.productId) soldByProduct.set(row.productId, Number(row._sum.quantity ?? 0));
  }

  const availableByProduct = new Map<string, { sku: string; available: number }>();
  for (const r of rows) {
    const entry = availableByProduct.get(r.productId) ?? { sku: r.internalSku, available: 0 };
    entry.available += r.available;
    availableByProduct.set(r.productId, entry);
  }

  return [...availableByProduct.entries()]
    .map(([productId, { sku, available }]) => {
      const soldUnits = soldByProduct.get(productId) ?? 0;
      const dailyVelocity = soldUnits / windowDays;
      return {
        productId,
        internalSku: sku,
        available,
        soldUnits,
        windowDays,
        daysOfCover: dailyVelocity > 0 ? Math.round((available / dailyVelocity) * 10) / 10 : null,
      };
    })
    .sort((a, b) => {
      const ac = a.daysOfCover ?? Infinity;
      const bc = b.daysOfCover ?? Infinity;
      return ac - bc;
    });
}

export type InventorySummary = {
  skuCount: number;
  usableOnHand: number;
  reserved: number;
  availableToSell: number;
  quarantined: number;
  inTransit: number;
  damaged: number;
  stockValueUsd: number;
};

export async function getInventorySummary(): Promise<InventorySummary> {
  const rows = await listInventory();
  const summary: InventorySummary = {
    skuCount: new Set(rows.map((r) => r.productId)).size,
    usableOnHand: 0,
    reserved: 0,
    availableToSell: 0,
    quarantined: 0,
    inTransit: 0,
    damaged: 0,
    stockValueUsd: 0,
  };
  for (const r of rows) {
    if (r.status === "USABLE") {
      summary.usableOnHand += r.quantity;
      summary.reserved += r.reserved;
      summary.availableToSell += r.available;
      if (r.unitCostUsd !== null) summary.stockValueUsd += r.quantity * r.unitCostUsd;
    } else if (r.status === "QUARANTINED") summary.quarantined += r.quantity;
    else if (r.status === "IN_TRANSIT") summary.inTransit += r.quantity;
    else if (r.status === "DAMAGED") summary.damaged += r.quantity;
  }
  return summary;
}

export type LotProfit = {
  lotRef: string;
  productId: string;
  internalSku: string;
  units: number;
  unitCostUsd: number | null;
  heldValueUsd: number | null;
  referenceSellUsd: number | null;
  referenceSource: "demand-target" | "public-retail" | null;
  /** Unrealised: (reference sell − unit cost) × held units. */
  potentialProfitUsd: number | null;
  potentialMarginPct: number | null;
};

export type InventoryAnalytics = {
  windowDays: number;
  cogsUsd: number;
  currentStockValueUsd: number;
  /** Period stock turn = COGS in window ÷ current usable stock value. */
  stockTurn: number | null;
  markdown: {
    thresholdDays: number;
    units: number;
    valueUsd: number;
    pctOfStockValue: number | null;
  };
  lots: LotProfit[];
  asOf: string;
};

/**
 * Stock turn, markdown exposure and profit by lot (§18). Turn uses the last
 * `windowDays` of won-deal COGS against the *current* usable stock value — a
 * snapshot denominator, stated openly, because true period-average inventory
 * needs a full ledger. Profit by lot is unrealised: it uses the best live
 * customer target, else the latest public retail observation, as the sell basis.
 */
export async function getInventoryAnalytics(
  now = new Date(),
  windowDays = 90,
  markdownThresholdDays = 180,
): Promise<InventoryAnalytics> {
  const windowFrom = new Date(now.getTime() - windowDays * 86_400_000);
  const [rows, wonDeals, demands, retail] = await Promise.all([
    listInventory(now),
    prisma.deal.findMany({
      where: { status: "WON", createdAt: { gte: windowFrom } },
      select: { quantity: true, landedUnitCost: true },
    }),
    prisma.demand.findMany({
      where: {
        approved: true,
        status: { in: ["WISHLIST", "REQUEST", "QUOTE", "CONFIRMED"] },
        productId: { not: null },
        targetPrice: { not: null },
        OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
      },
      select: { productId: true, targetPrice: true },
    }),
    prisma.marketPrice.findMany({
      where: { kind: "PUBLIC_RETAIL" },
      select: { productId: true, price: true, observedDate: true },
      orderBy: { observedDate: "desc" },
    }),
  ]);

  // Best (highest) live customer target per product.
  const demandTarget = new Map<string, number>();
  for (const d of demands) {
    if (!d.productId || d.targetPrice === null) continue;
    const value = Number(d.targetPrice);
    demandTarget.set(d.productId, Math.max(demandTarget.get(d.productId) ?? 0, value));
  }
  // Latest public retail per product (list is already newest-first).
  const publicRetail = new Map<string, number>();
  for (const m of retail) {
    if (!publicRetail.has(m.productId)) publicRetail.set(m.productId, Number(m.price));
  }

  const usable = rows.filter((r) => r.status === "USABLE");
  const currentStockValueUsd = usable.reduce((s, r) => s + (r.valueUsd ?? 0), 0);
  const cogsUsd = wonDeals.reduce(
    (s, d) => s + (d.landedUnitCost === null ? 0 : Number(d.landedUnitCost) * Number(d.quantity)),
    0,
  );
  const stockTurn = currentStockValueUsd > 0 ? round2(cogsUsd / currentStockValueUsd) : null;

  let markdownUnits = 0;
  let markdownValue = 0;
  for (const r of usable) {
    if (r.daysHeld <= markdownThresholdDays) continue;
    markdownUnits += r.quantity;
    markdownValue += r.valueUsd ?? 0;
  }

  const lotMap = new Map<string, LotProfit>();
  for (const r of usable) {
    const key = `${r.productId}::${r.lotRef ?? "(no lot)"}`;
    const entry = lotMap.get(key) ?? {
      lotRef: r.lotRef ?? "(no lot)",
      productId: r.productId,
      internalSku: r.internalSku,
      units: 0,
      unitCostUsd: r.unitCostUsd,
      heldValueUsd: 0,
      referenceSellUsd: null,
      referenceSource: null,
      potentialProfitUsd: null,
      potentialMarginPct: null,
    };
    entry.units += r.quantity;
    entry.heldValueUsd = (entry.heldValueUsd ?? 0) + (r.valueUsd ?? 0);
    if (entry.unitCostUsd === null && r.unitCostUsd !== null) entry.unitCostUsd = r.unitCostUsd;
    lotMap.set(key, entry);
  }

  for (const entry of lotMap.values()) {
    const target = demandTarget.get(entry.productId);
    const retailPrice = publicRetail.get(entry.productId);
    if (target !== undefined) {
      entry.referenceSellUsd = target;
      entry.referenceSource = "demand-target";
    } else if (retailPrice !== undefined) {
      entry.referenceSellUsd = retailPrice;
      entry.referenceSource = "public-retail";
    }
    if (entry.referenceSellUsd !== null && entry.unitCostUsd !== null && entry.referenceSellUsd > 0) {
      const perUnit = entry.referenceSellUsd - entry.unitCostUsd;
      entry.potentialProfitUsd = round2(perUnit * entry.units);
      entry.potentialMarginPct = round2((perUnit / entry.referenceSellUsd) * 100);
    }
  }

  const lots = [...lotMap.values()].sort(
    (a, b) => (b.potentialProfitUsd ?? -Infinity) - (a.potentialProfitUsd ?? -Infinity),
  );

  return {
    windowDays,
    cogsUsd: round2(cogsUsd),
    currentStockValueUsd: round2(currentStockValueUsd),
    stockTurn,
    markdown: {
      thresholdDays: markdownThresholdDays,
      units: markdownUnits,
      valueUsd: round2(markdownValue),
      pctOfStockValue: currentStockValueUsd > 0 ? round2((markdownValue / currentStockValueUsd) * 100) : null,
    },
    lots,
    asOf: now.toISOString().slice(0, 10),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Usable, unreserved units for a product (optionally in a warehouse). */
export async function availableToSell(
  productId: string,
  warehouse?: string | null,
): Promise<number> {
  const items = await prisma.inventoryItem.findMany({
    where: {
      productId,
      status: "USABLE",
      ...(warehouse ? { warehouse } : {}),
    },
    select: { id: true, quantity: true },
  });
  const reserved = await reservedByItemIds(items.map((i) => i.id));
  return items.reduce((sum, i) => sum + Number(i.quantity) - (reserved.get(i.id) ?? 0), 0);
}

export async function createInventoryItem(input: InventoryItemInput, actor = "web") {
  if (!input.productId) throw new Error("productId is required.");
  const quantity = toNumber(input.quantity);
  if (quantity === null || quantity <= 0) throw new Error("quantity must be greater than zero.");
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new Error("Product not found.");

  const item = await prisma.inventoryItem.create({
    data: {
      productId: input.productId,
      status: normaliseStatus(input.status),
      warehouse: emptyToNull(input.warehouse),
      territory: emptyToNull(input.territory),
      lotRef: emptyToNull(input.lotRef),
      batchRef: emptyToNull(input.batchRef),
      quantity,
      unitCostUsd: toNumber(input.unitCostUsd),
      acquiredDate: toDate(input.acquiredDate),
      dealId: emptyToNull(input.dealId),
      notes: emptyToNull(input.notes),
    },
  });

  await prisma.auditLog.create({
    data: {
      actor,
      action: "inventory.created",
      entityType: "InventoryItem",
      entityId: item.id,
      after: { productId: item.productId, status: item.status, quantity: Number(item.quantity) },
    },
  });
  return item;
}

export async function updateInventoryItem(
  id: string,
  patch: InventoryItemInput & { adjustQuantity?: number | string | null },
  actor = "web",
) {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw new Error("Inventory item not found.");

  const adjust = toNumber(patch.adjustQuantity);
  const nextQuantity =
    adjust !== null ? Number(item.quantity) + adjust : toNumber(patch.quantity) ?? Number(item.quantity);
  if (nextQuantity < 0) throw new Error("Quantity cannot be negative.");

  const updated = await prisma.inventoryItem.update({
    where: { id },
    data: {
      status: patch.status ? normaliseStatus(patch.status) : undefined,
      warehouse: patch.warehouse === undefined ? undefined : emptyToNull(patch.warehouse),
      territory: patch.territory === undefined ? undefined : emptyToNull(patch.territory),
      lotRef: patch.lotRef === undefined ? undefined : emptyToNull(patch.lotRef),
      quantity: nextQuantity,
      unitCostUsd: patch.unitCostUsd === undefined ? undefined : toNumber(patch.unitCostUsd),
      notes: patch.notes === undefined ? undefined : emptyToNull(patch.notes),
    },
  });

  await prisma.auditLog.create({
    data: {
      actor,
      action: "inventory.updated",
      entityType: "InventoryItem",
      entityId: id,
      before: { quantity: Number(item.quantity), status: item.status },
      after: { quantity: nextQuantity, status: updated.status },
    },
  });
  return updated;
}

export async function createReservation(input: ReservationInput, actor = "web") {
  if (!input.inventoryItemId) throw new Error("inventoryItemId is required.");
  const quantity = toNumber(input.quantity);
  if (quantity === null || quantity <= 0) throw new Error("quantity must be greater than zero.");

  const item = await prisma.inventoryItem.findUnique({
    where: { id: input.inventoryItemId },
    include: { reservations: { where: { status: "ACTIVE" } } },
  });
  if (!item) throw new Error("Inventory item not found.");
  if (item.status !== "USABLE") throw new Error("Only usable stock can be reserved.");

  const alreadyReserved = item.reservations.reduce((sum, r) => sum + Number(r.quantity), 0);
  const available = Number(item.quantity) - alreadyReserved;
  if (quantity > available) {
    throw new Error(`Insufficient available stock: ${available} available, ${quantity} requested.`);
  }

  const reservation = await prisma.inventoryReservation.create({
    data: {
      inventoryItemId: input.inventoryItemId,
      quantity,
      demandId: emptyToNull(input.demandId),
      dealId: emptyToNull(input.dealId),
      customerId: emptyToNull(input.customerId),
      note: emptyToNull(input.note),
      createdBy: emptyToNull(input.createdBy) ?? actor,
    },
  });

  await prisma.auditLog.create({
    data: {
      actor,
      action: "reservation.created",
      entityType: "InventoryReservation",
      entityId: reservation.id,
      after: { inventoryItemId: input.inventoryItemId, quantity },
    },
  });
  return reservation;
}

/** Release a reservation back to available stock without changing on-hand. */
export async function releaseReservation(id: string, actor = "web") {
  const reservation = await prisma.inventoryReservation.findUnique({ where: { id } });
  if (!reservation) throw new Error("Reservation not found.");
  if (reservation.status !== "ACTIVE") throw new Error("Reservation is no longer active.");

  const updated = await prisma.inventoryReservation.update({
    where: { id },
    data: { status: "RELEASED", resolvedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      actor,
      action: "reservation.released",
      entityType: "InventoryReservation",
      entityId: id,
      after: { quantity: Number(reservation.quantity) },
    },
  });
  return updated;
}

/** Fulfil a reservation: consume on-hand stock and mark the hold fulfilled. */
export async function fulfilReservation(id: string, actor = "web") {
  const reservation = await prisma.inventoryReservation.findUnique({
    where: { id },
    include: { inventoryItem: true },
  });
  if (!reservation) throw new Error("Reservation not found.");
  if (reservation.status !== "ACTIVE") throw new Error("Reservation is no longer active.");

  const nextQuantity = Math.max(0, Number(reservation.inventoryItem.quantity) - Number(reservation.quantity));
  const [updated] = await prisma.$transaction([
    prisma.inventoryItem.update({
      where: { id: reservation.inventoryItemId },
      data: { quantity: nextQuantity },
    }),
    prisma.inventoryReservation.update({
      where: { id },
      data: { status: "FULFILLED", resolvedAt: new Date() },
    }),
  ]);
  await prisma.auditLog.create({
    data: {
      actor,
      action: "reservation.fulfilled",
      entityType: "InventoryReservation",
      entityId: id,
      after: { quantity: Number(reservation.quantity), onHandAfter: nextQuantity },
    },
  });
  return updated;
}
