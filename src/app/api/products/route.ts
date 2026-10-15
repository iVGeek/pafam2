import { prisma } from "@/lib/prisma";
import { analyzeCode } from "@/lib/gtin";

export const runtime = "nodejs";

export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: { internalSku: "asc" },
    take: 200,
    include: { _count: { select: { aliases: true, offers: true } } },
  });
  return Response.json({ products });
}

type Body = {
  internalSku?: string;
  barcode?: string;
  brand?: string;
  fragranceName?: string;
  concentration?: string;
  sizeMl?: number | string;
  genderOrCategory?: string;
  setContents?: string;
  notes?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const internalSku = (body.internalSku ?? "").trim();
  if (!internalSku) {
    return Response.json(
      { error: "internalSku is required." },
      { status: 400 },
    );
  }

  const existing = await prisma.product.findUnique({
    where: { internalSku },
  });
  if (existing) {
    return Response.json(
      { error: `A product with SKU ${internalSku} already exists.` },
      { status: 409 },
    );
  }

  const code = analyzeCode(body.barcode);
  const sizeMl =
    body.sizeMl === undefined || body.sizeMl === ""
      ? null
      : Number(body.sizeMl);

  const product = await prisma.product.create({
    data: {
      internalSku,
      gtin14: code.isValidGtin ? code.gtin14 : null,
      brand: emptyToNull(body.brand),
      fragranceName: emptyToNull(body.fragranceName),
      concentration: emptyToNull(body.concentration),
      sizeMl: Number.isFinite(sizeMl) ? sizeMl : null,
      genderOrCategory: emptyToNull(body.genderOrCategory),
      setContents: emptyToNull(body.setContents),
      notes: emptyToNull(body.notes),
      aliases:
        code.raw === ""
          ? undefined
          : {
              create: {
                code: code.raw,
                codeType: "EAN",
                packagingLevel: "UNIT",
                sourceValue: code.raw,
              },
            },
    },
  });

  await prisma.auditLog.create({
    data: {
      actor: "web",
      action: "product.created",
      entityType: "Product",
      entityId: product.id,
      after: { internalSku, barcode: code.raw, gtin14: product.gtin14 },
    },
  });

  return Response.json({ product }, { status: 201 });
}

function emptyToNull(value: unknown): string | null {
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s === "" ? null : s;
}
