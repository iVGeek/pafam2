// Auto-clean pipeline.
//
// Supplier pricelists arrive in many shapes — different header names, currency
// symbols, concentration spellings ("Eau de Parfum" vs "EDP"), sizes given in
// ounces, quantities written as "1,200 pcs", and so on. This module normalises
// everything into the canonical vocabulary of the system template so an import
// is cleaned automatically, on every import, with no manual step.
//
// Two responsibilities:
//   1. Header aliasing — map common supplier header variants onto canonical
//      template keys (see HEADER_ALIASES / buildHeaderLookup).
//   2. Value cleaning — coerce each cell into the template's canonical form
//      (see cleanRow and the individual cleaners).

import { COLUMNS } from "./columns";

export type CleanNote = {
  field: string;
  from: string;
  to: string;
  reason: string;
};

export type CleanResult = {
  values: Record<string, unknown>;
  notes: CleanNote[];
};

/** Case/space/punctuation-insensitive header key used for matching. */
export function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Common supplier header variants per canonical key. Kept deliberately
// conservative: only unambiguous names, so a generic column like "Type" is not
// silently reinterpreted. Canonical template headers always win over aliases.
export const HEADER_ALIASES: Record<string, string[]> = {
  original_code: [
    "barcode",
    "barcodes",
    "ean",
    "ean code",
    "gtin",
    "upc",
    "bar code",
    "product barcode",
    "item barcode",
  ],
  code_type: ["code type", "barcode type", "code format"],
  internal_sku: [
    "internal sku",
    "our sku",
    "internal code",
    "article",
    "article no",
    "article number",
    "art no",
    "item number",
    "item no",
    "item code",
  ],
  brand: ["house", "brand name", "manufacturer", "maker", "maison"],
  fragrance_name: [
    "name",
    "product",
    "product name",
    "description",
    "product description",
    "item name",
    "title",
    "fragrance",
    "perfume",
  ],
  concentration: ["form", "strength", "concentration (edp/edt)"],
  size_ml: ["size", "volume", "capacity", "size (ml)", "volume (ml)", "ml"],
  gender_category: ["gender", "category"],
  set_contents: ["contents", "set contents", "coffret contents"],
  supplier_name: ["supplier", "vendor", "seller", "source", "company", "distributor", "wholesaler"],
  supplier_offer_id: ["supplier offer id", "offer id", "offer ref", "offer reference", "supplier ref", "reference no"],
  list_date: ["list date", "offer date", "quote date", "date listed", "dated"],
  valid_until: ["valid until", "valid to", "expiry", "expiry date", "expires", "validity"],
  last_stock_confirmation: ["last stock confirmation", "stock confirmed", "stock date", "confirmed on", "confirmation date"],
  packaging_level: ["packaging level", "packaging", "pack type", "pack format", "unit type", "format"],
  units_per_case: ["units per case", "units/case", "pcs per case", "bottles per case", "case qty", "per case", "pack size"],
  has_cap: ["has cap", "cap", "with cap"],
  has_box: ["has box", "box", "boxed", "with box"],
  sealed: ["sealed", "seal", "cellophane", "shrink wrapped"],
  damage_status: ["damage status", "damage", "condition", "defects", "defect"],
  batch_lot_ref: ["batch lot ref", "batch", "lot", "batch no", "batch number", "lot no", "lot number"],
  manufacture_date: ["manufacture date", "mfg date", "production date", "made date", "mfd"],
  currency: ["currency", "ccy", "curr", "currency code"],
  price: ["price", "unit price", "cost", "net price", "wholesale price", "offer price", "unit cost", "price per unit", "amount", "buy price", "best price"],
  price_basis: ["price basis", "basis", "price per"],
  available_quantity: ["available quantity", "quantity", "qty", "available", "stock", "available qty", "in stock", "units available", "available units", "stock qty"],
  quantity_unit: ["quantity unit", "qty unit", "units"],
  moq: ["moq", "minimum order", "min order", "min qty", "minimum quantity", "minimum order qty"],
  order_multiple: ["order multiple", "multiple", "pack multiple", "order in multiples", "increments of"],
  price_tier_min: ["price tier from", "tier from", "tier min", "qty from"],
  price_tier_max: ["price tier to", "tier to", "tier max", "qty to"],
  stock_country: ["stock country", "stock location country", "country of stock"],
  warehouse: ["warehouse", "location", "warehouse location", "wh"],
  country_of_origin: ["country of origin", "origin", "made in", "coo"],
  incoterm: ["incoterm", "incoterms", "delivery terms"],
  named_place: ["named place", "port", "place"],
  ready_date: ["ready date", "availability date", "ship date", "ready"],
  lead_time_days: ["lead time (days)", "lead time", "leadtime", "lead days"],
  payment_terms: ["payment terms", "terms of payment", "pay terms", "payment"],
  freight_inclusions: ["freight inclusions", "freight", "shipping", "delivery"],
  permitted_destinations: ["permitted destinations", "destinations", "markets", "market"],
  permitted_channels: ["permitted channels", "channels", "channel"],
  us_suitability: ["us suitability", "usa", "us ok", "us eligible"],
  authenticity_docs: ["authenticity docs", "authenticity", "coa", "certificate"],
  stock_owner_name: ["stock owner", "owner", "consignor", "stock owner name"],
  stock_owner_ref: ["stock owner ref", "owner ref", "owner reference"],
  unique_lot_reference: ["unique lot reference", "lot reference", "ulr"],
  stock_confidence: ["stock confidence", "confidence", "certainty"],
};

