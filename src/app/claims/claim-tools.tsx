"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CLAIM_TYPES = ["SHORTAGE", "DAMAGE", "QUALITY", "LATE", "RETURN", "OTHER"];

export type SupplierOption = { id: string; name: string };

export function ClaimForm({ suppliers }: { suppliers: SupplierOption[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [type, setType] = useState("SHORTAGE");
  const [units, setUnits] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supplierId) {
      setError("Choose a supplier.");
      return;
    }
    if (!description.trim()) {
      setError("Describe the claim.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          type,
          units: units || null,
          amountUsd: amountUsd || null,
          description,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to open claim.");
        return;
      }
      setUnits("");
      setAmountUsd("");
      setDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open claim.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-medium">Open a claim</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Supplier</span>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
          >
            {CLAIM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Units</span>
          <input
            type="number"
            min={0}
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Value (USD)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-zinc-500">Description</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. 12 units arrived damaged, bottle caps cracked"
          className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || suppliers.length === 0}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Saving…" : "Open claim"}
        </button>
        {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
      </div>
    </form>
  );
}

export function ClaimStatusControl({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [busy, setBusy] = useState(false);

  async function save(next: string) {
    setValue(next);
    setBusy(true);
    try {
      await fetch(`/api/claims/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => save(e.target.value)}
      className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
    >
      {["OPEN", "RESOLVED", "REJECTED"].map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
