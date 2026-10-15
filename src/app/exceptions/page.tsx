import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ResolveControls } from "./resolve-controls";

export const dynamic = "force-dynamic";

const severityClass: Record<string, string> = {
  ERROR: "text-red-700 dark:text-red-400",
  WARNING: "text-amber-700 dark:text-amber-400",
  INFO: "text-zinc-500",
};

export default async function ExceptionsPage() {
  const issues = await prisma.validationIssue.findMany({
    where: { resolved: false },
    orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
    take: 300,
    include: {
      uploadFile: { select: { id: true, filename: true } },
      uploadRow: {
        select: {
          rowNumber: true,
          offer: {
            select: {
              brand: true,
              fragranceName: true,
              originalCode: true,
            },
          },
        },
      },
    },
  });

  const grouped = issues.reduce<Record<string, number>>((acc, i) => {
    acc[i.code] = (acc[i.code] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Exception queue
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {issues.length} unresolved issue(s). Match unmatched barcodes to the
          product master, or dismiss warnings you have reviewed.
        </p>
      </div>

      <section className="flex flex-wrap gap-3 text-sm">
        {Object.entries(grouped).map(([code, count]) => (
          <span
            key={code}
            className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-800"
          >
            {code}: <span className="font-medium">{count}</span>
          </span>
        ))}
      </section>

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">Severity</th>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Row</th>
              <th className="px-4 py-2">File</th>
              <th className="px-4 py-2">Detail</th>
              <th className="px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {issues.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Nothing to resolve. 
                </td>
              </tr>
            ) : (
              issues.map((issue) => {
                const offer = issue.uploadRow?.offer;
                const canMatch = Boolean(offer);
                return (
                  <tr
                    key={issue.id}
                    className="border-t border-zinc-100 align-top dark:border-zinc-800"
                  >
                    <td className="px-4 py-2">
                      <span
                        className={
                          severityClass[issue.severity] ?? "text-zinc-500"
                        }
                      >
                        {issue.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{issue.code}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {issue.uploadRow?.rowNumber ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/uploads/${issue.uploadFile.id}`}
                        className="underline"
                      >
                        {issue.uploadFile.filename}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <div>{issue.message}</div>
                      {offer ? (
                        <div className="mt-0.5 font-mono text-xs text-zinc-500">
                          {offer.originalCode}
                          {[offer.brand, offer.fragranceName]
                            .filter(Boolean)
                            .length > 0
                            ? ` · ${[offer.brand, offer.fragranceName]
                                .filter(Boolean)
                                .join(" ")}`
                            : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <ResolveControls
                        issueId={issue.id}
                        code={issue.code}
                        canMatch={canMatch}
                        defaultSku=""
                        defaultBrand={offer?.brand ?? ""}
                        defaultName={offer?.fragranceName ?? ""}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
