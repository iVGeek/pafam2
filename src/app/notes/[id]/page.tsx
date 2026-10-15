import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dateStr } from "@/lib/format";
import { NoteReview, type ExtractionView } from "./note-review";

export const dynamic = "force-dynamic";

export default async function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await prisma.note.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      extractions: { orderBy: { createdAt: "asc" } },
      tasks: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!note) notFound();

  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.findMany({
      orderBy: { internalSku: "asc" },
      take: 500,
      select: { id: true, internalSku: true, brand: true, fragranceName: true },
    }),
  ]);

  const extractions: ExtractionView[] = note.extractions.map((x) => ({
    id: x.id,
    kind: x.kind,
    status: x.status,
    productText: x.productText,
    productId: x.productId,
    quantity: x.quantity === null ? null : String(x.quantity),
    quantityUnit: x.quantityUnit,
    targetPrice: x.targetPrice === null ? null : String(x.targetPrice),
    currency: x.currency,
    neededBy: x.neededBy ? x.neededBy.toISOString() : null,
    detail: x.detail,
    excerpt: x.excerpt,
    confidence: x.confidence,
    appliedDemandId: x.appliedDemandId,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Note · {note.customer?.name ?? "Unassigned"}</h1>
        <p className="text-xs text-zinc-500">
          {note.source} · meeting {dateStr(note.meetingDate ?? note.createdAt)}
          {note.staffMember ? ` · ${note.staffMember}` : ""}
          {note.filename ? ` · ${note.filename}` : ""}
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium">Original note (preserved verbatim)</h2>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-3 font-mono text-xs dark:bg-zinc-950">
          {note.rawText}
        </pre>
        {note.sourceLocation ? (
          <p className="mt-2 text-xs text-zinc-500">Source location: {note.sourceLocation}</p>
        ) : null}
      </section>

      <NoteReview
        noteId={note.id}
        noteCustomerId={note.customer?.id ?? null}
        noteStatus={note.status}
        extractions={extractions}
        customers={customers.map((c) => ({ id: c.id, label: c.name }))}
        products={products.map((p) => ({
          id: p.id,
          label: `${p.internalSku}${p.fragranceName ? ` · ${p.fragranceName}` : p.brand ? ` · ${p.brand}` : ""}`,
        }))}
      />

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-medium">Follow-up tasks from this note</h2>
        {note.tasks.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">None yet. Approve a follow-up claim to create one.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {note.tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 border-b border-zinc-100 py-1 dark:border-zinc-800">
                <span>{t.title}</span>
                <span className="text-xs text-zinc-500">
                  {t.status}
                  {t.dueDate ? ` · due ${dateStr(t.dueDate)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link className="mt-2 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400" href="/tasks">
          All tasks
        </Link>
      </section>
    </div>
  );
}
