import type { AskBucket, SkuTrend, TrendPoint, TrendSeries } from "@/lib/trends";

const PAD = { left: 56, right: 16, top: 16, bottom: 34 };
const W = 960;
const H = 360;

const SERIES_STYLE: Record<TrendSeries, { color: string; label: string }> = {
  ask: { color: "#2563eb", label: "Supplier ask (median)" },
  retail: { color: "#16a34a", label: "Public retail" },
  targets: { color: "#d97706", label: "Customer target" },
  purchases: { color: "#7c3aed", label: "Our purchase" },
  sales: { color: "#059669", label: "Our sale" },
};

function ms(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

// Break a series into contiguous segments so missing days read as gaps rather
// than being joined by a misleading straight line (§12).
function segments(points: TrendPoint[], maxGapDays = 3): TrendPoint[][] {
  const out: TrendPoint[][] = [];
  let current: TrendPoint[] = [];
  for (const p of points) {
    const prev = current[current.length - 1];
    if (prev && (ms(p.date) - ms(prev.date)) / 86400000 > maxGapDays) {
      out.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length) out.push(current);
  return out;
}

export function TrendChart({ trend, series }: { trend: SkuTrend; series: TrendSeries[] }) {
  const enabled = new Set(series);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const t0 = ms(trend.from);
  const t1 = ms(trend.to);
  const span = Math.max(1, t1 - t0);
  const x = (date: string) => PAD.left + ((ms(date) - t0) / span) * plotW;

  const values: number[] = [];
  if (enabled.has("ask")) for (const b of trend.ask) values.push(b.min, b.max);
  for (const key of ["retail", "targets", "purchases", "sales"] as const) {
    if (enabled.has(key)) for (const p of trend[key]) values.push(p.value);
  }

  if (values.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        No observations in this window. Record offers, demands, trades, or market prices to build the series.
      </div>
    );
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padY = (rawMax - rawMin) * 0.08 || rawMax * 0.08 || 1;
  const yMin = Math.max(0, rawMin - padY);
  const yMax = rawMax + padY;
  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const yTicks = 5;
  const xTicks = 6;
  const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(2));

  const askMedianPts = trend.ask.map((b) => ({ date: b.date, value: b.median }));
  const askSegs = enabled.has("ask") ? segments(askMedianPts) : [];
  const askBandSegs: AskBucket[][] = [];
  if (enabled.has("ask")) {
    let cur: AskBucket[] = [];
    for (const b of trend.ask) {
      const prev = cur[cur.length - 1];
      if (prev && (ms(b.date) - ms(prev.date)) / 86400000 > 3) {
        if (cur.length) askBandSegs.push(cur);
        cur = [];
      }
      cur.push(b);
    }
    if (cur.length) askBandSegs.push(cur);
  }

  const scatter = (key: "retail" | "targets" | "purchases" | "sales") =>
    enabled.has(key) ? trend[key] : [];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="SKU price and supply trend">
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const v = yMin + ((yMax - yMin) * i) / yTicks;
          const yy = y(v);
          return (
            <g key={`y${i}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={yy} y2={yy} stroke="#e4e4e7" strokeWidth={1} />
              <text x={PAD.left - 6} y={yy + 3} textAnchor="end" fontSize={10} fill="#71717a">
                {fmt(v)}
              </text>
            </g>
          );
        })}

        {Array.from({ length: xTicks + 1 }, (_, i) => {
          const t = t0 + (span * i) / xTicks;
          const xx = PAD.left + (plotW * i) / xTicks;
          const label = new Date(t).toISOString().slice(5, 10);
          return (
            <g key={`x${i}`}>
              <line x1={xx} x2={xx} y1={PAD.top} y2={H - PAD.bottom} stroke="#f4f4f5" strokeWidth={1} />
              <text x={xx} y={H - PAD.bottom + 14} textAnchor="middle" fontSize={10} fill="#71717a">
                {label}
              </text>
            </g>
          );
        })}

        {askBandSegs.map((seg, i) => {
          const upper = seg.map((b) => `${x(b.date)},${y(b.max)}`).join(" ");
          const lower = [...seg].reverse().map((b) => `${x(b.date)},${y(b.min)}`).join(" ");
          return <polygon key={`band${i}`} points={`${upper} ${lower}`} fill="#2563eb" fillOpacity={0.1} />;
        })}

        {askSegs.map((seg, i) => (
          <polyline
            key={`ask${i}`}
            points={seg.map((p) => `${x(p.date)},${y(p.value)}`).join(" ")}
            fill="none"
            stroke={SERIES_STYLE.ask.color}
            strokeWidth={2}
          />
        ))}

        {(["retail", "targets", "purchases", "sales"] as const).map((key) =>
          scatter(key).map((p, i) => (
            <circle key={`${key}${i}`} cx={x(p.date)} cy={y(p.value)} r={3.5} fill={SERIES_STYLE[key].color} />
          )),
        )}

        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#a1a1aa" strokeWidth={1} />
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="#a1a1aa" strokeWidth={1} />
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs">
        {series.map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SERIES_STYLE[key].color }} />
            <span className="text-zinc-600 dark:text-zinc-400">
              {SERIES_STYLE[key].label}
              {key === "ask" ? " (± band)" : ""}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
