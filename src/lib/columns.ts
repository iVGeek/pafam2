export type ColumnGroup =
  | "Matching keys"
  | "Source & dates"
  | "Packaging & condition"
  | "Price & quantity"
  | "Logistics & terms"
  | "Eligibility & evidence"
  | "Ownership";

export type Requirement = "required" | "recommended" | "optional";

export type ColumnDef = {
  key: string;
  header: string;
  group: ColumnGroup;
  requirement: Requirement;
  example: string;
  help: string;
};

/**
 * Canonical supplier Excel template. The same columns are used for import and
 * export so files round-trip cleanly. Header order is the template order.
 */
export const COLUMNS: ColumnDef[] = [
  // --- Matching keys ---
  {
    key: "original_code",
    header: "Barcode / Code",
    group: "Matching keys",
    requirement: "required",
    example: "3605533223300",
    help: "EAN/UPC/GTIN or internal code, as text (leading zeros matter).",
  },
  {
    key: "code_type",
    header: "Code Type",
    group: "Matching keys",
    requirement: "optional",
    example: "EAN",
    help: "EAN, UPC or GTIN. Left blank, the type is detected.",
  },
  {
    key: "internal_sku",
    header: "Internal SKU",
    group: "Matching keys",
    requirement: "optional",
    example: "",
    help: "Fill in only when the supplier already uses our SKU.",
  },
  {
    key: "brand",
    header: "Brand",
    group: "Matching keys",
    requirement: "recommended",
    example: "Dior",
    help: "House name.",
  },
  {
    key: "fragrance_name",
    header: "Fragrance / Product Name",
    group: "Matching keys",
    requirement: "recommended",
    example: "Sauvage",
    help: "Product name.",
  },
  {
    key: "concentration",
    header: "Concentration",
    group: "Matching keys",
    requirement: "optional",
    example: "EDP",
    help: "EDP / EDT / Parfum / etc.",
  },
  {
    key: "size_ml",
    header: "Size (ml)",
    group: "Matching keys",
    requirement: "optional",
    example: "100",
    help: "Numeric millilitres.",
  },
  {
    key: "gender_category",
    header: "Gender / Category",
    group: "Matching keys",
    requirement: "optional",
    example: "Men",
    help: "Men / Women / Unisex / other category.",
  },
  {
    key: "set_contents",
    header: "Set Contents",
    group: "Matching keys",
    requirement: "optional",
    example: "",
    help: "Description when the item is a set/coffret.",
  },

  // --- Source & dates ---
  {
    key: "supplier_name",
    header: "Supplier",
    group: "Source & dates",
    requirement: "required",
    example: "ACME Fragrances LLC",
    help: "Broker/supplier name. Created automatically if new.",
  },
  {
    key: "supplier_offer_id",
    header: "Supplier Offer ID",
    group: "Source & dates",
    requirement: "optional",
    example: "OFF-2026-0042",
    help: "Supplier's own offer reference.",
  },
  {
    key: "list_date",
    header: "List Date",
    group: "Source & dates",
    requirement: "recommended",
    example: "2026-10-01",
    help: "Date of the offer list (YYYY-MM-DD).",
  },
  {
    key: "valid_until",
    header: "Valid Until",
    group: "Source & dates",
    requirement: "optional",
    example: "2026-10-15",
    help: "Offer expiry date.",
  },
  {
    key: "last_stock_confirmation",
    header: "Last Stock Confirmation",
    group: "Source & dates",
    requirement: "optional",
    example: "2026-10-08",
    help: "When the supplier last confirmed stock.",
  },

  // --- Packaging & condition ---
  {
    key: "packaging_level",
    header: "Packaging Level",
    group: "Packaging & condition",
    requirement: "required",
    example: "UNIT",
    help: "UNIT / CASE / TESTER / GIFT_SET / REFILL / DAMAGED / UNKNOWN.",
  },
  {
    key: "units_per_case",
    header: "Units / Case",
    group: "Packaging & condition",
    requirement: "optional",
    example: "",
    help: "Required when a case price is quoted.",
  },
  {
    key: "has_cap",
    header: "Has Cap",
    group: "Packaging & condition",
    requirement: "optional",
    example: "yes",
    help: "yes / no.",
  },
  {
    key: "has_box",
    header: "Has Box",
    group: "Packaging & condition",
    requirement: "optional",
    example: "yes",
    help: "yes / no.",
  },
  {
    key: "sealed",
    header: "Sealed",
    group: "Packaging & condition",
    requirement: "optional",
    example: "yes",
    help: "yes / no.",
  },
  {
    key: "damage_status",
    header: "Damage Status",
    group: "Packaging & condition",
    requirement: "optional",
    example: "",
    help: "Free text description of damage, if any.",
  },
  {
    key: "batch_lot_ref",
    header: "Batch / Lot Ref",
    group: "Packaging & condition",
    requirement: "optional",
    example: "LOT-A123",
    help: "Supplier batch/lot reference.",
  },
  {
    key: "manufacture_date",
    header: "Manufacture Date",
    group: "Packaging & condition",
    requirement: "optional",
    example: "2024-03",
    help: "Production date/period.",
  },

  // --- Price & quantity ---
  {
    key: "currency",
    header: "Currency",
    group: "Price & quantity",
    requirement: "required",
    example: "USD",
    help: "3-letter ISO currency code.",
  },
  {
    key: "price",
    header: "Price",
    group: "Price & quantity",
    requirement: "required",
    example: "74.50",
    help: "Unit price in the stated currency.",
  },
  {
    key: "price_basis",
    header: "Price Basis",
    group: "Price & quantity",
    requirement: "optional",
    example: "UNIT",
    help: "UNIT or CASE — what the price refers to.",
  },
  {
    key: "available_quantity",
    header: "Available Quantity",
    group: "Price & quantity",
    requirement: "required",
    example: "120",
    help: "Quantity available at this offer.",
  },
  {
    key: "quantity_unit",
    header: "Quantity Unit",
    group: "Price & quantity",
    requirement: "optional",
    example: "units",
    help: "units / cases / pieces.",
  },
  {
    key: "moq",
    header: "MOQ",
    group: "Price & quantity",
    requirement: "optional",
    example: "12",
    help: "Minimum order quantity.",
  },
  {
    key: "order_multiple",
    header: "Order Multiple",
    group: "Price & quantity",
    requirement: "optional",
    example: "6",
    help: "Must be ordered in multiples of this.",
  },
  {
    key: "price_tier_min",
    header: "Price Tier From",
    group: "Price & quantity",
    requirement: "optional",
    example: "",
    help: "Lower bound of this price tier.",
  },
  {
    key: "price_tier_max",
    header: "Price Tier To",
    group: "Price & quantity",
    requirement: "optional",
    example: "",
    help: "Upper bound of this price tier.",
  },

  // --- Logistics & terms ---
  {
    key: "stock_country",
    header: "Stock Country",
    group: "Logistics & terms",
    requirement: "optional",
    example: "AE",
    help: "Country where stock physically sits.",
  },
  {
    key: "warehouse",
    header: "Warehouse",
    group: "Logistics & terms",
    requirement: "optional",
    example: "DXB Free Zone",
    help: "Warehouse / location name.",
  },
  {
    key: "country_of_origin",
    header: "Country of Origin",
    group: "Logistics & terms",
    requirement: "optional",
    example: "FR",
    help: "Manufacturing origin.",
  },
  {
    key: "incoterm",
    header: "Incoterm",
    group: "Logistics & terms",
    requirement: "optional",
    example: "FOB",
    help: "Incoterm code.",
  },
  {
    key: "named_place",
    header: "Named Place",
    group: "Logistics & terms",
    requirement: "optional",
    example: "Jebel Ali",
    help: "Named place for the Incoterm.",
  },
  {
    key: "ready_date",
    header: "Ready Date",
    group: "Logistics & terms",
    requirement: "optional",
    example: "2026-06-01",
    help: "Date stock is ready to ship.",
  },
  {
    key: "lead_time_days",
    header: "Lead Time (days)",
    group: "Logistics & terms",
    requirement: "optional",
    example: "14",
    help: "Days from order to dispatch.",
  },
  {
    key: "payment_terms",
    header: "Payment Terms",
    group: "Logistics & terms",
    requirement: "optional",
    example: "30% deposit",
    help: "Payment terms.",
  },
  {
    key: "freight_inclusions",
    header: "Freight Inclusions",
    group: "Logistics & terms",
    requirement: "optional",
    example: "excl. freight",
    help: "What freight is/isn't included.",
  },

  // --- Eligibility & evidence ---
  {
    key: "permitted_destinations",
    header: "Permitted Destinations",
    group: "Eligibility & evidence",
    requirement: "optional",
    example: "Worldwide",
    help: "Where this stock may be sold.",
  },
  {
    key: "permitted_channels",
    header: "Permitted Channels",
    group: "Eligibility & evidence",
    requirement: "optional",
    example: "Wholesale only",
    help: "Allowed sales channels.",
  },
  {
    key: "us_suitability",
    header: "US Suitability",
    group: "Eligibility & evidence",
    requirement: "optional",
    example: "yes",
    help: "Whether the offer is suitable for the USA.",
  },
  {
    key: "authenticity_docs",
    header: "Authenticity Docs",
    group: "Eligibility & evidence",
    requirement: "optional",
    example: "supplier letter",
    help: "Evidence of authenticity provided.",
  },

  // --- Ownership ---
  {
    key: "stock_owner_name",
    header: "Stock Owner",
    group: "Ownership",
    requirement: "optional",
    example: "Gulf Holdings FZE",
    help: "Registered owner of the stock. Created if new.",
  },
  {
    key: "stock_owner_ref",
    header: "Stock Owner Ref",
    group: "Ownership",
    requirement: "optional",
    example: "SO-1188",
    help: "Owner's reference.",
  },
  {
    key: "unique_lot_reference",
    header: "Unique Lot Reference",
    group: "Ownership",
    requirement: "optional",
    example: "LOT-DXB-7781",
    help: "Unique lot reference, where available.",
  },
  {
    key: "stock_confidence",
    header: "Stock Confidence",
    group: "Ownership",
    requirement: "optional",
    example: "confirmed",
    help: "e.g. confirmed / probable / unverified.",
  },
];

export const REQUIRED_KEYS = COLUMNS.filter(
  (c) => c.requirement === "required",
).map((c) => c.key);

export const HEADER_TO_KEY = new Map(COLUMNS.map((c) => [c.header, c.key]));
export const KEY_TO_COLUMN = new Map(COLUMNS.map((c) => [c.key, c]));
