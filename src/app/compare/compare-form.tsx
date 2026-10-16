"use client";

import { useState } from "react";

type Row = {
  rowNumber: number;
  code: string | null;
  brand: string | null;
  name: string | null;
  sizeMl: number | null;
  concentration: string | null;
  packagingLevel: string | null;
  currency: string | null;
  price: number | null;
  quantity: number | null;
};

type Diff = {
  key: string;
  label: string;
  left: Row | null;
  right: Row | null;
  status: "added" | "removed" | "changed" | "same";
  priceChangePct: number | null;
  usdChangePct: number | null;
  leftPriceUsd: number | null;
  rightPriceUsd: number | null;
  quantityChange: number | null;
};

type Result = {
  summary: {
    leftRows: number;
    rightRows: number;
    added: number;
    removed: number;
    changed: number;
    same: number;
    matched: number;
    currencyChanged: number;
  };
  diffs: Diff[];
  leftName: string;
  rightName: string;
  unknownHeaders: string[];
};

function num(value: number | null): string {
  return value === null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function price(row: Row | null): string {
  if (!row) return "—";
  if (row.price === null) return "—";
  return `${row.price.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${row.currency ?? ""}`.trim();
}

function signedPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function toneClass(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400";
}

export function CompareForm() {
  const [left, setLeft] = useState<File | null>(null);
  const [right, setRight] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [changedOnly, setChangedOnly] = useState(false);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (!left || !right) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("left", left);
      form.append("right", right);
      const res = await fetch("/api/compare", { method: "POST", body: form });
      const json = (await res.json()) as Result & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Comparison failed (${res.status}).`);
      } else {
        setResult(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950";
  const rows = result
    ? result.diffs.filter((d) => (changedOnly ? d.status !== "same" : true))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={run}
        className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Left file (before / list A)</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className={input}
              onChange={(e) => setLeft(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Right file (after / list B)</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className={input}
              onChange={(e) => setRight(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !left || !right}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy ? "Comparing…" : "Compare"}
          </button>
          <span className="text-xs text-zinc-500">
            Rows are matched by internal SKU, then barcode, then brand / name /
            size.
          </span>
        </div>
      </form>

      {result ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="In both lists" value={result.summary.matched} />
            <Tile label="Changed" value={result.summary.changed} tone="amber" />
            <Tile label="Added" value={result.summary.added} tone="emerald" />
            <Tile label="Removed" value={result.summary.removed} tone="red" />
            <Tile label="Unchanged" value={result.summary.same} />
            <Tile label="Currency changed" value={result.summary.currencyChanged} />
          </div>

          {result.unknownHeaders.length ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              Unrecognised column(s) ignored: {result.unknownHeaders.join(", ")}
            </p>
          ) : null}

          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">
                Differences: {result.leftName} → {result.rightName}
              </h2>
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={changedOnly}
                  onChange={(e) => setChangedOnly(e.target.checked)}
                />
                Changed only
              </label>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="py-1">Item</th>
                    <th className="py-1 text-right">Left price</th>
                    <th className="py-1 text-right">Right price</th>
                    <th className="py-1 text-right">Δ price</th>
                    <th className="py-1 text-right">Δ USD</th>
                    <th className="py-1 text-right">Δ qty</th>
                    <th className="py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr
                      key={d.key}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="py-1.5">
                        <div>{d.label}</div>
                        <div className="text-xs text-zinc-500">
                          {d.left?.code ?? d.right?.code ?? ""}
                        </div>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {price(d.left)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {price(d.right)}
                      </td>
                      <td
                        className={`py-1.5 text-right tabular-nums ${toneClass(d.priceChangePct)}`}
                      >
                        {signedPct(d.priceChangePct)}
                      </td>
                      <td
                        className={`py-1.5 text-right tabular-nums ${toneClass(d.usdChangePct)}`}
                      >
                        {signedPct(d.usdChangePct)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {d.quantityChange === null
                          ? "—"
                          : d.quantityChange > 0
                            ? `+${num(d.quantityChange)}`
                            : num(d.quantityChange)}
                      </td>
                      <td className="py-1.5">
                        <span className="text-xs capitalize text-zinc-600 dark:text-zinc-400">
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-zinc-500">
                        No differences to show.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "amber" | "emerald" | "red";
}) {
  const color =
    tone === "amber"
      ? "text-amber-700 dark:text-amber-400"
      : tone === "emerald"
        ? "text-emerald-700 dark:text-emerald-400"
        : tone === "red"
          ? "text-red-600 dark:text-red-400"
          : "";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}
