import { prisma } from "@/lib/prisma";
import {
  getCoverBySku,
  getInventoryAnalytics,
  getInventorySummary,
  listInventory,
  summariseAging,
} from "@/lib/inventory";
import { dateStr, pct, qty, usd } from "@/lib/format";
import { AddStockForm, ReservationActions, ReserveControl } from "./inventory-controls";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  USABLE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  IN_TRANSIT: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  QUARANTINED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  DAMAGED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

export default async function InventoryPage() {
  const [items, summary, products, reservations, cover, analytics] = await Promise.all([
    listInventory(),
    getInventorySummary(),
    prisma.product.findMany({
      orderBy: { internalSku: "asc" },
      select: { id: true, internalSku: true, brand: true, fragranceName: true },
    }),
    prisma.inventoryReservation.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: {
        inventoryItem: {
          include: { product: { select: { internalSku: true } } },
        },
        customer: { select: { name: true } },
      },
    }),
    getCoverBySku(90),
    getInventoryAnalytics(),
  ]);
  const aging = summariseAging(items);

  const warehouses = [...new Set(items.map((i) => i.warehouse).filter((w): w is string => Boolean(w)))];
  const stats = [
    { label: "Available to sell", value: qty(summary.availableToSell) },
    { label: "Usable on hand", value: qty(summary.usableOnHand) },
    { label: "Reserved", value: qty(summary.reserved) },
    { label: "In transit", value: qty(summary.inTransit) },
    { label: "Quarantined", value: qty(summary.quarantined) },
    { label: "Stock value (USD)", value: usd(summary.stockValueUsd) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Own inventory</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Own stock by SKU, warehouse and lot. Available to sell = usable on hand − active
          reservations. Inbound units are excluded until received.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="text-xs text-zinc-500">{s.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </section>

      <AddStockForm
        products={products.map((p) => ({
          id: p.id,
          label: `${p.internalSku} ${p.brand ?? ""} ${p.fragranceName ?? ""}`.trim(),
        }))}
        warehouses={warehouses}
      />

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Warehouse</th>
              <th className="px-4 py-2">Lot</th>
              <th className="px-4 py-2 text-right">Age (days)</th>
              <th className="px-4 py-2 text-right">On hand</th>
              <th className="px-4 py-2 text-right">Reserved</th>
              <th className="px-4 py-2 text-right">Available</th>
              <th className="px-4 py-2 text-right">Unit cost</th>
              <th className="px-4 py-2 text-right">Value</th>
              <th className="px-4 py-2 text-right">Reserve</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-zinc-500">
                  No own stock recorded yet.
                </td>
              </tr>
            ) : (
              items.map((i) => {
                const value = i.unitCostUsd === null ? null : i.quantity * i.unitCostUsd;
                return (
                  <tr key={i.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2">
                      <div className="font-mono text-xs">{i.internalSku}</div>
                      <div className="text-xs text-zinc-500">{i.description}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[i.status] ?? ""}`}>
                        {i.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">{i.warehouse ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500">{i.lotRef ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.daysHeld}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{qty(i.quantity)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{qty(i.reserved)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {qty(i.available)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(i.unitCostUsd)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(value)}</td>
                    <td className="px-4 py-2">
                      {i.status === "USABLE" ? (
                        <ReserveControl itemId={i.id} available={i.available} />
                      ) : (
                        <span className="block text-right text-xs text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-lg font-medium">Aging &amp; days of cover</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Usable stock by age since acquisition, and how long current availability lasts at the
          last 90 days of won-deal sales velocity. Lots with no recent sales show no cover estimate.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {aging.map((b) => (
            <div
              key={b.bucket}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="text-xs text-zinc-500">{b.bucket} days</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{qty(b.units)}</div>
              <div className="text-xs text-zinc-500">{usd(b.valueUsd)}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2 text-right">Available</th>
                <th className="px-4 py-2 text-right">Sold (90d)</th>
                <th className="px-4 py-2 text-right">Days of cover</th>
                <th className="px-4 py-2">Signal</th>
              </tr>
            </thead>
            <tbody>
              {cover.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No usable stock to cover.
                  </td>
                </tr>
              ) : (
                cover.map((c) => {
                  const signal =
                    c.daysOfCover === null
                      ? { label: "No recent sales", style: "text-zinc-500" }
                      : c.daysOfCover <= 14
                        ? { label: "Low cover — restock", style: "text-amber-600 dark:text-amber-400" }
                        : c.daysOfCover >= 180
                          ? { label: "Slow-moving", style: "text-red-600 dark:text-red-400" }
                          : { label: "Healthy", style: "text-emerald-600 dark:text-emerald-400" };
                  return (
                    <tr key={c.productId} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-4 py-2 font-mono text-xs">{c.internalSku}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{qty(c.available)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{qty(c.soldUnits)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {c.daysOfCover === null ? "—" : c.daysOfCover}
                      </td>
                      <td className={`px-4 py-2 text-xs ${signal.style}`}>{signal.label}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">Stock turn, markdown &amp; profit by lot</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Stock turn uses the last {analytics.windowDays} days of won-deal cost of goods against
          current usable stock value (a snapshot denominator). Markdown exposure is usable stock
          held longer than {analytics.markdown.thresholdDays} days. Profit by lot is unrealised,
          priced at the best live customer target, else the latest public retail observation.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Tile label={`Stock turn (${analytics.windowDays}d)`} value={analytics.stockTurn === null ? "—" : `${analytics.stockTurn}×`} />
          <Tile label="COGS in window" value={usd(analytics.cogsUsd)} />
          <Tile label="Current stock value" value={usd(analytics.currentStockValueUsd)} />
          <Tile
            label="Markdown exposure"
            value={usd(analytics.markdown.valueUsd)}
            sub={`${qty(analytics.markdown.units)} units · ${
              analytics.markdown.pctOfStockValue === null ? "—" : pct(analytics.markdown.pctOfStockValue)
            } of stock value`}
          />
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Lot</th>
                <th className="px-4 py-2 text-right">Units</th>
                <th className="px-4 py-2 text-right">Unit cost</th>
                <th className="px-4 py-2 text-right">Held value</th>
                <th className="px-4 py-2 text-right">Reference sell</th>
                <th className="px-4 py-2 text-right">Potential profit</th>
                <th className="px-4 py-2 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {analytics.lots.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                    No usable stock to analyse.
                  </td>
                </tr>
              ) : (
                analytics.lots.map((l) => (
                  <tr key={`${l.productId}:${l.lotRef}`} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2 font-mono text-xs">{l.internalSku}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500">{l.lotRef}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{qty(l.units)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(l.unitCostUsd)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{usd(l.heldValueUsd)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {l.referenceSellUsd === null ? "—" : usd(l.referenceSellUsd)}
                      {l.referenceSource ? (
                        <span className="ml-1 text-[10px] text-zinc-400">
                          {l.referenceSource === "demand-target" ? "demand" : "retail"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {l.potentialProfitUsd === null ? "—" : usd(l.potentialProfitUsd)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {l.potentialMarginPct === null ? "—" : pct(l.potentialMarginPct)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">Active reservations</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2 text-right">Quantity</th>
                <th className="px-4 py-2">Note</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {reservations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                    No active reservations.
                  </td>
                </tr>
              ) : (
                reservations.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2 font-mono text-xs">
                      {r.inventoryItem.product.internalSku}
                    </td>
                    <td className="px-4 py-2">{r.customer?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{qty(Number(r.quantity))}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500">{r.note ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-zinc-500">{dateStr(r.createdAt)}</td>
                    <td className="px-4 py-2">
                      <ReservationActions id={r.id} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Fulfilling a reservation consumes on-hand stock; releasing returns it to available.{" "}
          {qty(summary.availableToSell)} units are currently available to sell.
        </p>
      </section>
    </div>
  );
}
