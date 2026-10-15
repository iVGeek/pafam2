import { analyzeCode } from "./gtin";
import { cleanRow } from "./clean";

export type IssueSeverity = "ERROR" | "WARNING" | "INFO";

export type Issue = {
  code: string;
  field?: string;
  message: string;
  severity: IssueSeverity;
};

export type NormalizedOffer = {
  originalCode: string;
  originalCodeType: string;
  gtin14: string | null;
  codeIsGtin: boolean;
  internalSku: string | null;
  brand: string | null;
  fragranceName: string | null;
  concentration: string | null;
  sizeMl: number | null;
  genderOrCategory: string | null;
  setContents: string | null;
  supplierName: string;
  supplierOfferId: string | null;
  listDate: Date | null;
  validUntil: Date | null;
  lastStockConfirmation: Date | null;
  packagingLevel: string;
  unitsPerCase: number | null;
  hasCap: boolean | null;
  hasBox: boolean | null;
  sealed: boolean | null;
  damageStatus: string | null;
  batchOrLotRef: string | null;
  manufactureDate: Date | null;
  currency: string | null;
  price: number | null;
  priceBasis: string | null;
  availableQuantity: number | null;
  quantityUnit: string | null;
  moq: number | null;
  orderMultiple: number | null;
  priceTierMin: number | null;
  priceTierMax: number | null;
  stockCountry: string | null;
  warehouse: string | null;
  countryOfOrigin: string | null;
  incoterm: string | null;
  namedPlace: string | null;
  readyDate: Date | null;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  freightInclusions: string | null;
  permittedDestinations: string | null;
  permittedChannels: string | null;
  usSuitability: string | null;
  authenticityDocs: string | null;
  stockOwnerName: string | null;
  stockOwnerRef: string | null;
  uniqueLotReference: string | null;
  stockConfidence: string | null;
};

export type RowValidation = {
  issues: Issue[];
  normalized: NormalizedOffer;
  supplierName: string;
  internalSku: string | null;
  gtin14: string | null;
  originalCode: string;
  codeType: "EAN" | "UPC" | "GTIN";
};

const str = (v: unknown): string | null => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s === "" ? null : s;
};

