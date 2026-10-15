import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["PUBLIC_RETAIL", "WHOLESALE_SALE", "OTHER"] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const prices = await prisma.marketPrice.findMany({
    where: productId ? { productId } : undefined,
    orderBy: { observedDate: "desc" },
    take: 500,
  });
  return Response.json({ prices });
}

type Body = {
  productId?: string;
  kind?: string;
  price?: number | string;
  currency?: string;
  observedDate?: string;
  source?: string | null;
  territory?: string | null;
  note?: string | null;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const productId = (body.productId ?? "").trim();
  const kind = (body.kind ?? "PUBLIC_RETAIL").trim().toUpperCase();
  const price = Number(body.price);
  const currency = (body.currency ?? "USD").trim().toUpperCase();
  const observedDate = body.observedDate ? new Date(body.observedDate) : new Date();

  if (!productId) return Response.json({ error: "productId is required." }, { status: 400 });
  if (!(KINDS as readonly string[]).includes(kind)) {
    return Response.json({ error: `kind must be one of ${KINDS.join(", ")}.` }, { status: 400 });
  }
  if (!Number.isFinite(price) || price <= 0) {
    return Response.json({ error: "price must be a positive number." }, { status: 400 });
  }
  if (Number.isNaN(observedDate.getTime())) {
    return Response.json({ error: "observedDate must be a valid date." }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return Response.json({ error: "Unknown productId." }, { status: 404 });

  const record = await prisma.marketPrice.create({
    data: {
      productId,
      kind: kind as (typeof KINDS)[number],
      price,
      currency,
      observedDate,
      source: body.source?.trim() || null,
      territory: body.territory?.trim() || null,
      note: body.note?.trim() || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: "web",
      action: "marketPrice.created",
      entityType: "MarketPrice",
      entityId: record.id,
      after: { productId, kind, price, currency, observedDate: observedDate.toISOString() },
    },
  });

  return Response.json({ price: record }, { status: 201 });
}
