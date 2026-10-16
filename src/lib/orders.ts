// Purchase-order helpers: creating orders with whole-box quantities, computing
// totals, and comparing a received supplier proforma invoice (PFI) against what
// we ordered (§2 requirement: order placement vs PFI variance).

import { prisma } from "./prisma";
import { resolveFxRate } from "./deals";
import type { PackagingLevel } from "@prisma/client";

const PACKAGING_LEVELS = new Set([
  "UNIT",
  "CASE",
  "TESTER",
  "GIFT_SET",
  "REFILL",
  "DAMAGED",
  "UNKNOWN",
]);

export const ORDER_STATUSES = [
  "DRAFT",
  "SENT",
  "CONFIRMED",
  "RECEIVED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderLineInput = {
  productId?: string | null;
  originalCode?: string | null;
  brand?: string | null;
  fragranceName?: string | null;
  concentration?: string | null;
  sizeMl?: number | string | null;
  packagingLevel?: string | null;
  unitsPerCase?: number | string | null;
  cases?: number | string | null;
  unitCost?: number | string | null;
  notes?: string | null;
};

export type CreateOrderInput = {
  supplierId: string;
  reference?: string | null;
  currency?: string | null;
  incoterm?: string | null;
  expectedDate?: string | Date | null;
  notes?: string | null;
  createdBy?: string | null;
  lines: OrderLineInput[];
};

