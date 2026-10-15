import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const customerId = url.searchParams.get("customerId");

  const where: Prisma.DemandWhereInput = {};
  if (status) where.status = status.toUpperCase() as Prisma.DemandWhereInput["status"];
  if (customerId) where.customerId = customerId;

  const demands = await prisma.demand.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      customer: { select: { name: true } },
      product: { select: { internalSku: true, brand: true, fragranceName: true } },
    },
  });
  return Response.json({ demands });
}

type Body = {
  customerId?: string;
  status?: string;
  certainty?: string;
  productId?: string | null;
  barcode?: string | null;
  internalSku?: string | null;
  brand?: string | null;
  fragranceName?: string | null;
  concentration?: string | null;
  sizeMl?: number | string | null;
  packagingRequirement?: string | null;
  quantity?: number | string | null;
  quantityUnit?: string | null;
  targetPrice?: number | string | null;
  currency?: string;
  deliveryBasis?: string | null;
  destination?: string | null;
  neededBy?: string | null;
  paymentTerms?: string | null;
  evidence?: string | null;
  meetingDate?: string | null;
  owner?: string | null;
  extractionConfidence?: number | string | null;
  matchConfidence?: number | string | null;
  approved?: boolean;
  expiryDate?: string | null;
};

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
  const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
  if (!customer) {
    return Response.json({ error: "Customer not found." }, { status: 404 });
  }

  const status = (body.status ?? "WISHLIST").toUpperCase();

  const demand = await prisma.demand.create({
    data: {
      customerId: body.customerId,
      status: (["WISHLIST", "REQUEST", "QUOTE", "CONFIRMED", "FULFILLED", "LOST", "EXPIRED"].includes(status)
        ? status
        : "WISHLIST") as Prisma.DemandCreateInput["status"],
      certainty: body.certainty === "INFERRED" ? "INFERRED" : "EXACT",
      productId: body.productId ?? null,
      barcode: emptyToNull(body.barcode),
      internalSku: emptyToNull(body.internalSku),
      brand: emptyToNull(body.brand),
      fragranceName: emptyToNull(body.fragranceName),
      concentration: emptyToNull(body.concentration),
      sizeMl: toInt(body.sizeMl),
      packagingRequirement: emptyToNull(body.packagingRequirement),
      quantity: toNumber(body.quantity),
      quantityUnit: emptyToNull(body.quantityUnit),
      targetPrice: toNumber(body.targetPrice),
      currency: (body.currency ?? "USD").toUpperCase(),
      deliveryBasis: emptyToNull(body.deliveryBasis),
      destination: emptyToNull(body.destination),
      neededBy: toDate(body.neededBy),
      paymentTerms: emptyToNull(body.paymentTerms),
      evidence: emptyToNull(body.evidence),
      meetingDate: toDate(body.meetingDate),
      owner: emptyToNull(body.owner),
      extractionConfidence: toInt(body.extractionConfidence),
      matchConfidence: toInt(body.matchConfidence),
      approved: body.approved === true,
      expiryDate: toDate(body.expiryDate),
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: body.owner ?? "web",
      action: "demand.created",
      entityType: "Demand",
      entityId: demand.id,
      after: { customerId: body.customerId, status },
    },
  });

  return Response.json({ demand }, { status: 201 });
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toInt(value: number | string | null | undefined): number | null {
  const n = toNumber(value);
  return n === null ? null : Math.trunc(n);
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function emptyToNull(value: unknown): string | null {
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s === "" ? null : s;
}
