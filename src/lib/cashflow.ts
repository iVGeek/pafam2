// Dated cash flows, invoices, payments and financing (§8.4).
//
// The brief asks for cash return measured on actual cash-received dates versus
// actual cash-paid dates, partial payments with an outstanding balance, a stored
// financing rate with funded dates, daily funding balances, and XIRR where
// dated flows support it. This module owns that ledger. Every figure is derived
// from dated records; nothing is estimated from a single scalar when dated flows
// exist.

import { prisma } from "./prisma";
import type {
  CashFlowType,
  FinancingStatus,
  InvoiceStatus,
  InvoiceType,
  PaymentDirection,
} from "@prisma/client";

export const CASH_FLOW_TYPES = [
  "BUY_PAYMENT",
  "SELL_RECEIPT",
  "FINANCING_IN",
  "FINANCING_OUT",
  "RECOVERABLE_REFUND",
  "DEPOSIT_SUPPLIER",
  "DEPOSIT_CUSTOMER",
  "ADJUSTMENT",
  "OTHER",
] as const satisfies readonly CashFlowType[];

export const INVOICE_TYPES = ["SUPPLIER", "CUSTOMER"] as const satisfies readonly InvoiceType[];

export const FINANCING_STATUSES = ["ACTIVE", "REPAID", "CANCELLED"] as const satisfies readonly FinancingStatus[];

/** Types whose cash-flow sign is fixed by convention. */
const TYPE_SIGN: Partial<Record<CashFlowType, 1 | -1>> = {
  BUY_PAYMENT: -1,
  SELL_RECEIPT: 1,
  FINANCING_IN: 1,
  FINANCING_OUT: -1,
  RECOVERABLE_REFUND: 1,
  DEPOSIT_SUPPLIER: -1,
  DEPOSIT_CUSTOMER: 1,
};

export const TYPE_LABELS: Record<CashFlowType, string> = {
  BUY_PAYMENT: "Purchase payment",
  SELL_RECEIPT: "Sales receipt",
  FINANCING_IN: "Financing drawn",
  FINANCING_OUT: "Financing repaid / interest",
  RECOVERABLE_REFUND: "Recoverable refund",
  DEPOSIT_SUPPLIER: "Supplier deposit / advance",
  DEPOSIT_CUSTOMER: "Customer deposit",
  ADJUSTMENT: "Adjustment",
  OTHER: "Other",
};

// ---------------------------------------------------------------------------
// Small coercion helpers
// ---------------------------------------------------------------------------

function toNum(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function isCashFlowType(value: string | null | undefined): value is CashFlowType {
  return !!value && (CASH_FLOW_TYPES as readonly string[]).includes(value);
}

/**
 * Turn a positive magnitude into the signed USD amount the ledger stores.
 * Types with a fixed direction are signed here; ADJUSTMENT and OTHER keep the
 * sign the caller supplied (so they can be used as corrections either way).
 */
export function applyCashFlowSign(type: CashFlowType, amountUsd: number): number {
  const sign = TYPE_SIGN[type];
  if (sign === undefined) return amountUsd;
  return sign * Math.abs(amountUsd);
}

// ---------------------------------------------------------------------------
// XIRR
// ---------------------------------------------------------------------------

export type DatedFlow = { date: Date; amountUsd: number };

/**
 * Extended internal rate of return for an irregular series of dated flows.
 * Outflows are negative, inflows positive. Returns the annual rate as a
 * fraction (0.1 = 10%), or null when the series cannot support a rate (needs at
 * least one inflow and one outflow, and a sign change brackets a root).
 */
export function xirr(flows: DatedFlow[]): number | null {
  const sorted = flows
    .filter((f) => Number.isFinite(f.amountUsd))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sorted.length < 2) return null;
  const hasIn = sorted.some((f) => f.amountUsd > 0);
  const hasOut = sorted.some((f) => f.amountUsd < 0);
  if (!hasIn || !hasOut) return null;

  const t0 = sorted[0].date.getTime();
  const yearFrac = (d: Date) => (d.getTime() - t0) / 86_400_000 / 365;
  const npv = (r: number) => {
    let sum = 0;
    for (const f of sorted) {
      const denom = Math.pow(1 + r, yearFrac(f.date));
      if (!Number.isFinite(denom) || denom === 0) return Number.NaN;
      sum += f.amountUsd / denom;
    }
    return sum;
  };

  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  let fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) {
    // Fall back to a Newton pass before giving up.
    let r = 0.1;
    for (let i = 0; i < 100; i++) {
      const f = npv(r);
      if (!Number.isFinite(f)) break;
      const h = 1e-6;
      const deriv = (npv(r + h) - f) / h;
      if (!Number.isFinite(deriv) || deriv === 0) break;
      const next = r - f / deriv;
      if (!Number.isFinite(next) || next <= -0.9999) break;
      if (Math.abs(next - r) < 1e-9) return next;
      r = next;
    }
    return null;
  }

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (!Number.isFinite(fm)) return null;
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Cash-flow ledger
// ---------------------------------------------------------------------------

