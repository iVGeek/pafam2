import { prisma } from "@/lib/prisma";
import { extractNote } from "@/lib/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES = ["PLAUD", "REMARKABLE", "MANUAL"] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const notes = await prisma.note.findMany({
    where: source && (SOURCES as readonly string[]).includes(source) ? { source: source as (typeof SOURCES)[number] } : undefined,
    orderBy: [{ meetingDate: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      customer: { select: { name: true } },
      _count: { select: { extractions: true, tasks: true } },
    },
  });
  return Response.json({ notes });
}

type Body = {
  source?: string;
  customerId?: string;
  meetingDate?: string;
  staffMember?: string;
  filename?: string;
  sourceLocation?: string;
  rawText?: string;
  summary?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawText = (body.rawText ?? "").trim();
  if (!rawText) return Response.json({ error: "rawText is required." }, { status: 400 });

  const source = (body.source ?? "MANUAL").toUpperCase();
  if (!(SOURCES as readonly string[]).includes(source)) {
    return Response.json({ error: `source must be one of ${SOURCES.join(", ")}.` }, { status: 400 });
  }

  const customerId: string | null = body.customerId?.trim() || null;
  if (customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) return Response.json({ error: "Unknown customerId." }, { status: 404 });
  }

  const meetingDate = body.meetingDate ? new Date(body.meetingDate) : null;
  if (meetingDate && Number.isNaN(meetingDate.getTime())) {
    return Response.json({ error: "meetingDate must be a valid date." }, { status: 400 });
  }

  const note = await prisma.note.create({
    data: {
      source: source as (typeof SOURCES)[number],
      customerId,
      meetingDate,
      staffMember: body.staffMember?.trim() || null,
      filename: body.filename?.trim() || null,
      sourceLocation: body.sourceLocation?.trim() || null,
      summary: body.summary?.trim() || null,
      rawText,
    },
  });

  const created = await extractNote(note.id);

  await prisma.auditLog.create({
    data: { actor: "web", action: "note.created", entityType: "Note", entityId: note.id, after: { source, extractions: created } },
  });

  return Response.json({ note, extractionsCreated: created }, { status: 201 });
}