let headerLookup: Map<string, string> | null = null;

/** Lookup of normalised header (canonical names + aliases) to template key. */
export function buildHeaderLookup(): Map<string, string> {
  if (headerLookup) return headerLookup;
  const map = new Map<string, string>();
  // Canonical template headers take precedence.
  for (const c of COLUMNS) map.set(normaliseHeader(c.header), c.key);
  // Aliases fill the gaps; first writer wins so keys listed earlier dominate.
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      const n = normaliseHeader(alias);
      if (!map.has(n)) map.set(n, key);
    }
  }
  headerLookup = map;
  return map;
}

/** Map a raw supplier header onto a canonical template key, if known. */
export function matchHeader(header: string): string | null {
  return buildHeaderLookup().get(normaliseHeader(header)) ?? null;
}

// ---------------------------------------------------------------------------
// Value cleaners
// ---------------------------------------------------------------------------

const CONCENTRATION_MAP: Record<string, string> = {
  EDP: "EDP",
  "EAU DE PARFUM": "EDP",
  "EAUDE PARFUM": "EDP",
  "EAU DE PARFUM INTENSE": "EDP",
  "EDP INTENSE": "EDP",
  EDT: "EDT",
  "EAU DE TOILETTE": "EDT",
  "EAUDE TOILETTE": "EDT",
  EDC: "EDC",
  "EAU DE COLOGNE": "EDC",
  COLOGNE: "EDC",
  "EAU DE SPRAY": "EDS",
  EDS: "EDS",
  PARFUM: "PARFUM",
  PERFUME: "PARFUM",
  EXTRAIT: "PARFUM",
  "EXTRAIT DE PARFUM": "PARFUM",
  ELIXIR: "ELIXIR",
  "EAU FRAICHE": "EAU FRAICHE",
  "AFTER SHAVE": "AFTERSHAVE",
  AFTERSHAVE: "AFTERSHAVE",
  "A/S": "AFTERSHAVE",
  AS: "AFTERSHAVE",
  DEODORANT: "DEODORANT",
  "BODY MIST": "BODY MIST",
  "HAIR MIST": "HAIR MIST",
  OIL: "OIL",
  SHAMPOO: "SHAMPOO",
  SOAP: "SOAP",
  GEL: "GEL",
};

const CURRENCY_MAP: Record<string, string> = {
  $: "USD",
  US$: "USD",
  USD: "USD",
  DOLLAR: "USD",
  DOLLARS: "USD",
  BUCK: "USD",
  "€": "EUR",
  EUR: "EUR",
  EURO: "EUR",
  EUROS: "EUR",
  "£": "GBP",
  GBP: "GBP",
  POUND: "GBP",
  STERLING: "GBP",
  AED: "AED",
  DH: "AED",
  DHS: "AED",
  DIRHAM: "AED",
  DIRHAMS: "AED",
  CHF: "CHF",
  FRANC: "CHF",
  SAR: "SAR",
  RIYAL: "SAR",
  CAD: "CAD",
  AUD: "AUD",
  JPY: "JPY",
  "¥": "JPY",
  CNY: "CNY",
  RMB: "CNY",
  INR: "INR",
  TRY: "TRY",
  PLN: "PLN",
  SEK: "SEK",
  HKD: "HKD",
  SGD: "SGD",
};

