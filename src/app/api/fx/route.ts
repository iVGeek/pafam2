import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rates = await prisma.fxRate.findMany({
    orderBy: [{ baseCurrency: "asc" }, { rateDate: "desc" }],
    take: 200,
  });
  const latest = new Map<string, (typeof rates)[number]>();
  for (const rate of rates) {
    if (!latest.has(rate.baseCurrency)) latest.set(rate.baseCurrency, rate);
  }
  return Response.json({
    rates,
    latest: Array.from(latest.values()),
  });
}

type Body = {
  baseCurrency?: string;
  quoteCurrency?: string;
  rate?: number | string;
  rateDate?: string;
  source?: string | null;
  booked?: boolean;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const baseCurrency = (body.baseCurrency ?? "").trim().toUpperCase();
  const quoteCurrency = (body.quoteCurrency ?? "USD").trim().toUpperCase();
  const rate = Number(body.rate);
  const rateDate = body.rateDate ? new Date(body.rateDate) : null;

  if (!baseCurrency) return Response.json({ error: "baseCurrency is required." }, { status: 400 });
  if (!Number.isFinite(rate) || rate <= 0) {
    return Response.json({ error: "rate must be a positive number (USD per 1 unit)." }, { status: 400 });
  }
  if (!rateDate || Number.isNaN(rateDate.getTime())) {
    return Response.json({ error: "rateDate must be a valid date." }, { status: 400 });
  }

  const source = body.source?.trim() ? body.source.trim() : null;

  const existing = await prisma.fxRate.findFirst({
    where: { baseCurrency, quoteCurrency, rateDate, source },
  });

  const record = existing
    ? await prisma.fxRate.update({
        where: { id: existing.id },
        data: { rate, booked: Boolean(body.booked) },
      })
    : await prisma.fxRate.create({
        data: { baseCurrency, quoteCurrency, rate, rateDate, source, booked: Boolean(body.booked) },
      });

  await prisma.auditLog.create({
    data: {
      actor: "web",
      action: existing ? "fx.updated" : "fx.created",
      entityType: "FxRate",
      entityId: record.id,
      after: { baseCurrency, quoteCurrency, rate, rateDate: rateDate.toISOString(), source },
    },
  });

  return Response.json({ rate: record }, { status: existing ? 200 : 201 });
}
