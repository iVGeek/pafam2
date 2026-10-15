import { execSync } from "node:child_process";
import ExcelJS from "exceljs";
import { DATABASE_URL, startDb } from "./dev-db.mjs";
import { COLUMNS } from "../src/lib/columns";

const env = { ...process.env, DATABASE_URL };

function run(cmd: string) {
  execSync(cmd, { stdio: "inherit", env, cwd: process.cwd() });
}

async function buildSampleWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Offers");
  sheet.addRow(COLUMNS.map((c) => c.header));
  const col = (header: string) =>
    COLUMNS.findIndex((c) => c.header === header) + 1;
  const set = (row: number, header: string, value: unknown) => {
    sheet.getCell(row, col(header)).value = value as never;
  };

  // Row 2 — clean, valid EAN-13, matches a product we create below.
  set(2, "Barcode / Code", "4006381333931");
  set(2, "Supplier", "Pilot Supplier LLC");
  set(2, "Brand", "Dior");
  set(2, "Fragrance / Product Name", "Sauvage");
  set(2, "Concentration", "EDP");
  set(2, "Size (ml)", 100);
  set(2, "Price", 55.5);
  set(2, "Currency", "USD");
  set(2, "Available Quantity", 120);
  set(2, "Packaging Level", "UNIT");
  set(2, "List Date", "2026-10-01");

  // Row 3 — bad check digit (should be an ERROR).
  set(3, "Barcode / Code", "1234567890123");
  set(3, "Supplier", "Pilot Supplier LLC");
  set(3, "Price", 40);
  set(3, "Currency", "USD");
  set(3, "Available Quantity", 10);
  set(3, "Packaging Level", "UNIT");

  // Row 4 — CASE with no price basis / units-per-case (WARNING).
  set(4, "Barcode / Code", "4006381333931");
  set(4, "Supplier", "Pilot Supplier LLC");
  set(4, "Price", 480);
  set(4, "Currency", "USD");
  set(4, "Available Quantity", 5);
  set(4, "Packaging Level", "CASE");

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function main() {
  const pg = await startDb({ log: console.log });
  try {
    run("npx prisma migrate deploy");
    run("npx tsx prisma/seed.ts");

    // Set the env BEFORE importing anything that instantiates a PrismaClient.
    process.env.DATABASE_URL = DATABASE_URL;
    const { importOffersWorkbook } = await import("../src/lib/ingest");
    const { prisma } = await import("../src/lib/prisma");
    const { analyzeCode } = await import("../src/lib/gtin");

    console.log("\nGTIN check:", analyzeCode("4006381333931"));

    await prisma.product.upsert({
      where: { internalSku: "DIOR-SAUVAGE-EDP-100" },
      update: {},
      create: {
        internalSku: "DIOR-SAUVAGE-EDP-100",
        gtin14: "04006381333931",
        brand: "Dior",
        fragranceName: "Sauvage",
        concentration: "EDP",
        sizeMl: 100,
      },
    });

    const buffer = await buildSampleWorkbook();

    console.log("\n=== Import #1 ===");
    console.log(
      await importOffersWorkbook(buffer, {
        filename: "pilot-offers.xlsx",
        uploadedBy: "verify-script",
      }),
    );

    console.log("\n=== Import #2 (same file — should be DUPLICATE) ===");
    console.log(
      await importOffersWorkbook(buffer, {
        filename: "pilot-offers.xlsx",
        uploadedBy: "verify-script",
      }),
    );

    const [products, offers, uploads, openIssues] = await Promise.all([
      prisma.product.count(),
      prisma.offer.count(),
      prisma.uploadFile.count(),
      prisma.validationIssue.count({ where: { resolved: false } }),
    ]);

    const matches = await prisma.offer.findMany({
      where: { productId: { not: null } },
      include: { product: { select: { internalSku: true } }, supplier: true },
    });
    const issues = await prisma.validationIssue.findMany({
      include: { uploadRow: { select: { rowNumber: true } } },
      orderBy: { createdAt: "asc" },
    });

    console.log("\n=== Database state ===");
    console.log({
      products,
      offers,
      uploads,
      openIssues,
      matchedOffers: matches.map((m) => ({
        sku: m.product?.internalSku,
        supplier: m.supplier.name,
        price: m.price?.toString(),
        currency: m.currency,
        packaging: m.packagingLevel,
      })),
      issues: issues.map((i) => ({
        row: i.uploadRow?.rowNumber ?? null,
        code: i.code,
        severity: i.severity,
      })),
    });

    await prisma.$disconnect();
  } finally {
    await pg.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
