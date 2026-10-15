import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["DRAFT", "APPROVED", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"];

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: { include: { product: { select: { internalSku: true } } } },
    },
  });
  if (!quote) return Response.json({ error: "Quote not found." }, { status: 404 });
  return Response.json({ quote });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: { status?: string; approvedBy?: string };
  try {
    body = (await request.json()) as { status?: string; approvedBy?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.status || !STATUSES.includes(body.status.toUpperCase())) {
    return Response.json({ error: `status must be one of ${STATUSES.join(", ")}.` }, { status: 400 });
  }
  const status = body.status.toUpperCase();
  const quote = await prisma.quote.update({
    where: { id },
    data: {
      status: status as "DRAFT" | "APPROVED" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED",
      approvedBy: status === "APPROVED" ? (body.approvedBy ?? "web") : undefined,
      approvedAt: status === "APPROVED" ? new Date() : undefined,
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: body.approvedBy ?? "web",
      action: "quote.status_changed",
      entityType: "Quote",
      entityId: id,
      after: { status },
    },
  });

  return Response.json({ quote });
}
