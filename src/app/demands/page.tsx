import { prisma } from "@/lib/prisma";
import { getDemandPipeline } from "@/lib/demands";
import { dateStr, money, qty, usd } from "@/lib/format";
import { NewDemandForm, DemandApproveButton } from "./demand-controls";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function DemandsPage() {
  const [demands, customers, products, pipeline] = await Promise.all([
    prisma.demand.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        customer: { select: { name: true } },
        product: { select: { internalSku: true } },
      },
    }),
    prisma.customer.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({ orderBy: { internalSku: "asc" }, select: { id: true, internalSku: true, brand: true, fragranceName: true } }),
    getDemandPipeline(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customer demand</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Each requirement is a separate dated record. Approved demand is what buying
          recommendations match against; unclear SKUs stay unresolved rather than being invented.
        </p>
      </div>
      <SearchBar placeholder="Search…" />

      <NewDemandForm
        customers={customers.map((c) => ({ id: c.id, label: c.name }))}
        products={products.map((p) => ({
          id: p.id,
          label: `${p.internalSku} ${p.brand ?? ""} ${p.fragranceName ?? ""}`.trim(),
        }))}
      />

      <section>
        <h2 className="text-lg font-medium">Pipeline segments (as of {pipeline.asOf})</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Kept separate on purpose — never summed blindly. Confirmed orders are committed;
          wishlists are uncommitted interest; the probability-weighted figure applies documented
          stage/certainty weights to active requests and quotes only.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PipelineCard
            title="Confirmed unfilled orders"
            bucket={pipeline.confirmedUnfilled}
            note="Committed, not yet fulfilled."
          />
          <PipelineCard
            title="Current wishlists"
            bucket={pipeline.currentWishlists}
            note="Uncommitted interest; not counted as orders."
          />
          <PipelineCard
            title="Probability-weighted opportunities"
            bucket={pipeline.probabilityWeighted}
            weighted
            note="Active requests & quotes, discounted by stage and certainty."
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {pipeline.expired.demandCount} expired demand record(s) ({qty(pipeline.expired.units)} units)
          excluded from every open bucket.
        </p>
      </section>

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Quantity</th>
              <th className="px-4 py-2 text-right">Target</th>
              <th className="px-4 py-2">Needed by</th>
              <th className="px-4 py-2">Expiry</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Review</th>
            </tr>
          </thead>
          <tbody>
            {demands.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-zinc-500">
                  No demand recorded yet.
                </td>
              </tr>
            ) : (
              demands.map((d) => (
                <tr key={d.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-2">{d.customer.name}</td>
                  <td className="px-4 py-2">
                    <div className="font-mono text-xs">
                      {d.product?.internalSku ?? d.barcode ?? "— unlinked —"}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {[d.brand, d.fragranceName, d.sizeMl ? `${d.sizeMl}ml` : null]
                        .filter(Boolean)
                        .join(" ") || ""}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {d.status}
                    {d.certainty === "INFERRED" ? (
                      <span className="ml-1 rounded bg-zinc-100 px-1 text-zinc-500 dark:bg-zinc-800">
                        inferred
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {d.quantity ? qty(Number(d.quantity)) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {d.targetPrice ? usd(Number(d.targetPrice)) : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs">{dateStr(d.neededBy)}</td>
                  <td className="px-4 py-2 text-xs">{dateStr(d.expiryDate)}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">
                    {d.owner ?? "—"}
                    {d.evidence ? ` · ${d.evidence.slice(0, 40)}` : ""}
                  </td>
                  <td className="px-4 py-2">
                    <DemandApproveButton demandId={d.id} approved={d.approved} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-zinc-500">
        Approved demand only. {demands.filter((d) => d.approved).length} of {demands.length} approved.
        {" "}
        {money(
          demands
            .filter((d) => d.approved && d.targetPrice !== null)
            .reduce((s, d) => s + (d.quantity ? Number(d.quantity) * Number(d.targetPrice) : 0), 0),
        )}{" "}
        indicative approved value.
      </p>
    </div>
  );
}

function PipelineCard({
  title,
  bucket,
  weighted = false,
  note,
}: {
  title: string;
  bucket: {
    demandCount: number;
    units: number;
    valueUsd: number;
    weightedUnits: number;
    weightedValueUsd: number;
  };
  weighted?: boolean;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">
        {weighted ? qty(Math.round(bucket.weightedUnits * 10) / 10) : qty(bucket.units)}
        <span className="ml-1 text-xs font-normal text-zinc-500">units</span>
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        {bucket.demandCount} demand record(s)
        {weighted
          ? ` · ${usd(Math.round(bucket.weightedValueUsd * 100) / 100)} weighted value`
          : bucket.valueUsd > 0
            ? ` · ${usd(Math.round(bucket.valueUsd * 100) / 100)} indicative value`
            : ""}
      </div>
      <p className="mt-2 text-xs text-zinc-400">{note}</p>
    </div>
  );
}
