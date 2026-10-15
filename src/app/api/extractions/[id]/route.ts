import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMAND_KINDS = new Set(["PRODUCT_MENTION", "QUANTITY", "TARGET_PRICE", "DEADLINE"]);

type Body = { status?: string; reviewedBy?: string; productId?: string | null };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const status = (body.status ?? "").toUpperCase();
  if (body.status !== undefined && !["APPROVED", "REJECTED", "PENDING"].includes(status)) {
    return Response.json({ error: "status must be APPROVED, REJECTED or PENDING." }, { status: 400 });
  }

  const extraction = await prisma.noteExtraction.findUnique({
    where: { id },
    include: { note: true },
  });
  if (!extraction) return Response.json({ error: "Extraction not found." }, { status: 404 });

  const reviewedBy = body.reviewedBy?.trim() || "web";

  // Resolve a product link without changing approval status.
  if (body.status === undefined && body.productId !== undefined) {
    if (body.productId) {
      const product = await prisma.product.findUnique({ where: { id: body.productId }, select: { id: true } });
      if (!product) return Response.json({ error: "Unknown productId." }, { status: 404 });
    }
    const updated = await prisma.noteExtraction.update({
      where: { id },
      data: { productId: body.productId || null },
    });
    return Response.json({ extraction: updated });
  }

  if (status === "REJECTED") {
    const updated = await prisma.noteExtraction.update({
      where: { id },
      data: { status: "REJECTED", reviewedBy, reviewedAt: new Date() },
    });
    return Response.json({ extraction: updated });
  }

  if (status === "PENDING") {
    const updated = await prisma.noteExtraction.update({
      where: { id },
      data: { status: "PENDING", reviewedBy: null, reviewedAt: null },
    });
    return Response.json({ extraction: updated });
  }

  // APPROVED.
  if (extraction.kind === "FOLLOW_UP") {
    const task = await prisma.followUpTask.create({
      data: {
        noteId: extraction.noteId,
        customerId: extraction.note.customerId,
        title: (extraction.detail ?? extraction.excerpt).slice(0, 200),
        detail: extraction.detail ?? null,
        dueDate: extraction.dueDate ?? null,
        owner: extraction.note.staffMember ?? reviewedBy,
      },
    });
    const updated = await prisma.noteExtraction.update({
      where: { id },
      data: { status: "APPROVED", reviewedBy, reviewedAt: new Date() },
    });
    return Response.json({ extraction: updated, task });
  }

  if (DEMAND_KINDS.has(extraction.kind)) {
    if (!extraction.note.customerId) {
      return Response.json({ error: "Set the note customer before applying a demand claim." }, { status: 409 });
    }

    // Resolve the product: use the claim's own link, else another resolved
    // claim in the same note (e.g. a deadline stated on a separate line).
    let productId = extraction.productId;
    if (!productId) {
      const sibling = await prisma.noteExtraction.findFirst({
        where: { noteId: extraction.noteId, productId: { not: null }, status: { not: "REJECTED" } },
        select: { productId: true },
      });
      productId = sibling?.productId ?? null;
    }
    if (!productId) {
      return Response.json({ error: "This claim has no resolved product; link a product first." }, { status: 409 });
    }

    // Merge into a live demand only. An expired demand must not be revived by
    // a new note; a fresh demand is created instead (§20).
    const existing = await prisma.demand.findFirst({
      where: {
        customerId: extraction.note.customerId,
        productId,
        status: { in: ["WISHLIST", "REQUEST", "QUOTE", "CONFIRMED"] },
        OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
    });

    const reconfirmed = extraction.note.meetingDate ?? new Date();
    let demandId: string;

    if (existing) {
      const merged = await prisma.demand.update({
        where: { id: existing.id },
        data: {
          quantity: extraction.quantity ?? existing.quantity,
          quantityUnit: extraction.quantityUnit ?? existing.quantityUnit,
          targetPrice: extraction.targetPrice ?? existing.targetPrice,
          currency: extraction.currency ?? existing.currency,
          neededBy: extraction.neededBy ?? existing.neededBy,
          lastReconfirmed: reconfirmed,
          extractionConfidence: extraction.confidence ?? existing.extractionConfidence,
          evidence: [existing.evidence, extraction.excerpt].filter(Boolean).join(" | "),
        },
      });
      demandId = merged.id;
      await prisma.auditLog.create({
        data: { actor: reviewedBy, action: "demand.merged", entityType: "Demand", entityId: merged.id, after: { fromExtraction: id } },
      });
    } else {
      const created = await prisma.demand.create({
        data: {
          customerId: extraction.note.customerId,
          productId,
          status: "REQUEST",
          certainty: "EXACT",
          quantity: extraction.quantity ?? null,
          quantityUnit: extraction.quantityUnit ?? null,
          targetPrice: extraction.targetPrice ?? null,
          currency: extraction.currency ?? "USD",
          neededBy: extraction.neededBy ?? null,
          meetingDate: extraction.note.meetingDate ?? null,
          owner: extraction.note.staffMember ?? reviewedBy,
          evidence: extraction.excerpt,
          extractionConfidence: extraction.confidence ?? null,
          approved: false,
        },
      });
      demandId = created.id;
    }

    const updated = await prisma.noteExtraction.update({
      where: { id },
      data: { status: "APPROVED", reviewedBy, reviewedAt: new Date(), appliedDemandId: demandId, productId },
    });
    return Response.json({ extraction: updated, demandId });
  }

  // Informational claims (channel restriction, objection, competitor quote).
  const updated = await prisma.noteExtraction.update({
    where: { id },
    data: { status: "APPROVED", reviewedBy, reviewedAt: new Date() },
  });
  return Response.json({ extraction: updated });
}
