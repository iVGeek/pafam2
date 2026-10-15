import { listDeals, saveDeal, type SaveDealPayload } from "@/lib/deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const deals = await listDeals();
  return Response.json({ deals });
}

export async function POST(request: Request) {
  let body: SaveDealPayload;
  try {
    body = (await request.json()) as SaveDealPayload;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.supplierId) {
    return Response.json({ error: "supplierId is required." }, { status: 400 });
  }
  if (!(Number(body.quantity) > 0)) {
    return Response.json({ error: "quantity must be greater than zero." }, { status: 400 });
  }

  try {
    const { deal, result } = await saveDeal(body);
    return Response.json({ deal, result }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save deal." },
      { status: 400 },
    );
  }
}
