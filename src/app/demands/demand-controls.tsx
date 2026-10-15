"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; label: string };

const STATUSES = ["WISHLIST", "REQUEST", "QUOTE", "CONFIRMED", "FULFILLED", "LOST", "EXPIRED"];

export function NewDemandForm({
  customers,
  products,
}: {
  customers: Option[];
  products: Option[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const input =
    "rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950";
  const label = "flex flex-col gap-1 text-sm";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...raw,
          certainty: raw.certainty === "INFERRED" ? "INFERRED" : "EXACT",
          approved: false,
        }),
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
        New demand
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
          <span className="text-zinc-600 dark:text-zinc-400">Customer *</span>
          <select name="customerId" required className={input}>
            <option value="">Select…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Status</span>
          <select name="status" className={input} defaultValue="REQUEST">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Certainty</span>
          <select name="certainty" className={input} defaultValue="EXACT">
            <option value="EXACT">Explicit requirement</option>
            <option value="INFERRED">Inferred interest</option>
          </select>
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Product (optional)</span>
          <select name="productId" className={input}>
            <option value="">Unlinked</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Barcode (EAN/UPC as text)</span>
          <input name="barcode" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Brand</span>
          <input name="brand" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Fragrance</span>
          <input name="fragranceName" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Size (ml)</span>
          <input name="sizeMl" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Quantity</span>
          <input name="quantity" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Target price</span>
          <input name="targetPrice" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Currency</span>
          <input name="currency" className={input} defaultValue="USD" />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Needed by</span>
          <input type="date" name="neededBy" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Expiry</span>
          <input type="date" name="expiryDate" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Owner</span>
          <input name="owner" className={input} />
        </label>
        <label className={`${label} sm:col-span-2 lg:col-span-3`}>
          <span className="text-zinc-600 dark:text-zinc-400">Evidence / source excerpt</span>
          <input name="evidence" className={input} />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Saving…" : "Save demand"}
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

export function DemandApproveButton({
  demandId,
  approved,
}: {
  demandId: string;
  approved: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await fetch(`/api/demands/${demandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: !approved, approvedBy: "web" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded px-2 py-0.5 text-xs disabled:opacity-50 ${
        approved
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {approved ? "Approved" : "Approve"}
    </button>
  );
}
