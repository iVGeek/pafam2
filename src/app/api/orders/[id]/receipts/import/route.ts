import { prisma } from "@/lib/prisma";
import { importReceiptWorkbook } from "@/lib/receipts";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const order = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Attach the receipt as 'file'." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const user = await getCurrentUser();
    const summary = await importReceiptWorkbook(id, buffer, {
      receivedBy: user?.email ?? null,
      reference: (form.get("reference") as string | null) || null,
    });
    return Response.json({ summary }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not import the receipt." },
      { status: 400 },
    );
  }
}
