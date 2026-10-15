import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSkuTrend, TREND_SERIES, TREND_WINDOWS, type TrendSeries, type TrendWindow } from "@/lib/trends";
import { usd, qty } from "@/lib/format";
import { TrendChart } from "./trend-chart";
import { MarketPriceForm } from "./market-price-form";

export const dynamic = "force-dynamic";

export default async function SkuTrendPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const daysParam = Number(Array.isArray(sp.days) ? sp.days[0] : sp.days);
  const windowDays = (TREND_WINDOWS as readonly number[]).includes(daysParam)
    ? (daysParam as TrendWindow)
    : 30;

  const seriesParam = Array.isArray(sp.series) ? sp.series.join(",") : (sp.series ?? "");
  const requested = seriesParam
    ? seriesParam.split(",").filter((s): s is TrendSeries => (TREND_SERIES as readonly string[]).includes(s))
    : [...TREND_SERIES];
  const series = requested.length ? requested : [...TREND_SERIES];

  const trend = await buildSkuTrend(id, windowDays);
  if (!trend) notFound();

  const linkFor = (nextDays: number, nextSeries: TrendSeries[]) =>
    `/trends/${id}?days=${nextDays}&series=${nextSeries.join(",")}`;

  const stats: { label: string; value: string }[] = [
    { label: "Observation days", value: String(trend.stats.observationDays) },
    { label: "Independent stock owners", value: String(trend.stats.independentOwners) },
    { label: "Active offers", value: String(trend.stats.activeOffers) },
    {
      label: "Latest median ask",
      value: trend.stats.latestMedianAsk === null ? "—" : usd(trend.stats.latestMedianAsk),
    },
    {
      label: `Median ask (${windowDays}d)`,
      value: trend.stats.medianAskWindow === null ? "—" : usd(trend.stats.medianAskWindow),
    },
    {
      label: "Change (first to last)",
      value: trend.stats.changePct === null ? "—" : `${qty(trend.stats.changePct)}%`,
    },
    { label: "In-transit units", value: qty(trend.stats.inboundUnits) },
    { label: "Available on hand", value: qty(trend.stats.onHandUnits) },
    { label: "Approved demand qty", value: qty(trend.stats.approvedDemandQty) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">
          Price &amp; supply trend · {trend.product.internalSku}
        </h1>
        <p className="text-xs text-zinc-500">
          {trend.product.brand ?? "—"} · {trend.product.fragranceName ?? "—"}
          {trend.product.sizeMl ? ` · ${trend.product.sizeMl} ml` : ""}
        </p>
      </div>

      <MarketPriceForm productId={id} />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">Window</span>
        {TREND_WINDOWS.map((w) => (
          <Link
            key={w}
            href={linkFor(w, series)}
            className={`rounded-full border px-2.5 py-1 ${
              w === windowDays
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {w}d
          </Link>
        ))}
        <span className="ml-3 text-zinc-500">Series</span>
        {TREND_SERIES.map((s) => {
          const on = series.includes(s);
          const next = on ? series.filter((x) => x !== s) : [...series, s];
          return (
            <Link
              key={s}
              href={linkFor(windowDays, next.length ? next : [...TREND_SERIES])}
              className={`rounded-full border px-2.5 py-1 capitalize ${
                on
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              }`}
            >
              {s}
            </Link>
          );
        })}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="text-xs text-zinc-500">{s.label}</div>
            <div className="mt-1 text-sm font-medium">{s.value}</div>
          </div>
        ))}
      </section>

      <TrendChart trend={trend} series={series} />

      <p className="text-xs text-zinc-500">
        Only recorded observations are plotted; days without data are left as gaps. Supplier ask
        (min-max band and median), public retail, customer target, our purchase and our sale prices are
        kept as separate series and never blended. Window {trend.from} to {trend.to}.
      </p>

      <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="border-b border-zinc-100 px-4 py-2 text-sm font-medium dark:border-zinc-800">
          Supplier ask by day
        </h2>
        {trend.ask.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">No dated supplier offers in this window.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Min</th>
                <th className="px-4 py-2 font-medium">Median</th>
                <th className="px-4 py-2 font-medium">Max</th>
                <th className="px-4 py-2 font-medium">Obs.</th>
                <th className="px-4 py-2 font-medium">Owners</th>
              </tr>
            </thead>
            <tbody>
              {trend.ask.map((b) => (
                <tr key={b.date} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-1.5">{b.date}</td>
                  <td className="px-4 py-1.5">{usd(b.min)}</td>
                  <td className="px-4 py-1.5">{usd(b.median)}</td>
                  <td className="px-4 py-1.5">{usd(b.max)}</td>
                  <td className="px-4 py-1.5">{b.count}</td>
                  <td className="px-4 py-1.5">{b.owners}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
