import { prisma } from "@/lib/prisma";
import { getOrder, computePfiVariance } from "@/lib/orders";
import { parsePfi } from "@/lib/pfi";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Attach the PFI as 'file'." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parsePfi(buffer, file.name);
  } catch (error) {
    return Response.json(
      {
        error: `Could not read the PFI: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      },
      { status: 400 },
    );
  }

  if (parsed.lines.length === 0) {
    return Response.json(
      { error: "No line items were recognised in the file.", text: parsed.text ?? null },
      { status: 422 },
    );
  }

  const user = await getCurrentUser();
  const doc = await prisma.pfiDocument.create({
    data: {
      orderId: id,
      filename: file.name,
      sourceType: parsed.sourceType,
      lineCount: parsed.lines.length,
      createdBy: user?.email ?? null,
      lines: {
        create: parsed.lines.map((l) => ({
          originalCode: l.originalCode,
          brand: l.brand,
          name: l.name,
          unitPrice: l.unitPrice,
          currency: l.currency,
          quantity: l.quantity,
          unitsPerCase: l.unitsPerCase,
          rawText: l.rawText,
        })),
      },
    },
    include: { lines: true },
  });

  await prisma.auditLog.create({
    data: {
      actor: user?.email ?? "web",
      action: "order.pfi_uploaded",
      entityType: "PfiDocument",
      entityId: doc.id,
      after: {
        order: order.reference,
        filename: file.name,
        sourceType: parsed.sourceType,
        lines: parsed.lines.length,
      },
    },
  });

  const variance = computePfiVariance(order.lines, doc.lines);
  const full = await getOrder(id);
  return Response.json({ order: full, variance }, { status: 201 });
}
