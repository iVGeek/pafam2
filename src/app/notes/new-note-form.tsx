"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: string; label: string };

export function NewNoteForm({ customers }: { customers: Option[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = "rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950";
  const label = "flex flex-col gap-1 text-sm";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(raw),
      });
      const json = (await res.json()) as { error?: string; note?: { id: string } };
      if (!res.ok) setError(json.error ?? `Failed (${res.status}).`);
      else if (json.note) {
        form.reset();
        router.push(`/notes/${json.note.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="text-sm font-medium">Add note (Plaud / reMarkable / manual)</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Paste the transcript or note text. The original is preserved verbatim and never overwritten.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Source</span>
          <select name="source" className={input} defaultValue="MANUAL">
            <option value="PLAUD">Plaud</option>
            <option value="REMARKABLE">reMarkable</option>
            <option value="MANUAL">Manual</option>
          </select>
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Customer</span>
          <select name="customerId" className={input}>
            <option value="">Unassigned</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Meeting date</span>
          <input type="date" name="meetingDate" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Staff member</span>
          <input name="staffMember" className={input} />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Filename</span>
          <input name="filename" className={input} placeholder="meeting-2026-10-10.txt" />
        </label>
        <label className={label}>
          <span className="text-zinc-600 dark:text-zinc-400">Source location</span>
          <input name="sourceLocation" className={input} placeholder="drive path / notebook ref" />
        </label>
      </div>
      <label className={`${label} mt-3`}>
        <span className="text-zinc-600 dark:text-zinc-400">Note text *</span>
        <textarea name="rawText" required rows={8} className={`${input} font-mono text-xs`} />
      </label>
      {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {busy ? "Saving…" : "Save and extract"}
      </button>
    </form>
  );
}
