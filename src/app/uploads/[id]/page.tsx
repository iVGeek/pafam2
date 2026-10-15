import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UploadDetailPage({
  params,
}: PageProps<"/uploads/[id]">) {
  const { id } = await params;

  const upload = await prisma.uploadFile.findUnique({
    where: { id },
    include: {
      supplier: { select: { name: true } },
      issues: { orderBy: { createdAt: "asc" } },
      rows: {
        orderBy: { rowNumber: "asc" },
        take: 500,
        include: {
          issues: true,
          offer: {
            include: {
              product: { select: { internalSku: true, fragranceName: true } },
            },
          },
        },
      },
    },
  });

  if (!upload) notFound();

  const fileIssues = upload.issues.filter((i) => !i.uploadRowId);
  const cleanedCount = upload.rows.reduce(
    (sum, row) => sum + row.issues.filter((i) => i.code === "CLEANED").length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/uploads" className="text-sm underline">
          ← Uploads
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {upload.filename}
          </h1>
          <a
            href={`/api/uploads/${upload.id}/cleaned`}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
          >
            Download cleaned file
          </a>
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {upload.status} · {upload.message}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Cleaned automatically on import to match the template format
          {cleanedCount > 0 ? ` — ${cleanedCount} value(s) normalised.` : "."}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
          <Info label="Rows" value={upload.rowCount} />
          <Info label="Valid" value={upload.validRows} />
          <Info label="Problems" value={upload.invalidRows} />
          <Info
            label="Imported"
            value={upload.createdAt.toISOString().slice(0, 16).replace("T", " ")}
          />
        </dl>
      </div>

      {fileIssues.length > 0 ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950">
          <h2 className="font-medium">File-level warnings</h2>
          <ul className="mt-2 list-disc pl-5">
            {fileIssues.map((i) => (
              <li key={i.id}>{i.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-3 py-2">Row</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Brand / Name</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2">Matched product</th>
              <th className="px-4 py-2">Issues</th>
            </tr>
          </thead>
          <tbody>
            {upload.rows.map((row) => {
              const raw = (row.rawJson ?? {}) as Record<string, string>;
              return (
                <tr
                  key={row.id}
                  className="border-t border-zinc-100 align-top dark:border-zinc-800"
                >
                  <td className="px-4 py-2 tabular-nums">{row.rowNumber}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        row.status === "OK"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : row.status === "DUPLICATE"
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-red-700 dark:text-red-400"
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {raw.original_code || raw.internal_sku || "—"}
                  </td>
                  <td className="px-4 py-2">
                    {[raw.brand, raw.fragrance_name]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {raw.price || "—"}
                  </td>
                  <td className="px-4 py-2">
                    {row.offer?.product
                      ? `${row.offer.product.internalSku}${
                          row.offer.product.fragranceName
                            ? ` — ${row.offer.product.fragranceName}`
                            : ""
                        }`
                      : row.offer
                        ? "Unmatched"
                        : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {row.issues.length === 0 ? (
                      <span className="text-zinc-400">none</span>
                    ) : (
                      <ul className="list-disc pl-4 text-xs">
                        {row.issues.map((i) => (
                          <li
                            key={i.id}
                            className={
                              i.severity === "ERROR"
                                ? "text-red-700 dark:text-red-400"
                                : i.severity === "WARNING"
                                  ? "text-amber-700 dark:text-amber-400"
                                  : "text-zinc-500"
                            }
                          >
                            {i.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
