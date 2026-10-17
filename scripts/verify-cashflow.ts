// Verifies §8.4 cash flow, invoices, partial payments, financing, daily funding
// balances and XIRR.
// Run: npx tsx scripts/verify-cashflow.ts (requires the dev DB running)
import { loadEnvFile } from "node:process";

try {
  loadEnvFile();
} catch {}

let failures = 0;
function assert(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}
function closeTo(a: number | null | undefined, b: number, eps = 0.01): boolean {
  return a !== null && a !== undefined && Math.abs(a - b) < eps;
}

const stamp = Date.now();
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const {
    xirr,
    applyCashFlowSign,
    recordCashFlow,
    createInvoice,
    recordInvoicePayment,
    getOutstandingSummary,
    createFinancing,
    financingInterestUsd,
    getFinancingSummary,
    getDailyFundingBalances,
    getDealCashReturn,
  } = await import("../src/lib/cashflow");

  const createdFlows: string[] = [];
  const createdInvoices: string[] = [];
  const createdFinancing: string[] = [];
  let dealId: string | null = null;
  let supplierId: string | null = null;

  try {
    // --- 1. XIRR pure function. -------------------------------------------
    assert("sign: BUY_PAYMENT is an outflow", applyCashFlowSign("BUY_PAYMENT", 500) === -500);
    assert("sign: SELL_RECEIPT is an inflow", applyCashFlowSign("SELL_RECEIPT", 500) === 500);

    const oneYear = xirr([
      { date: utc(2026, 1, 1), amountUsd: -1000 },
      { date: utc(2026, 12, 31), amountUsd: 1100 },
    ]);
    assert("XIRR: -1000 then +1100 over a year is ~10%", closeTo(oneYear, 0.1, 1e-3));

    const twoYear = xirr([
      { date: utc(2026, 1, 1), amountUsd: -1000 },
      { date: utc(2028, 1, 1), amountUsd: 1210 },
    ]);
    assert("XIRR: -1000 then +1210 over two years is ~10%", closeTo(twoYear, 0.1, 2e-3));

    const noSign = xirr([
      { date: utc(2026, 1, 1), amountUsd: -1000 },
      { date: utc(2026, 6, 1), amountUsd: -500 },
    ]);
    assert("XIRR: returns null without a sign change", noSign === null);

    // --- 2. Cash-flow ledger signs. ---------------------------------------
    const buy = await recordCashFlow({ date: utc(2026, 6, 1), type: "BUY_PAYMENT", amountUsd: 500 });
    createdFlows.push(buy.id);
    assert("recorded BUY_PAYMENT stored as -500", Number(buy.amountUsd) === -500);
    const sell = await recordCashFlow({ date: utc(2026, 6, 2), type: "SELL_RECEIPT", amountUsd: 800 });
    createdFlows.push(sell.id);
    assert("recorded SELL_RECEIPT stored as +800", Number(sell.amountUsd) === 800);

    // --- 3. Invoices and partial payments. --------------------------------
    const beforeOutstanding = await getOutstandingSummary(utc(2026, 7, 1));

    const custInvoice = await createInvoice({
      type: "CUSTOMER",
      reference: `INV-C-${stamp}`,
      total: 1000,
      dueDate: utc(2026, 6, 15), // in the past relative to asOf below => overdue
      issueDate: utc(2026, 5, 15),
    });
    createdInvoices.push(custInvoice.id);
    assert("invoice starts open with full balance", custInvoice.status === "OPEN" && Number(custInvoice.balance) === 1000);

    const pay1 = await recordInvoicePayment(custInvoice.id, { amount: 400, paidDate: utc(2026, 6, 10), createdBy: "verify" });
    createdFlows.push(pay1.cashFlow.id);
    assert("partial payment leaves 600 outstanding", closeTo(Number(pay1.invoice.balance), 600));
    assert("partial payment status PARTIALLY_PAID", pay1.invoice.status === "PARTIALLY_PAID");
    assert("partial payment writes a customer receipt (+400)", Number(pay1.cashFlow.amountUsd) === 400);

    let overpayRejected = false;
    try {
      await recordInvoicePayment(custInvoice.id, { amount: 900 });
    } catch {
      overpayRejected = true;
    }
    assert("overpayment beyond the balance is rejected", overpayRejected);

    const pay2 = await recordInvoicePayment(custInvoice.id, { amount: 600, paidDate: utc(2026, 6, 20) });
    createdFlows.push(pay2.cashFlow.id);
    assert("final payment clears the balance", closeTo(Number(pay2.invoice.balance), 0));
    assert("paid invoice status PAID", pay2.invoice.status === "PAID");

    const supplyInvoice = await createInvoice({ type: "SUPPLIER", reference: `INV-S-${stamp}`, total: 250 });
    createdInvoices.push(supplyInvoice.id);
    const spay = await recordInvoicePayment(supplyInvoice.id, { amount: 250, paidDate: utc(2026, 6, 25) });
    createdFlows.push(spay.cashFlow.id);
    assert("supplier payment is an outflow (-250)", Number(spay.cashFlow.amountUsd) === -250);

    // Overdue customer debt: the invoice is fully paid, so make a fresh overdue one.
    const overdueInvoice = await createInvoice({
      type: "CUSTOMER",
      reference: `INV-O-${stamp}`,
      total: 700,
      dueDate: utc(2026, 6, 1),
      issueDate: utc(2026, 5, 1),
    });
    createdInvoices.push(overdueInvoice.id);
    const afterOutstanding = await getOutstandingSummary(utc(2026, 7, 1));
    assert(
      "overdue receivables rise by the overdue invoice",
      closeTo(afterOutstanding.overdueReceivableUsd - beforeOutstanding.overdueReceivableUsd, 700),
    );
    assert(
      "receivables rise by the overdue invoice",
      closeTo(afterOutstanding.receivableUsd - beforeOutstanding.receivableUsd, 700),
    );

    // --- 4. Financing interest and summary. -------------------------------
    assert("financing interest: 5000 @ 12% for 365d = 600", financingInterestUsd(5000, 0.12, utc(2026, 1, 1), utc(2027, 1, 1)) === 600);

    const beforeFinancing = await getFinancingSummary(utc(2026, 3, 1));
    const facility = await createFinancing({
      fromDate: utc(2026, 3, 1),
      principalUsd: 5000,
      rateAnnual: 0.12,
      description: `Facility ${stamp}`,
    });
    createdFinancing.push(facility.id);
    assert("active financing stores principal", closeTo(Number(facility.principalUsd), 5000));
    const afterFinancing = await getFinancingSummary(utc(2026, 3, 1));
    assert(
      "financing summary principal rises by 5000",
      closeTo(afterFinancing.principalUsd - beforeFinancing.principalUsd, 5000),
    );

    // --- 5. Daily funding balances. ---------------------------------------
    const day20 = utc(2026, 3, 20);
    const base = (await getDailyFundingBalances(day20, day20))[0];
    const facility2 = await createFinancing({
      fromDate: utc(2026, 3, 10),
      principalUsd: 3000,
      rateAnnual: 0.12,
      description: `Funding ${stamp}`,
    });
    createdFinancing.push(facility2.id);
    const flow = await recordCashFlow({ date: utc(2026, 3, 15), type: "BUY_PAYMENT", amountUsd: 2000 });
    createdFlows.push(flow.id);
    const cur = (await getDailyFundingBalances(day20, day20))[0];
    assert(
      "financing outstanding includes the facility on the day",
      closeTo(cur.financingOutstandingUsd - base.financingOutstandingUsd, 3000),
    );
    assert(
      "net cash includes the outflow",
      closeTo(cur.netCashUsd - base.netCashUsd, -2000),
    );
    assert(
      "funding balance = financing outstanding + net cash",
      closeTo(cur.fundingBalanceUsd, cur.financingOutstandingUsd + cur.netCashUsd),
    );

    // --- 6. Deal-level dated cash return. ---------------------------------
    const supplier = await prisma.supplier.create({ data: { name: `V-Cash-Sup-${stamp}`, country: "US" } });
    supplierId = supplier.id;
    const deal = await prisma.deal.create({
      data: { supplierId: supplier.id, quantity: 100, buyCurrency: "USD", buyPrice: 10 },
    });
    dealId = deal.id;
    const d1 = await recordCashFlow({ date: utc(2026, 1, 1), type: "BUY_PAYMENT", amountUsd: 1000, dealId: deal.id });
    const d2 = await recordCashFlow({ date: utc(2026, 6, 30), type: "SELL_RECEIPT", amountUsd: 1200, dealId: deal.id });
    createdFlows.push(d1.id, d2.id);
    const cashReturn = await getDealCashReturn(deal.id);
    assert("deal cash return recorded", cashReturn !== null);
    assert("deal total out 1000 / in 1200", closeTo(cashReturn?.totalOutUsd, 1000) && closeTo(cashReturn?.totalInUsd, 1200));
    assert("deal cash-on-cash return 20%", closeTo(cashReturn?.cashReturnPct, 20));
    assert("deal holding period ~180 days", cashReturn?.holdingDays === 180);
    assert(
      "deal XIRR computed (between 40% and 50%)",
      cashReturn?.xirrPct !== null && cashReturn!.xirrPct! > 40 && cashReturn!.xirrPct! < 50,
    );

    const noFlowsDeal = await prisma.deal.create({
      data: { supplierId: supplier.id, quantity: 1, buyCurrency: "USD", buyPrice: 1 },
    });
    const none = await getDealCashReturn(noFlowsDeal.id);
    assert("deal without dated flows returns null (fallback stays intact)", none === null);
    await prisma.deal.delete({ where: { id: noFlowsDeal.id } });
  } finally {
    // --- Cleanup. ---------------------------------------------------------
    const { prisma } = await import("../src/lib/prisma");
    if (createdFlows.length) {
      await prisma.paymentReceipt.deleteMany({ where: { cashFlowId: { in: createdFlows } } });
      await prisma.cashFlow.deleteMany({ where: { id: { in: createdFlows } } });
    }
    if (createdInvoices.length) {
      await prisma.paymentReceipt.deleteMany({ where: { invoiceId: { in: createdInvoices } } });
      await prisma.invoice.deleteMany({ where: { id: { in: createdInvoices } } });
    }
    if (createdFinancing.length) {
      await prisma.financingEntry.deleteMany({ where: { id: { in: createdFinancing } } });
    }
    if (dealId) await prisma.deal.delete({ where: { id: dealId } });
    if (supplierId) await prisma.supplier.delete({ where: { id: supplierId } });
    await prisma.$disconnect();
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
