import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { dateStr } from "@/lib/format";
import { NewNoteForm } from "./new-note-form";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const [notes, customers] = await Promise.all([
    prisma.note.findMany({
      orderBy: [{ meetingDate: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        customer: { select: { name: true } },
        _count: { select: { extractions: true, tasks: true } },
      },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Notes</h1>

      <NewNoteForm customers={customers.map((c) => ({ id: c.id, label: c.name }))} />

      {notes.length === 0 ? (
        <p className="text-sm text-zinc-500">No notes captured yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Meeting</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Staff</th>
                <th className="px-4 py-2 text-right font-medium">Claims</th>
                <th className="px-4 py-2 text-right font-medium">Tasks</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-900">
              {notes.map((n) => (
                <tr key={n.id} className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60">
                  <td className="px-4 py-1.5">
                    <Link className="text-blue-600 hover:underline dark:text-blue-400" href={`/notes/${n.id}`}>
                      {dateStr(n.meetingDate ?? n.createdAt)}
                    </Link>
                  </td>
                  <td className="px-4 py-1.5">{n.customer?.name ?? "Unassigned"}</td>
                  <td className="px-4 py-1.5">{n.source}</td>
                  <td className="px-4 py-1.5">{n.staffMember ?? "—"}</td>
                  <td className="px-4 py-1.5 text-right">{n._count.extractions}</td>
                  <td className="px-4 py-1.5 text-right">{n._count.tasks}</td>
                  <td className="px-4 py-1.5">{n.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
