import { prisma } from "@/lib/prisma";
import SearchBar from "@/components/SearchBar";
import {
  getOutstandingSummary,
  getFinancingSummary,
  listFinancing,
  listCashFlows,
  listInvoices,
  xirr,
  TYPE_LABELS,
  type DatedFlow,
} from "@/lib/cashflow";
import { dateStr, pct, usd } from "@/lib/format";
import { CashFlowForm, DeleteCashFlowButton, InvoiceForm, InvoicePaymentControl, FinancingForm } from "./cashflow-tools";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  OPEN: "text-zinc-600 dark:text-zinc-400",
  PARTIALLY_PAID: "text-amber-700 dark:text-amber-400",
  PAID: "text-emerald-700 dark:text-emerald-400",
  CANCELLED: "text-zinc-400 line-through",
};

export default async function CashFlowPage() {
  const [outstanding, financingSummary, financing, flows, invoices, deals, orders] = await Promise.all([
    getOutstandingSummary(),
    getFinancingSummary(),
    listFinancing(),
    listCashFlows({ limit: 200 }),
    listInvoices(),
    prisma.deal.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, status: true } }),
    prisma.purchaseOrder.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, reference: true } }),
  ]);

  // Overall XIRR across every dated flow we hold, when the series supports it.
  const allFlows: DatedFlow[] = await prisma.cashFlow
    .findMany({ select: { date: true, amountUsd: true }, orderBy: { date: "asc" } })
    .then((rows) => rows.map((r) => ({ date: r.date, amountUsd: Number(r.amountUsd) })));
  const overallRate = xirr(allFlows);
  const netCash = flows.reduce((s, f) => s + Number(f.amountUsd), 0);
  const openInvoices = invoices.filter((i) => i.status === "OPEN" || i.status === "PARTIALLY_PAID");
  const dealOptions = deals.map((d) => ({ id: d.id, label: `Deal ${d.id.slice(0, 6)} · ${d.status}` }));
  const orderOptions = orders.map((o) => ({ id: o.id, label: o.reference }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cash flow &amp; financing</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Dated cash flows are the source of truth: partial payments, outstanding balances, funding
          balances, financing and XIRR all come from them (§8.4).
        </p>
      </div>
      <SearchBar placeholder="Search…" />

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-white p-5 text-sm sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Stat label="Receivables (owed to us)" value={usd(outstanding.receivableUsd)} />
        <Stat label="Payables (we owe)" value={usd(outstanding.payableUsd)} />
        <Stat label="Overdue receivables" value={usd(outstanding.overdueReceivableUsd)} />
        <Stat label="Overdue payables" value={usd(outstanding.overduePayableUsd)} />
        <Stat label="Active financing" value={usd(financingSummary.principalUsd)} />
        <Stat label="Accrued interest" value={usd(financingSummary.accruedInterestUsd)} />
        <Stat label="Net cash (recorded)" value={usd(netCash)} />
        <Stat label="Overall XIRR" value={overallRate === null ? "—" : pct(overallRate * 100)} />
      </div>

      <InvoiceForm orders={orderOptions} />

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Invoices &amp; bills</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Paid</th>
                <th className="px-4 py-2 text-right">Balance</th>
                <th className="px-4 py-2">Due</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Record payment</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                    No invoices recorded.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2 text-xs">{inv.type === "CUSTOMER" ? "Customer" : "Supplier"}</td>
                    <td className="px-4 py-2 text-xs">{inv.reference ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{inv.order?.reference ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(Number(inv.total))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(Number(inv.paid))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(Number(inv.balance))}</td>
                    <td className="px-4 py-2 text-xs">{dateStr(inv.dueDate)}</td>
                    <td className={`px-4 py-2 text-xs ${STATUS_STYLE[inv.status] ?? ""}`}>{inv.status}</td>
                    <td className="px-4 py-2">
                      {inv.status === "PAID" || inv.status === "CANCELLED" ? (
                        <span className="text-xs text-zinc-400">—</span>
                      ) : (
                        <InvoicePaymentControl id={inv.id} balance={Number(inv.balance)} />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500">
          {openInvoices.length} open invoice(s). A payment may be partial; the balance updates and a
          dated cash flow is written automatically.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Financing</h2>
        <FinancingForm orders={orderOptions} />
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-2">Funded</th>
                <th className="px-4 py-2">Principal</th>
                <th className="px-4 py-2 text-right">Rate</th>
                <th className="px-4 py-2 text-right">Interest</th>
                <th className="px-4 py-2">Repaid</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {financing.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                    No financing recorded.
                  </td>
                </tr>
              ) : (
                financing.map((f) => (
                  <tr key={f.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2 text-xs">{dateStr(f.fundedDate)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(Number(f.principalUsd))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {f.rateAnnual === null ? "—" : pct(Number(f.rateAnnual) * 100)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {f.interestUsd === null ? "—" : usd(Number(f.interestUsd))}
                    </td>
                    <td className="px-4 py-2 text-xs">{dateStr(f.repaidDate)}</td>
                    <td className="px-4 py-2 text-xs">{f.status}</td>
                    <td className="px-4 py-2 text-xs">{f.description ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Cash-flow ledger</h2>
        <CashFlowForm deals={dealOptions} />
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2 text-right">Amount (USD)</th>
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Note</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {flows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                    No cash flows recorded.
                  </td>
                </tr>
              ) : (
                flows.map((f) => (
                  <tr key={f.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2 text-xs">{dateStr(f.date)}</td>
                    <td className="px-4 py-2 text-xs">{TYPE_LABELS[f.type]}</td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        Number(f.amountUsd) < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {usd(Number(f.amountUsd))}
                    </td>
                    <td className="px-4 py-2 text-xs">{f.order?.reference ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{f.reference ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{f.note ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <DeleteCashFlowButton id={f.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}