export type CreateCashFlowInput = {
  date: Date | string;
  type: string;
  amountUsd: number | string;
  currency?: string | null;
  fxRate?: number | string | null;
  orderId?: string | null;
  dealId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  reference?: string | null;
  note?: string | null;
  createdBy?: string | null;
};

export async function recordCashFlow(input: CreateCashFlowInput) {
  const date = toDate(input.date);
  if (!date) throw new Error("A cash flow needs a date.");
  if (!isCashFlowType(input.type)) throw new Error(`Unknown cash-flow type: ${input.type}`);
  const magnitude = toNum(input.amountUsd);
  if (magnitude === null || magnitude === 0) throw new Error("A cash flow needs a non-zero amount.");

  const amountUsd = applyCashFlowSign(input.type, magnitude);

  return prisma.cashFlow.create({
    data: {
      date,
      type: input.type,
      amountUsd,
      currency: input.currency?.trim() || "USD",
      fxRate: toNum(input.fxRate),
      orderId: input.orderId?.trim() || null,
      dealId: input.dealId?.trim() || null,
      quoteId: input.quoteId?.trim() || null,
      invoiceId: input.invoiceId?.trim() || null,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      createdBy: input.createdBy ?? null,
    },
  });
}

export type CashFlowFilter = {
  from?: Date;
  to?: Date;
  type?: string;
  dealId?: string;
  orderId?: string;
  limit?: number;
};

export async function listCashFlows(filter: CashFlowFilter = {}) {
  return prisma.cashFlow.findMany({
    where: {
      date: {
        gte: filter.from ?? undefined,
        lte: filter.to ?? undefined,
      },
      type: isCashFlowType(filter.type) ? filter.type : undefined,
      dealId: filter.dealId ?? undefined,
      orderId: filter.orderId ?? undefined,
    },
    orderBy: { date: "desc" },
    take: filter.limit ?? 300,
    include: {
      order: { select: { reference: true } },
      deal: { select: { id: true } },
      invoice: { select: { reference: true, type: true } },
    },
  });
}

export async function deleteCashFlow(id: string, actor?: string | null) {
  const existing = await prisma.cashFlow.findUnique({
    where: { id },
    include: { paymentReceipt: { select: { id: true } } },
  });
  if (!existing) throw new Error("Cash flow not found.");
  if (existing.paymentReceipt) {
    throw new Error(
      "This cash flow is tied to a recorded invoice payment — remove the payment on the invoice instead.",
    );
  }
  await prisma.cashFlow.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      actor: actor ?? "web",
      action: "cashflow.deleted",
      entityType: "CashFlow",
      entityId: id,
      before: { date: dayKey(existing.date), type: existing.type, amountUsd: existing.amountUsd.toString() },
    },
  });
  return existing;
}

// ---------------------------------------------------------------------------
// Invoices and partial payments
// ---------------------------------------------------------------------------

export type CreateInvoiceInput = {
  type?: string | null;
  orderId?: string | null;
  quoteId?: string | null;
  dealId?: string | null;
  reference?: string | null;
  currency?: string | null;
  fxRate?: number | string | null;
  total: number | string;
  dueDate?: Date | string | null;
  issueDate?: Date | string | null;
  notes?: string | null;
  createdBy?: string | null;
};

function invoiceType(value: string | null | undefined): InvoiceType {
  const v = (value ?? "SUPPLIER").toUpperCase();
  return (INVOICE_TYPES as readonly string[]).includes(v) ? (v as InvoiceType) : "SUPPLIER";
}

export async function createInvoice(input: CreateInvoiceInput) {
  const total = toNum(input.total);
  if (total === null || total <= 0) throw new Error("An invoice needs a positive total.");

  const invoice = await prisma.invoice.create({
    data: {
      type: invoiceType(input.type),
      orderId: input.orderId?.trim() || null,
      quoteId: input.quoteId?.trim() || null,
      dealId: input.dealId?.trim() || null,
      reference: input.reference?.trim() || null,
      currency: input.currency?.trim() || "USD",
      fxRate: toNum(input.fxRate),
      total,
      paid: 0,
      balance: total,
      dueDate: toDate(input.dueDate),
      issueDate: toDate(input.issueDate) ?? new Date(),
      status: "OPEN",
      notes: input.notes?.trim() || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: input.createdBy ?? "web",
      action: "invoice.created",
      entityType: "Invoice",
      entityId: invoice.id,
      after: { type: invoice.type, total: invoice.total.toString(), dueDate: invoice.dueDate ? dayKey(invoice.dueDate) : null },
    },
  });

  return invoice;
}

