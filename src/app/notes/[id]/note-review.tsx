"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; label: string };

export type ExtractionView = {
  id: string;
  kind: string;
  status: string;
  productText: string | null;
  productId: string | null;
  quantity: string | null;
  quantityUnit: string | null;
  targetPrice: string | null;
  currency: string | null;
  neededBy: string | null;
  detail: string | null;
  excerpt: string;
  confidence: number | null;
  appliedDemandId: string | null;
};

const KIND_LABEL: Record<string, string> = {
  PRODUCT_MENTION: "Product mention",
  QUANTITY: "Quantity",
  TARGET_PRICE: "Target price",
  DEADLINE: "Deadline",
  CHANNEL_RESTRICTION: "Channel restriction",
  OBJECTION: "Objection",
  COMPETITOR_QUOTE: "Competitor quote",
  FOLLOW_UP: "Follow-up",
};

function StatusPill({ status }: { status: string }) {
  const style =
    status === "APPROVED"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      : status === "REJECTED"
        ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  return <span className={`rounded px-1.5 py-0.5 text-xs ${style}`}>{status}</span>;
}

export function NoteReview({
  noteId,
  noteCustomerId,
  noteStatus,
  extractions,
  customers,
  products,
}: {
  noteId: string;
  noteCustomerId: string | null;
  noteStatus: string;
  extractions: ExtractionView[];
  customers: Option[];
  products: Option[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = "rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  async function call(key: string, url: string, body: object, method = "PATCH") {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? `Failed (${res.status}).`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Customer (required to apply claims)</span>
          <select
            className={input}
            value={noteCustomerId ?? ""}
            disabled={busy === "customer"}
            onChange={(e) => call("customer", `/api/notes/${noteId}`, { customerId: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Note status</span>
          <select
            className={input}
            value={noteStatus}
            disabled={busy === "status"}
            onChange={(e) => call("status", `/api/notes/${noteId}`, { status: e.target.value })}
          >
            <option value="RECEIVED">Received</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <button
          onClick={() => call("extract", `/api/notes/${noteId}`, { action: "extract" })}
          disabled={busy === "extract"}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
        >
          {busy === "extract" ? "Extracting…" : "Re-run extraction"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {extractions.length === 0 ? (
        <p className="text-sm text-zinc-500">No claims extracted yet.</p>
      ) : (
        <ul className="space-y-2">
          {extractions.map((x) => (
            <li key={x.id} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{KIND_LABEL[x.kind] ?? x.kind}</span>
                <StatusPill status={x.status} />
                {x.confidence !== null ? <span className="text-xs text-zinc-500">confidence {x.confidence}</span> : null}
                {x.appliedDemandId ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">linked to demand</span>
                ) : null}
              </div>

              <p className="mt-1.5 border-l-2 border-zinc-300 pl-2 text-xs italic text-zinc-500 dark:border-zinc-700">
                {x.excerpt}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                {x.productText ? <span>Product: {x.productText}</span> : null}
                {x.quantity ? <span>Qty: {x.quantity} {x.quantityUnit ?? ""}</span> : null}
                {x.targetPrice ? <span>Target: {x.currency ?? "USD"} {x.targetPrice}</span> : null}
                {x.neededBy ? <span>Needed by: {x.neededBy.slice(0, 10)}</span> : null}
                {x.detail ? <span>{x.detail}</span> : null}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {x.status !== "APPROVED" ? (
                  <button
                    onClick={() => call(`a${x.id}`, `/api/extractions/${x.id}`, { status: "APPROVED" })}
                    disabled={busy === `a${x.id}`}
                    className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                ) : null}
                {x.status !== "REJECTED" ? (
                  <button
                    onClick={() => call(`r${x.id}`, `/api/extractions/${x.id}`, { status: "REJECTED" })}
                    disabled={busy === `r${x.id}`}
                    className="rounded bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Reject
                  </button>
                ) : null}
                {x.status !== "PENDING" ? (
                  <button
                    onClick={() => call(`p${x.id}`, `/api/extractions/${x.id}`, { status: "PENDING" })}
                    disabled={busy === `p${x.id}`}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
                  >
                    Reset
                  </button>
                ) : null}

                {["PRODUCT_MENTION", "QUANTITY", "TARGET_PRICE", "DEADLINE"].includes(x.kind) ? (
                  <select
                    className="rounded border border-zinc-300 px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                    value={x.productId ?? ""}
                    disabled={busy === `l${x.id}`}
                    onChange={(e) => call(`l${x.id}`, `/api/extractions/${x.id}`, { productId: e.target.value || null })}
                  >
                    <option value="">Link product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
