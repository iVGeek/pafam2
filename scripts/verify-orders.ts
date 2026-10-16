// Verifies order maths (whole-box quantities, totals) and PFI variance/parsing.
// Pure functions — no database required.
// Run: npx tsx scripts/verify-orders.ts
import { loadEnvFile } from "node:process";
try {
  loadEnvFile();
} catch {}

import { lineUnits, orderTotals, computePfiVariance } from "../src/lib/orders";
import { parsePfiTextLine, parsePfiText } from "../src/lib/pfi";

let failures = 0;
function assert(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}

// --- Whole-box quantities ---
assert("lineUnits(12,3) = 36", lineUnits(12, 3) === 36);
assert("lineUnits(0,5) = 5 (units-per-case falls back to 1)", lineUnits(0, 5) === 5);
assert("lineUnits(24,0) = 0", lineUnits(24, 0) === 0);

// --- Totals ---
const totals = orderTotals(
  [
    { units: 24, cases: 2, unitCost: 5 },
    { units: 36, cases: 3, unitCost: null },
  ],
  1.1,
);
assert("totals.units = 60", totals.units === 60);
assert("totals.cases = 5", totals.cases === 5);
assert("totals.lineCount = 2", totals.lineCount === 2);
assert("totals.value = 120", totals.value === 120);
assert("totals.valueUsd = 132", Math.round(totals.valueUsd * 100) / 100 === 132);
assert("totals.complete = false (one cost missing)", totals.complete === false);

const completeTotals = orderTotals([{ units: 10, cases: 1, unitCost: 2.5 }], null);
assert("completeTotals.value = 25", completeTotals.value === 25);
assert("completeTotals.complete = true", completeTotals.complete === true);

// --- PFI variance ---
const variance = computePfiVariance(
  [
    { originalCode: "4006381333931", brand: "Dior", fragranceName: "Sauvage", concentration: "EDP", sizeMl: 100, packagingLevel: "UNIT", units: 120, unitCost: 70 },
    { originalCode: "3600541456789", brand: "Chanel", fragranceName: "Bleu", concentration: "EDP", sizeMl: 100, packagingLevel: "UNIT", units: 60, unitCost: 90 },
    { originalCode: "1111111111111", brand: "Acme", fragranceName: "Extra", concentration: null, sizeMl: null, packagingLevel: "UNIT", units: 10, unitCost: 1 },
  ],
  [
    { originalCode: "4006381333931", brand: "Dior", name: "Sauvage", quantity: 120, unitPrice: 74.5 },
    { originalCode: "3600541456789", brand: "Chanel", name: "Bleu", quantity: 48, unitPrice: 92 },
    { originalCode: "1111111111111", brand: "Acme", name: "Extra", quantity: 20, unitPrice: 1 },
    { originalCode: "9999999999999", brand: "New", name: "Item", quantity: 10, unitPrice: 5 },
  ],
);
assert("variance matched = 1", variance.summary.matched === 1);
assert("variance short = 1", variance.summary.short === 1);
assert("variance over = 1", variance.summary.over === 1);
assert("variance missing = 1", variance.summary.missing === 1);
assert("variance absent = 0", variance.summary.absent === 0);
assert("variance orderedUnits = 190", variance.summary.orderedUnits === 190);
assert("variance invoicedUnits = 198", variance.summary.invoicedUnits === 198);

const sauvage = variance.lines.find((l) => l.code === "4006381333931");
assert("Sauvage status match", sauvage?.status === "match");
assert("Sauvage priceDiff = 4.5", sauvage?.priceDiff === 4.5);
const bleu = variance.lines.find((l) => l.code === "3600541456789");
assert("Bleu status short", bleu?.status === "short");
assert("Bleu quantityDiff = -12", bleu?.quantityDiff === -12);

// --- PFI text parsing ---
const line = parsePfiTextLine("4006381333931    Dior Sauvage EDP   120   74.50   USD");
assert("parsed code", line?.originalCode === "4006381333931");
assert("parsed quantity = 120", line?.quantity === 120);
assert("parsed unitPrice = 74.50", line?.unitPrice === 74.5);
assert("parsed currency = USD", line?.currency === "USD");
assert("parsed name = 'Dior Sauvage EDP'", line?.name === "Dior Sauvage EDP");

assert("header line ignored", parsePfiTextLine("Code Description Qty Price") === null);
assert("total line ignored", parsePfiTextLine("Subtotal 120 8940.00") === null);
assert("proforma title ignored", parsePfiTextLine("PROFORMA INVOICE PFI-2026-001") === null);
assert(
  "row without code kept",
  parsePfiTextLine("No-Name Lotion 10 5.00")?.quantity === 10,
);

const multi = parsePfiText(
  [
    "PROFORMA INVOICE",
    "Code Description Qty Price",
    "4006381333931 Dior Sauvage EDP 120 74.50",
    "3600541456789 Chanel Bleu EDP 60 92.00",
    "Grand total 166",
  ].join("\n"),
);
assert("multi-line text yields 2 line items", multi.length === 2);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
