// Customer-facing quote workbook (§16). Contains ONLY customer information,
// quantities and selling prices — never supplier names or buying costs.

import ExcelJS from "exceljs";

export type QuoteForExport = {
  quoteNumber: string;
  currency: string;
  validUntil: Date | string | null;
  paymentTerms: string | null;
  deliveryBasis: string | null;
  destination: string | null;
  notes: string | null;
  createdAt: Date;
  customer: {
    name: string;
    company?: string | null;
    contactName?: string | null;
  };
  lines: {
    description: string;
    quantity: unknown;
    unitPrice: unknown;
    currency: string;
    product?: { internalSku: string | null } | null;
  }[];
};

function ymd(value: Date | string | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export async function buildQuoteWorkbook(quote: QuoteForExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "pafam2";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Quote");
  sheet.columns = [
    { key: "sku", width: 22 },
    { key: "description", width: 44 },
    { key: "qty", width: 12 },
    { key: "price", width: 14 },
    { key: "amount", width: 16 },
  ];

  sheet.mergeCells("A1:E1");
  const title = sheet.getCell("A1");
  title.value = `Quotation ${quote.quoteNumber}`;
  title.font = { bold: true, size: 16 };
  sheet.getRow(1).height = 24;

  sheet.mergeCells("A2:E2");
  sheet.getCell("A2").value = `${quote.customer.company ?? quote.customer.name}${
    quote.customer.contactName ? ` — ${quote.customer.contactName}` : ""
  }`;
  sheet.getCell("A2").font = { bold: true };

  const metaRows: [string, string][] = [
    ["Quote date", ymd(quote.createdAt)],
    ["Valid until", ymd(quote.validUntil)],
    ["Currency", quote.currency],
    ["Delivery basis", quote.deliveryBasis ?? ""],
    ["Destination", quote.destination ?? ""],
    ["Payment terms", quote.paymentTerms ?? ""],
  ];
  for (const [label, value] of metaRows) {
    const row = sheet.addRow([`${label}:`, value]);
    sheet.mergeCells(`B${row.number}:E${row.number}`);
    sheet.getCell(`A${row.number}`).font = { bold: true };
  }

  sheet.addRow([]);

  const headerRow = sheet.addRow(["SKU", "Description", "Qty", "Unit price", "Amount"]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
    cell.alignment = { vertical: "middle" };
  });

  let total = 0;
  for (const line of quote.lines) {
    const qty = Number(line.quantity);
    const price = Number(line.unitPrice);
    const amount = qty * price;
    total += amount;
    sheet.addRow([
      line.product?.internalSku ?? "",
      line.description,
      qty,
      price,
      amount,
    ]);
  }

  const totalRow = sheet.addRow(["", "", "", "Total", total]);
  totalRow.font = { bold: true };
  sheet.getColumn("qty").numFmt = "#,##0";
  sheet.getColumn("price").numFmt = "#,##0.00";
  sheet.getColumn("amount").numFmt = "#,##0.00";

  if (quote.notes) {
    sheet.addRow([]);
    sheet.addRow(["Notes", quote.notes]);
  }

  sheet.addRow([]);
  sheet.addRow([
    "This quotation excludes supplier identities and internal buying costs.",
  ]);
  sheet.getCell(`A${sheet.rowCount}`).font = { italic: true, size: 9, color: { argb: "FF808080" } };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
