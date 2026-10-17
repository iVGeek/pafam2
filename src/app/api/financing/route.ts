import { createFinancing, listFinancing, getFinancingSummary } from "@/lib/cashflow";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [entries, summary] = await Promise.all([listFinancing(), getFinancingSummary()]);
  return Response.json({ financing: entries, summary });
}

export async function POST(request: Request) {
  let body: {
    fromDate?: string;
    fundedDate?: string | null;
    toDate?: string | null;
    repaidDate?: string | null;
    principalUsd?: number | string;
    rateAnnual?: number | string | null;
    currency?: string | null;
    description?: string | null;
    dealId?: string | null;
    orderId?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.fromDate) return Response.json({ error: "fromDate is required." }, { status: 400 });

  try {
    const user = await getCurrentUser();
    const entry = await createFinancing({
      fromDate: body.fromDate,
      fundedDate: body.fundedDate ?? null,
      toDate: body.toDate ?? null,
      repaidDate: body.repaidDate ?? null,
      principalUsd: body.principalUsd ?? 0,
      rateAnnual: body.rateAnnual ?? null,
      currency: body.currency ?? null,
      description: body.description ?? null,
      dealId: body.dealId ?? null,
      orderId: body.orderId ?? null,
      createdBy: user?.email ?? null,
    });
    return Response.json({ financing: entry }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to record financing." },
      { status: 400 },
    );
  }
}
