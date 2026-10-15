import { prisma } from "@/lib/prisma";
import { buildQuoteWorkbook } from "@/lib/quote-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      customer: true,
      lines: { include: { product: { select: { internalSku: true } } } },
    },
  });
  if (!quote) {
    return Response.json({ error: "Quote not found." }, { status: 404 });
  }

  const buffer = await buildQuoteWorkbook({
    quoteNumber: quote.quoteNumber,
    currency: quote.currency,
    validUntil: quote.validUntil,
    paymentTerms: quote.paymentTerms,
    deliveryBasis: quote.deliveryBasis,
    destination: quote.destination,
    notes: quote.notes,
    createdAt: quote.createdAt,
    customer: {
      name: quote.customer.name,
      company: quote.customer.company,
      contactName: quote.customer.contactName,
    },
    lines: quote.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      currency: line.currency,
      product: line.product ? { internalSku: line.product.internalSku } : null,
    })),
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="quote-${quote.quoteNumber}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
