import { updateClaimStatus } from "@/lib/receipts";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.status) {
    return Response.json({ error: "status is required." }, { status: 400 });
  }
  try {
    const user = await getCurrentUser();
    const claim = await updateClaimStatus(id, body.status, user?.email ?? null);
    return Response.json({ claim });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update claim." },
      { status: 400 },
    );
  }
}