export type ListInvoiceFilter = {
  type?: string;
  status?: string;
  includeClosed?: boolean;
};

export async function listInvoices(filter: ListInvoiceFilter = {}) {
  return prisma.invoice.findMany({
    where: {
      type: (INVOICE_TYPES as readonly string[]).includes(filter.type ?? "") ? (filter.type as InvoiceType) : undefined,
      status: filter.includeClosed ? undefined : { not: "CANCELLED" },
    },
    orderBy: [{ dueDate: "asc" }, { issueDate: "desc" }],
    include: {
      _count: { select: { payments: true } },
      order: { select: { reference: true } },
      quote: { select: { quoteNumber: true } },
    },
  });
}

export async function listInvoicePayments(invoiceId: string) {
  return prisma.paymentReceipt.findMany({
    where: { invoiceId },
    orderBy: { paidDate: "asc" },
    include: { cashFlow: { select: { id: true, date: true, amountUsd: true } } },
  });
}

export type RecordPaymentInput = {
  amount: number | string;
  paidDate?: Date | string | null;
  fxRate?: number | string | null;
  reference?: string | null;
  method?: string | null;
  notes?: string | null;
  createdBy?: string | null;
};

/**
 * Record a (possibly partial) payment against an invoice. Updates the invoice's
 * paid/balance/status, and writes both the dated cash flow and the payment
 * receipt so funding balances and XIRR see it. Overpayment is rejected rather
 * than silently absorbed.
 */
export async function recordInvoicePayment(invoiceId: string, input: RecordPaymentInput) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === "CANCELLED") throw new Error("Cannot pay a cancelled invoice.");

  const amount = toNum(input.amount);
  if (amount === null || amount <= 0) throw new Error("A payment needs a positive amount.");

  const balance = Number(invoice.balance);
  if (amount > balance + 0.005) {
    throw new Error(`Payment of ${amount} exceeds the outstanding balance of ${balance}.`);
  }

  const paidDate = toDate(input.paidDate) ?? new Date();
  const direction: PaymentDirection = invoice.type === "SUPPLIER" ? "OUT" : "IN";
  const cashType: CashFlowType = invoice.type === "SUPPLIER" ? "BUY_PAYMENT" : "SELL_RECEIPT";

  const newPaid = Math.round((Number(invoice.paid) + amount) * 100) / 100;
  const newBalance = Math.round((Number(invoice.total) - newPaid) * 100) / 100;
  const status: InvoiceStatus = newBalance <= 0.005 ? "PAID" : "PARTIALLY_PAID";

  const result = await prisma.$transaction(async (tx) => {
    const cashFlow = await tx.cashFlow.create({
      data: {
        date: paidDate,
        type: cashType,
        amountUsd: applyCashFlowSign(cashType, amount),
        currency: invoice.currency,
        fxRate: toNum(input.fxRate) ?? (invoice.fxRate === null ? null : Number(invoice.fxRate)),
        orderId: invoice.orderId,
        dealId: invoice.dealId,
        quoteId: invoice.quoteId,
        invoiceId: invoice.id,
        reference: input.reference?.trim() || invoice.reference,
        note: input.notes?.trim() || null,
        createdBy: input.createdBy ?? null,
      },
    });

    const payment = await tx.paymentReceipt.create({
      data: {
        invoiceId: invoice.id,
        cashFlowId: cashFlow.id,
        direction,
        amount,
        currency: invoice.currency,
        fxRate: toNum(input.fxRate),
        paidDate,
        reference: input.reference?.trim() || null,
        method: input.method?.trim() || null,
        notes: input.notes?.trim() || null,
        createdBy: input.createdBy ?? null,
      },
    });

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paid: newPaid,
        balance: newBalance,
        status,
        closedDate: status === "PAID" ? paidDate : null,
      },
    });

    return { invoice: updated, payment, cashFlow };
  });

  await prisma.auditLog.create({
    data: {
      actor: input.createdBy ?? "web",
      action: "invoice.payment",
      entityType: "Invoice",
      entityId: invoice.id,
      after: { amount, paidTotal: newPaid, balance: newBalance, status },
    },
  });

  return result;
}

