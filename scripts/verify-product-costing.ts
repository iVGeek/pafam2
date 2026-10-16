// Verifies per-product costing: FX conversion (unit and case), landed cost with
// freight + duty, best-supplier ranking, and margin at an actual sell price.
// Pure functions — no database required.
// Run: npx tsx scripts/verify-product-costing.ts
import { loadEnvFile } from "node:process";
try {
  loadEnvFile();
} catch {}

import { offerUnitUsd, landOffer, rankOffersByLanded, marginAtSellPrice } from "../src/lib/product-costing";

let failures = 0;
function assert(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}
function close(a: number, b: number, tol = 0.01): boolean {
  return Math.abs(a - b) <= tol;
}

// --- FX conversion ---
assert(
  "unit price EUR -> USD",
  offerUnitUsd({ price: 100, currency: "EUR", priceBasis: "UNIT", unitsPerCase: null }, 1.1) === 110,
);
assert(
  "case price EUR -> USD per unit",
  offerUnitUsd({ price: 1200, currency: "EUR", priceBasis: "CASE", unitsPerCase: 12 }, 1.1) === 110,
);
assert(
  "USD is unchanged",
  offerUnitUsd({ price: 42, currency: "USD", priceBasis: "UNIT", unitsPerCase: null }, 1) === 42,
);

// --- Landed cost with freight + duty ---
const assumptions = {
  fxByCurrency: { USD: 1, EUR: 1.1 },
  freightPerUnitUsd: 5,
  dutyPct: 10,
  targetMarginPct: 20,
};
const cost = landOffer(
  { price: 100, currency: "USD", priceBasis: "UNIT", unitsPerCase: null },
  assumptions,
);
assert("buy/unit = 100", cost.buyUnitUsd === 100);
assert("freight = 5", cost.freightPerUnitUsd === 5);
assert("duty = 10 (10% of CP)", cost.dutyPerUnitUsd === 10);
assert("landed = 115", close(cost.landedUnitCost, 115));
assert("break-even = 115", close(cost.breakEvenSellingPriceUsd, 115));
assert(
  "suggested SP for 20% margin = 143.75",
  cost.minSellPriceUsd !== null && close(cost.minSellPriceUsd, 143.75),
);

// --- Margin at an actual sell price ---
const margin = marginAtSellPrice(
  { price: 100, currency: "USD", priceBasis: "UNIT", unitsPerCase: null },
  assumptions,
  143.75,
);
assert("contribution margin at suggested SP = 20%", close(margin.contributionMarginPct, 20, 0.05));

const marginLow = marginAtSellPrice(
  { price: 100, currency: "USD", priceBasis: "UNIT", unitsPerCase: null },
  assumptions,
  115,
);
assert("margin at break-even = 0%", close(marginLow.contributionMarginPct, 0, 0.05));

// --- Best-supplier ranking on landed cost, not sticker price ---
const offers = [
  { id: "eur", price: 95, currency: "EUR", priceBasis: "UNIT" as const, unitsPerCase: null },
  { id: "usd", price: 108, currency: "USD", priceBasis: "UNIT" as const, unitsPerCase: null },
];
const ranked = rankOffersByLanded(offers, {
  fxByCurrency: { USD: 1, EUR: 1.1 },
  freightPerUnitUsd: 0,
  dutyPct: 0,
  targetMarginPct: 20,
});
assert("cheapest landed is first", ranked[0].offer.id === "eur");
assert("EUR landed = 104.5", close(ranked[0].cost.landedUnitCost, 104.5));
assert("USD offer is 108", close(ranked[1].cost.landedUnitCost, 108));

const flip = rankOffersByLanded(offers, {
  fxByCurrency: { USD: 1, EUR: 1.2 },
  freightPerUnitUsd: 0,
  dutyPct: 0,
  targetMarginPct: 20,
});
assert("at fx 1.2 the USD offer wins", flip[0].offer.id === "usd");

const noFx = rankOffersByLanded(
  [
    { id: "gbp", price: 90, currency: "GBP", priceBasis: "UNIT" as const, unitsPerCase: null },
    { id: "usd", price: 108, currency: "USD", priceBasis: "UNIT" as const, unitsPerCase: null },
  ],
  { fxByCurrency: { USD: 1 }, freightPerUnitUsd: 0, dutyPct: 0, targetMarginPct: 20 },
);
assert("no-FX offer ranked last", noFx[0].offer.id === "usd" && noFx[1].cost.hasFx === false);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