const PACKAGING_MAP: Record<string, string> = {
  UNIT: "UNIT",
  UNITS: "UNIT",
  BOTTLE: "UNIT",
  BOTTLES: "UNIT",
  BTL: "UNIT",
  PIECE: "UNIT",
  PIECES: "UNIT",
  PCS: "UNIT",
  PC: "UNIT",
  EACH: "UNIT",
  EA: "UNIT",
  SINGLE: "UNIT",
  ITEM: "UNIT",
  FLACON: "UNIT",
  CASE: "CASE",
  CASES: "CASE",
  CARTON: "CASE",
  CARTONS: "CASE",
  CTN: "CASE",
  "MASTER CARTON": "CASE",
  SHRINK: "CASE",
  TRAY: "CASE",
  TESTER: "TESTER",
  TESTERS: "TESTER",
  TEST: "TESTER",
  TESTEUR: "TESTER",
  "GIFT SET": "GIFT_SET",
  GIFTSET: "GIFT_SET",
  GIFT: "GIFT_SET",
  SET: "GIFT_SET",
  COFFRET: "GIFT_SET",
  "COFFRET / SET": "GIFT_SET",
  REFILL: "REFILL",
  REFILLS: "REFILL",
  REFILLABLE: "REFILL",
  RECHARGE: "REFILL",
  DAMAGED: "DAMAGED",
  DAMAGE: "DAMAGED",
  BROKEN: "DAMAGED",
  FAULTY: "DAMAGED",
  DEFECTIVE: "DAMAGED",
  UNKNOWN: "UNKNOWN",
};

const GENDER_MAP: Record<string, string> = {
  M: "Men",
  MALE: "Men",
  MEN: "Men",
  "MEN'S": "Men",
  HIM: "Men",
  F: "Women",
  FEMALE: "Women",
  WOMEN: "Women",
  "WOMEN'S": "Women",
  HER: "Women",
  LADIES: "Women",
  UNISEX: "Unisex",
  "UNI-SEX": "Unisex",
  AGENDER: "Unisex",
};

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "x", "✓", "✔", "ja", "si", "sí", "t", "ok", "included", "incl"]);
const FALSE_WORDS = new Set(["false", "no", "n", "0", "✗", "✘", "nein", "none", "without"]);
const NULL_WORDS = new Set(["", "-", "n/a", "na", "null", "nil", "unknown", "?"]);

