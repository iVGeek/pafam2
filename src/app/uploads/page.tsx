import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  VALIDATED:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  DUPLICATE: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  PENDING: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
};

export default async function UploadsPage() {
  const uploads = await prisma.uploadFile.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { supplier: { select: { name: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Uploads</h1>
      <UploadForm />

      <section className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">File</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Rows</th>
              <th className="px-4 py-2 text-right">Valid</th>
              <th className="px-4 py-2 text-right">Problems</th>
              <th className="px-4 py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {uploads.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-zinc-500"
                >
                  No uploads yet. Import your first offers file above.
                </td>
              </tr>
            ) : (
              uploads.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/uploads/${u.id}`}
                      className="font-medium underline"
                    >
                      {u.filename}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        statusStyles[u.status] ?? statusStyles.PENDING
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {u.rowCount}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {u.validRows}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {u.invalidRows}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {u.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
