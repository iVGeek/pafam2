import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    take: 200,
    include: { _count: { select: { demands: true, deals: true, quotes: true } } },
  });
  return Response.json({ customers });
}

type Body = {
  name?: string;
  company?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  destinationCountry?: string;
  destinationCity?: string;
  channels?: string;
  accountOwner?: string;
  currency?: string;
  paymentTerms?: string;
  creditLimit?: number | string | null;
  notes?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return Response.json({ error: "name is required." }, { status: 400 });

  const existing = await prisma.customer.findUnique({ where: { name } });
  if (existing) {
    return Response.json({ error: `Customer "${name}" already exists.` }, { status: 409 });
  }

  const creditLimit =
    body.creditLimit === null || body.creditLimit === undefined || body.creditLimit === ""
      ? null
      : Number(body.creditLimit);

  const customer = await prisma.customer.create({
    data: {
      name,
      company: emptyToNull(body.company),
      contactName: emptyToNull(body.contactName),
      contactEmail: emptyToNull(body.contactEmail),
      contactPhone: emptyToNull(body.contactPhone),
      destinationCountry: emptyToNull(body.destinationCountry),
      destinationCity: emptyToNull(body.destinationCity),
      channels: emptyToNull(body.channels),
      accountOwner: emptyToNull(body.accountOwner),
      currency: (body.currency ?? "USD").toUpperCase(),
      paymentTerms: emptyToNull(body.paymentTerms),
      creditLimit: Number.isFinite(creditLimit) ? creditLimit : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: "web",
      action: "customer.created",
      entityType: "Customer",
      entityId: customer.id,
      after: { name },
    },
  });

  return Response.json({ customer }, { status: 201 });
}

function emptyToNull(value: unknown): string | null {
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s === "" ? null : s;
}