export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let s = typeof value === "string" ? value : String(value);
  s = s
    .normalize("NFC")
    // Common mojibake fixes seen in supplier exports.
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€\u009d/g, '"')
    .replace(/â€"/g, "—")
    .replace(/Â /g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s === "" ? null : s;
}

export function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  let s = String(value).trim();
  if (s === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // Drop currency symbols and letters, keep digits, separators and sign.
  s = s.replace(/[^\d.,\-+]/g, "");
  // Thousands separators: 1,234.56 or 1.234,56
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function cleanInt(value: unknown): number | null {
  const n = cleanNumber(value);
  if (n === null) return null;
  return Number.isInteger(n) ? n : null;
}

export function cleanBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (NULL_WORDS.has(s)) return null;
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  return null;
}

export function cleanConcentration(value: unknown): string | null {
  const s = cleanText(value);
  if (!s) return null;
  const key = s.toUpperCase().replace(/\s+/g, " ").trim();
  return CONCENTRATION_MAP[key] ?? s;
}

export function cleanCurrency(value: unknown): string | null {
  const s = cleanText(value);
  if (!s) return null;
  const key = s.toUpperCase();
  if (CURRENCY_MAP[key]) return CURRENCY_MAP[key];
  const code = s.match(/[A-Za-z]{3}/);
  if (code) return code[0].toUpperCase();
  return key;
}

export function cleanPackagingLevel(value: unknown): string | null {
  const s = cleanText(value);
  if (!s) return null;
  const key = s.toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return PACKAGING_MAP[key] ?? s.toUpperCase();
}

export function cleanPriceBasis(value: unknown): string | null {
  const s = cleanText(value);
  if (!s) return null;
  const key = s.toUpperCase();
  if (["CASE", "PER CASE", "CASE PRICE", "BOX", "CARTON"].includes(key)) return "CASE";
  if (["UNIT", "PER UNIT", "BOTTLE", "EACH", "PC", "PIECE"].includes(key)) return "UNIT";
  return key;
}

export function cleanGender(value: unknown): string | null {
  const s = cleanText(value);
  if (!s) return null;
  const key = s.toUpperCase();
  return GENDER_MAP[key] ?? s;
}

const OZ_TO_ML = 29.5735;
export function cleanSizeMl(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isInteger(value) ? value : Math.round(value);
  const s = String(value).trim().toLowerCase();
  const num = cleanNumber(s.replace(/[a-z]/g, " "));
  if (num === null) return null;
  if (/\boz\b|ounce|fl\.?\s*oz/.test(s)) return Math.round(num * OZ_TO_ML);
  if (/\bl\b|litre|liter|litres|liters/.test(s) && !/ml/.test(s)) return Math.round(num * 1000);
  return Math.round(num);
}

export function cleanCode(value: unknown): string | null {
  const s = cleanText(value);
  if (!s) return null;
  // If the value is digits plus separators only, strip the separators so a
  // barcode written "3 605 533 223300" becomes "3605533223300".
  if (/^[\d\s\-_.]+$/.test(s) && /\d/.test(s)) {
    return s.replace(/[\s\-_.]/g, "");
  }
  return s;
}

// Fields and the cleaner applied to each. Anything not listed is cleaned as
// text (or passed through for unknown keys).
const TEXT_FIELDS = new Set([
  "brand",
  "fragrance_name",
  "set_contents",
  "supplier_name",
  "supplier_offer_id",
  "damage_status",
  "batch_lot_ref",
  "quantity_unit",
  "warehouse",
  "incoterm",
  "named_place",
  "payment_terms",
  "freight_inclusions",
  "permitted_destinations",
  "permitted_channels",
  "us_suitability",
  "authenticity_docs",
  "stock_owner_name",
  "stock_owner_ref",
  "unique_lot_reference",
  "stock_confidence",
  "stock_country",
  "country_of_origin",
]);
const INT_FIELDS = new Set([
  "units_per_case",
  "moq",
  "order_multiple",
  "price_tier_min",
  "price_tier_max",
  "lead_time_days",
]);
const BOOL_FIELDS = new Set(["has_cap", "has_box", "sealed"]);

/** Clean a single canonical field value; returns [value, reason?]. */
export function cleanField(key: string, value: unknown): { value: unknown; reason: string | null } {
  if (value === null || value === undefined || value === "") return { value, reason: null };

  if (key === "original_code" || key === "internal_sku" || key === "code_type") {
    const v = cleanCode(value);
    return { value: v, reason: v !== String(value).trim() ? "trimmed code separators" : null };
  }
  if (key === "concentration") {
    const v = cleanConcentration(value);
    return { value: v, reason: String(v) !== String(value).trim() ? "canonical concentration" : null };
  }
  if (key === "currency") {
    const v = cleanCurrency(value);
    return { value: v, reason: String(v) !== String(value).trim().toUpperCase() ? "canonical currency code" : null };
  }
  if (key === "packaging_level") {
    const v = cleanPackagingLevel(value);
    return { value: v, reason: String(v) !== String(value).trim().toUpperCase() ? "canonical packaging level" : null };
  }
  if (key === "price_basis") {
    const v = cleanPriceBasis(value);
    return { value: v, reason: String(v) !== String(value).trim().toUpperCase() ? "canonical price basis" : null };
  }
  if (key === "gender_category") {
    const v = cleanGender(value);
    return { value: v, reason: String(v) !== String(value).trim() ? "canonical gender" : null };
  }
  if (key === "size_ml") {
    const v = cleanSizeMl(value);
    return { value: v, reason: v !== null && String(v) !== String(value).trim() ? "size normalised to ml" : null };
  }
  if (INT_FIELDS.has(key)) {
    const v = cleanInt(value);
    return { value: v ?? value, reason: null };
  }
  if (key === "price" || key === "available_quantity") {
    const v = cleanNumber(value);
    return { value: v ?? value, reason: v !== null && String(v) !== String(value).trim() ? "numeric value cleaned" : null };
  }
  if (BOOL_FIELDS.has(key)) {
    const v = cleanBoolean(value);
    return { value: v, reason: v !== null && String(v) !== String(value).trim().toLowerCase() ? "canonical yes/no" : null };
  }
  if (TEXT_FIELDS.has(key)) {
    const v = cleanText(value);
    return { value: v, reason: v !== String(value).trim() ? "whitespace/encoding cleaned" : null };
  }
  // Dates and anything else: leave for the validator's parsers.
  return { value, reason: null };
}

/**
 * Clean every field of a parsed row. Returns the cleaned values plus an audit
 * list of what changed, so the import can record it.
 */
export function cleanRow(values: Record<string, unknown>): CleanResult {
  const out: Record<string, unknown> = {};
  const notes: CleanNote[] = [];
  for (const [key, raw] of Object.entries(values)) {
    const { value, reason } = cleanField(key, raw);
    out[key] = value;
    if (reason) {
      notes.push({ field: key, from: String(raw), to: String(value), reason });
    }
  }
  return { values: out, notes };
}
