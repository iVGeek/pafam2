import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { status?: string; title?: string; detail?: string | null; owner?: string | null; dueDate?: string | null };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const existing = await prisma.followUpTask.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Task not found." }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!["OPEN", "DONE", "CANCELLED"].includes(body.status)) {
      return Response.json({ error: "Invalid status." }, { status: 400 });
    }
    data.status = body.status;
    data.completedAt = body.status === "DONE" ? new Date() : null;
  }
  if (body.title !== undefined) {
    const t = body.title.trim();
    if (!t) return Response.json({ error: "title cannot be empty." }, { status: 400 });
    data.title = t;
  }
  if (body.detail !== undefined) data.detail = body.detail?.trim() || null;
  if (body.owner !== undefined) data.owner = body.owner?.trim() || null;
  if (body.dueDate !== undefined) {
    if (body.dueDate) {
      const d = new Date(body.dueDate);
      if (Number.isNaN(d.getTime())) return Response.json({ error: "Invalid dueDate." }, { status: 400 });
      data.dueDate = d;
    } else {
      data.dueDate = null;
    }
  }

  const task = await prisma.followUpTask.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: { actor: "web", action: "task.updated", entityType: "FollowUpTask", entityId: id, after: data as object },
  });
  return Response.json({ task });
}
