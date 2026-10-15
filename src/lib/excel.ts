import ExcelJS from "exceljs";
import { COLUMNS, type ColumnGroup } from "./columns";
import { cellValue } from "./parse";
import { matchHeader } from "./clean";

const GROUP_FILL: Record<ColumnGroup, string> = {
  "Matching keys": "FF1F3864",
  "Source & dates": "FF2E5496",
  "Packaging & condition": "FF548235",
  "Price & quantity": "FFBF8F00",
  "Logistics & terms": "FF7030A0",
  "Eligibility & evidence": "FFC55A11",
  Ownership: "FF7F7F7F",
};

const YES_NO: [string, string][] = [
  ["yes", "yes"],
  ["no", "no"],
];

export async function buildTemplateWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Perfumes+";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Offers", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.min(Math.max(c.header.length + 4, 14), 28),
  }));

  const header = sheet.getRow(1);
  header.height = 30;
  header.eachCell((cell, colNumber) => {
    const col = COLUMNS[colNumber - 1];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GROUP_FILL[col.group] },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
    };
  });

  // Light dropdowns so the file behaves the same for every supplier.
  const lastRow = 2000;
  const validation = (
    col: number,
    values: string[],
    allowBlank = true,
  ): void => {
    for (let row = 2; row <= lastRow; row++) {
      sheet.getCell(row, col).dataValidation = {
        type: "list",
        allowBlank,
        formulae: [`"${values.join(",")}"`],
      };
    }
  };

  const colIndex = (key: string): number =>
    COLUMNS.findIndex((c) => c.key === key) + 1;

  validation(colIndex("code_type"), ["EAN", "UPC", "GTIN"]);
  validation(colIndex("packaging_level"), [
    "UNIT",
    "CASE",
    "TESTER",
    "GIFT_SET",
    "REFILL",
    "DAMAGED",
    "UNKNOWN",
  ]);
  validation(colIndex("price_basis"), ["UNIT", "CASE"]);
  for (const key of ["has_cap", "has_box", "sealed"]) {
    const col = colIndex(key);
    for (let row = 2; row <= lastRow; row++) {
      sheet.getCell(row, col).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${YES_NO.map((y) => y[0]).join(",")}"`],
      };
    }
  }

  // Force the code columns to be text (leading zeros are significant).
  for (const key of ["original_code", "internal_sku"]) {
    const col = colIndex(key);
    for (let row = 2; row <= lastRow; row++) {
      sheet.getCell(row, col).numFmt = "@";
    }
  }

  const info = wb.addWorksheet("Instructions");
  info.columns = [
    { header: "Group", key: "group", width: 24 },
    { header: "Column", key: "header", width: 26 },
    { header: "Required", key: "requirement", width: 14 },
    { header: "Example", key: "example", width: 24 },
    { header: "Guidance", key: "help", width: 70 },
  ];
  info.getRow(1).font = { bold: true };
  info.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F3864" },
  };
  info.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  for (const c of COLUMNS) {
    info.addRow({
      group: c.group,
      header: c.header,
      requirement: c.requirement,
      example: c.example,
      help: c.help,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// Cleaned pricelist export
// ---------------------------------------------------------------------------

function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "yes" : "no";
  const s = String(value).trim();
  return s === "" ? null : s;
}

const NUMERIC_KEYS = new Set([
  "price",
  "available_quantity",
  "units_per_case",
  "moq",
  "order_multiple",
  "price_tier_min",
  "price_tier_max",
  "lead_time_days",
  "size_ml",
]);

/**
 * Write cleaned records back out in the system template's exact columns and
 * order. Used for the auto-generated "cleaned pricelist" download so a supplier
 * file can always be re-exported in our canonical shape.
 */
export async function buildOffersWorkbook(
  rows: Record<string, unknown>[],
  sheetName = "Offers",
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Perfumes+";
  wb.created = new Date();

  const sheet = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.min(Math.max(c.header.length + 4, 14), 28),
  }));

  const header = sheet.getRow(1);
  header.height = 30;
  header.eachCell((cell, colNumber) => {
    const col = COLUMNS[colNumber - 1];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GROUP_FILL[col.group] },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  for (const row of rows) {
    const values = COLUMNS.map((c) => {
      const raw = row[c.key];
      if (NUMERIC_KEYS.has(c.key)) {
        const n = typeof raw === "number" ? raw : raw === null || raw === undefined || raw === "" ? null : Number(raw);
        return n === null || !Number.isFinite(n) ? cellText(raw) : n;
      }
      return cellText(raw);
    });
    sheet.addRow(values);
  }

  // Keep code columns as text so leading zeros survive a round-trip.
  const codeCols = COLUMNS.map((c, i) => ({ key: c.key, i })).filter((c) =>
    ["original_code", "internal_sku"].includes(c.key),
  );
  for (const { i } of codeCols) {
    for (let r = 2; r <= sheet.rowCount; r++) {
      sheet.getCell(r, i + 1).numFmt = "@";
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export type ParsedRow = {
  rowNumber: number;
  /** Values keyed by canonical column key. */
  values: Record<string, unknown>;
  /** Headers that were present but not recognised. */
  unknownHeaders: string[];
};

export type ParsedWorkbook = {
  sheetName: string;
  /** Human-readable headers found in row 1. */
  headers: string[];
  /** Header -> canonical key, where known. */
  mapping: Record<string, string>;
  unknownHeaders: string[];
  rows: ParsedRow[];
};

export async function parseOffersWorkbook(
  data: ArrayBuffer | Buffer,
): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet =
    wb.getWorksheet("Offers") ?? wb.worksheets.find((s) => s.rowCount > 0);
  if (!sheet) {
    throw new Error("Workbook has no sheets.");
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  const mapping: Record<string, string> = {};
  const unknownHeaders: string[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    // Pragmatic normalisation: case/space-insensitive header match.
    const raw = String(cellValue(cell.value) ?? "").trim();
    if (!raw) return;
    headers.push(raw);
    const key = matchHeader(raw);
    if (key) {
      mapping[raw] = key;
    } else {
      unknownHeaders.push(raw);
    }
  });

  const rows: ParsedRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, unknown> = {};
    let hasValue = false;
    for (let col = 1; col <= headers.length; col++) {
      const header = headers[col - 1];
      const key = mapping[header];
      if (!key) continue;
      const v = cellValue(row.getCell(col).value);
      values[key] = v;
      if (v !== null && v !== undefined && String(v).trim() !== "") {
        hasValue = true;
      }
    }
    if (hasValue) rows.push({ rowNumber, values, unknownHeaders });
  });

  return { sheetName: sheet.name, headers, mapping, unknownHeaders, rows };
}

// Header matching (canonical template names + supplier aliases) lives in
// ./clean so the same alias table drives import cleaning and mapping.

