import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

function toInt(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const limit = toInt(params.get("limit") ?? undefined, DEFAULT_LIMIT, MAX_LIMIT);
  const cursor = params.get("cursor");

  const where: Prisma.AuditLogWhereInput = {};
  const entityType = params.get("entityType");
  const actor = params.get("actor");
  const action = params.get("action");
  const q = params.get("q");

  if (entityType) where.entityType = entityType;
  if (actor) where.actor = { contains: actor, mode: "insensitive" };
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { entityType: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { actor: { contains: q, mode: "insensitive" } },
      { details: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;

  return Response.json({
    entries,
    nextCursor: hasMore ? entries[entries.length - 1]?.id : null,
  });
}
