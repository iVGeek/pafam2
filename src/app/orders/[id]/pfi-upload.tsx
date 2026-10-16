"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PfiUpload({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setText(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/orders/${orderId}/pfi`, { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { error?: string; text?: string | null };
      if (!res.ok) {
        setError(json.error ?? `Upload failed (${res.status}).`);
        if (json.text) setText(json.text);
        return;
      }
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".pdf,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          type="submit"
          disabled={busy || !file}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Reading…" : "Upload PFI"}
        </button>
        <span className="text-xs text-zinc-500">PDF or Excel.</span>
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {text ? (
        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer">Show text that was read</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-zinc-100 p-2 dark:bg-zinc-950">
            {text}
          </pre>
        </details>
      ) : null}
    </form>
  );
}
