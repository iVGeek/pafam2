import { listCashFlows, recordCashFlow, isCashFlowType } from "@/lib/cashflow";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const flows = await listCashFlows({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    type: params.get("type") ?? undefined,
    dealId: params.get("dealId") ?? undefined,
    orderId: params.get("orderId") ?? undefined,
  });
  return Response.json({ cashFlows: flows });
}

export async function POST(request: Request) {
  let body: {
    date?: string;
    type?: string;
    amountUsd?: number | string;
    currency?: string | null;
    fxRate?: number | string | null;
    dealId?: string | null;
    orderId?: string | null;
    invoiceId?: string | null;
    reference?: string | null;
    note?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.date) return Response.json({ error: "date is required." }, { status: 400 });
  if (!isCashFlowType(body.type)) {
    return Response.json({ error: `Unknown cash-flow type: ${body.type ?? "(none)"}.` }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    const flow = await recordCashFlow({
      date: body.date,
      type: body.type,
      amountUsd: body.amountUsd ?? 0,
      currency: body.currency ?? null,
      fxRate: body.fxRate ?? null,
      dealId: body.dealId ?? null,
      orderId: body.orderId ?? null,
      invoiceId: body.invoiceId ?? null,
      reference: body.reference ?? null,
      note: body.note ?? null,
      createdBy: user?.email ?? null,
    });
    return Response.json({ cashFlow: flow }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to record cash flow." },
      { status: 400 },
    );
  }
}
