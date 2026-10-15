"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FxForm() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [baseCurrency, setBaseCurrency] = useState("EUR");
  const [rate, setRate] = useState("");
  const [rateDate, setRateDate] = useState(today);
  const [source, setSource] = useState("ECB");
  const [booked, setBooked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input =
    "rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/fx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseCurrency, rate, rateDate, source, booked }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setError(json.error ?? `Failed (${res.status}).`);
      else {
        setRate("");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Currency</span>
        <input className={input} value={baseCurrency} maxLength={3} onChange={(e) => setBaseCurrency(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">USD per 1 unit</span>
        <input className={input} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="1.0850" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Rate date</span>
        <input type="date" className={input} value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Source</span>
        <input className={input} value={source} onChange={(e) => setSource(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" checked={booked} onChange={(e) => setBooked(e.target.checked)} />
        Booked
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {busy ? "Saving…" : "Add rate"}
      </button>
      {error ? <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </form>
  );
}
