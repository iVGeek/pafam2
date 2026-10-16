import {
  getOrder,
  updateOrderStatus,
  updateOrderExpectedDate,
  orderTotals,
  computePfiVariance,
} from "@/lib/orders";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const order = await getOrder(id);
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }
  const totals = orderTotals(order.lines, order.fxRate ? Number(order.fxRate) : null);
  const latestPfi = order.pfiDocuments[0] ?? null;
  const variance = latestPfi
    ? computePfiVariance(order.lines, latestPfi.lines)
    : null;
  return Response.json({ order, totals, variance });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: { status?: string; expectedDate?: string | null };
  try {
    body = (await request.json()) as { status?: string; expectedDate?: string | null };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.status && body.expectedDate === undefined) {
    return Response.json({ error: "status or expectedDate is required." }, { status: 400 });
  }
  try {
    const user = await getCurrentUser();
    let order = null;
    if (body.status) order = await updateOrderStatus(id, body.status, user?.email ?? null);
    if (body.expectedDate !== undefined) {
      order = await updateOrderExpectedDate(id, body.expectedDate, user?.email ?? null);
    }
    return Response.json({ order });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update order." },
      { status: 400 },
    );
  }
}
