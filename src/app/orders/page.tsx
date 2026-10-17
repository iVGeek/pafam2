import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orderTotals } from "@/lib/orders";
import { dateStr, money, qty } from "@/lib/format";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  CONFIRMED: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  RECEIVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
};

export default async function OrdersPage() {
  const orders = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      supplier: { select: { name: true } },
      lines: { select: { units: true, cases: true, unitCost: true } },
      _count: { select: { lines: true, pfiDocuments: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order placements</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Place purchase orders with suppliers in whole-box quantities, export
            them to Excel, and compare the supplier&apos;s proforma invoice (PFI)
            against what we ordered.
          </p>
        </div>
      <SearchBar placeholder="Search…" />
        <Link
          href="/orders/new"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          New order
        </Link>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
          No orders yet. Create one to send to a supplier.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Lines</th>
                <th className="px-3 py-2 text-right">Cases</th>
                <th className="px-3 py-2 text-right">Units</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">PFIs</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const totals = orderTotals(
                  order.lines,
                  order.fxRate ? Number(order.fxRate) : null,
                );
                return (
                  <tr
                    key={order.id}
                    className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <td className="px-3 py-2">
                      <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
                        {order.reference}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{order.supplier.name}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLE[order.status] ?? ""
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{order._count.lines}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{qty(totals.cases)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{qty(totals.units)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(totals.value, order.currency ?? "USD")}
                      {totals.complete ? "" : " +"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {order._count.pfiDocuments}
                    </td>
                    <td className="px-3 py-2 text-zinc-500">{dateStr(order.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
