// Verifies §18 exposure caps: commitment grouped by SKU/brand/supplier/customer,
// speculative exposure (spend without approved demand backing), cap comparison,
// the EXPOSURE_CAP alert, and cap parsing/resolution.
// Run: npx tsx scripts/verify-exposure.ts   (requires the dev DB running)
import { loadEnvFile } from "node:process";

try {
  loadEnvFile();
} catch {}

let failures = 0;
function assert(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}

const stamp = Date.now();

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getExposure, parseExposureCaps, resolveCap } = await import("../src/lib/exposure");
  const { computeAlerts } = await import("../src/lib/alerts");

  // --- Pure parsing/resolution checks ---
  const parsed = parseExposureCaps({ sku: { X: 100 }, defaults: { sku: 5 } });
  assert("cap override parsed", resolveCap(parsed, "sku", "X") === 100);
  assert("cap default applied", resolveCap(parsed, "sku", "Y") === 5);
  assert("missing dimension defaults to 0", resolveCap(parsed, "brand", "Z") === 0);
  assert("empty object parses to no caps", resolveCap(parseExposureCaps(null), "supplier", "S") === 0);

  // --- Data set-up ---
  const now = new Date();
  const sku1 = `VERIFY-EXP-A-${stamp}`;
  const sku2 = `VERIFY-EXP-B-${stamp}`;
  const brand1 = `ExpBrand-A-${stamp}`;
  const brand2 = `ExpBrand-B-${stamp}`;
  const supName = `ExpSupplier ${stamp}`;
  const custName = `ExpCustomer ${stamp}`;

  const p1 = await prisma.product.create({ data: { internalSku: sku1, brand: brand1 } });
  const p2 = await prisma.product.create({ data: { internalSku: sku2, brand: brand2 } });
  const supplier = await prisma.supplier.create({ data: { name: supName } });
  const customer = await prisma.customer.create({ data: { name: custName } });

  // Approved open demand backs p1 (customer + product).
  await prisma.demand.create({
    data: {
      customerId: customer.id,
      productId: p1.id,
      status: "REQUEST",
      approved: true,
      quantity: 100,
      targetPrice: 50,
      currency: "USD",
    },
  });

  const mkDeal = (
    productId: string,
    customerId: string | null,
    cash: number,
    status: "DRAFT" | "REVIEWED" | "APPROVED",
  ) =>
    prisma.deal.create({
      data: {
        status,
        supplierId: supplier.id,
        productId,
        customerId,
        quantity: 100,
        buyCurrency: "USD",
        buyPrice: 10,
        cashRequirement: cash,
        createdAt: now,
      },
    });

  await mkDeal(p1.id, customer.id, 5000, "APPROVED"); // backed (pair)
  await mkDeal(p1.id, null, 1000, "REVIEWED"); // backed (product-level demand)
  await mkDeal(p2.id, null, 3000, "DRAFT"); // speculative (no demand for p2)

  // No caps yet -> nothing over cap.
  await prisma.setting.deleteMany({ where: { key: "exposure_caps" } });
  const before = await getExposure(now);
  const sku1Before = before.rows.find((r) => r.dimension === "sku" && r.key === sku1);
  const sku2Before = before.rows.find((r) => r.dimension === "sku" && r.key === sku2);
  assert("SKU1 committed is 6000", sku1Before?.committedUsd === 6000);
  assert("SKU1 speculative is 0 (demand-backed)", sku1Before?.speculativeUsd === 0);
  assert("SKU2 committed is 3000", sku2Before?.committedUsd === 3000);
  assert("SKU2 speculative is 3000", sku2Before?.speculativeUsd === 3000);
  assert("no cap -> SKU1 not over", sku1Before?.overCap === false);

  // Supplier groups both deals.
  const supRow = before.rows.find((r) => r.dimension === "supplier" && r.key === supName);
  assert("supplier committed is 9000", supRow?.committedUsd === 9000);
  assert("supplier speculative is 3000", supRow?.speculativeUsd === 3000);

  // Now set caps and re-check.
  await prisma.setting.create({
    data: {
      key: "exposure_caps",
      value: { sku: {}, brand: {}, supplier: {}, customer: {}, defaults: { sku: 5000, brand: 0, supplier: 8000, customer: 0 } },
      updatedBy: "verify",
    },
  });
  const after = await getExposure(now);
  const sku1After = after.rows.find((r) => r.dimension === "sku" && r.key === sku1);
  const sku2After = after.rows.find((r) => r.dimension === "sku" && r.key === sku2);
  const supAfter = after.rows.find((r) => r.dimension === "supplier" && r.key === supName);
  assert("SKU1 over cap (6000 > 5000)", sku1After?.overCap === true);
  assert("SKU2 within cap (3000 < 5000)", sku2After?.overCap === false);
  assert("supplier over cap (9000 > 8000)", supAfter?.overCap === true);
  assert("over-cap rows sort first", after.rows[0]?.overCap === true);

  // Alerts should surface the over-cap supplier.
  const alerts = await computeAlerts(now);
  assert(
    "EXPOSURE_CAP alert raised for supplier",
    alerts.some((a) => a.type === "EXPOSURE_CAP" && a.id === `exposure:supplier:${supName}`),
  );

  // --- Clean-up ---
  await prisma.setting.deleteMany({ where: { key: "exposure_caps" } });
  await prisma.deal.deleteMany({ where: { supplierId: supplier.id } });
  await prisma.demand.deleteMany({ where: { productId: { in: [p1.id, p2.id] } } });
  await prisma.product.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
  await prisma.customer.delete({ where: { id: customer.id } });
  await prisma.supplier.delete({ where: { id: supplier.id } });

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
