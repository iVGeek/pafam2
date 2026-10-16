// Goods-receipt Excel import (§18).
//
// A warehouse can record what arrived for an order in a workbook instead of
// typing each line. The template is pre-filled with the order's lines (code and
// ordered units) so the only columns staff fill in are received and rejected
// quantities, plus the arrival date.

import ExcelJS from "exceljs";
import { cellValue } from "./parse";

const ALIASES: Record<string, string> = {
  // code
  code: "code",
  "product code": "code",
  barcode: "code",
  "barcode / code": "code",
  "original code": "code",
  sku: "code",
  upc: "code",
  ean: "code",
  gtin: "code",
  // received
  received: "received_units",
  "received units": "received_units",
  "units received": "received_units",
  "received qty": "received_units",
  "qty received": "received_units",
  "quantity received": "received_units",
  "good units": "received_units",
  delivered: "received_units",
  received_qty: "received_units",
  // rejected
  rejected: "rejected_units",
  "rejected units": "rejected_units",
  "units rejected": "rejected_units",
  "rejected qty": "rejected_units",
  damaged: "rejected_units",
  "damaged units": "rejected_units",
  // dates
  "receipt date": "receipt_date",
  "received date": "receipt_date",
  "arrival date": "receipt_date",
  "delivered date": "receipt_date",
  "expected date": "expected_date",
  "promised date": "expected_date",
  "due date": "expected_date",
  eta: "expected_date",
  // misc
  notes: "notes",
  note: "notes",
  comment: "notes",
};

function normHeader(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[key] ?? null;
}

function toInt(value: unknown): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ReceiptImportRow = {
  rowNumber: number;
  code: string | null;
  receivedUnits: number;
  rejectedUnits: number;
  notes: string | null;
};

export type ParsedReceiptWorkbook = {
  sheetName: string;
  headers: string[];
  unknownHeaders: string[];
  receiptDate: Date | null;
  expectedDate: Date | null;
  rows: ReceiptImportRow[];
};

export async function parseReceiptWorkbook(
  data: ArrayBuffer | Buffer,
): Promise<ParsedReceiptWorkbook> {
  const wb = new ExcelJS.Workbook();
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet = wb.worksheets.find((s) => s.rowCount > 0);
  if (!sheet) throw new Error("Workbook has no sheets.");

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  const mapping: Record<number, string> = {};
  const unknownHeaders: string[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = String(cellValue(cell.value) ?? "").trim();
    if (!raw) return;
    headers.push(raw);
    const key = normHeader(raw);
    if (key) mapping[colNumber] = key;
    else unknownHeaders.push(raw);
  });

  const rows: ReceiptImportRow[] = [];
  let receiptDate: Date | null = null;
  let expectedDate: Date | null = null;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    let code: string | null = null;
    let receivedUnits = 0;
    let rejectedUnits = 0;
    let notes: string | null = null;
    let hasValue = false;

    for (let col = 1; col <= headerRow.cellCount; col++) {
      const key = mapping[col];
      if (!key) continue;
      const v = cellValue(row.getCell(col).value);
      if (v === null || v === undefined || String(v).trim() === "") continue;
      hasValue = true;
      if (key === "code") code = String(v).trim();
      else if (key === "received_units") receivedUnits = toInt(v);
      else if (key === "rejected_units") rejectedUnits = toInt(v);
      else if (key === "notes") notes = String(v).trim();
      else if (key === "receipt_date") receiptDate = receiptDate ?? toDate(v);
      else if (key === "expected_date") expectedDate = expectedDate ?? toDate(v);
    }

    if (!hasValue) return;
    if (!code && receivedUnits === 0 && rejectedUnits === 0) return;
    rows.push({ rowNumber, code, receivedUnits, rejectedUnits, notes });
  });

  return { sheetName: sheet.name, headers, unknownHeaders, receiptDate, expectedDate, rows };
}

export type ReceiptTemplateLine = {
  code: string | null;
  label: string;
  orderedUnits: number;
};

/** A pre-filled receipt workbook: order lines with blank received/rejected. */
export async function buildReceiptTemplateWorkbook(
  orderReference: string,
  lines: ReceiptTemplateLine[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Perfumes+";
  wb.created = new Date();

  const sheet = wb.addWorksheet("Receipt", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Code", key: "code", width: 20 },
    { header: "Product", key: "product", width: 40 },
    { header: "Ordered units", key: "ordered", width: 14 },
    { header: "Received units", key: "received", width: 15 },
    { header: "Rejected units", key: "rejected", width: 15 },
    { header: "Receipt date", key: "receipt_date", width: 14 },
    { header: "Notes", key: "notes", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };

  const today = new Date().toISOString().slice(0, 10);
  sheet.addRow({ code: "", product: `Goods receipt for ${orderReference}`, ordered: "", received: "", rejected: "", receipt_date: today, notes: "" });
  for (const l of lines) {
    sheet.addRow({ code: l.code ?? "", product: l.label, ordered: l.orderedUnits, received: "", rejected: "", receipt_date: today, notes: "" });
  }
  for (let r = 2; r <= sheet.rowCount; r++) sheet.getCell(r, 1).numFmt = "@";

  const info = wb.addWorksheet("Instructions");
  info.addRow(["Goods receipt", orderReference]);
  info.addRow([]);
  info.addRow(["Fill in 'Received units' and 'Rejected units' for each line, and add a 'Receipt date' cell."]);
  info.addRow(["Rows left blank are ignored. 'Received units' count as delivered; 'Rejected units' do not."]);
  info.getRow(1).font = { bold: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
