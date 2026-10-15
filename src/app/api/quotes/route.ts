import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const quotes = await prisma.quote.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      customer: { select: { name: true } },
      _count: { select: { lines: true } },
    },
  });
  return Response.json({ quotes });
}

type LineInput = {
  dealId?: string | null;
  productId?: string | null;
  description?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  currency?: string;
};

type Body = {
  customerId?: string;
  validUntil?: string | null;
  paymentTerms?: string | null;
  deliveryBasis?: string | null;
  destination?: string | null;
  notes?: string | null;
  owner?: string | null;
  lines?: LineInput[];
};

async function nextQuoteNumber(): Promise<string> {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const start = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const count = await prisma.quote.count({ where: { createdAt: { gte: start } } });
  return `Q-${stamp}-${String(count + 1).padStart(3, "0")}`;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.customerId) {
    return Response.json({ error: "customerId is required." }, { status: 400 });
  }
  const lines = (body.lines ?? []).filter((l) => l.description && Number(l.quantity) > 0);
  if (lines.length === 0) {
    return Response.json({ error: "At least one quote line is required." }, { status: 400 });
  }

  const quoteNumber = await nextQuoteNumber();
  const quote = await prisma.quote.create({
    data: {
      quoteNumber,
      customerId: body.customerId,
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      paymentTerms: body.paymentTerms ?? null,
      deliveryBasis: body.deliveryBasis ?? null,
      destination: body.destination ?? null,
      notes: body.notes ?? null,
      owner: body.owner ?? null,
      lines: {
        create: lines.map((line) => ({
          dealId: line.dealId ?? null,
          productId: line.productId ?? null,
          description: String(line.description),
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice ?? 0),
          currency: (line.currency ?? "USD").toUpperCase(),
        })),
      },
    },
    include: { lines: true },
  });

  await prisma.auditLog.create({
    data: {
      actor: body.owner ?? "web",
      action: "quote.created",
      entityType: "Quote",
      entityId: quote.id,
      after: { quoteNumber, lines: lines.length },
    },
  });

  return Response.json({ quote }, { status: 201 });
}
