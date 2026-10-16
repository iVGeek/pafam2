import { prisma } from "@/lib/prisma";
import { buildReceiptTemplateWorkbook } from "@/lib/receipt-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { lines: { orderBy: { createdAt: "asc" } } },
  });
  if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

  const buffer = await buildReceiptTemplateWorkbook(
    order.reference,
    order.lines.map((l) => ({
      code: l.originalCode,
      label:
        [l.brand, l.fragranceName, l.concentration].filter(Boolean).join(" ") +
        (l.sizeMl ? ` ${l.sizeMl}ml` : "") || "Unnamed line",
      orderedUnits: l.units,
    })),
  );

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="receipt-${order.reference}.xlsx"`,
    },
  });
}
