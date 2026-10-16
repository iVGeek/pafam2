// Verifies the price-list comparison engine: matching, additions/removals,
// percentage change, cross-currency USD comparison and quantity change.
// Pure functions — no database required.
// Run: npx tsx scripts/verify-compare.ts
import { loadEnvFile } from "node:process";
try {
  loadEnvFile();
} catch {}

import { comparePriceLists, toPriceListRow } from "../src/lib/compare";

let failures = 0;
function assert(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}

const row = (values: Record<string, unknown>, n: number) =>
  toPriceListRow(values, n);

const fx = { USD: 1, EUR: 1.1 };

// --- Matching and price change (same currency) ---
const left = [
  row({ original_code: "111", brand: "Dior", fragrance_name: "Sauvage", packaging_level: "UNIT", price: "50", currency: "USD", available_quantity: "100" }, 2),
  row({ original_code: "222", brand: "Dior", fragrance_name: "Homme", packaging_level: "UNIT", price: "40", currency: "USD", available_quantity: "50" }, 3),
  row({ original_code: "333", brand: "Chanel", fragrance_name: "Bleu", packaging_level: "UNIT", price: "60", currency: "USD", available_quantity: "10" }, 4),
];
const right = [
  row({ original_code: "111", brand: "Dior", fragrance_name: "Sauvage", packaging_level: "UNIT", price: "55", currency: "USD", available_quantity: "120" }, 2),
  row({ original_code: "222", brand: "Dior", fragrance_name: "Homme", packaging_level: "UNIT", price: "40", currency: "USD", available_quantity: "50" }, 3),
  row({ original_code: "444", brand: "Chanel", fragrance_name: "No5", packaging_level: "UNIT", price: "70", currency: "USD", available_quantity: "5" }, 5),
];

const result = comparePriceLists(left, right, fx);
assert("matched rows = 2", result.summary.matched === 2);
assert("added = 1", result.summary.added === 1);
assert("removed = 1", result.summary.removed === 1);
assert("changed = 1 (Sauvage)", result.summary.changed === 1);
assert("same = 1 (Homme)", result.summary.same === 1);

const sauvage = result.diffs.find((d) => d.label.includes("Sauvage"));
assert("Sauvage price change = +10%", sauvage?.priceChangePct === 10);
assert("Sauvage qty change = +20", sauvage?.quantityChange === 20);
const homme = result.diffs.find((d) => d.label.includes("Homme"));
assert("Homme marked same", homme?.status === "same");

// --- Cross-currency comparison uses USD value ---
const eurLeft = [
  row({ original_code: "999", brand: "X", fragrance_name: "Y", packaging_level: "UNIT", price: "100", currency: "EUR" }, 2),
];
const eurRight = [
  row({ original_code: "999", brand: "X", fragrance_name: "Y", packaging_level: "UNIT", price: "112", currency: "EUR" }, 2),
];
const eur = comparePriceLists(eurLeft, eurRight, fx);
const eurDiff = eur.diffs[0];
assert("EUR left USD = 110", eurDiff.leftPriceUsd === 110);
assert("EUR right USD = 123.2", Math.round((eurDiff.rightPriceUsd ?? 0) * 100) / 100 === 123.2);
assert("EUR USD change = +12%", eurDiff.usdChangePct === 12);
assert("same-currency price % available", eurDiff.priceChangePct === 12);

// --- Currency change is flagged ---
const curLeft = [row({ original_code: "777", brand: "Z", fragrance_name: "Q", packaging_level: "UNIT", price: "10", currency: "GBP" }, 2)];
const curRight = [row({ original_code: "777", brand: "Z", fragrance_name: "Q", packaging_level: "UNIT", price: "10", currency: "USD" }, 2)];
const cur = comparePriceLists(curLeft, curRight, { USD: 1 });
assert("currency change counted", cur.summary.currencyChanged === 1);
assert("no same-currency price % when currency differs", cur.diffs[0].priceChangePct === null);

// --- Matching by internal SKU takes precedence ---
const skuLeft = [row({ internal_sku: "SKU-1", original_code: "0001", packaging_level: "UNIT", price: "5", currency: "USD" }, 2)];
const skuRight = [row({ internal_sku: "SKU-1", original_code: "0002", packaging_level: "UNIT", price: "6", currency: "USD" }, 2)];
const sku = comparePriceLists(skuLeft, skuRight, {});
assert("SKU match yields 1 matched", sku.summary.matched === 1);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
