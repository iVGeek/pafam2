// Scenario engine (§8.5): conservative, base and upside cases plus explicit
// price-drop and customer-default stress cases. Every case is just the base
// input re-run through the same profitability engine, so results stay
// comparable and auditable.

import {
  computeProfitability,
  type CostLineInput,
  type ProfitabilityInput,
  type ProfitabilityResult,
} from "./pricing";

export const SCENARIO_NAMES = [
  "conservative",
  "base",
  "upside",
  "price_drop",
  "customer_default",
] as const;

export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export type Scenario = {
  name: ScenarioName;
  label: string;
  /** Multiplies the selling price. */
  sellingPriceFactor: number;
  /** Multiplies the FX rate (ignored for USD purchases). */
  fxFactor: number;
  /** Multiplies FREIGHT cost lines. */
  freightFactor: number;
  /** Extra days added to the cash cycle. */
  delayDays: number;
  /** Fraction of purchased units expected to sell. */
  sellThroughFactor: number;
  /** Portion of the receivable assumed uncollectible. */
  defaultPctOnReceivable: number;
};

export const DEFAULT_SCENARIOS: Scenario[] = [
  {
    name: "conservative",
    label: "Conservative",
    sellingPriceFactor: 0.97,
    fxFactor: 1.03,
    freightFactor: 1.1,
    delayDays: 15,
    sellThroughFactor: 0.9,
    defaultPctOnReceivable: 0,
  },
  {
    name: "base",
    label: "Base",
    sellingPriceFactor: 1,
    fxFactor: 1,
    freightFactor: 1,
    delayDays: 0,
    sellThroughFactor: 1,
    defaultPctOnReceivable: 0,
  },
  {
    name: "upside",
    label: "Upside",
    sellingPriceFactor: 1.03,
    fxFactor: 0.98,
    freightFactor: 0.95,
    delayDays: 0,
    sellThroughFactor: 1,
    defaultPctOnReceivable: 0,
  },
  {
    name: "price_drop",
    label: "Price drop",
    sellingPriceFactor: 0.9,
    fxFactor: 1.05,
    freightFactor: 1.05,
    delayDays: 30,
    sellThroughFactor: 0.8,
    defaultPctOnReceivable: 0,
  },
  {
    name: "customer_default",
    label: "Customer default",
    sellingPriceFactor: 1,
    fxFactor: 1,
    freightFactor: 1,
    delayDays: 60,
    sellThroughFactor: 0.9,
    defaultPctOnReceivable: 0.5,
  },
];

const isUsd = (currency: string | undefined) => (currency ?? "USD").toUpperCase() === "USD";

/** Rebuild the base input with a scenario's assumptions applied. */
export function applyScenario(input: ProfitabilityInput, scenario: Scenario): ProfitabilityInput {
  const inboundCosts: CostLineInput[] | undefined = input.inboundCosts?.map((line) =>
    line.category === "FREIGHT"
      ? { ...line, amount: line.amount * scenario.freightFactor }
      : { ...line },
  );

  const cycleDays = (input.cashCycleDays ?? 0) + scenario.delayDays;

  return {
    ...input,
    sellingPriceUsd: input.sellingPriceUsd * scenario.sellingPriceFactor,
    fxRate: isUsd(input.buyCurrency) ? input.fxRate : (input.fxRate ?? 0) * scenario.fxFactor,
    inboundCosts,
    cashCycleDays: cycleDays > 0 ? cycleDays : null,
    sellThroughFactor: scenario.sellThroughFactor,
    defaultPctOnReceivable: scenario.defaultPctOnReceivable,
  };
}

export type ScenarioResult = {
  scenario: Scenario;
  result: ProfitabilityResult;
};

export function runScenarios(
  input: ProfitabilityInput,
  scenarios: Scenario[] = DEFAULT_SCENARIOS,
): ScenarioResult[] {
  return scenarios.map((scenario) => ({
    scenario,
    result: computeProfitability(applyScenario(input, scenario)),
  }));
}
