import { createOrder, listOrders, type CreateOrderInput } from "@/lib/orders";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const orders = await listOrders();
  return Response.json({ orders });
}

export async function POST(request: Request) {
  let body: CreateOrderInput;
  try {
    body = (await request.json()) as CreateOrderInput;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.supplierId) {
    return Response.json({ error: "supplierId is required." }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return Response.json({ error: "At least one order line is required." }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    const order = await createOrder({
      ...body,
      createdBy: body.createdBy ?? user?.email ?? null,
    });
    return Response.json({ order }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to create order." },
      { status: 400 },
    );
  }
}
