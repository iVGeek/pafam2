import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { dateStr, money, qty } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  SENT: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  ACCEPTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  DECLINED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  EXPIRED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export default async function QuotesPage() {
  const quotes = await prisma.quote.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      customer: { select: { name: true } },
      lines: { select: { quantity: true, unitPrice: true, description: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Customer-facing quotations. Exports contain prices and terms only — never supplier
          identities or internal buying costs.
        </p>
      </div>

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">Quote</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2 text-right">Lines</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2">Valid until</th>
              <th className="px-4 py-2">Terms</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2 text-right">Export</th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-zinc-500">
                  No quotes yet. Create one from a{" "}
                  <Link href="/deals" className="underline">
                    deal
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              quotes.map((q) => {
                const total = q.lines.reduce(
                  (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
                  0,
                );
                return (
                  <tr
                    key={q.id}
                    className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <td className="px-4 py-2 font-mono text-xs">{q.quoteNumber}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          STATUS_STYLE[q.status] ?? STATUS_STYLE.DRAFT
                        }`}
                      >
                        {q.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">{q.customer.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{q.lines.length}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {money(total, q.currency)}
                    </td>
                    <td className="px-4 py-2 text-xs">{dateStr(q.validUntil)}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {q.paymentTerms ?? "—"}
                      {q.deliveryBasis ? ` · ${q.deliveryBasis}` : ""}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">{dateStr(q.createdAt)}</td>
                    <td className="px-4 py-2 text-right">
                      <a
                        href={`/api/quotes/${q.id}/export`}
                        className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        xlsx
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-zinc-500">
        {quotes.length} quote(s).{" "}
        {qty(quotes.reduce((n, q) => n + q.lines.length, 0))} line(s) total.
      </p>
    </div>
  );
}
