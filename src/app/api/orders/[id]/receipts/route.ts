import { prisma } from "@/lib/prisma";
import { getOrderReceipts, createReceipt, orderFillRate } from "@/lib/receipts";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const receipts = await getOrderReceipts(id);
  return Response.json({ receipts });
}

type ReceiptLineBody = {
  orderLineId?: string;
  receivedUnits?: number | string;
  rejectedUnits?: number | string;
  notes?: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

  let body: {
    receiptDate?: string;
    expectedDate?: string | null;
    reference?: string | null;
    carrier?: string | null;
    notes?: string | null;
    lines?: ReceiptLineBody[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.receiptDate) {
    return Response.json({ error: "receiptDate is required." }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return Response.json({ error: "At least one receipt line is required." }, { status: 400 });
  }

  const lineIds = new Set(order.lines.map((l) => l.id));
  for (const l of body.lines) {
    if (!l.orderLineId || !lineIds.has(l.orderLineId)) {
      return Response.json({ error: "Every receipt line must reference a line on this order." }, { status: 400 });
    }
  }

  try {
    const user = await getCurrentUser();
    const receipt = await createReceipt({
      orderId: id,
      receiptDate: body.receiptDate,
      expectedDate: body.expectedDate ?? null,
      reference: body.reference ?? null,
      carrier: body.carrier ?? null,
      notes: body.notes ?? null,
      receivedBy: user?.email ?? null,
      lines: body.lines.map((l) => ({
        orderLineId: l.orderLineId,
        receivedUnits: l.receivedUnits ?? 0,
        rejectedUnits: l.rejectedUnits ?? 0,
        notes: l.notes ?? null,
      })),
    });

    const receipts = await getOrderReceipts(id);
    const orderedUnits = order.lines.reduce((s, l) => s + l.units, 0);
    const summary = orderFillRate(orderedUnits, receipts);
    return Response.json({ receipt, orderFillRate: summary }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to record receipt." },
      { status: 400 },
    );
  }
}