/** Validate one parsed row and return issues plus a normalised record. */
export function validateRow(values: Record<string, unknown>): RowValidation {
  const issues: Issue[] = [];
  const add = (
    code: string,
    message: string,
    severity: Issue["severity"] = "ERROR",
    field?: string,
  ): void => {
    issues.push({ code, message, severity, field });
  };

  // Auto-clean the row into the canonical template vocabulary before
  // validating. Every change is recorded as an INFO issue so the cleaning is
  // visible and auditable on the upload.
  const clean = cleanRow(values);
  values = clean.values;
  for (const note of clean.notes) {
    add(
      "CLEANED",
      `Cleaned ${note.field}: "${note.from}" → "${note.to}" (${note.reason}).`,
      "INFO",
      note.field,
    );
  }

  const originalCodeRaw = str(values.original_code) ?? "";
  const internalSku = str(values.internal_sku);
  const code = analyzeCode(values.original_code);

  if (!originalCodeRaw && !internalSku) {
    add(
      "MISSING_CODE",
      "Provide a Barcode / Code or an Internal SKU.",
      "ERROR",
      "original_code",
    );
  } else if (!originalCodeRaw) {
    add(
      "NO_BARCODE",
      "No barcode supplied; row relies on internal SKU only.",
      "WARNING",
      "original_code",
    );
  } else if (code.kind === "GTIN" && !code.isValidGtin) {
    add(
      "INVALID_CHECK_DIGIT",
      `"${code.raw}" is ${code.length} digits but fails the GTIN check digit.`,
      "ERROR",
      "original_code",
    );
  } else if (code.kind === "INTERNAL") {
    add(
      "NON_NUMERIC_CODE",
      `"${code.raw}" is not a numeric barcode; treated as an internal code.`,
      "INFO",
      "original_code",
    );
  }

  // Code type
  let codeType = (str(values.code_type) ?? "").toUpperCase();
  if (codeType && !["EAN", "UPC", "GTIN"].includes(codeType)) {
    add(
      "BAD_CODE_TYPE",
      `Code Type "${codeType}" is not EAN/UPC/GTIN.`,
      "WARNING",
      "code_type",
    );
    codeType = "";
  }
  if (!codeType) {
    if (code.length === 12) codeType = "UPC";
    else if (code.length === 8 || code.length === 13 || code.length === 14)
      codeType = "EAN";
    else codeType = "GTIN";
  }

  // Supplier
  const supplierName = str(values.supplier_name) ?? "";
  if (!supplierName) {
    add("MISSING_SUPPLIER", "Supplier is required.", "ERROR", "supplier_name");
  }

  // Packaging level
  let packagingLevel = (str(values.packaging_level) ?? "").toUpperCase();
  if (!packagingLevel) {
    packagingLevel = "UNKNOWN";
    add(
      "MISSING_PACKAGING_LEVEL",
      "Packaging level not supplied; defaulted to UNKNOWN.",
      "WARNING",
      "packaging_level",
    );
  } else if (
    !["UNIT", "CASE", "TESTER", "GIFT_SET", "REFILL", "DAMAGED", "UNKNOWN"].includes(
      packagingLevel,
    )
  ) {
    add(
      "BAD_PACKAGING_LEVEL",
      `Packaging level "${packagingLevel}" is not recognised.`,
      "WARNING",
      "packaging_level",
    );
    packagingLevel = "UNKNOWN";
  }
  if (packagingLevel === "UNKNOWN") {
    add(
      "PACKAGING_UNCLASSIFIED",
      "Packaging level is UNKNOWN and must be classified before sale.",
      "WARNING",
      "packaging_level",
    );
  }

  // Price basis + units per case
  let priceBasis = (str(values.price_basis) ?? "").toUpperCase();
  if (priceBasis && !["UNIT", "CASE"].includes(priceBasis)) {
    add(
      "BAD_PRICE_BASIS",
      `Price basis "${priceBasis}" is not UNIT/CASE.`,
      "WARNING",
      "price_basis",
    );
    priceBasis = "";
  }
  const unitsPerCase = intOf(values.units_per_case);
  if (priceBasis === "CASE" && (!unitsPerCase || unitsPerCase <= 0)) {
    add(
      "CASE_WITHOUT_UNITS",
      "A CASE price requires Units per Case so it can be converted to a bottle price.",
      "ERROR",
      "units_per_case",
    );
  }
  if (priceBasis === "CASE" && unitsPerCase && unitsPerCase > 0) {
    add(
      "CASE_TO_UNIT",
      `Bottle price will be shown as price ÷ ${unitsPerCase}. Confirm the units-per-case with the supplier.`,
      "INFO",
      "units_per_case",
    );
  }
  if (packagingLevel === "CASE" && !priceBasis) {
    add(
      "CASE_BASIS_UNKNOWN",
      "A CASE item has no Price Basis — state whether the price is per unit or per case.",
      "WARNING",
      "price_basis",
    );
  }

  // Price & currency
  const currency = (str(values.currency) ?? "").toUpperCase();
  if (!currency) {
    add("MISSING_CURRENCY", "Currency is required.", "ERROR", "currency");
  } else if (!/^[A-Z]{3}$/.test(currency)) {
    add(
      "BAD_CURRENCY",
      `Currency "${currency}" should be a 3-letter code.`,
      "WARNING",
      "currency",
    );
  }
  const price = numberOf(values.price);
  if (price === null) {
    add("MISSING_PRICE", "Price is required.", "ERROR", "price");
  } else if (price <= 0) {
    add("BAD_PRICE", "Price must be greater than zero.", "ERROR", "price");
  }

  // Quantity
  const availableQuantity = numberOf(values.available_quantity);
  if (availableQuantity === null) {
    add(
      "MISSING_QUANTITY",
      "Available quantity is required.",
      "ERROR",
      "available_quantity",
    );
  } else if (availableQuantity < 0) {
    add(
      "BAD_QUANTITY",
      "Available quantity cannot be negative.",
      "ERROR",
      "available_quantity",
    );
  }

  // MOQ / multiples
  const moq = intOf(values.moq);
  if (str(values.moq) && (moq === null || moq <= 0)) {
    add("BAD_MOQ", "MOQ must be a positive whole number.", "WARNING", "moq");
  }
  const orderMultiple = intOf(values.order_multiple);
  if (str(values.order_multiple) && (orderMultiple === null || orderMultiple <= 0)) {
    add(
      "BAD_ORDER_MULTIPLE",
      "Order multiple must be a positive whole number.",
      "WARNING",
      "order_multiple",
    );
  }

  // Size
  const sizeMl = intOf(values.size_ml);
  if (str(values.size_ml) && (sizeMl === null || sizeMl <= 0)) {
    add("BAD_SIZE", "Size (ml) should be a positive whole number.", "WARNING", "size_ml");
  }

  // Dates
  const listDate = dateOf(values.list_date);
  if (str(values.list_date) && !listDate) {
    add("BAD_LIST_DATE", "List date could not be read as a date.", "WARNING", "list_date");
  }
  const validUntil = dateOf(values.valid_until);
  if (str(values.valid_until) && !validUntil) {
    add("BAD_VALID_UNTIL", "Valid-until could not be read as a date.", "WARNING", "valid_until");
  }
  const lastStockConfirmation = dateOf(values.last_stock_confirmation);
  const manufactureDate = dateOf(values.manufacture_date) ?? null;
  const readyDate = dateOf(values.ready_date) ?? null;

  const normalized: NormalizedOffer = {
    originalCode: originalCodeRaw,
    originalCodeType: codeType,
    gtin14: code.gtin14,
    codeIsGtin: code.isValidGtin,
    internalSku,
    supplierName,
    supplierOfferId: str(values.supplier_offer_id),
    listDate,
    validUntil,
    lastStockConfirmation,
    packagingLevel,
    unitsPerCase,
    hasCap: boolOf(values.has_cap),
    hasBox: boolOf(values.has_box),
    sealed: boolOf(values.sealed),
    damageStatus: str(values.damage_status),
    batchOrLotRef: str(values.batch_lot_ref) ?? str(values.unique_lot_reference),
    manufactureDate,
    currency: currency || null,
    price,
    priceBasis: priceBasis || null,
    availableQuantity,
    quantityUnit: str(values.quantity_unit),
    moq,
    orderMultiple,
    priceTierMin: intOf(values.price_tier_min),
    priceTierMax: intOf(values.price_tier_max),
    stockCountry: str(values.stock_country),
    warehouse: str(values.warehouse),
    countryOfOrigin: str(values.country_of_origin),
    incoterm: str(values.incoterm),
    namedPlace: str(values.named_place),
    readyDate,
    leadTimeDays: intOf(values.lead_time_days),
    paymentTerms: str(values.payment_terms),
    freightInclusions: str(values.freight_inclusions),
    permittedDestinations: str(values.permitted_destinations),
    permittedChannels: str(values.permitted_channels),
    usSuitability: str(values.us_suitability),
    authenticityDocs: str(values.authenticity_docs),
    stockOwnerName: str(values.stock_owner_name),
    stockOwnerRef: str(values.stock_owner_ref),
    uniqueLotReference: str(values.unique_lot_reference),
    stockConfidence: str(values.stock_confidence),
    brand: str(values.brand),
    fragranceName: str(values.fragrance_name),
    concentration: str(values.concentration),
    sizeMl,
    genderOrCategory: str(values.gender_category),
    setContents: str(values.set_contents),
  };

  return {
    issues,
    normalized,
    supplierName,
    internalSku,
    gtin14: code.gtin14,
    originalCode: originalCodeRaw,
    codeType: codeType as "EAN" | "UPC" | "GTIN",
  };
}

const numberOf = (v: unknown): number | null => {
  const n = Number(
    typeof v === "string" ? v.replace(/[,\s$]/g, "") : v,
  );
  return v === null || v === undefined || v === "" || !Number.isFinite(n)
    ? null
    : n;
};
const intOf = (v: unknown): number | null => {
  const n = numberOf(v);
  return n === null ? null : Number.isInteger(n) ? n : null;
};
const boolOf = (v: unknown): boolean | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "y", "1", "x"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
};
const dateOf = (v: unknown): Date | null => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  const d = new Date(/^\d{4}-\d{2}-\d{2}/.test(s) ? s : s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const ALLOWED_CODE_TYPES = ["EAN", "UPC", "GTIN"] as const;
export const ALLOWED_PACKAGING_LEVELS = [
  "UNIT",
  "CASE",
  "TESTER",
  "GIFT_SET",
  "REFILL",
  "DAMAGED",
  "UNKNOWN",
] as const;
