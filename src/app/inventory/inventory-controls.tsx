"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; label: string };

const input = "rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950";
const label = "flex flex-col gap-1 text-sm";

export function AddStockForm({ products, warehouses }: { products: Option[]; warehouses: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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
        className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Add stock
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Product *</span>
          <select name="productId" required className={input}>
            <option value="">Select…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Status</span>
          <select name="status" className={input} defaultValue="USABLE">
            <option value="USABLE">Usable</option>
            <option value="IN_TRANSIT">In transit</option>
            <option value="QUARANTINED">Quarantined</option>
            <option value="DAMAGED">Damaged</option>
          </select>
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Quantity *</span>
          <input name="quantity" required className={input} placeholder="e.g. 240" />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Warehouse</span>
          <input name="warehouse" list="warehouse-list" className={input} />
          <datalist id="warehouse-list">
            {warehouses.map((w) => (
              <option key={w} value={w} />
            ))}
          </datalist>
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Territory</span>
          <input name="territory" className={input} defaultValue="US" />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Lot reference</span>
          <input name="lotRef" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Unit cost (USD landed)</span>
          <input name="unitCostUsd" className={input} placeholder="e.g. 33.00" />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Acquired date</span>
          <input type="date" name="acquiredDate" className={input} />
        </label>
        <label className={`${label} sm:col-span-2 lg:col-span-3`}>
          <span className="text-zinc-600 dark:text-zinc-400">Notes</span>
          <input name="notes" className={input} />
        </label>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        In-transit and quarantined units are tracked but never counted as available to sell.
      </p>
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Saving…" : "Save stock"}
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

export function ReserveControl({ itemId, available }: { itemId: string; available: number }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reserve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventoryItemId: itemId, quantity }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setError(json.error ?? `Failed (${res.status}).`);
      else {
        setQuantity("");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="qty"
          className="w-20 rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
          disabled={available <= 0}
        />
        <button
          onClick={reserve}
          disabled={busy || available <= 0}
          className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Reserve
        </button>
      </div>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </div>
  );
}

export function ReservationActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "release" | "fulfil") {
    setBusy(true);
    try {
      const res = await fetch(`/api/inventory/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <button
        onClick={() => act("fulfil")}
        disabled={busy}
        className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 disabled:opacity-50 dark:bg-emerald-950 dark:text-emerald-300"
      >
        Fulfil
      </button>
      <button
        onClick={() => act("release")}
        disabled={busy}
        className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300"
      >
        Release
      </button>
    </div>
  );
}
