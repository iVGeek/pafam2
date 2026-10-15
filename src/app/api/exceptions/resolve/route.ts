import { prisma } from "@/lib/prisma";
import type { PackagingLevel } from "@prisma/client";

export const runtime = "nodejs";

type Body = {
  issueId?: string;
  action?: "link" | "create" | "dismiss";
  internalSku?: string;
  brand?: string;
  fragranceName?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.issueId || !body.action) {
    return Response.json(
      { error: "issueId and action are required." },
      { status: 400 },
    );
  }

  const issue = await prisma.validationIssue.findUnique({
    where: { id: body.issueId },
    include: { uploadRow: { include: { offer: true } } },
  });
  if (!issue) {
    return Response.json({ error: "Issue not found." }, { status: 404 });
  }

  if (body.action === "dismiss") {
    await prisma.validationIssue.update({
      where: { id: issue.id },
      data: {
        resolved: true,
        resolvedBy: "web",
        resolvedAt: new Date(),
        resolution: "Dismissed",
      },
    });
    await prisma.auditLog.create({
      data: {
        actor: "web",
        action: "issue.dismissed",
        entityType: "ValidationIssue",
        entityId: issue.id,
      },
    });
    return Response.json({ ok: true });
  }

  const offer = issue.uploadRow?.offer;
  if (!offer) {
    return Response.json(
      { error: "This issue is not attached to an offer, so there is nothing to match." },
      { status: 400 },
    );
  }

  let productId: string;
  const internalSku = (body.internalSku ?? "").trim();

  if (body.action === "link") {
    if (!internalSku) {
      return Response.json(
        { error: "internalSku is required to link." },
        { status: 400 },
      );
    }
    const product = await prisma.product.findUnique({
      where: { internalSku },
    });
    if (!product) {
      return Response.json(
        { error: `No product master entry with SKU ${internalSku}.` },
        { status: 404 },
      );
    }
    productId = product.id;
  } else {
    // create
    if (!internalSku) {
      return Response.json(
        { error: "internalSku is required to create a product." },
        { status: 400 },
      );
    }
    const exists = await prisma.product.findUnique({
      where: { internalSku },
    });
    if (exists) {
      productId = exists.id;
    } else {
      const product = await prisma.product.create({
        data: {
          internalSku,
          brand: trimOrNull(body.brand) ?? offer.brand,
          fragranceName: trimOrNull(body.fragranceName) ?? offer.fragranceName,
        },
      });
      productId = product.id;
    }
  }

  const code = offer.originalCode;
  await prisma.barcodeAlias.upsert({
    where: {
      code_packagingLevel: {
        code,
        packagingLevel: offer.packagingLevel as PackagingLevel,
      },
    },
    update: { productId },
    create: {
      code,
      packagingLevel: offer.packagingLevel as PackagingLevel,
      productId,
      sourceValue: code,
      unitsPerCase: offer.unitsPerCase,
    },
  });

  await prisma.offer.update({
    where: { id: offer.id },
    data: { productId },
  });

  if (issue.uploadRowId) {
    await prisma.validationIssue.updateMany({
      where: { uploadRowId: issue.uploadRowId, resolved: false },
      data: {
        resolved: true,
        resolvedBy: "web",
        resolvedAt: new Date(),
        resolution:
          body.action === "link"
            ? `Linked to ${internalSku}`
            : `Product ${internalSku} created`,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actor: "web",
      action: `offer.matched.${body.action}`,
      entityType: "Offer",
      entityId: offer.id,
      after: { productId, code },
    },
  });

  return Response.json({ ok: true, productId });
}

function trimOrNull(value: unknown): string | null {
  const s = value === null || value === undefined ? "" : String(value).trim();
  return s === "" ? null : s;
}
