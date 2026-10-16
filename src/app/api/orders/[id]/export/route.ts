import { getOrder } from "@/lib/orders";
import { buildOrderWorkbook } from "@/lib/order-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const order = await getOrder(id);
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  const buffer = await buildOrderWorkbook({
    reference: order.reference,
    status: order.status,
    currency: order.currency ?? "USD",
    fxRate: order.fxRate ? Number(order.fxRate) : null,
    incoterm: order.incoterm,
    notes: order.notes,
    createdAt: order.createdAt,
    supplier: { name: order.supplier.name, country: order.supplier.country },
    lines: order.lines.map((l) => ({
      originalCode: l.originalCode,
      brand: l.brand,
      fragranceName: l.fragranceName,
      concentration: l.concentration,
      sizeMl: l.sizeMl,
      packagingLevel: l.packagingLevel,
      unitsPerCase: l.unitsPerCase,
      cases: l.cases,
      units: l.units,
      unitCost: l.unitCost,
      notes: l.notes,
    })),
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${order.reference}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
