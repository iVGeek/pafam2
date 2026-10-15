"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ImportResult = {
  uploadId?: string;
  status?: string;
  rowCount?: number;
  validRows?: number;
  invalidRows?: number;
  duplicateRows?: number;
  matchedRows?: number;
  unmatchedRows?: number;
  duplicateOf?: string | null;
  message?: string;
  error?: string;
};

export function UploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        body: data,
      });
      const json = (await res.json()) as ImportResult;
      if (!res.ok) {
        setError(json.error ?? `Upload failed (${res.status}).`);
      } else {
        setResult(json);
        form.reset();
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-medium">Import an offers file</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Use the <a className="underline" href="/api/template">published template</a>.
        Re-uploading the same file will not create duplicate records.
      </p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xlsm"
          required
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </form>

      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800">
          <p className="font-medium">{result.message}</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Rows: {result.rowCount} · valid {result.validRows} · invalid{" "}
            {result.invalidRows} · duplicate {result.duplicateRows} · matched{" "}
            {result.matchedRows} · unmatched {result.unmatchedRows}
          </p>
          {result.uploadId && result.duplicateOf === null ? (
            <a
              className="mt-1 inline-block underline"
              href={`/uploads/${result.uploadId}`}
            >
              View this import
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
