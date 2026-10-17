// Populates a rich, realistic demo dataset for the user manual and screenshots.
//
// Run (requires the dev DB running):  npx tsx scripts/seed-demo.ts
//
// This is NOT part of the production seed. It creates broker lists (via the real
// Excel import path, so uploads/exceptions/pools are exercised), customers,
// demand, notes, deals, quotes, purchase orders with receipts and claims,
// inventory, market prices, invoices, payments, cash flows and financing.

import { loadEnvFile } from "node:process";

try {
  loadEnvFile();
} catch {}

import ExcelJS from "exceljs";
import { COLUMNS } from "../src/lib/columns";

function ean13(base12: string): string {
  const digits = base12.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return base12 + String(check);
}

function makeWorkbook(rows: Record<string, unknown>[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Offers");
  ws.addRow(COLUMNS.map((c) => c.header));
  for (const r of rows) {
    ws.addRow(COLUMNS.map((c) => r[c.key] ?? ""));
  }
  return wb;
}

const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d;
};

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { hashPassword } = await import("../src/lib/auth");
  const { importOffersWorkbook } = await import("../src/lib/ingest");
  const { saveDeal, updateDealStatus } = await import("../src/lib/deals");
  const { createOrder } = await import("../src/lib/orders");
  const { createReceipt, createClaim } = await import("../src/lib/receipts");
  const { createInventoryItem, createReservation } = await import("../src/lib/inventory");
  const { createInvoice, recordInvoicePayment, recordCashFlow, createFinancing } = await import(
    "../src/lib/cashflow"
  );
  const { extractNote } = await import("../src/lib/notes");

  console.log("Resetting demo data…");
  // Child-first deletes keep foreign keys happy. Settings/users are preserved.
  await prisma.$transaction([
    prisma.paymentReceipt.deleteMany(),
    prisma.cashFlow.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.financingEntry.deleteMany(),
    prisma.goodsReceiptLine.deleteMany(),
    prisma.goodsReceipt.deleteMany(),
    prisma.supplierClaim.deleteMany(),
    prisma.pfiLine.deleteMany(),
    prisma.pfiDocument.deleteMany(),
    prisma.orderLine.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.inventoryReservation.deleteMany(),
    prisma.inventoryItem.deleteMany(),
    prisma.quoteLine.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.dealCost.deleteMany(),
    prisma.deal.deleteMany(),
    prisma.demand.deleteMany(),
    prisma.noteExtraction.deleteMany(),
    prisma.followUpTask.deleteMany(),
    prisma.note.deleteMany(),
    prisma.marketPrice.deleteMany(),
    prisma.offer.deleteMany(),
    prisma.uploadRow.deleteMany(),
    prisma.validationIssue.deleteMany(),
    prisma.uploadFile.deleteMany(),
    prisma.stockPool.deleteMany(),
    prisma.lot.deleteMany(),
    prisma.stockOwner.deleteMany(),
    prisma.barcodeAlias.deleteMany(),
    prisma.product.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.customer.deleteMany(),
  ]);

  // --- Users (one per role) -------------------------------------------------
  const demoPassword = process.env.DEMO_PASSWORD ?? "demo-password";
  const users: { email: string; name: string; role: string }[] = [
    { email: "admin@pafam2.local", name: "Administrator", role: "ADMIN" },
    { email: "manager@pafam2.local", name: "Maria Manager", role: "MANAGER" },
    { email: "purchasing@pafam2.local", name: "Paul Buyer", role: "PURCHASING" },
    { email: "sales@pafam2.local", name: "Sarah Seller", role: "SALES" },
    { email: "accounts@pafam2.local", name: "Alan Accountant", role: "ACCOUNTS" },
    { email: "warehouse@pafam2.local", name: "Wendy Warehouse", role: "WAREHOUSE" },
  ];
  for (const u of users) {
    await prisma.appUser.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role as never },
      create: {
        email: u.email,
        name: u.name,
        role: u.role as never,
        passwordHash: hashPassword(u.email === "admin@pafam2.local" ? (process.env.ADMIN_PASSWORD ?? demoPassword) : demoPassword),
      },
    });
  }

  // --- Suppliers ------------------------------------------------------------
  const supplierDefs = [
    { name: "Gulf Fragrance Trading FZE", country: "AE", notes: "Dubai-based broker; fast air freight to JFK." },
    { name: "EuroBeauty Distributors SARL", country: "FR", notes: "Paris distributor; EU stock, VAT-registered." },
    { name: "Alpin Perfume Supply AG", country: "CH", notes: "Geneva; premium and niche houses." },
    { name: "BritScents Wholesale Ltd", country: "GB", notes: "London; strong on gift sets and testers." },
  ];
  const suppliers: Record<string, { id: string }> = {};
  for (const s of supplierDefs) {
    suppliers[s.name] = await prisma.supplier.create({ data: s });
  }

  // --- Products + barcode aliases ------------------------------------------
  const productDefs = [
    { sku: "PAF-DIO-SAU-100", base: "334890136154", brand: "Dior", name: "Sauvage", conc: "EDP", size: 100, gender: "Men" },
    { sku: "PAF-CHA-BLE-100", base: "314589107360", brand: "Chanel", name: "Bleu de Chanel", conc: "EDT", size: 100, gender: "Men" },
    { sku: "PAF-CRE-AVE-100", base: "350844100101", brand: "Creed", name: "Aventus", conc: "EDP", size: 100, gender: "Men" },
    { sku: "PAF-TF-BLA-100", base: "888066007490", brand: "Tom Ford", name: "Black Orchid", conc: "EDP", size: 100, gender: "Women" },
    { sku: "PAF-YSL-LIB-090", base: "361427203740", brand: "Yves Saint Laurent", name: "Libre", conc: "EDP", size: 90, gender: "Women" },
    { sku: "PAF-VER-ERO-100", base: "801100380301", brand: "Versace", name: "Eros", conc: "EDT", size: 100, gender: "Men" },
    { sku: "PAF-LAN-LVI-100", base: "360553322330", brand: "Lancôme", name: "La Vie Est Belle", conc: "EDP", size: 100, gender: "Women" },
    { sku: "PAF-PAC-1M-100", base: "334966850980", brand: "Paco Rabanne", name: "1 Million", conc: "EDT", size: 100, gender: "Men" },
  ];
  const products: Record<string, { id: string; sku: string; brand: string; name: string; conc: string; size: number }> = {};
  const codeBySku: Record<string, string> = {};
  for (const p of productDefs) {
    const code = ean13(p.base);
    codeBySku[p.sku] = code;
    const created = await prisma.product.create({
      data: {
        internalSku: p.sku,
        gtin14: code.padStart(14, "0"),
        brand: p.brand,
        fragranceName: p.name,
        concentration: p.conc,
        sizeMl: p.size,
        genderOrCategory: p.gender,
        aliases: {
          create: [
            { code, codeType: "EAN", packagingLevel: "UNIT", sourceValue: code },
            { code: code.slice(0, 12), codeType: "UPC", packagingLevel: "UNIT", sourceValue: code.slice(0, 12) },
          ],
        },
      },
    });
    products[p.sku] = { id: created.id, sku: p.sku, brand: p.brand, name: p.name, conc: p.conc, size: p.size };
  }

  // --- Broker offer lists (real Excel import path) --------------------------
  const common = {
    code_type: "EAN",
    packaging_level: "UNIT",
    units_per_case: 6,
    has_cap: "yes",
    has_box: "yes",
    sealed: "yes",
    quantity_unit: "units",
    country_of_origin: "FR",
    incoterm: "FOB",
    permitted_destinations: "Worldwide",
    permitted_channels: "Wholesale only",
    us_suitability: "yes",
    authenticity_docs: "supplier letter",
    stock_confidence: "confirmed",
  };

  function offerRow(o: {
    sku: string; supplier: string; currency: string; price: number; qty: number;
    listDate: string; validUntil?: string; moq?: number; owner?: string; lot?: string;
    warehouse?: string; stockCountry?: string; offerId?: string;
  }) {
    const p = productDefs.find((x) => x.sku === o.sku)!;
    return {
      ...common,
      original_code: codeBySku[o.sku],
      internal_sku: o.sku,
      brand: p.brand,
      fragrance_name: p.name,
      concentration: p.conc,
      size_ml: p.size,
      gender_category: p.gender,
      supplier_name: o.supplier,
      supplier_offer_id: o.offerId ?? "",
      list_date: o.listDate,
      valid_until: o.validUntil ?? "",
      last_stock_confirmation: o.listDate,
      currency: o.currency,
      price: o.price,
      price_basis: "UNIT",
      available_quantity: o.qty,
      moq: o.moq ?? 12,
      order_multiple: 6,
      stock_country: o.stockCountry ?? "AE",
      warehouse: o.warehouse ?? "DXB Free Zone",
      named_place: "Jebel Ali",
      lead_time_days: 14,
      payment_terms: "30% deposit, balance on BL",
      stock_owner_name: o.owner ?? "Global Scent Holdings",
      stock_owner_ref: "SO-1188",
      unique_lot_reference: o.lot ?? "",
    };
  }

  const gulfRows = [
    offerRow({ sku: "PAF-DIO-SAU-100", supplier: "Gulf Fragrance Trading FZE", currency: "USD", price: 92.5, qty: 480, listDate: iso(daysFromNow(-5)), lot: "LOT-DXB-7781", offerId: "GF-2261" }),
    offerRow({ sku: "PAF-CHA-BLE-100", supplier: "Gulf Fragrance Trading FZE", currency: "USD", price: 104, qty: 300, listDate: iso(daysFromNow(-5)), offerId: "GF-2262" }),
    offerRow({ sku: "PAF-CRE-AVE-100", supplier: "Gulf Fragrance Trading FZE", currency: "USD", price: 289, qty: 120, listDate: iso(daysFromNow(-5)), lot: "LOT-DXB-7781", offerId: "GF-2263" }),
    offerRow({ sku: "PAF-TF-BLA-100", supplier: "Gulf Fragrance Trading FZE", currency: "USD", price: 88, qty: 200, listDate: iso(daysFromNow(-5)), offerId: "GF-2264" }),
    offerRow({ sku: "PAF-VER-ERO-100", supplier: "Gulf Fragrance Trading FZE", currency: "USD", price: 61, qty: 600, listDate: iso(daysFromNow(-5)), offerId: "GF-2265" }),
    offerRow({ sku: "PAF-PAC-1M-100", supplier: "Gulf Fragrance Trading FZE", currency: "USD", price: 58.5, qty: 540, listDate: iso(daysFromNow(-5)), offerId: "GF-2266" }),
  ];
  const gulfWb = makeWorkbook(gulfRows);
  const gulfSummary = await importOffersWorkbook(Buffer.from(await gulfWb.xlsx.writeBuffer()), {
    filename: "Gulf_Fragrance_offer_list_2026-10-12.xlsx",
    uploadedBy: "purchasing@pafam2.local",
  });
  console.log("Gulf import:", gulfSummary.status, gulfSummary.validRows, "valid");

  // EuroBeauty list — EUR prices, a second broker on the same lot, and three
  // deliberately messy rows so the Exceptions queue has something to show.
  const euroRows = [
    offerRow({ sku: "PAF-YSL-LIB-090", supplier: "EuroBeauty Distributors SARL", currency: "EUR", price: 74, qty: 360, listDate: iso(daysFromNow(-2)), owner: "Maison Distribution SA", lot: "MD-PARIS-3391", offerId: "EB-7781", stockCountry: "FR", warehouse: "CDG Bonded" }),
    offerRow({ sku: "PAF-LAN-LVI-100", supplier: "EuroBeauty Distributors SARL", currency: "EUR", price: 69, qty: 420, listDate: iso(daysFromNow(-2)), owner: "Maison Distribution SA", lot: "MD-PARIS-3391", offerId: "EB-7782", stockCountry: "FR", warehouse: "CDG Bonded" }),
    // Same owner + same lot as Gulf's Creed line → one pool, two brokers (§11.1)
    offerRow({ sku: "PAF-CRE-AVE-100", supplier: "EuroBeauty Distributors SARL", currency: "EUR", price: 265, qty: 80, listDate: iso(daysFromNow(-2)), owner: "Global Scent Holdings", lot: "LOT-DXB-7781", offerId: "EB-7783", stockCountry: "AE", warehouse: "DXB Free Zone" }),
    // Missing currency (exception)
    { ...offerRow({ sku: "PAF-CHA-BLE-100", supplier: "EuroBeauty Distributors SARL", currency: "", price: 96, qty: 150, listDate: iso(daysFromNow(-2)), offerId: "EB-7784", stockCountry: "FR" }), currency: "" },
    // Invalid barcode check digit (exception)
    { ...offerRow({ sku: "PAF-VER-ERO-100", supplier: "EuroBeauty Distributors SARL", currency: "EUR", price: 55, qty: 300, listDate: iso(daysFromNow(-2)), offerId: "EB-7785", stockCountry: "FR" }), original_code: "8011003803019" },
    // Suspiciously low price (price anomaly exception)
    offerRow({ sku: "PAF-TF-BLA-100", supplier: "EuroBeauty Distributors SARL", currency: "EUR", price: 12, qty: 40, listDate: iso(daysFromNow(-2)), offerId: "EB-7786", stockCountry: "FR" }),
  ];
  const euroWb = makeWorkbook(euroRows);
  const euroSummary = await importOffersWorkbook(Buffer.from(await euroWb.xlsx.writeBuffer()), {
    filename: "EuroBeauty_price_list_2026-10-15.xlsx",
    uploadedBy: "purchasing@pafam2.local",
  });
  console.log("EuroBeauty import:", euroSummary.status, euroSummary.validRows, "valid,", euroSummary.invalidRows, "invalid");

  // Alpin list — CHF, niche.
  const alpinRows = [
    offerRow({ sku: "PAF-CRE-AVE-100", supplier: "Alpin Perfume Supply AG", currency: "CHF", price: 255, qty: 60, listDate: iso(daysFromNow(-1)), owner: "Alpin Reserve", lot: "CH-GVA-9902", offerId: "AL-551", stockCountry: "CH", warehouse: "GVA Bonded" }),
    offerRow({ sku: "PAF-TF-BLA-100", supplier: "Alpin Perfume Supply AG", currency: "CHF", price: 79, qty: 90, listDate: iso(daysFromNow(-1)), offerId: "AL-552", stockCountry: "CH" }),
  ];
  const alpinWb = makeWorkbook(alpinRows);
  await importOffersWorkbook(Buffer.from(await alpinWb.xlsx.writeBuffer()), {
    filename: "Alpin_Perfume_Supply_2026-10-16.xlsx",
    uploadedBy: "purchasing@pafam2.local",
  });

  // A stale/expired BritScents list dated well in the past.
  const britRows = [
    offerRow({ sku: "PAF-VER-ERO-100", supplier: "BritScents Wholesale Ltd", currency: "GBP", price: 44, qty: 240, listDate: iso(daysFromNow(-40)), validUntil: iso(daysFromNow(-25)), offerId: "BS-3390", stockCountry: "GB", warehouse: "LHR" }),
    offerRow({ sku: "PAF-PAC-1M-100", supplier: "BritScents Wholesale Ltd", currency: "GBP", price: 42, qty: 300, listDate: iso(daysFromNow(-40)), validUntil: iso(daysFromNow(-25)), offerId: "BS-3391", stockCountry: "GB", warehouse: "LHR" }),
  ];
  await importOffersWorkbook(Buffer.from(await makeWorkbook(britRows).xlsx.writeBuffer()), {
    filename: "BritScents_list_2026-09-07.xlsx",
    uploadedBy: "purchasing@pafam2.local",
  });

  // --- Customers ------------------------------------------------------------
  const customerDefs = [
    { name: "LuxScent Retail Group", company: "LuxScent LLC", contactName: "Dana Whitfield", contactEmail: "dana@luxscent.example", destinationCity: "New York", destinationCountry: "US", channels: "Wholesale, Retail", accountOwner: "Sarah Seller", paymentTerms: "Net 30", creditLimit: 120000 },
    { name: "Manhattan Perfumery", company: "Manhattan Perfumery Inc", contactName: "Victor Alvarez", contactEmail: "victor@manhattanperfumery.example", destinationCity: "New York", destinationCountry: "US", channels: "Boutique", accountOwner: "Sarah Seller", paymentTerms: "Net 15", creditLimit: 60000 },
    { name: "Florida Aroma Wholesale", company: "Florida Aroma LLC", contactName: "Grace Tan", contactEmail: "grace@flaroma.example", destinationCity: "Miami", destinationCountry: "US", channels: "Wholesale", accountOwner: "Sarah Seller", paymentTerms: "Net 30", creditLimit: 80000 },
    { name: "Golden State Fragrance Co", company: "GS Fragrance", contactName: "Mike Okafor", contactEmail: "mike@gsfrag.example", destinationCity: "Los Angeles", destinationCountry: "US", channels: "Wholesale, Duty-free", accountOwner: "Sarah Seller", paymentTerms: "Net 45", creditLimit: 90000 },
  ];
  const customers: Record<string, { id: string }> = {};
  for (const c of customerDefs) customers[c.name] = await prisma.customer.create({ data: c });

  // --- Demand ---------------------------------------------------------------
  const demandDefs = [
    { customer: "LuxScent Retail Group", sku: "PAF-DIO-SAU-100", status: "CONFIRMED", certainty: "EXACT", qty: 600, target: 95, neededBy: daysFromNow(30), evidence: "Email 12 Oct — wants 600 units by mid-November.", approved: true },
    { customer: "Manhattan Perfumery", sku: "PAF-CHA-BLE-100", status: "REQUEST", certainty: "EXACT", qty: 200, target: 118, neededBy: daysFromNow(45), evidence: "Manager call 10 Oct.", approved: false },
    { customer: "Florida Aroma Wholesale", sku: "PAF-CRE-AVE-100", status: "QUOTE", certainty: "EXACT", qty: 60, target: 340, neededBy: daysFromNow(21), evidence: "WhatsApp thread — quote requested.", approved: true },
    { customer: "Golden State Fragrance Co", sku: "PAF-TF-BLA-100", status: "WISHLIST", certainty: "INFERRED", qty: 150, target: 105, neededBy: daysFromNow(60), evidence: "Mentioned at trade show.", approved: false },
    { customer: "LuxScent Retail Group", sku: "PAF-VER-ERO-100", status: "FULFILLED", certainty: "EXACT", qty: 400, target: 70, neededBy: daysFromNow(-10), evidence: "Delivered on order PO-2026-0412.", approved: true },
  ];
  const demands: Record<string, { id: string }> = {};
  for (const d of demandDefs) {
    const p = products[d.sku];
    const created = await prisma.demand.create({
      data: {
        customerId: customers[d.customer].id,
        productId: p.id,
        status: d.status as never,
        certainty: d.certainty as never,
        barcode: codeBySku[d.sku],
        internalSku: d.sku,
        brand: p.brand,
        fragranceName: p.name,
        concentration: p.conc,
        sizeMl: p.size,
        quantity: d.qty,
        quantityUnit: "units",
        targetPrice: d.target,
        currency: "USD",
        destination: "New York, US",
        neededBy: d.neededBy,
        evidence: d.evidence,
        approved: d.approved,
        approvedBy: d.approved ? "Maria Manager" : null,
        expiryDate: daysFromNow(90),
        owner: "Sarah Seller",
      },
    });
    demands[`${d.customer}|${d.sku}`] = created;
  }

  // --- Notes + extractions --------------------------------------------------
  const note1 = await prisma.note.create({
    data: {
      source: "MANUAL",
      status: "REVIEWED",
      customerId: customers["LuxScent Retail Group"].id,
      meetingDate: daysFromNow(-6),
      staffMember: "Sarah Seller",
      filename: "luxscent-meeting.txt",
      sourceLocation: "Drive/Sales/LuxScent",
      rawText:
        "Meeting with Dana at LuxScent, 11 Oct.\nDana wants 600 units of Dior Sauvage EDP 100ml by mid-November, target $95 landed.\nShe also asked about Chanel Bleu 100ml — maybe 200 units if the price is right.\nPricing pressure from a competitor quoting $92.\nFollow up with a formal quote next week.",
      summary: "LuxScent wants 600 Sauvage units by mid-Nov, plus interest in Bleu.",
    },
  });
  await extractNote(note1.id);

  const note2 = await prisma.note.create({
    data: {
      source: "PLAUD",
      status: "REVIEWED",
      customerId: customers["Florida Aroma Wholesale"].id,
      meetingDate: daysFromNow(-3),
      staffMember: "Sarah Seller",
      filename: "plaud-flaroma.mp3",
      sourceLocation: "Plaud cloud",
      rawText:
        "Call with Grace at Florida Aroma.\nShe needs 60 units of Creed Aventus EDP 100ml, can go to $340.\nDeadline is three weeks out.\nShe asked whether we can also supply gift sets for the holidays.\nObjection: last shipment arrived with two damaged boxes.",
      summary: "Florida Aroma needs 60 Aventus units; asks about gift sets.",
    },
  });
  await extractNote(note2.id);

  // --- Deals ----------------------------------------------------------------
  const gulfOffer = await prisma.offer.findFirst({ where: { supplierId: suppliers["Gulf Fragrance Trading FZE"].id, productId: products["PAF-DIO-SAU-100"].id } });
  const gulfBleuOffer = await prisma.offer.findFirst({ where: { supplierId: suppliers["Gulf Fragrance Trading FZE"].id, productId: products["PAF-CHA-BLE-100"].id } });
  const euroCreedOffer = await prisma.offer.findFirst({ where: { supplierId: suppliers["EuroBeauty Distributors SARL"].id, productId: products["PAF-CRE-AVE-100"].id } });

  const { deal: deal1 } = await saveDeal({
    supplierId: suppliers["Gulf Fragrance Trading FZE"].id,
    productId: products["PAF-DIO-SAU-100"].id,
    customerId: customers["LuxScent Retail Group"].id,
    offerId: gulfOffer?.id ?? null,
    owner: "Paul Buyer",
    status: "WON",
    notes: "Flagship deal for the season.",
    quantity: 600,
    buyCurrency: "USD",
    buyPrice: 92.5,
    buyPriceBasis: "UNIT",
    unitsPerCase: 6,
    sellingPriceUsd: 132,
    inboundCosts: [
      { category: "FREIGHT", label: "Air freight DXB→JFK", amount: 2400 },
      { category: "DUTY", label: "US import duty", amount: 3.1, perUnit: true },
      { category: "INSURANCE", label: "Cargo insurance", amount: 240 },
    ],
    outboundCosts: [
      { category: "OUTBOUND", label: "Delivery to customer", amount: 1.2, perUnit: true },
      { category: "COMMISSION", label: "Sales commission 3%", amount: 3.96, perUnit: true },
      { category: "STORAGE", label: "3PL storage", amount: 300 },
    ],
    cashCycleDays: 45,
    sellThroughFactor: 100,
    defaultPctOnReceivable: 2,
    requiredContributionMarginPct: 10,
  });

  const { deal: deal2 } = await saveDeal({
    supplierId: suppliers["EuroBeauty Distributors SARL"].id,
    productId: products["PAF-CRE-AVE-100"].id,
    customerId: customers["Florida Aroma Wholesale"].id,
    offerId: euroCreedOffer?.id ?? null,
    owner: "Paul Buyer",
    status: "APPROVED",
    quantity: 60,
    buyCurrency: "EUR",
    buyPrice: 265,
    buyPriceBasis: "UNIT",
    unitsPerCase: 1,
    sellingPriceUsd: 340,
    inboundCosts: [
      { category: "FREIGHT", label: "Air freight CDG→MIA", amount: 420 },
      { category: "DUTY", label: "US import duty", amount: 6.5, perUnit: true },
    ],
    outboundCosts: [{ category: "OUTBOUND", label: "Delivery", amount: 1.5, perUnit: true }],
    cashCycleDays: 40,
    sellThroughFactor: 90,
    defaultPctOnReceivable: 1,
    requiredContributionMarginPct: 12,
  });

  await saveDeal({
    supplierId: suppliers["Gulf Fragrance Trading FZE"].id,
    productId: products["PAF-CHA-BLE-100"].id,
    customerId: customers["Manhattan Perfumery"].id,
    offerId: gulfBleuOffer?.id ?? null,
    owner: "Paul Buyer",
    status: "REVIEWED",
    quantity: 200,
    buyCurrency: "USD",
    buyPrice: 104,
    buyPriceBasis: "UNIT",
    unitsPerCase: 6,
    sellingPriceUsd: 138,
    inboundCosts: [{ category: "FREIGHT", label: "Air freight", amount: 900 }],
    outboundCosts: [{ category: "OUTBOUND", label: "Delivery", amount: 1.4, perUnit: true }],
    cashCycleDays: 50,
    sellThroughFactor: 100,
    defaultPctOnReceivable: 2,
    requiredContributionMarginPct: 10,
  });

  const { deal: lostDeal } = await saveDeal({
    supplierId: suppliers["Gulf Fragrance Trading FZE"].id,
    productId: products["PAF-VER-ERO-100"].id,
    customerId: customers["Golden State Fragrance Co"].id,
    owner: "Paul Buyer",
    status: "LOST",
    quantity: 400,
    buyCurrency: "USD",
    buyPrice: 61,
    buyPriceBasis: "UNIT",
    unitsPerCase: 6,
    sellingPriceUsd: 74,
    inboundCosts: [{ category: "FREIGHT", label: "Air freight", amount: 700 }],
    outboundCosts: [{ category: "OUTBOUND", label: "Delivery", amount: 1.1, perUnit: true }],
    cashCycleDays: 55,
    sellThroughFactor: 100,
    defaultPctOnReceivable: 2,
    requiredContributionMarginPct: 10,
  });
  await updateDealStatus(
    lostDeal.id,
    "LOST",
    "Paul Buyer",
    "Price — customer bought from a competing broker at a lower landed cost.",
  );

  // --- Quotes ---------------------------------------------------------------
  const quote1 = await prisma.quote.create({
    data: {
      quoteNumber: "Q-2026-1042",
      customerId: customers["LuxScent Retail Group"].id,
      status: "SENT",
      currency: "USD",
      validUntil: daysFromNow(14),
      paymentTerms: "Net 30",
      deliveryBasis: "DDP New York",
      destination: "New York, US",
      owner: "Sarah Seller",
      lines: {
        create: [
          { dealId: deal1.id, productId: products["PAF-DIO-SAU-100"].id, description: "Dior Sauvage EDP 100ml — 600 units at $132.00", quantity: 600, unitPrice: 132, currency: "USD" },
        ],
      },
    },
  });
  await prisma.quote.create({
    data: {
      quoteNumber: "Q-2026-1043",
      customerId: customers["Florida Aroma Wholesale"].id,
      status: "ACCEPTED",
      currency: "USD",
      validUntil: daysFromNow(21),
      paymentTerms: "Net 30",
      deliveryBasis: "FOB Miami",
      destination: "Miami, US",
      owner: "Sarah Seller",
      approvedBy: "Maria Manager",
      approvedAt: daysFromNow(-2),
      lines: {
        create: [
          { dealId: deal2.id, productId: products["PAF-CRE-AVE-100"].id, description: "Creed Aventus EDP 100ml — 60 units at $340.00", quantity: 60, unitPrice: 340, currency: "USD" },
        ],
      },
    },
  });

  // --- Purchase orders, receipts and claims --------------------------------
  const order1 = await createOrder({
    supplierId: suppliers["Gulf Fragrance Trading FZE"].id,
    reference: "PO-2026-0412",
    currency: "USD",
    incoterm: "FOB",
    expectedDate: daysFromNow(-8),
    notes: "Season stock; ship air freight.",
    createdBy: "purchasing@pafam2.local",
    lines: [
      { productId: products["PAF-DIO-SAU-100"].id, originalCode: codeBySku["PAF-DIO-SAU-100"], brand: "Dior", fragranceName: "Sauvage", concentration: "EDP", sizeMl: 100, packagingLevel: "UNIT", unitsPerCase: 6, cases: 100, unitCost: 92.5 },
      { productId: products["PAF-VER-ERO-100"].id, originalCode: codeBySku["PAF-VER-ERO-100"], brand: "Versace", fragranceName: "Eros", concentration: "EDT", sizeMl: 100, packagingLevel: "UNIT", unitsPerCase: 6, cases: 100, unitCost: 61 },
    ],
  });
  const order2 = await createOrder({
    supplierId: suppliers["EuroBeauty Distributors SARL"].id,
    reference: "PO-2026-0413",
    currency: "EUR",
    incoterm: "CIF",
    expectedDate: daysFromNow(6),
    notes: "Awaiting shipping confirmation.",
    createdBy: "purchasing@pafam2.local",
    lines: [
      { productId: products["PAF-CRE-AVE-100"].id, originalCode: codeBySku["PAF-CRE-AVE-100"], brand: "Creed", fragranceName: "Aventus", concentration: "EDP", sizeMl: 100, packagingLevel: "UNIT", unitsPerCase: 1, cases: 80, unitCost: 265 },
    ],
  });
  const order3 = await createOrder({
    supplierId: suppliers["Alpin Perfume Supply AG"].id,
    reference: "PO-2026-0414",
    currency: "CHF",
    incoterm: "FOB",
    expectedDate: daysFromNow(-2),
    createdBy: "purchasing@pafam2.local",
    lines: [
      { productId: products["PAF-TF-BLA-100"].id, originalCode: codeBySku["PAF-TF-BLA-100"], brand: "Tom Ford", fragranceName: "Black Orchid", concentration: "EDP", sizeMl: 100, packagingLevel: "UNIT", unitsPerCase: 1, cases: 90, unitCost: 79 },
    ],
  });

  const order1Full = await prisma.purchaseOrder.findUnique({ where: { id: order1.id }, include: { lines: true } });
  const diorLine = order1Full!.lines.find((l) => l.productId === products["PAF-DIO-SAU-100"].id)!;
  const versaceLine = order1Full!.lines.find((l) => l.productId === products["PAF-VER-ERO-100"].id)!;

  // Receipt 1 on order1: full Dior, short + damaged Versace, a few days late.
  const receipt1 = await createReceipt({
    orderId: order1.id,
    receiptDate: daysFromNow(-3),
    expectedDate: daysFromNow(-8),
    reference: "GRN-2026-0031",
    carrier: "Emirates SkyCargo",
    receivedBy: "purchasing@pafam2.local",
    notes: "Versace carton crushed on one corner.",
    lines: [
      { orderLineId: diorLine.id, orderedUnits: diorLine.units, receivedUnits: diorLine.units, rejectedUnits: 0 },
      { orderLineId: versaceLine.id, orderedUnits: versaceLine.units, receivedUnits: versaceLine.units - 40, rejectedUnits: 12, notes: "One carton damaged." },
    ],
  });

  await createClaim({
    supplierId: suppliers["Gulf Fragrance Trading FZE"].id,
    orderId: order1.id,
    receiptId: receipt1.id,
    type: "SHORTAGE",
    units: 40,
    amountUsd: 2440,
    description: "40 Versace Eros units short on GRN-2026-0031.",
    createdBy: "warehouse@pafam2.local",
  });
  await createClaim({
    supplierId: suppliers["Gulf Fragrance Trading FZE"].id,
    orderId: order1.id,
    type: "DAMAGE",
    units: 12,
    amountUsd: 732,
    description: "12 Versace Eros units crushed — credit requested.",
    createdBy: "warehouse@pafam2.local",
  });

  // Receipt 2 on order3: on time, full.
  const order3Full = await prisma.purchaseOrder.findUnique({ where: { id: order3.id }, include: { lines: true } });
  const tfLine = order3Full!.lines[0];
  await createReceipt({
    orderId: order3.id,
    receiptDate: daysFromNow(-3),
    expectedDate: daysFromNow(-2),
    reference: "GRN-2026-0032",
    carrier: "Swiss WorldCargo",
    receivedBy: "purchasing@pafam2.local",
    lines: [{ orderLineId: tfLine.id, orderedUnits: tfLine.units, receivedUnits: tfLine.units, rejectedUnits: 0 }],
  });

  // --- Inventory + reservations --------------------------------------------
  const inv1 = await createInventoryItem({ productId: products["PAF-DIO-SAU-100"].id, status: "USABLE", warehouse: "JFK 3PL", territory: "US", lotRef: "LOT-DXB-7781", quantity: 600, unitCostUsd: 105.4, acquiredDate: iso(daysFromNow(-3)), dealId: deal1.id }, "warehouse@pafam2.local");
  await createInventoryItem({ productId: products["PAF-TF-BLA-100"].id, status: "USABLE", warehouse: "JFK 3PL", territory: "US", lotRef: "CH-GVA-9902", quantity: 90, unitCostUsd: 96.2, acquiredDate: iso(daysFromNow(-1)) }, "warehouse@pafam2.local");
  await createInventoryItem({ productId: products["PAF-VER-ERO-100"].id, status: "QUARANTINED", warehouse: "JFK 3PL", territory: "US", lotRef: "LOT-DXB-7781", quantity: 12, unitCostUsd: 61, acquiredDate: iso(daysFromNow(-3)), notes: "Damaged — pending supplier credit." }, "warehouse@pafam2.local");
  await createInventoryItem({ productId: products["PAF-CHA-BLE-100"].id, status: "IN_TRANSIT", warehouse: "In transit", territory: "US", quantity: 300, unitCostUsd: 112.5, acquiredDate: iso(daysFromNow(-1)) }, "warehouse@pafam2.local");
  await createReservation({ inventoryItemId: inv1.id, quantity: 600, dealId: deal1.id, customerId: customers["LuxScent Retail Group"].id, note: "Reserved for LuxScent PO.", createdBy: "sales@pafam2.local" }, "sales@pafam2.local");

  // --- Market prices --------------------------------------------------------
  const marketDefs: { sku: string; price: number; days: number; source: string }[] = [
    { sku: "PAF-DIO-SAU-100", price: 154, days: -30, source: "Sephora US" },
    { sku: "PAF-DIO-SAU-100", price: 159, days: -12, source: "Sephora US" },
    { sku: "PAF-DIO-SAU-100", price: 149, days: -2, source: "Sephora US" },
    { sku: "PAF-CHA-BLE-100", price: 172, days: -20, source: "Nordstrom" },
    { sku: "PAF-CHA-BLE-100", price: 178, days: -4, source: "Nordstrom" },
    { sku: "PAF-CRE-AVE-100", price: 435, days: -25, source: "Neiman Marcus" },
    { sku: "PAF-CRE-AVE-100", price: 445, days: -6, source: "Neiman Marcus" },
    { sku: "PAF-TF-BLA-100", price: 155, days: -15, source: "Bloomingdale's" },
    { sku: "PAF-VER-ERO-100", price: 95, days: -18, source: "Macys" },
    { sku: "PAF-VER-ERO-100", price: 92, days: -3, source: "Macys" },
  ];
  for (const m of marketDefs) {
    await prisma.marketPrice.create({
      data: { productId: products[m.sku].id, kind: "PUBLIC_RETAIL", price: m.price, currency: "USD", observedDate: daysFromNow(m.days), source: m.source, territory: "US" },
    });
  }

  // --- Tasks ----------------------------------------------------------------
  const openDemand = demands["LuxScent Retail Group|PAF-DIO-SAU-100"];
  await prisma.followUpTask.create({
    data: { title: "Send LuxScent a formal quote for 600 Sauvage units", detail: "Confirmed on the 11 Oct call; needs approval first.", dueDate: daysFromNow(3), owner: "Sarah Seller", status: "OPEN", customerId: customers["LuxScent Retail Group"].id, demandId: openDemand?.id ?? null, noteId: note1.id },
  });
  await prisma.followUpTask.create({
    data: { title: "Chase competitor price claim from LuxScent", detail: "Dana says a competitor quoted $92 landed — verify.", dueDate: daysFromNow(5), owner: "Sarah Seller", status: "OPEN", customerId: customers["LuxScent Retail Group"].id },
  });
  await prisma.followUpTask.create({
    data: { title: "Resolve Versace Eros shortage claim with Gulf", detail: "40 units short + 12 damaged on GRN-2026-0031.", dueDate: daysFromNow(2), owner: "Wendy Warehouse", status: "OPEN", customerId: null },
  });

  // --- Invoices, payments, cash flows (§8.4) --------------------------------
  // Supplier bill for order1, paid in full.
  const supplierInvoice = await createInvoice({
    type: "SUPPLIER", orderId: order1.id, reference: "BILL-GF-2026-0412", currency: "USD", total: 45900,
    issueDate: iso(daysFromNow(-3)), dueDate: iso(daysFromNow(27)), notes: "Goods received — payable on terms.",
  });
  await recordInvoicePayment(supplierInvoice.id, { amount: 45900, paidDate: daysFromNow(-1), method: "Bank transfer", reference: "WIRE-88213" });

  // Customer invoice for deal1, partially paid.
  const customerInvoice = await createInvoice({
    type: "CUSTOMER", dealId: deal1.id, reference: "INV-2026-1042", currency: "USD", total: 79200,
    issueDate: iso(daysFromNow(-2)), dueDate: iso(daysFromNow(28)), notes: "600 × Dior Sauvage @ $132.",
  });
  await recordInvoicePayment(customerInvoice.id, { amount: 30000, paidDate: daysFromNow(-1), method: "Bank transfer", reference: "DEP-1042" });

  // Overdue customer invoice (never paid) → drives overdue-debt KPI.
  const overdueInvoice = await createInvoice({
    type: "CUSTOMER", quoteId: quote1.id, reference: "INV-2026-1030", currency: "USD", total: 18500,
    issueDate: iso(daysFromNow(-50)), dueDate: iso(daysFromNow(-20)), notes: "Balance 20 days past due.",
  });
  void overdueInvoice;

  // Deal attribution: a couple of dated flows tied directly to deal2 so its page
  // shows a real XIRR alongside the estimate.
  await recordCashFlow({ date: daysFromNow(-10), type: "BUY_PAYMENT", amountUsd: 16500, dealId: deal2.id, reference: "DEP-EB-0413", note: "Deposit to EuroBeauty", createdBy: "accounts@pafam2.local" });
  await recordCashFlow({ date: daysFromNow(-1), type: "SELL_RECEIPT", amountUsd: 20400, dealId: deal2.id, reference: "DEP-FLA-1043", note: "Customer deposit", createdBy: "accounts@pafam2.local" });

  // --- Financing ------------------------------------------------------------
  await createFinancing({ fromDate: daysFromNow(-30), fundedDate: daysFromNow(-30), principalUsd: 60000, rateAnnual: 0.11, description: "Working-capital facility — season stock", createdBy: "accounts@pafam2.local" });
  await createFinancing({ fromDate: daysFromNow(-12), fundedDate: daysFromNow(-12), toDate: daysFromNow(18), principalUsd: 25000, rateAnnual: 0.095, description: "Short-term draw for order PO-2026-0413", orderId: order2.id, createdBy: "accounts@pafam2.local" });

  // Cross-deal dated flows so the overall XIRR and funding balances are real.
  await recordCashFlow({ date: daysFromNow(-20), type: "FINANCING_IN", amountUsd: 60000, reference: "FAC-001", note: "Drawdown", createdBy: "accounts@pafam2.local" });
  await recordCashFlow({ date: daysFromNow(-15), type: "BUY_PAYMENT", amountUsd: 25500, dealId: deal1.id, reference: "WIRE-GF", note: "Supplier payment", createdBy: "accounts@pafam2.local" });

  // --- Settings that shape the dashboards ----------------------------------
  const settings: { key: string; value: unknown }[] = [
    { key: "kpi_owners", value: { quote_conversion: "Sarah Seller", lost_sale_reasons: "Paul Buyer", realised_vs_expected_margin: "Alan Accountant", supplier_fill_rate: "Wendy Warehouse", customer_repeat_purchases: "Sarah Seller", overdue_debt: "Alan Accountant", cash_deployment: "Alan Accountant", exposure_over_cap: "Maria Manager", stock_turn: "Wendy Warehouse" } },
    { key: "exposure_caps", value: { sku: { "PAF-CRE-AVE-100": 40000 }, brand: { Creed: 40000 }, supplier: { "Gulf Fragrance Trading FZE": 80000 }, customer: { "LuxScent Retail Group": 100000 }, defaults: { sku: 25000, brand: 40000, supplier: 60000, customer: 80000 } } },
    { key: "customer_pricing", value: { defaultMarginPct: 18, overrides: { "LuxScent Retail Group": { marginPct: 22 } } } },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({ where: { key: s.key }, update: { value: s.value as object, updatedBy: "seed-demo" }, create: { key: s.key, value: s.value as object, updatedBy: "seed-demo" } });
  }

  console.log("Demo data seeded.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
