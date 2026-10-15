import { createInventoryItem, getInventorySummary, listInventory } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [items, summary] = await Promise.all([listInventory(), getInventorySummary()]);
  return Response.json({ items, summary });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const item = await createInventoryItem(
      {
        productId: typeof body.productId === "string" ? body.productId : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
        warehouse: (body.warehouse as string | null) ?? null,
        territory: (body.territory as string | null) ?? null,
        lotRef: (body.lotRef as string | null) ?? null,
        batchRef: (body.batchRef as string | null) ?? null,
        quantity: (body.quantity as number | string | null) ?? null,
        unitCostUsd: (body.unitCostUsd as number | string | null) ?? null,
        acquiredDate: (body.acquiredDate as string | null) ?? null,
        dealId: (body.dealId as string | null) ?? null,
        notes: (body.notes as string | null) ?? null,
      },
      typeof body.actor === "string" ? body.actor : "web",
    );
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to add stock." },
      { status: 400 },
    );
  }
}
