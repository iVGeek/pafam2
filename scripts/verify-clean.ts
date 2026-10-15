// Verifies the auto-clean pipeline: supplier header aliases map onto template
// keys, values are normalised into the canonical vocabulary, cleaning is
// audited, and the cleaned pricelist re-exports in the template layout.
// Run: npx tsx scripts/verify-clean.ts (requires the dev DB running)
import { loadEnvFile } from "node:process";
import ExcelJS from "exceljs";

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
  const {
    matchHeader,
    cleanConcentration,
    cleanCurrency,
    cleanPackagingLevel,
    cleanSizeMl,
    cleanNumber,
    cleanBoolean,
    cleanRow,
  } = await import("../src/lib/clean");
  const { buildOffersWorkbook, parseOffersWorkbook } = await import("../src/lib/excel");
  const { importOffersWorkbook } = await import("../src/lib/ingest");

  // --- Header aliasing ---
  assert("'Unit Price' -> price", matchHeader("Unit Price") === "price");
  assert("'Qty' -> available_quantity", matchHeader("Qty") === "available_quantity");
  assert("'EAN' -> original_code", matchHeader("EAN") === "original_code");
  assert("'House' -> brand", matchHeader("House") === "brand");
  assert("'Description' -> fragrance_name", matchHeader("Description") === "fragrance_name");
  assert("'Volume' -> size_ml", matchHeader("Volume") === "size_ml");
  assert("'CCY' -> currency", matchHeader("CCY") === "currency");
  assert("'Packaging' -> packaging_level", matchHeader("Packaging") === "packaging_level");
  assert("canonical 'Barcode / Code' still maps", matchHeader("Barcode / Code") === "original_code");
  assert("unknown header stays unknown", matchHeader("Totally Made Up Column") === null);

  // --- Value cleaners ---
  assert("'Eau de Parfum' -> EDP", cleanConcentration("Eau de Parfum") === "EDP");
  assert("'eau de toilette' -> EDT", cleanConcentration("eau de toilette") === "EDT");
  assert("'$' -> USD", cleanCurrency("$") === "USD");
  assert("'£' -> GBP", cleanCurrency("£") === "GBP");
  assert("'Bottle' -> UNIT", cleanPackagingLevel("Bottle") === "UNIT");
  assert("'Carton' -> CASE", cleanPackagingLevel("Carton") === "CASE");
  assert("'Gift Set' -> GIFT_SET", cleanPackagingLevel("Gift Set") === "GIFT_SET");
  assert("'3.4 oz' -> ~101 ml", cleanSizeMl("3.4 oz") === 101);
  assert("'100 ml' -> 100", cleanSizeMl("100 ml") === 100);
  assert("'$1,234.50' -> 1234.5", cleanNumber("$1,234.50") === 1234.5);
  assert("'(1.50)' -> -1.5", cleanNumber("(1.50)") === -1.5);
  assert("'Y' -> true", cleanBoolean("Y") === true);
  assert("'N/A' -> null", cleanBoolean("N/A") === null);

  // --- cleanRow audit ---
  const cleaned = cleanRow({
    price: "$74.50",
    currency: "$",
    concentration: "Eau de Parfum",
    packaging_level: "bottle",
    size_ml: "3.4 oz",
    has_cap: "Y",
  });
  assert("cleanRow canonicalises price", cleaned.values.price === 74.5);
  assert("cleanRow canonicalises currency", cleaned.values.currency === "USD");
  assert("cleanRow canonicalises concentration", cleaned.values.concentration === "EDP");
  assert("cleanRow canonicalises packaging", cleaned.values.packaging_level === "UNIT");
  assert("cleanRow normalises size", cleaned.values.size_ml === 101);
  assert("cleanRow canonicalises boolean", cleaned.values.has_cap === true);
  assert("cleanRow records audit notes", cleaned.notes.length >= 5);

  // --- Cleaned workbook round-trips into the template layout ---
  const wb = await buildOffersWorkbook([
    { original_code: "4006381333931", brand: "Dior", fragrance_name: "Sauvage", concentration: "EDP", size_ml: 100, currency: "USD", price: 74.5 },
  ]);
  const roundTrip = await parseOffersWorkbook(wb);
  assert("cleaned workbook parses", roundTrip.rows.length === 1);
  assert("cleaned workbook uses template headers", roundTrip.headers.includes("Barcode / Code") && roundTrip.headers.includes("Concentration"));
  assert("cleaned workbook keeps code as text", String(roundTrip.rows[0].values.original_code) === "4006381333931");
  assert("no unknown headers in cleaned workbook", roundTrip.unknownHeaders.length === 0);

  // --- End-to-end: a messy supplier file is cleaned on import ---
  const supplier = `Clean Supplier ${stamp}`;
  const sheetWb = new ExcelJS.Workbook();
  const ws = sheetWb.addWorksheet("Pricelist");
  ws.addRow(["Barcode", "Description", "House", "Concentration", "Size", "Price", "Currency", "Qty", "Packaging", "Supplier"]);
  ws.addRow(["4006381333931", "Sauvage", "Dior", "Eau de Parfum", "3.4 oz", "$74.50", "$", "120", "Bottle", supplier]);
  const buf = Buffer.from(await sheetWb.xlsx.writeBuffer());

  const summary = await importOffersWorkbook(buf, { filename: `clean-${stamp}.xlsx`, uploadedBy: "verify-clean" });
  assert("messy file imported a valid row", summary.validRows === 1);

  const offer = await prisma.offer.findFirst({
    where: { supplier: { name: supplier } },
    orderBy: { createdAt: "desc" },
  });
  assert("offer concentration cleaned to EDP", offer?.concentration === "EDP");
  assert("offer currency cleaned to USD", offer?.currency === "USD");
  assert("offer packaging cleaned to UNIT", offer?.packagingLevel === "UNIT");
  assert("offer size cleaned to 101 ml", offer?.sizeMl === 101);
  assert("offer price parsed from $74.50", Number(offer?.price) === 74.5);
  assert("offer quantity parsed to 120", Number(offer?.availableQuantity) === 120);

  const cleanIssues = await prisma.validationIssue.count({
    where: { uploadFileId: summary.uploadId, code: "CLEANED" },
  });
  assert("cleaning was audited as issues", cleanIssues >= 4);

  // Cleanup.
  await prisma.validationIssue.deleteMany({ where: { uploadFileId: summary.uploadId } });
  await prisma.uploadRow.deleteMany({ where: { uploadFileId: summary.uploadId } });
  await prisma.offer.deleteMany({ where: { supplier: { name: supplier } } });
  await prisma.uploadFile.delete({ where: { id: summary.uploadId } });
  await prisma.supplier.deleteMany({ where: { name: supplier } });

  await prisma.$disconnect();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
