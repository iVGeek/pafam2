import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["WISHLIST", "REQUEST", "QUOTE", "CONFIRMED", "FULFILLED", "LOST", "EXPIRED"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: { status?: string; approved?: boolean; approvedBy?: string };
  try {
    body = (await request.json()) as { status?: string; approved?: boolean; approvedBy?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const data: Prisma.DemandUpdateInput = {};
  if (body.status) {
    const status = body.status.toUpperCase();
    if (!STATUSES.includes(status)) {
      return Response.json({ error: `Unknown status: ${body.status}` }, { status: 400 });
    }
    data.status = status as Prisma.DemandUpdateInput["status"];
  }
  if (typeof body.approved === "boolean") {
    data.approved = body.approved;
    data.approvedBy = body.approved ? (body.approvedBy ?? "web") : null;
    data.lastReconfirmed = body.approved ? new Date() : undefined;
  }

  const demand = await prisma.demand.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      actor: body.approvedBy ?? "web",
      action: "demand.updated",
      entityType: "Demand",
      entityId: id,
      after: { status: data.status ?? null, approved: data.approved ?? null },
    },
  });

  return Response.json({ demand });
}
