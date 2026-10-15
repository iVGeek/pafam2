import { getDeal, updateDealStatus } from "@/lib/deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const deal = await getDeal(id);
  if (!deal) return Response.json({ error: "Deal not found." }, { status: 404 });
  return Response.json({ deal });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: { status?: string; owner?: string; lostReason?: string };
  try {
    body = (await request.json()) as { status?: string; owner?: string; lostReason?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.status) {
    return Response.json({ error: "status is required." }, { status: 400 });
  }
  try {
    const deal = await updateDealStatus(id, body.status, body.owner, body.lostReason);
    return Response.json({ deal });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update deal." },
      { status: 400 },
    );
  }
}
