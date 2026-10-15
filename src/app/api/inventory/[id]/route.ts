import { updateInventoryItem } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const item = await updateInventoryItem(
      id,
      {
        status: typeof body.status === "string" ? body.status : undefined,
        warehouse: body.warehouse as string | null | undefined,
        territory: body.territory as string | null | undefined,
        lotRef: body.lotRef as string | null | undefined,
        quantity: (body.quantity as number | string | null) ?? undefined,
        adjustQuantity: (body.adjustQuantity as number | string | null) ?? null,
        unitCostUsd: (body.unitCostUsd as number | string | null) ?? undefined,
        notes: body.notes as string | null | undefined,
      },
      typeof body.actor === "string" ? body.actor : "web",
    );
    return Response.json({ item });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update stock." },
      { status: 400 },
    );
  }
}
