// Parse a supplier proforma invoice (PFI) into normalised lines. Supports both
// Excel and PDF. The extraction is deliberately conservative and always keeps
// the raw text of each line so a human can eyeball what was read; the variance
// against the purchase order is then compared primarily on the product code.

import { extractText, getDocumentProxy } from "unpdf";
import { parseOffersWorkbook } from "./excel";
import { cleanRow } from "./clean";

export type PfiParsedLine = {
  originalCode: string | null;
  brand: string | null;
  name: string | null;
  unitPrice: number | null;
  currency: string | null;
  quantity: number | null;
  unitsPerCase: number | null;
  rawText: string;
};

export type PfiParseResult = {
  sourceType: "PDF" | "EXCEL";
  lines: PfiParsedLine[];
  /** Full extracted text, for PDFs, so the user can review what was read. */
  text?: string;
  unknownHeaders?: string[];
};

const CURRENCY_RE = /^(USD|EUR|GBP|AED|CHF|CAD|AUD|SEK|DKK|NOK|PLN|JPY|CNY|HKD|SGD)$/i;
const CODE_RE = /\b\d{8,14}\b/;
const SKIP_RE =
  /(sub-?total|total|amount due|balance|invoice no|invoice number|proforma|page \d|grand total|freight|shipping|insurance|bank|iban|swift)/i;

function toNumber(token: string): number | null {
  const cleaned = token.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!cleaned || !/[0-9]/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract a PFI line from a single line of text. Heuristic: the barcode is the
 * first long digit run; the trailing numeric tokens are [quantity, unit price,
 * ...]; everything between is the description.
 */
export function parsePfiTextLine(line: string): PfiParsedLine | null {
  const raw = line.replace(/\s+/g, " ").trim();
  if (raw.length < 4) return null;
  if (SKIP_RE.test(raw)) return null;

  const tokens = raw.split(" ").filter(Boolean);
  if (tokens.length < 2) return null;

  const codeMatch = raw.match(CODE_RE);
  const originalCode = codeMatch ? codeMatch[0] : null;

  const currency = tokens.find((t) => CURRENCY_RE.test(t)) ?? null;

  // Working tokens: drop the code token and any standalone currency token.
  const working = tokens.filter((t) => t !== originalCode && !CURRENCY_RE.test(t));

  // Collect the trailing run of numeric tokens.
  const numbers: number[] = [];
  let i = working.length - 1;
  while (i >= 0) {
    const n = toNumber(working[i]);
    if (n === null) break;
    numbers.unshift(n);
    i--;
  }
  if (numbers.length === 0) return null;

  const quantity = numbers[0];
  const unitPrice = numbers.length >= 2 ? numbers[1] : null;
  const description = working.slice(0, i + 1).join(" ").trim();

  if (!originalCode && description.length < 3) return null;

  return {
    originalCode,
    brand: null,
    name: description || null,
    unitPrice,
    currency: currency ? currency.toUpperCase() : null,
    quantity,
    unitsPerCase: null,
    rawText: raw,
  };
}

export function parsePfiText(text: string): PfiParsedLine[] {
  const lines: PfiParsedLine[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parsed = parsePfiTextLine(line);
    if (parsed) lines.push(parsed);
  }
  return lines;
}

async function parsePdf(buffer: Buffer): Promise<PfiParseResult> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const flat = Array.isArray(text) ? text.join("\n") : text;
  return { sourceType: "PDF", lines: parsePfiText(flat), text: flat };
}

async function parseExcel(buffer: Buffer): Promise<PfiParseResult> {
  const parsed = await parseOffersWorkbook(buffer);
  const lines: PfiParsedLine[] = [];
  for (const row of parsed.rows) {
    const values = cleanRow(row.values).values;
    const code = values.original_code ? String(values.original_code) : null;
    const name = values.fragrance_name ? String(values.fragrance_name) : null;
    if (!code && !name) continue;
    const qty = numOrNull(values.available_quantity);
    const price = numOrNull(values.price);
    lines.push({
      originalCode: code,
      brand: values.brand ? String(values.brand) : null,
      name,
      unitPrice: price,
      currency: values.currency ? String(values.currency) : null,
      quantity: qty,
      unitsPerCase: values.units_per_case ? Number(values.units_per_case) || null : null,
      rawText: [code, name, qty, price].filter((v) => v !== null && v !== "").join(" | "),
    });
  }
  return { sourceType: "EXCEL", lines, unknownHeaders: parsed.unknownHeaders };
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function parsePfi(
  buffer: Buffer,
  filename: string,
): Promise<PfiParseResult> {
  const isPdf =
    /\.pdf$/i.test(filename) || buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  if (isPdf) return parsePdf(buffer);
  return parseExcel(buffer);
}
