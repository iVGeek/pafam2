import { prisma } from "@/lib/prisma";
import { createReservation } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const reservations = await prisma.inventoryReservation.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      inventoryItem: {
        include: { product: { select: { internalSku: true, brand: true, fragranceName: true } } },
      },
      customer: { select: { name: true } },
    },
  });
  return Response.json({ reservations });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const reservation = await createReservation(
      {
        inventoryItemId: typeof body.inventoryItemId === "string" ? body.inventoryItemId : undefined,
        quantity: (body.quantity as number | string | null) ?? null,
        demandId: (body.demandId as string | null) ?? null,
        dealId: (body.dealId as string | null) ?? null,
        customerId: (body.customerId as string | null) ?? null,
        note: (body.note as string | null) ?? null,
        createdBy: (body.createdBy as string | null) ?? null,
      },
      typeof body.actor === "string" ? body.actor : "web",
    );
    return Response.json({ reservation }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to reserve stock." },
      { status: 400 },
    );
  }
}