export type OutstandingSummary = {
  receivableUsd: number;
  payableUsd: number;
  overdueReceivableUsd: number;
  overduePayableUsd: number;
};

/** Open balances by direction, with the portion past its due date split out. */
export async function getOutstandingSummary(asOf: Date = new Date()): Promise<OutstandingSummary> {
  const open = await prisma.invoice.findMany({
    where: { status: { in: ["OPEN", "PARTIALLY_PAID"] } },
    select: { type: true, balance: true, dueDate: true },
  });
  const summary: OutstandingSummary = {
    receivableUsd: 0,
    payableUsd: 0,
    overdueReceivableUsd: 0,
    overduePayableUsd: 0,
  };
  for (const inv of open) {
    const bal = Number(inv.balance);
    const overdue = inv.dueDate !== null && inv.dueDate.getTime() < asOf.getTime();
    if (inv.type === "CUSTOMER") {
      summary.receivableUsd += bal;
      if (overdue) summary.overdueReceivableUsd += bal;
    } else {
      summary.payableUsd += bal;
      if (overdue) summary.overduePayableUsd += bal;
    }
  }
  summary.receivableUsd = Math.round(summary.receivableUsd * 100) / 100;
  summary.payableUsd = Math.round(summary.payableUsd * 100) / 100;
  summary.overdueReceivableUsd = Math.round(summary.overdueReceivableUsd * 100) / 100;
  summary.overduePayableUsd = Math.round(summary.overduePayableUsd * 100) / 100;
  return summary;
}

// ---------------------------------------------------------------------------
// Financing
// ---------------------------------------------------------------------------

export type CreateFinancingInput = {
  fromDate: Date | string;
  fundedDate?: Date | string | null;
  toDate?: Date | string | null;
  repaidDate?: Date | string | null;
  principalUsd: number | string;
  rateAnnual?: number | string | null;
  currency?: string | null;
  description?: string | null;
  dealId?: string | null;
  orderId?: string | null;
  createdBy?: string | null;
};

/** Annual-rate interest over a day count, at a 365-day year. */
export function financingInterestUsd(
  principalUsd: number,
  rateAnnual: number | null,
  fromDate: Date,
  toDate: Date,
): number | null {
  if (rateAnnual === null || !Number.isFinite(rateAnnual)) return null;
  const days = Math.max(0, daysBetween(fromDate, toDate));
  return Math.round(principalUsd * rateAnnual * (days / 365) * 100) / 100;
}

export async function createFinancing(input: CreateFinancingInput) {
  const fromDate = toDate(input.fromDate);
  if (!fromDate) throw new Error("Financing needs a from-date.");
  const principalUsd = toNum(input.principalUsd);
  if (principalUsd === null || principalUsd <= 0) throw new Error("Financing needs a positive principal.");
  const rateAnnual = toNum(input.rateAnnual);
  const fundedDate = toDate(input.fundedDate) ?? fromDate;
  const maturityDate = toDate(input.toDate);
  const repaidDate = toDate(input.repaidDate);
  const end = maturityDate ?? repaidDate;
  const interestUsd = end ? financingInterestUsd(principalUsd, rateAnnual, fromDate, end) : null;

  const entry = await prisma.financingEntry.create({
    data: {
      fromDate,
      fundedDate,
      toDate: maturityDate,
      repaidDate,
      principalUsd,
      rateAnnual,
      interestUsd,
      currency: input.currency?.trim() || "USD",
      description: input.description?.trim() || null,
      dealId: input.dealId?.trim() || null,
      orderId: input.orderId?.trim() || null,
      status: repaidDate ? "REPAID" : "ACTIVE",
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: input.createdBy ?? "web",
      action: "financing.created",
      entityType: "FinancingEntry",
      entityId: entry.id,
      after: { principalUsd, rateAnnual, fundedDate: dayKey(fundedDate) },
    },
  });

  return entry;
}

export async function listFinancing() {
  return prisma.financingEntry.findMany({
    orderBy: { fundedDate: "desc" },
    include: { deal: { select: { id: true } }, order: { select: { reference: true } } },
  });
}

