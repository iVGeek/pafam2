"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarketPriceForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const input = "rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950";
  const label = "flex flex-col gap-1 text-sm";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/market-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...raw, productId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setError(json.error ?? `Failed (${res.status}).`);
      else {
        form.reset();
        setOpen(false);
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
        Record market price
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Kind</span>
          <select name="kind" className={input} defaultValue="PUBLIC_RETAIL">
            <option value="PUBLIC_RETAIL">Public retail</option>
            <option value="WHOLESALE_SALE">Wholesale (observed)</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Price *</span>
          <input name="price" required inputMode="decimal" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Currency</span>
          <input name="currency" className={input} defaultValue="USD" />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Observed date</span>
          <input type="date" name="observedDate" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Source</span>
          <input name="source" className={input} placeholder="site / store" />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
