// Purchase-order workbook export. Sends the order to a supplier: whole-box
// quantities (cases x units per case) and the agreed unit cost.

import ExcelJS from "exceljs";

export type OrderForExport = {
  reference: string;
  status: string;
  currency: string;
  fxRate: number | null;
  incoterm: string | null;
  notes: string | null;
  createdAt: Date;
  supplier: { name: string; country?: string | null };
  lines: {
    originalCode: string | null;
    brand: string | null;
    fragranceName: string | null;
    concentration: string | null;
    sizeMl: number | null;
    packagingLevel: string;
    unitsPerCase: number;
    cases: number;
    units: number;
    unitCost: unknown;
    notes: string | null;
  }[];
};

function ymd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function buildOrderWorkbook(order: OrderForExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Perfumes+";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Purchase order");
  sheet.columns = [
    { key: "code", width: 18 },
    { key: "brand", width: 16 },
    { key: "name", width: 32 },
    { key: "conc", width: 10 },
    { key: "size", width: 10 },
    { key: "pack", width: 12 },
    { key: "upc", width: 11 },
    { key: "cases", width: 10 },
    { key: "units", width: 12 },
    { key: "cost", width: 14 },
    { key: "total", width: 16 },
  ];

  sheet.mergeCells("A1:K1");
  const title = sheet.getCell("A1");
  title.value = `Purchase order ${order.reference}`;
  title.font = { bold: true, size: 16 };
  sheet.getRow(1).height = 24;

  const meta: [string, string][] = [
    ["Supplier", order.supplier.name],
    ["Status", order.status],
    ["Order date", ymd(order.createdAt)],
    ["Currency", order.currency],
    ["FX (USD per 1)", order.fxRate ? String(order.fxRate) : ""],
    ["Incoterm", order.incoterm ?? ""],
  ];
  for (const [label, value] of meta) {
    const row = sheet.addRow([`${label}:`, value]);
    sheet.mergeCells(`B${row.number}:K${row.number}`);
    sheet.getCell(`A${row.number}`).font = { bold: true };
  }
  sheet.addRow([]);

  const headerRow = sheet.addRow([
    "Barcode / Code",
    "Brand",
    "Product name",
    "Conc.",
    "Size (ml)",
    "Packaging",
    "Units / case",
    "Cases",
    "Units",
    "Unit cost",
    "Line total",
  ]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  let units = 0;
  let cases = 0;
  let total = 0;
  for (const line of order.lines) {
    const cost = line.unitCost === null || line.unitCost === undefined ? null : Number(line.unitCost);
    const amount = cost === null ? null : cost * line.units;
    units += line.units;
    cases += line.cases;
    if (amount !== null) total += amount;
    sheet.addRow([
      line.originalCode ?? "",
      line.brand ?? "",
      line.fragranceName ?? "",
      line.concentration ?? "",
      line.sizeMl ?? "",
      line.packagingLevel,
      line.unitsPerCase,
      line.cases,
      line.units,
      cost ?? "",
      amount ?? "",
    ]);
  }

  const totalRow = sheet.addRow(["", "", "", "", "", "", "", "Totals", units, "", total]);
  totalRow.font = { bold: true };
  sheet.getColumn("upc").numFmt = "#,##0";
  sheet.getColumn("cases").numFmt = "#,##0";
  sheet.getColumn("units").numFmt = "#,##0";
  sheet.getColumn("cost").numFmt = "#,##0.00";
  sheet.getColumn("total").numFmt = "#,##0.00";
  sheet.getCell(`A${sheet.rowCount + 1}`).value = "";
  sheet.addRow([
    `Total: ${cases} case(s), ${units} unit(s), value ${total.toFixed(2)} ${order.currency}`,
  ]);

  if (order.notes) {
    sheet.addRow([]);
    sheet.addRow(["Notes", order.notes]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