export async function getFinancingSummary(asOf: Date = new Date()) {
  const entries = await prisma.financingEntry.findMany({ where: { status: "ACTIVE" } });
  let principal = 0;
  let accruedInterest = 0;
  for (const e of entries) {
    principal += Number(e.principalUsd);
    const interest =
      e.interestUsd !== null
        ? Number(e.interestUsd)
        : financingInterestUsd(
            Number(e.principalUsd),
            e.rateAnnual === null ? null : Number(e.rateAnnual),
            e.fromDate,
            asOf,
          );
    accruedInterest += interest ?? 0;
  }
  return {
    activeCount: entries.length,
    principalUsd: Math.round(principal * 100) / 100,
    accruedInterestUsd: Math.round(accruedInterest * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Daily funding balances
// ---------------------------------------------------------------------------

export type FundingDay = {
  date: string;
  financingOutstandingUsd: number;
  netCashUsd: number;
  /** financing outstanding plus cumulative net cash; negative means own cash at work. */
  fundingBalanceUsd: number;
};

/**
 * Day-by-day funding position between two dates: the outstanding financing
 * principal plus the cumulative net cash flow. A negative balance is capital we
 * have funded from our own cash. Days with no change are still emitted so the
 * balance can be charted without gaps.
 */
export async function getDailyFundingBalances(from: Date, to: Date): Promise<FundingDay[]> {
  const [financing, flows] = await Promise.all([
    prisma.financingEntry.findMany({
      where: { status: { not: "CANCELLED" } },
      select: { principalUsd: true, fundedDate: true, repaidDate: true },
    }),
    prisma.cashFlow.findMany({
      where: { date: { lte: to } },
      select: { date: true, amountUsd: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const days: FundingDay[] = [];
  let flowIdx = 0;
  let netCash = 0;
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  for (let d = new Date(start); d.getTime() <= end.getTime(); d = new Date(d.getTime() + 86_400_000)) {
    while (flowIdx < flows.length && flows[flowIdx].date.getTime() <= d.getTime()) {
      netCash += Number(flows[flowIdx].amountUsd);
      flowIdx++;
    }

    let outstanding = 0;
    for (const f of financing) {
      if (f.fundedDate.getTime() > d.getTime()) continue;
      if (f.repaidDate && f.repaidDate.getTime() <= d.getTime()) continue;
      outstanding += Number(f.principalUsd);
    }

    const fundingBalance = Math.round((outstanding + netCash) * 100) / 100;
    days.push({
      date: dayKey(d),
      financingOutstandingUsd: Math.round(outstanding * 100) / 100,
      netCashUsd: Math.round(netCash * 100) / 100,
      fundingBalanceUsd: fundingBalance,
    });
  }

  return days;
}

// ---------------------------------------------------------------------------
// Deal-level dated cash return
// ---------------------------------------------------------------------------

export type DealCashReturn = {
  flowCount: number;
  totalInUsd: number;
  totalOutUsd: number;
  netUsd: number;
  xirrPct: number | null;
  firstPaidDate: string | null;
  lastReceiptDate: string | null;
  holdingDays: number | null;
  /** cash-on-cash return: net / total out. */
  cashReturnPct: number | null;
};

/**
 * Dated cash return for a deal, from the cash flows tagged to it. Returns null
 * when a deal has no dated flows yet, so callers fall back to the estimated
 * annualised return rather than presenting an invented figure.
 */
export async function getDealCashReturn(dealId: string): Promise<DealCashReturn | null> {
  const flows = await prisma.cashFlow.findMany({
    where: { dealId },
    orderBy: { date: "asc" },
    select: { date: true, amountUsd: true },
  });
  if (flows.length === 0) return null;

  let totalIn = 0;
  let totalOut = 0;
  let firstPaid: Date | null = null;
  let lastReceipt: Date | null = null;
  const dated: DatedFlow[] = [];
  for (const f of flows) {
    const amount = Number(f.amountUsd);
    dated.push({ date: f.date, amountUsd: amount });
    if (amount < 0) {
      totalOut += -amount;
      if (!firstPaid) firstPaid = f.date;
    } else if (amount > 0) {
      totalIn += amount;
      lastReceipt = f.date;
    }
  }

  const rate = xirr(dated);
  const holdingDays = firstPaid && lastReceipt ? Math.max(0, daysBetween(firstPaid, lastReceipt)) : null;

  return {
    flowCount: flows.length,
    totalInUsd: Math.round(totalIn * 100) / 100,
    totalOutUsd: Math.round(totalOut * 100) / 100,
    netUsd: Math.round((totalIn - totalOut) * 100) / 100,
    xirrPct: rate === null ? null : Math.round(rate * 10000) / 100,
    firstPaidDate: firstPaid ? dayKey(firstPaid) : null,
    lastReceiptDate: lastReceipt ? dayKey(lastReceipt) : null,
    holdingDays,
    cashReturnPct: totalOut > 0 ? Math.round(((totalIn - totalOut) / totalOut) * 10000) / 100 : null,
  };
}
