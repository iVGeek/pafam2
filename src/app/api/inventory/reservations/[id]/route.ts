import { fulfilReservation, releaseReservation } from "@/lib/inventory";

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

  const action = typeof body.action === "string" ? body.action.toLowerCase() : "";
  const actor = typeof body.actor === "string" ? body.actor : "web";
  try {
    if (action === "release") {
      const reservation = await releaseReservation(id, actor);
      return Response.json({ reservation });
    }
    if (action === "fulfil" || action === "fulfill") {
      const reservation = await fulfilReservation(id, actor);
      return Response.json({ reservation });
    }
    return Response.json({ error: 'action must be "release" or "fulfil".' }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update reservation." },
      { status: 400 },
    );
  }
}