function toInt(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function toNum(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function packaging(value: string | null | undefined): PackagingLevel {
  const v = (value ?? "UNIT").toUpperCase();
  return (PACKAGING_LEVELS.has(v) ? v : "UNKNOWN") as PackagingLevel;
}

export function lineUnits(unitsPerCase: number, cases: number): number {
  const upc = unitsPerCase > 0 ? unitsPerCase : 1;
  return upc * Math.max(0, cases);
}

/** A short, unique-enough human reference like PO-20261016-A1B2. */
function makeReference(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PO-${ymd}-${rand}`;
}

export async function createOrder(input: CreateOrderInput) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: input.supplierId },
  });
  if (!supplier) throw new Error("Unknown supplier for this order.");

  const lines = (input.lines ?? []).filter((l) => {
    const upc = toInt(l.unitsPerCase, 1) || 1;
    const cases = toInt(l.cases, 0);
    return cases > 0 && (l.originalCode || l.fragranceName || l.productId) && upc > 0;
  });
  if (lines.length === 0) {
    throw new Error("An order needs at least one line with a quantity (cases).");
  }

  const currency = (input.currency ?? "USD").toUpperCase();
  const fx = await resolveFxRate(currency);

  const order = await prisma.purchaseOrder.create({
    data: {
      reference: input.reference?.trim() || makeReference(),
      supplierId: input.supplierId,
      currency,
      fxRate: fx.rate || null,
      incoterm: input.incoterm?.trim() || null,
      expectedDate: toDate(input.expectedDate),
      notes: input.notes?.trim() || null,
      createdBy: input.createdBy ?? null,
      lines: {
        create: lines.map((l) => {
          const unitsPerCase = Math.max(1, toInt(l.unitsPerCase, 1));
          const cases = Math.max(0, toInt(l.cases, 0));
          return {
            productId: l.productId ?? null,
            originalCode: l.originalCode ? String(l.originalCode) : null,
            brand: l.brand?.trim() || null,
            fragranceName: l.fragranceName?.trim() || null,
            concentration: l.concentration?.trim() || null,
            sizeMl: l.sizeMl === null || l.sizeMl === undefined || l.sizeMl === "" ? null : toInt(l.sizeMl),
            packagingLevel: packaging(l.packagingLevel),
            unitsPerCase,
            cases,
            units: lineUnits(unitsPerCase, cases),
            unitCost: toNum(l.unitCost),
            currency,
            notes: l.notes?.trim() || null,
          };
        }),
      },
    },
    include: { lines: true, supplier: true },
  });

  await prisma.auditLog.create({
    data: {
      actor: input.createdBy ?? "web",
      action: "order.created",
      entityType: "PurchaseOrder",
      entityId: order.id,
      after: {
        reference: order.reference,
        supplier: supplier.name,
        lines: order.lines.length,
        currency,
      },
    },
  });

  return order;
}

export async function listOrders(limit = 100) {
  return prisma.purchaseOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      supplier: { select: { name: true } },
      _count: { select: { lines: true, pfiDocuments: true } },
    },
  });
}

export async function getOrder(id: string) {
  return prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      lines: { orderBy: { createdAt: "asc" } },
      pfiDocuments: {
        orderBy: { createdAt: "desc" },
        include: { lines: true },
      },
    },
  });
}

export async function updateOrderStatus(id: string, status: string, actor?: string | null) {
  const next = status.toUpperCase();
  if (!ORDER_STATUSES.includes(next as OrderStatus)) {
    throw new Error(`Unknown order status: ${status}`);
  }
  const order = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: next as OrderStatus },
  });
  await prisma.auditLog.create({
    data: {
      actor: actor ?? "web",
      action: "order.status_changed",
      entityType: "PurchaseOrder",
      entityId: id,
      after: { status: next },
    },
  });
  return order;
}

export async function updateOrderExpectedDate(
  id: string,
  expectedDate: string | Date | null,
  actor?: string | null,
) {
  const date = toDate(expectedDate);
  const order = await prisma.purchaseOrder.update({
    where: { id },
    data: { expectedDate: date },
  });
  await prisma.auditLog.create({
    data: {
      actor: actor ?? "web",
      action: "order.expected_date_changed",
      entityType: "PurchaseOrder",
      entityId: id,
      after: { expectedDate: date ? date.toISOString().slice(0, 10) : null },
    },
  });
  return order;
}

// ---------------------------------------------------------------------------
// Order totals
// ---------------------------------------------------------------------------

export type OrderTotals = {
  units: number;
  cases: number;
  lineCount: number;
  value: number;
  valueUsd: number;
  complete: boolean;
};

export function orderTotals(
  lines: { units: number; cases: number; unitCost: unknown }[],
  fxRate: number | null,
): OrderTotals {
  let units = 0;
  let cases = 0;
  let value = 0;
  let complete = true;
  for (const l of lines) {
    units += l.units;
    cases += l.cases;
    const cost = l.unitCost === null || l.unitCost === undefined ? null : Number(l.unitCost);
    if (cost === null || !Number.isFinite(cost)) {
      complete = false;
      continue;
    }
    value += cost * l.units;
  }
  const valueUsd = fxRate && fxRate > 0 ? value * fxRate : value;
  return {
    units,
    cases,
    lineCount: lines.length,
    value: Math.round(value * 100) / 100,
    valueUsd: Math.round(valueUsd * 100) / 100,
    complete,
  };
}

// ---------------------------------------------------------------------------
// PFI variance (§2)
// ---------------------------------------------------------------------------

export type PfiVarianceLine = {
  key: string;
  label: string;
  code: string | null;
  orderedUnits: number | null;
  pfiQuantity: number | null;
  quantityDiff: number | null;
  orderUnitCost: number | null;
  pfiUnitPrice: number | null;
  priceDiff: number | null;
  status: "match" | "short" | "over" | "missing" | "absent";
};

export type PfiVariance = {
  lines: PfiVarianceLine[];
  summary: {
    lines: number;
    matched: number;
    short: number;
    over: number;
    missing: number;
    absent: number;
    orderedUnits: number;
    invoicedUnits: number;
  };
};

type OrderLineLike = {
  originalCode: string | null;
  brand: string | null;
  fragranceName: string | null;
  concentration: string | null;
  sizeMl: number | null;
  packagingLevel: string;
  units: number;
  unitCost: unknown;
};

type PfiLineLike = {
  originalCode: string | null;
  brand: string | null;
  name: string | null;
  quantity: unknown;
  unitPrice: unknown;
};

function normCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const digits = String(code).replace(/\D/g, "");
  return digits.length >= 5 ? digits : null;
}

function desc(line: { brand: string | null; fragranceName: string | null; name?: string | null; concentration: string | null; sizeMl: number | null; packagingLevel?: string }): string {
  const parts = [line.brand, line.fragranceName ?? line.name, line.concentration];
  let text = parts.filter(Boolean).join(" ");
  if (line.sizeMl) text += ` ${line.sizeMl}ml`;
  if (line.packagingLevel && line.packagingLevel !== "UNIT") text += ` (${line.packagingLevel})`;
  return text.trim() || "Unnamed line";
}

export function computePfiVariance(
  orderLines: OrderLineLike[],
  pfiLines: PfiLineLike[],
): PfiVariance {
  const pfiByCode = new Map<string, PfiLineLike>();
  const consumed = new Set<PfiLineLike>();
  for (const p of pfiLines) {
    const c = normCode(p.originalCode);
    if (c && !pfiByCode.has(c)) pfiByCode.set(c, p);
  }

  const lines: PfiVarianceLine[] = [];

  for (const o of orderLines) {
    const code = normCode(o.originalCode);
    const match = code ? pfiByCode.get(code) : undefined;
    const orderUnitCost = o.unitCost === null || o.unitCost === undefined ? null : Number(o.unitCost);
    if (match) {
      consumed.add(match);
      const pfiQty = match.quantity === null || match.quantity === undefined ? null : Number(match.quantity);
      const pfiPrice = match.unitPrice === null || match.unitPrice === undefined ? null : Number(match.unitPrice);
      const diff = pfiQty === null ? null : pfiQty - o.units;
      const status: PfiVarianceLine["status"] =
        diff === null || diff === 0 ? "match" : diff < 0 ? "short" : "over";
      lines.push({
        key: `code:${code}`,
        label: desc(o),
        code: o.originalCode,
        orderedUnits: o.units,
        pfiQuantity: pfiQty,
        quantityDiff: diff,
        orderUnitCost,
        pfiUnitPrice: pfiPrice,
        priceDiff:
          orderUnitCost !== null && pfiPrice !== null
            ? Math.round((pfiPrice - orderUnitCost) * 10000) / 10000
            : null,
        status,
      });
    } else {
      lines.push({
        key: `order:${o.originalCode ?? desc(o)}`,
        label: desc(o),
        code: o.originalCode,
        orderedUnits: o.units,
        pfiQuantity: null,
        quantityDiff: null,
        orderUnitCost,
        pfiUnitPrice: null,
        priceDiff: null,
        status: "absent",
      });
    }
  }

  for (const p of pfiLines) {
    if (consumed.has(p)) continue;
    const pfiQty = p.quantity === null || p.quantity === undefined ? null : Number(p.quantity);
    const pfiPrice = p.unitPrice === null || p.unitPrice === undefined ? null : Number(p.unitPrice);
    lines.push({
      key: `pfi:${p.originalCode ?? p.name ?? Math.random()}`,
      label: desc({ ...p, fragranceName: null, concentration: null, sizeMl: null }),
      code: p.originalCode,
      orderedUnits: null,
      pfiQuantity: pfiQty,
      quantityDiff: null,
      orderUnitCost: null,
      pfiUnitPrice: pfiPrice,
      priceDiff: null,
      status: "missing",
    });
  }

  const summary = {
    lines: lines.length,
    matched: lines.filter((l) => l.status === "match").length,
    short: lines.filter((l) => l.status === "short").length,
    over: lines.filter((l) => l.status === "over").length,
    missing: lines.filter((l) => l.status === "missing").length,
    absent: lines.filter((l) => l.status === "absent").length,
    orderedUnits: orderLines.reduce((s, l) => s + l.units, 0),
    invoicedUnits: pfiLines.reduce(
      (s, l) => s + (l.quantity === null || l.quantity === undefined ? 0 : Number(l.quantity) || 0),
      0,
    ),
  };

  return { lines, summary };
}
