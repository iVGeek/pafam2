import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const tasks = await prisma.followUpTask.findMany({
    where: status && ["OPEN", "DONE", "CANCELLED"].includes(status) ? { status: status as "OPEN" | "DONE" | "CANCELLED" } : undefined,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      customer: { select: { name: true } },
      note: { select: { id: true, source: true } },
      demand: { select: { id: true, status: true } },
    },
  });
  return Response.json({ tasks });
}

type Body = {
  title?: string;
  detail?: string;
  dueDate?: string;
  owner?: string;
  customerId?: string;
  demandId?: string;
  noteId?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) return Response.json({ error: "title is required." }, { status: 400 });

  let dueDate: Date | null = null;
  if (body.dueDate) {
    dueDate = new Date(body.dueDate);
    if (Number.isNaN(dueDate.getTime())) return Response.json({ error: "dueDate must be a valid date." }, { status: 400 });
  }

  const task = await prisma.followUpTask.create({
    data: {
      title,
      detail: body.detail?.trim() || null,
      dueDate,
      owner: body.owner?.trim() || null,
      customerId: body.customerId?.trim() || null,
      demandId: body.demandId?.trim() || null,
      noteId: body.noteId?.trim() || null,
    },
  });

  await prisma.auditLog.create({
    data: { actor: "web", action: "task.created", entityType: "FollowUpTask", entityId: task.id, after: { title } },
  });

  return Response.json({ task }, { status: 201 });
}
