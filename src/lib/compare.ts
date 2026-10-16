// Price-list comparison.
//
// Compares two price lists / offers (two supplier offers, a previous vs a
// current list, or our own list) row by row and reports what was added, removed
// or repriced — including the percentage change. Prices in different currencies
// are compared on their USD value using the supplied dated rates.
//
// Pure functions: no database access. Rows are the cleaned canonical-key values
// produced by the import parser/cleaner.

import {
  cleanCode,
  cleanConcentration,
  cleanCurrency,
  cleanNumber,
  cleanPackagingLevel,
  cleanSizeMl,
  cleanText,
} from "./clean";

export type PriceListRow = {
  rowNumber: number;
  key: string;
  code: string | null;
  internalSku: string | null;
  brand: string | null;
  name: string | null;
  sizeMl: number | null;
  concentration: string | null;
  packagingLevel: string | null;
  currency: string | null;
  price: number | null;
  quantity: number | null;
  label: string;
};

export type FxMap = Record<string, number>;

export type PriceDiff = {
  key: string;
  label: string;
  left: PriceListRow | null;
  right: PriceListRow | null;
  status: "added" | "removed" | "changed" | "same";
  /** % change in the listed price (same currency only). */
  priceChangePct: number | null;
  /** % change in USD value (works across currencies). */
  usdChangePct: number | null;
  leftPriceUsd: number | null;
  rightPriceUsd: number | null;
  quantityChange: number | null;
};

export type CompareResult = {
  summary: {
    leftRows: number;
    rightRows: number;
    added: number;
    removed: number;
    changed: number;
    same: number;
    /** Rows present in both lists. */
    matched: number;
    /** Rows where the currency differs between lists. */
    currencyChanged: number;
  };
  diffs: PriceDiff[];
};

const norm = (value: string | number | null): string =>
  String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function firstText(values: Record<string, unknown>, key: string): string | null {
  return cleanText(values[key]);
}

/** Build a comparable row from cleaned canonical-key values. */
export function toPriceListRow(
  values: Record<string, unknown>,
  rowNumber: number,
): PriceListRow {
  const code = firstText(values, "original_code");
  const internalSku = cleanText(values.internal_sku);
  const brand = cleanText(values.brand);
  const name = cleanText(values.fragrance_name);
  const sizeMl = cleanSizeMl(values.size_ml);
  const concentration = cleanConcentration(values.concentration);
  const packagingLevel = cleanPackagingLevel(values.packaging_level);
  const currency = cleanCurrency(values.currency);
  const price = cleanNumber(values.price);
  const quantity = cleanNumber(values.available_quantity);

  const key =
    (internalSku && `sku:${norm(internalSku)}`) ||
    (code && `code:${norm(cleanCode(code) ?? code)}`) ||
    `desc:${[brand, name, sizeMl, concentration, packagingLevel]
      .map(norm)
      .join("|")}`;

  const label =
    [
      brand,
      name,
      sizeMl !== null ? `${sizeMl}ml` : null,
      concentration,
      packagingLevel,
    ]
      .filter(Boolean)
      .join(" ") || code || "Unknown row";

  return {
    rowNumber,
    key,
    code,
    internalSku,
    brand,
    name,
    sizeMl,
    concentration,
    packagingLevel,
    currency,
    price,
    quantity,
    label,
  };
}

function usdValue(
  price: number | null,
  currency: string | null,
  fx: FxMap,
): number | null {
  if (price === null) return null;
  const code = (currency ?? "USD").toUpperCase();
  if (code === "USD") return price;
  const rate = fx[code];
  if (!rate || rate <= 0) return null;
  return Math.round(price * rate * 10000) / 10000;
}

function pctChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null;
  return Math.round(((to - from) / Math.abs(from)) * 10000) / 100;
}

export function comparePriceLists(
  leftRows: PriceListRow[],
  rightRows: PriceListRow[],
  fx: FxMap = {},
): CompareResult {
  const index = (rows: PriceListRow[]) => {
    const map = new Map<string, PriceListRow>();
    for (const row of rows) if (!map.has(row.key)) map.set(row.key, row);
    return map;
  };

  const left = index(leftRows);
  const right = index(rightRows);
  const keys = new Set<string>([...left.keys(), ...right.keys()]);

  const diffs: PriceDiff[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  let same = 0;
  let matched = 0;
  let currencyChanged = 0;

  for (const key of keys) {
    const l = left.get(key) ?? null;
    const r = right.get(key) ?? null;

    if (l && !r) {
      removed++;
      diffs.push(blankDiff(key, l, null, "removed"));
      continue;
    }
    if (!l && r) {
      added++;
      diffs.push(blankDiff(key, null, r, "added"));
      continue;
    }
    if (!l || !r) continue;

    matched++;
    const lUsd = usdValue(l.price, l.currency, fx);
    const rUsd = usdValue(r.price, r.currency, fx);
    const usdChangePct = pctChange(lUsd, rUsd);
    const sameCurrency = (l.currency ?? "USD") === (r.currency ?? "USD");
    const priceChangePct = sameCurrency ? pctChange(l.price, r.price) : null;
    if (!sameCurrency) currencyChanged++;
    const quantityChange =
      l.quantity !== null && r.quantity !== null
        ? r.quantity - l.quantity
        : null;

    const isChanged =
      (usdChangePct !== null && Math.abs(usdChangePct) > 0.001) ||
      quantityChange !== null && quantityChange !== 0 ||
      !sameCurrency;
    if (isChanged) changed++;
    else same++;

    diffs.push({
      key,
      label: r?.label ?? l?.label ?? key,
      left: l,
      right: r,
      status: isChanged ? "changed" : "same",
      priceChangePct,
      usdChangePct,
      leftPriceUsd: lUsd,
      rightPriceUsd: rUsd,
      quantityChange,
    });
  }

  const rank = (d: PriceDiff) =>
    d.left && d.right ? 0 : 1;
  const magnitude = (d: PriceDiff) => Math.abs(d.usdChangePct ?? 0);
  diffs.sort((a, b) => {
    const byPresence = rank(a) - rank(b);
    if (byPresence !== 0) return byPresence;
    const byChange = Number(b.status === "changed") - Number(a.status === "changed");
    if (byChange !== 0) return byChange;
    return magnitude(b) - magnitude(a);
  });

  return {
    summary: {
      leftRows: leftRows.length,
      rightRows: rightRows.length,
      added,
      removed,
      changed,
      same,
      matched,
      currencyChanged,
    },
    diffs,
  };
}

function blankDiff(
  key: string,
  left: PriceListRow | null,
  right: PriceListRow | null,
  status: "added" | "removed",
): PriceDiff {
  return {
    key,
    label: (right ?? left)?.label ?? key,
    left,
    right,
    status,
    priceChangePct: null,
    usdChangePct: null,
    leftPriceUsd: null,
    rightPriceUsd: null,
    quantityChange: null,
  };
}
