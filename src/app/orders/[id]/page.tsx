import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder, orderTotals, computePfiVariance } from "@/lib/orders";
import { dateStr, money, qty } from "@/lib/format";
import { OrderStatusControl } from "./order-status";
import { PfiUpload } from "./pfi-upload";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  CONFIRMED: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  RECEIVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
};

const VAR_STYLE: Record<string, string> = {
  match: "text-emerald-700 dark:text-emerald-400",
  short: "text-red-600 dark:text-red-400",
  over: "text-amber-700 dark:text-amber-400",
  missing: "text-blue-700 dark:text-blue-400",
  absent: "text-red-600 dark:text-red-400",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const currency = order.currency ?? "USD";
  const totals = orderTotals(order.lines, order.fxRate ? Number(order.fxRate) : null);
  const latestPfi = order.pfiDocuments[0] ?? null;
  const variance = latestPfi ? computePfiVariance(order.lines, latestPfi.lines) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/orders" className="text-xs text-zinc-500 hover:underline">
            ← Orders
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{order.reference}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {order.supplier.name}
            {order.supplier.country ? ` · ${order.supplier.country}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[order.status] ?? ""}`}
          >
            {order.status}
          </span>
          <a
            href={`/api/orders/${order.id}/export`}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Download order (Excel)
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-white p-5 text-sm sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Meta label="Created" value={dateStr(order.createdAt)} />
        <Meta label="Currency" value={currency} />
        <Meta
          label="FX (USD per 1)"
          value={order.fxRate ? Number(order.fxRate).toString() : "—"}
        />
        <Meta label="Incoterm" value={order.incoterm ?? "—"} />
        <Meta label="Lines" value={String(totals.lineCount)} />
        <Meta label="Cases" value={qty(totals.cases)} />
        <Meta label="Units" value={qty(totals.units)} />
        <Meta
          label="Order value"
          value={`${money(totals.value, currency)}${totals.complete ? "" : " +"}`}
        />
        <div className="col-span-2 sm:col-span-4">
          <OrderStatusControl id={order.id} status={order.status} />
        </div>
        {order.notes ? (
          <div className="col-span-2 sm:col-span-4 text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Notes: </span>
            {order.notes}
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Packaging</th>
              <th className="px-3 py-2 text-right">Units/case</th>
              <th className="px-3 py-2 text-right">Cases</th>
              <th className="px-3 py-2 text-right">Units</th>
              <th className="px-3 py-2 text-right">Unit cost</th>
              <th className="px-3 py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => {
              const cost = line.unitCost === null ? null : Number(line.unitCost);
              return (
                <tr key={line.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-2 font-mono text-xs">{line.originalCode ?? "—"}</td>
                  <td className="px-3 py-2">
                    {[line.brand, line.fragranceName, line.concentration]
                      .filter(Boolean)
                      .join(" ") || "—"}
                    {line.sizeMl ? ` · ${line.sizeMl}ml` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs">{line.packagingLevel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.unitsPerCase}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.cases}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.units}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {cost === null ? "—" : money(cost, currency)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {cost === null ? "—" : money(cost * line.units, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-zinc-50 font-medium dark:bg-zinc-900">
            <tr>
              <td className="px-3 py-2" colSpan={4}>
                Totals
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{totals.cases}</td>
              <td className="px-3 py-2 text-right tabular-nums">{totals.units}</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right tabular-nums">
                {money(totals.value, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Supplier PFI (proforma invoice)</h2>
          <span className="text-xs text-zinc-500">
            Compare the received PFI quantities against this order.
          </span>
        </div>
        <PfiUpload orderId={order.id} />

        {order.pfiDocuments.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {order.pfiDocuments.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between border-t border-zinc-100 py-1 dark:border-zinc-800">
                <span>
                  {doc.filename}{" "}
                  <span className="text-xs text-zinc-500">
                    ({doc.sourceType}, {doc.lineCount} line{doc.lineCount === 1 ? "" : "s"})
                  </span>
                </span>
                <span className="text-xs text-zinc-500">{dateStr(doc.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No PFI uploaded yet.</p>
        )}

        {variance && variance.lines.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="py-1">Product</th>
                  <th className="py-1 text-right">Ordered</th>
                  <th className="py-1 text-right">Invoiced</th>
                  <th className="py-1 text-right">Difference</th>
                  <th className="py-1 text-right">Unit cost → PFI</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {variance.lines.map((line) => (
                  <tr key={line.key} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5">
                      {line.label}
                      {line.code ? (
                        <span className="ml-2 font-mono text-xs text-zinc-500">{line.code}</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {line.orderedUnits === null ? "—" : line.orderedUnits}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {line.pfiQuantity === null ? "—" : qty(line.pfiQuantity)}
                    </td>
                    <td className={`py-1.5 text-right tabular-nums ${VAR_STYLE[line.status] ?? ""}`}>
                      {line.quantityDiff === null
                        ? "—"
                        : line.quantityDiff > 0
                          ? `+${qty(line.quantityDiff)}`
                          : qty(line.quantityDiff)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {line.orderUnitCost === null ? "—" : money(line.orderUnitCost, currency)}
                      {line.pfiUnitPrice === null ? "" : ` → ${line.pfiUnitPrice}`}
                    </td>
                    <td className={`py-1.5 text-xs font-medium capitalize ${VAR_STYLE[line.status] ?? ""}`}>
                      {line.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-zinc-500">
              {variance.summary.matched} match · {variance.summary.short} short ·{" "}
              {variance.summary.over} over · {variance.summary.missing} not ordered ·{" "}
              {variance.summary.absent} not invoiced.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}
