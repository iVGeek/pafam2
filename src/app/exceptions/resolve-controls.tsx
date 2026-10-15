"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResolveControls({
  issueId,
  code,
  canMatch,
  defaultSku,
  defaultBrand,
  defaultName,
}: {
  issueId: string;
  code: string;
  canMatch: boolean;
  defaultSku: string;
  defaultBrand: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [sku, setSku] = useState(defaultSku);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "link" | "create" | "dismiss") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/exceptions/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId,
          action,
          internalSku: sku,
          brand: defaultBrand,
          fragranceName: defaultName,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status}).`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  if (code === "UNMATCHED_PRODUCT" && canMatch) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Internal SKU"
            className="w-32 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            onClick={() => act("link")}
            disabled={busy || !sku}
            className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Link
          </button>
          <button
            onClick={() => act("create")}
            disabled={busy || !sku}
            className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
          >
            Create
          </button>
        </div>
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
      </div>
    );
  }

  return (
    <button
      onClick={() => act("dismiss")}
      disabled={busy}
      className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
    >
      Dismiss
    </button>
  );
}
