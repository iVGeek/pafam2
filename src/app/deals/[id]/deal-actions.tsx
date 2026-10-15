"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUSES = ["DRAFT", "REVIEWED", "APPROVED", "WON", "LOST"];

export function DealActions({
  dealId,
  status,
  customerId,
  quoteNumber,
  existingQuoteId,
  quoteLine,
  lostReason,
}: {
  dealId: string;
  status: string;
  customerId: string | null;
  quoteNumber?: string | null;
  existingQuoteId?: string | null;
  quoteLine: { quantity: number; unitPrice: number; description: string } | null;
  lostReason?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState(lostReason ?? "");

  async function setStatus(next: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          next === "LOST" ? { status: next, lostReason: reason } : { status: next },
        ),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setError(json.error ?? `Failed (${res.status}).`);
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createQuote() {
    if (!customerId || !quoteLine) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          owner: "web",
          destination: "US",
          lines: [
            {
              dealId,
              productId: null,
              description: quoteLine.description,
              quantity: quoteLine.quantity,
              unitPrice: quoteLine.unitPrice,
              currency: "USD",
            },
          ],
        }),
      });
      const json = (await res.json()) as { quote?: { id: string }; error?: string };
      if (!res.ok || !json.quote) setError(json.error ?? `Failed (${res.status}).`);
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase text-zinc-500">Status</span>
      {STATUSES.map((s) => (
        <button
          key={s}
          onClick={() => setStatus(s)}
          disabled={busy}
          className={`rounded-md px-3 py-1.5 text-sm disabled:opacity-50 ${
            s === status
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          }`}
        >
          {s}
        </button>
      ))}

      {existingQuoteId ? (
        <a
          href={`/api/quotes/${existingQuoteId}/export`}
          className="ml-auto rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
        >
          Export quote Excel
        </a>
      ) : (
        <button
          onClick={createQuote}
          disabled={busy || !customerId || !quoteLine}
          title={
            !customerId
              ? "Attach a customer first"
              : !quoteLine
                ? "A selling price is required"
                : undefined
          }
          className="ml-auto rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Working…" : "Create quote"}
        </button>
      )}

      {quoteNumber ? (
        <span className="text-xs text-zinc-500">Quote {quoteNumber}</span>
      ) : null}
      <label className="flex w-full items-center gap-2 text-xs text-zinc-500">
        <span className="uppercase">Lost reason</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. price, lead time, lost to competitor"
          className="w-full max-w-md rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
