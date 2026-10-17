import { listInvoicePayments, recordInvoicePayment } from "@/lib/cashflow";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payments = await listInvoicePayments(id);
  return Response.json({ payments });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: {
    amount?: number | string;
    paidDate?: string | null;
    fxRate?: number | string | null;
    reference?: string | null;
    method?: string | null;
    notes?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    const result = await recordInvoicePayment(id, {
      amount: body.amount ?? 0,
      paidDate: body.paidDate ?? null,
      fxRate: body.fxRate ?? null,
      reference: body.reference ?? null,
      method: body.method ?? null,
      notes: body.notes ?? null,
      createdBy: user?.email ?? null,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to record payment." },
      { status: 400 },
    );
  }
}
