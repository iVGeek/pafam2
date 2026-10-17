import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

type Search = {
  entityType?: string;
  actor?: string;
  action?: string;
  q?: string;
  limit?: string;
};

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

function toInt(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function stamp(value: Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function pretty(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function Chip({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "blue" | "amber" }) {
  const tones = {
    zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  } as const;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { entityType, actor, action, q, limit } = await searchParams;
  const take = toInt(limit, DEFAULT_LIMIT, MAX_LIMIT);

  const where: Prisma.AuditLogWhereInput = {};
  if (entityType) where.entityType = entityType;
  if (actor) where.actor = { contains: actor, mode: "insensitive" };
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { entityType: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { actor: { contains: q, mode: "insensitive" } },
      { details: { contains: q, mode: "insensitive" } },
    ];
  }

  const [entries, entityTypes, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    }),
    prisma.auditLog.findMany({
      distinct: ["entityType"],
      orderBy: { entityType: "asc" },
      select: { entityType: true },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Immutable record of every sensitive change: who did it, when, and the before and after
            values. The log is append-only — entries are never edited or deleted.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {total.toLocaleString("en-US")} {total === 1 ? "entry" : "entries"}
            {Object.keys(where).length > 0 ? " matching current filters" : ""} · showing{" "}
            {entries.length}
          </p>
        </div>
      <SearchBar placeholder="Search…" />
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Entity type
          <select
            name="entityType"
            defaultValue={entityType ?? ""}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All</option>
            {entityTypes.map((e) => (
              <option key={e.entityType} value={e.entityType}>
                {e.entityType}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Action
          <input
            name="action"
            defaultValue={action ?? ""}
            placeholder="e.g. order.created"
            className="w-44 rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Actor
          <input
            name="actor"
            defaultValue={actor ?? ""}
            className="w-36 rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>

        <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-500">
          Search
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="action, entity id, details…"
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Rows
          <select
            name="limit"
            defaultValue={String(take)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {[100, 250, 500].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Filter
        </button>
      </form>

      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No audit entries{Object.keys(where).length > 0 ? " match these filters" : " yet"}.
        </p>
      ) : (
        <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Actor</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Entity</th>
                <th className="px-4 py-2">Details</th>
                <th className="px-4 py-2">Change</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const before = pretty(e.before);
                const after = pretty(e.after);
                return (
                  <tr key={e.id} className="border-t border-zinc-100 align-top dark:border-zinc-800">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs tabular-nums">
                      {stamp(e.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-xs">{e.actor ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Chip tone="blue">{e.action}</Chip>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-xs">{e.entityType}</div>
                      {e.entityId ? (
                        <div className="font-mono text-[11px] text-zinc-500">{e.entityId}</div>
                      ) : null}
                    </td>
                    <td className="max-w-sm px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {e.details ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      {before || after ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer select-none text-zinc-500">
                            view
                          </summary>
                          <div className="mt-2 space-y-2">
                            {before ? (
                              <div>
                                <Chip tone="amber">before</Chip>
                                <pre className="mt-1 max-w-xs overflow-x-auto rounded bg-zinc-50 p-2 text-[11px] dark:bg-zinc-900">
                                  {before}
                                </pre>
                              </div>
                            ) : null}
                            {after ? (
                              <div>
                                <Chip>after</Chip>
                                <pre className="mt-1 max-w-xs overflow-x-auto rounded bg-zinc-50 p-2 text-[11px] dark:bg-zinc-900">
                                  {after}
                                </pre>
                              </div>
                            ) : null}
                          </div>
                        </details>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {entries.length >= take ? (
        <p className="text-xs text-zinc-500">
          Showing the first {take} of {total.toLocaleString("en-US")} entries — narrow the filters
          to see older ones.
        </p>
      ) : null}
    </div>
  );
}
