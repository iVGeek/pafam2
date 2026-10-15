import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { dateStr } from "@/lib/format";
import { NewTaskForm, TaskToggle } from "./task-controls";

export const dynamic = "force-dynamic";

function isOverdue(status: string, dueDate: Date | null): boolean {
  if (status !== "OPEN" || !dueDate) return false;
  return dueDate.getTime() < new Date().getTime();
}

export default async function TasksPage() {
  const [tasks, customers] = await Promise.all([
    prisma.followUpTask.findMany({
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 300,
      include: {
        customer: { select: { name: true } },
        note: { select: { id: true } },
      },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Follow-up tasks</h1>
        <p className="text-xs text-zinc-500">{tasks.filter((t) => t.status === "OPEN").length} open</p>
      </div>

      <NewTaskForm customers={customers.map((c) => ({ id: c.id, label: c.name }))} />

      {tasks.length === 0 ? (
        <p className="text-sm text-zinc-500">No tasks yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Task</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-900">
              {tasks.map((t) => {
                const overdue = isOverdue(t.status, t.dueDate);
                return (
                  <tr key={t.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-1.5">
                      <div>{t.title}</div>
                      {t.detail ? <div className="text-xs text-zinc-500">{t.detail}</div> : null}
                    </td>
                    <td className="px-4 py-1.5">{t.customer?.name ?? "—"}</td>
                    <td className="px-4 py-1.5">{t.owner ?? "—"}</td>
                    <td className={`px-4 py-1.5 ${overdue ? "font-medium text-red-600 dark:text-red-400" : ""}`}>
                      {t.dueDate ? dateStr(t.dueDate) : "—"}
                      {overdue ? " (overdue)" : ""}
                    </td>
                    <td className="px-4 py-1.5">
                      {t.note ? (
                        <Link className="text-blue-600 hover:underline dark:text-blue-400" href={`/notes/${t.note.id}`}>
                          Note
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-1.5">
                      <TaskToggle taskId={t.id} status={t.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
