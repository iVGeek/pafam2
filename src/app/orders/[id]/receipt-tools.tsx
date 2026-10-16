"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ReceiptLineOption = {
  id: string;
  code: string | null;
  label: string;
  orderedUnits: number;
};

export function ReceiptTools({
  orderId,
  lines,
  defaultExpectedDate,
}: {
  orderId: string;
  lines: ReceiptLineOption[];
  defaultExpectedDate: string | null;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [receiptDate, setReceiptDate] = useState(today);
  const [expectedDate, setExpectedDate] = useState(defaultExpectedDate ?? "");
  const [values, setValues] = useState<Record<string, { received: string; rejected: string }>>(
    () => Object.fromEntries(lines.map((l) => [l.id, { received: "", rejected: "" }])),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setValue(id: string, field: "received" | "rejected", v: string) {
    setValues((prev) => ({ ...prev, [id]: { ...prev[id], [field]: v } }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const payloadLines = lines
      .map((l) => ({
        orderLineId: l.id,
        receivedUnits: Number(values[l.id]?.received || 0),
        rejectedUnits: Number(values[l.id]?.rejected || 0),
      }))
      .filter((l) => l.receivedUnits > 0 || l.rejectedUnits > 0);

    if (payloadLines.length === 0) {
      setError("Enter received or rejected units on at least one line.");
      return;
    }
    if (!receiptDate) {
      setError("A receipt needs an arrival date.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptDate,
          expectedDate: expectedDate || null,
          lines: payloadLines,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to record receipt.");
        return;
      }
      setValues(Object.fromEntries(lines.map((l) => [l.id, { received: "", rejected: "" }])));
      setMessage("Receipt recorded.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record receipt.");
    } finally {
      setBusy(false);
    }
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/orders/${orderId}/receipts/import`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to import the receipt.");
        return;
      }
      setMessage("Receipt imported.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import the receipt.");
    } finally {
      e.target.value = "";
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Receipt date</span>
          <input
            type="date"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Promised date (for on-time)</span>
          <input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <a
          href={`/api/orders/${orderId}/receipts/template`}
          className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Download receipt template
        </a>
        <label className="cursor-pointer rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
          Import receipt (Excel)
          <input type="file" accept=".xlsx" className="hidden" onChange={onImport} disabled={busy} />
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">Ordered</th>
              <th className="px-3 py-2 text-right">Received</th>
              <th className="px-3 py-2 text-right">Rejected</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-3 py-2 font-mono text-xs">{l.code ?? "—"}</td>
                <td className="px-3 py-2">{l.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.orderedUnits}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={values[l.id]?.received ?? ""}
                    onChange={(e) => setValue(l.id, "received", e.target.value)}
                    className="w-24 rounded border border-zinc-300 px-2 py-1 text-right dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    value={values[l.id]?.rejected ?? ""}
                    onChange={(e) => setValue(l.id, "rejected", e.target.value)}
                    className="w-24 rounded border border-zinc-300 px-2 py-1 text-right dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Saving…" : "Record receipt"}
        </button>
        {message ? <span className="text-xs text-emerald-600 dark:text-emerald-400">{message}</span> : null}
        {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
      </div>
      <p className="text-xs text-zinc-500">
        Partial deliveries are fine — record each arrival. Rejected units are not counted as received.
      </p>
    </form>
  );
}
