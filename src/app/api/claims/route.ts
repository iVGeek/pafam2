import { prisma } from "@/lib/prisma";
import { listClaims, createClaim } from "@/lib/receipts";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supplierId = new URL(request.url).searchParams.get("supplierId") ?? undefined;
  const claims = await listClaims(supplierId ?? undefined);
  return Response.json({ claims });
}

export async function POST(request: Request) {
  let body: {
    supplierId?: string;
    orderId?: string | null;
    receiptId?: string | null;
    type?: string | null;
    units?: number | string | null;
    amountUsd?: number | string | null;
    description?: string;
    openedDate?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.supplierId) {
    return Response.json({ error: "supplierId is required." }, { status: 400 });
  }
  const supplier = await prisma.supplier.findUnique({ where: { id: body.supplierId } });
  if (!supplier) return Response.json({ error: "Supplier not found." }, { status: 404 });
  if (!body.description || !body.description.trim()) {
    return Response.json({ error: "A claim needs a description." }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    const claim = await createClaim({
      supplierId: body.supplierId,
      orderId: body.orderId ?? null,
      receiptId: body.receiptId ?? null,
      type: body.type ?? null,
      units: body.units ?? null,
      amountUsd: body.amountUsd ?? null,
      description: body.description,
      openedDate: body.openedDate ?? null,
      createdBy: user?.email ?? null,
    });
    return Response.json({ claim }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to open claim." },
      { status: 400 },
    );
  }
}
