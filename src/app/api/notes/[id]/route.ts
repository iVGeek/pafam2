import { prisma } from "@/lib/prisma";
import { extractNote } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await prisma.note.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      extractions: { orderBy: { createdAt: "asc" } },
      tasks: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!note) return Response.json({ error: "Note not found." }, { status: 404 });
  return Response.json({ note });
}

type Body = {
  status?: string;
  customerId?: string | null;
  meetingDate?: string | null;
  staffMember?: string | null;
  summary?: string | null;
  action?: string;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return Response.json({ error: "Note not found." }, { status: 404 });

  if (body.action === "extract") {
    const created = await extractNote(id);
    return Response.json({ extractionsCreated: created });
  }

  const data: Record<string, unknown> = {};
  if (body.status) {
    if (!["RECEIVED", "REVIEWED", "ARCHIVED"].includes(body.status)) {
      return Response.json({ error: "Invalid status." }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.customerId !== undefined) {
    if (body.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: body.customerId }, select: { id: true } });
      if (!customer) return Response.json({ error: "Unknown customerId." }, { status: 404 });
      data.customerId = body.customerId;
    } else {
      data.customerId = null;
    }
  }
  if (body.meetingDate !== undefined) {
    if (body.meetingDate) {
      const d = new Date(body.meetingDate);
      if (Number.isNaN(d.getTime())) return Response.json({ error: "Invalid meetingDate." }, { status: 400 });
      data.meetingDate = d;
    } else {
      data.meetingDate = null;
    }
  }
  if (body.staffMember !== undefined) data.staffMember = body.staffMember?.trim() || null;
  if (body.summary !== undefined) data.summary = body.summary?.trim() || null;

  const updated = await prisma.note.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: { actor: "web", action: "note.updated", entityType: "Note", entityId: id, after: data as object },
  });
  return Response.json({ note: updated });
}
