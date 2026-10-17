import { createInvoice, listInvoices, getOutstandingSummary } from "@/lib/cashflow";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const [invoices, outstanding] = await Promise.all([
    listInvoices({
      type: params.get("type") ?? undefined,
      includeClosed: params.get("includeClosed") === "true",
    }),
    getOutstandingSummary(),
  ]);
  return Response.json({ invoices, outstanding });
}

export async function POST(request: Request) {
  let body: {
    type?: string | null;
    orderId?: string | null;
    quoteId?: string | null;
    dealId?: string | null;
    reference?: string | null;
    currency?: string | null;
    total?: number | string;
    dueDate?: string | null;
    issueDate?: string | null;
    notes?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    const invoice = await createInvoice({
      type: body.type ?? null,
      orderId: body.orderId ?? null,
      quoteId: body.quoteId ?? null,
      dealId: body.dealId ?? null,
      reference: body.reference ?? null,
      currency: body.currency ?? null,
      total: body.total ?? 0,
      dueDate: body.dueDate ?? null,
      issueDate: body.issueDate ?? null,
      notes: body.notes ?? null,
      createdBy: user?.email ?? null,
    });
    return Response.json({ invoice }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create invoice." },
      { status: 400 },
    );
  }
}
