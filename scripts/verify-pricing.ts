// Verifies the profitability engine against the §9 illustration and other
// acceptance rules (§20). Run: npx tsx scripts/verify-pricing.ts
import {
  computeProfitability,
  round,
  type ProfitabilityInput,
} from "../src/lib/pricing";
import { DEFAULT_SCENARIOS, runScenarios } from "../src/lib/scenarios";

let failures = 0;
function check(label: string, actual: number | null, expected: number, tolerance = 0.01) {
  const ok = actual !== null && Math.abs(actual - expected) <= tolerance;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${actual}, expected ${expected}`);
}

// §9 illustration: buy 1,000 bottles at $30, inbound $3,000, sell $40,
// outbound $2,000, deployed capital $35,000, 90-day cycle.
const illustration: ProfitabilityInput = {
  quantity: 1000,
  buyCurrency: "USD",
  buyPrice: 30,
  sellingPriceUsd: 40,
  inboundCosts: [{ category: "FREIGHT", amount: 2000 }, { category: "DUTY", amount: 1000 }],
  inboundCostsComplete: true,
  outboundCosts: [{ category: "OUTBOUND", amount: 1500 }, { category: "COMMISSION", amount: 500 }],
  cashCycleDays: 90,
  deployedCapitalUsd: 35000,
  requiredContributionMarginPct: 10,
};

const r = computeProfitability(illustration);
console.log("\n--- §9 illustration ---");
check("landed unit cost", r.landedUnitCost, 33, 0.0001);
check("net unit revenue", r.netUnitRevenue, 40, 0.0001);
check("gross profit", r.grossProfit, 7000, 0.01);
check("gross margin %", r.grossMarginPct, 17.5, 0.0001);
check("deal contribution", r.dealContribution, 5000, 0.01);
check("contribution margin %", r.contributionMarginPct, 12.5, 0.0001);
check("capital efficiency %", r.capitalEfficiencyPct, 14.29, 0.01);
check("annualised return %", r.annualisedReturnPct, 57.94, 0.05);
console.log(`meets required 10% contribution margin: ${r.meetsRequiredContribution}`);
console.log(`min sell price for 10% margin: ${r.minSellPriceUsd}`);
console.log(`max buy price (USD): ${r.maxBuyPriceUsd}`);

// Case pricing + FX: EUR supplier, €240/case, 12 per case, EUR->USD 1.10.
console.log("\n--- case + FX ---");
const caseDeal = computeProfitability({
  quantity: 120,
  buyCurrency: "EUR",
  buyPrice: 240,
  buyPriceBasis: "CASE",
  unitsPerCase: 12,
  fxRate: 1.1,
  sellingPriceUsd: 30,
  inboundCosts: [{ category: "FREIGHT", amount: 200, recoverable: false }],
  inboundCostsComplete: true,
  cashCycleDays: 60,
});
check("buy unit price (USD)", caseDeal.buyUnitPriceUsd, 22, 0.0001); // 240/12*1.1
check("landed unit cost", caseDeal.landedUnitCost, round(22 + 200 / 120, 4), 0.0001);

// Incomplete profitability must be flagged, not silently zero-cost (§8.3).
console.log("\n--- incomplete inputs ---");
const noCosts = computeProfitability({
  quantity: 100,
  buyCurrency: "USD",
  buyPrice: 10,
  sellingPriceUsd: 20,
});
console.log(`incomplete: ${noCosts.incomplete}; missing: ${noCosts.missingInputs.join("; ")}`);
if (!noCosts.incomplete) failures++;

const noFx = computeProfitability({
  quantity: 100,
  buyCurrency: "GBP",
  buyPrice: 10,
  sellingPriceUsd: 20,
  inboundCostsComplete: true,
  inboundCosts: [],
});
console.log(`non-USD without FX incomplete: ${noFx.incomplete}; missing: ${noFx.missingInputs.join("; ")}`);
if (!noFx.incomplete) failures++;

// Scenarios.
console.log("\n--- scenarios ---");
for (const { scenario, result } of runScenarios(illustration)) {
  console.log(
    `${scenario.label.padEnd(16)} contribution=${String(result.dealContribution).padStart(9)} ` +
      `margin%=${String(result.contributionMarginPct).padStart(7)} ` +
      `annualised%=${String(result.annualisedReturnPct).padStart(7)}`,
  );
}
console.log(`scenarios defined: ${DEFAULT_SCENARIOS.length}`);

// Quantity-tier / MOQ constraints must surface as warnings, not blockers (§7.1).
console.log("\n--- quantity constraints ---");
const constrained = computeProfitability({
  quantity: 45,
  buyCurrency: "USD",
  buyPrice: 10,
  sellingPriceUsd: 20,
  inboundCostsComplete: true,
  inboundCosts: [{ category: "FREIGHT", amount: 100 }],
  moq: 100,
  orderMultiple: 12,
  priceTierMin: 100,
  priceTierMax: 500,
});
console.log(`warnings: ${constrained.warnings.join(" | ")}`);
const tierOk =
  constrained.warnings.length >= 3 &&
  constrained.warnings.some((w) => w.includes("MOQ")) &&
  constrained.warnings.some((w) => w.includes("multiple")) &&
  constrained.warnings.some((w) => w.includes("price tier"));
if (!tierOk) failures++;
if (constrained.incomplete) failures++;

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
