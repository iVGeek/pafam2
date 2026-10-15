"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Field = { key: string; label: string; value: number; hint?: string };

export function AlertSettingsForm({
  fields,
  overrides = "{}",
}: {
  fields: Field[];
  overrides?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const input = "w-28 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: Record<string, number | object> = {};
    for (const [k, v] of form.entries()) {
      if (k === "alert_overrides") continue;
      const n = Number(v);
      if (Number.isFinite(n)) values[k] = n;
    }
    const raw = String(form.get("alert_overrides") ?? "").trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          setError("Overrides must be a JSON object.");
          return;
        }
        values.alert_overrides = parsed;
      } catch {
        setError("Overrides are not valid JSON.");
        return;
      }
    } else {
      values.alert_overrides = {};
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setError(json.error ?? `Failed (${res.status}).`);
      else {
        setSaved(true);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
      >
        Alert thresholds
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap gap-4">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">{f.label}</span>
            <input name={f.key} defaultValue={f.value} inputMode="decimal" className={input} />
            {f.hint ? <span className="text-xs text-zinc-400">{f.hint}</span> : null}
          </label>
        ))}
      </div>
      <label className="mt-4 flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">
          Per-brand / per-SKU overrides (JSON)
        </span>
        <textarea
          name="alert_overrides"
          defaultValue={overrides}
          rows={5}
          spellCheck={false}
          className="w-full rounded border border-zinc-300 px-2 py-1 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
        />
        <span className="text-xs text-zinc-400">
          e.g. {`{"brands":{"Chanel":{"priceMovePct":5}},"skus":{"CH-EDA-100":{"agedInventoryDays":30}}}`}.
          Overrides apply on top of the thresholds above; SKU wins over brand.
        </span>
      </label>
      {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {saved ? <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">Saved.</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Saving…" : "Save thresholds"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          Close
        </button>
      </div>
    </form>
  );
}
