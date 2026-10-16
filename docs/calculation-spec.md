# Calculation Specification

The executable definition of every money figure the platform produces. The
authoritative implementation is `src/lib/pricing.ts` (`computeProfitability`),
with FX in `src/lib/pricing.ts`/`product-costing.ts`, landed-offer ranking in
`src/lib/product-costing.ts` and scenario re-runs in `src/lib/scenarios.ts`.
If this document and the code ever disagree, the code is the behaviour and this
document must be corrected.

Scope: sections 7, 8, 9, 10 and 18 of `docs/requirements.md`.

---

## 0. Conventions

- **All comparison is in USD.** Every non-USD input is converted with a dated
  rate expressed as **USD per 1 unit of the source currency**.
- Rates come from `FxRate` (`rateDate`, `source`, optional `booked`). A booked
  rate is preferred over a market rate on the same date.
- Original currency, rate source and rate date are always retained — the
  conversion never destroys the source figure.
- **Rounding:** money to 2 dp, unit costs to 4 dp, percentages to 4 dp. The
  implementation never returns `NaN`/`Infinity`; missing inputs are reported via
  `incomplete` + `missingInputs`.
- **Blank means unknown, never zero.** A missing cost is a *blocker*, not a
  free input.

---

## 1. FX conversion

```
fxRate      = USD per 1 unit of buyCurrency      (1.0 when buyCurrency = USD)
buyUnitUsd  = buyUnitPriceSource × fxRate
```

`buyUnitPriceSource` is the supplier price **per bottle**, in source currency.

## 2. Case → bottle conversion

Supplier prices are frequently quoted per case. Convert **before** comparing.

```
if priceBasis = CASE:
    buyUnitPriceSource = buyPrice / unitsPerCase      # unitsPerCase required
else:
    buyUnitPriceSource = buyPrice
```

If `priceBasis = CASE` and `unitsPerCase` is missing, this is a **blocker**
(`missingInputs: "Units per case"`). A case barcode is never assumed equal to a
bottle (§6.2 of the brief).

## 3. Quantity constraints (MOQ / order multiple / price tiers)

Checked before the money maths; violations raise **warnings**, not errors:

| Condition | Warning |
| --- | --- |
| `quantity < moq` | below supplier MOQ |
| `quantity % orderMultiple ≠ 0` | not a valid multiple; nearest valid quantity shown |
| `quantity < priceTierMin` | below this tier's minimum |
| `quantity > priceTierMax` | above this tier; quoted price may not apply |

## 4. Sell-through

We may buy more than we sell in the period.

```
soldQty = quantity × sellThroughFactor        (factor clamped to 0..1)
```

Unsold units stay in inventory; revenue is recognised on `soldQty`, while the
purchase and landed cost are on the full `quantity`.

---

## 5. Inbound costs → landed cost

Costs are entered **once** as `DealCost` lines with a `category` and a
`recoverable` flag (§8.1, §8.2).

```
inboundTotal       = Σ inbound cost lines (per-unit lines × quantity)
recoverableTotal   = Σ inbound lines where recoverable = true
permanentInbound   = inboundTotal − recoverableTotal
inboundPerUnit     = permanentInbound / quantity

landedUnitCost     = buyUnitUsd + inboundPerUnit
landedCostTotal    = landedUnitCost × quantity
```

**Double-count prevention (§8.1).** Respect the Incoterm: if the Incoterm says
freight is included in the price, do not also add a freight line. Shipment
costs are allocated by a documented `driver` (chargeable weight, volume or
value); allocated totals must reconcile to the shipment total.

**Recoverable taxes (§8.2).** Recoverable amounts (e.g. refundable duties,
VAT recoverable on export) affect the **cash** required but are **excluded from
permanent cost**. They are reported separately as `recoverableInboundTotal`.

**Broker-confirmed inputs (§8.3).** Duty and import inputs must be
broker-confirmed for the specific origin, classification and date. The engine
cannot verify this, so the caller declares completeness:

```
inboundCostsComplete = false  →  missingInputs += "Inbound costs not confirmed..."
```

Missing material costs therefore show **incomplete profitability**, never a
false zero-cost result.

---

## 6. Revenue and deductions

Deductions are applied in a fixed order (§7.2).

```
deductionFactor   = 1 − discountPct − returnsAllowancePct
netUnitRevenue    = sellingPriceUsd × deductionFactor − rebatePerUnit − otherDeductionsPerUnit
netRevenueTotal   = netUnitRevenue × soldQty
```

Percentages are clamped to 0..1. `netUnitRevenue` is net of discounts, rebates,
returns allowance and other customer deductions.

---

## 7. Profit and margin (§7.2)

```
grossProfit         = netRevenueTotal − landedCostTotal
grossMarginPct      = grossProfit / netRevenueTotal          (net revenue based)
markupOnCostPct     = grossProfit / landedCostTotal          (cost based — kept separate)
```

Markup is always reported separately from margin and is never substituted for it.

### Deal contribution

```
outboundTotal   = Σ outbound cost lines (per-unit lines × soldQty)
creditLoss      = netRevenueTotal × defaultPctOnReceivable

dealContribution        = grossProfit − outboundTotal − creditLoss
contributionMarginPct   = dealContribution / netRevenueTotal
```

Outbound costs cover delivery, commission, transaction fees, storage, financing
and expected credit loss. Like inbound costs they are entered once and each is
counted once.

---

## 8. Cash, capital and return (§7.2, §8.4)

```
cashRequirement = landedCostTotal + recoverableInboundTotal + outboundTotal
deployedCapital = deployedCapitalUsd (if given) else cashRequirement

capitalEfficiencyPct = dealContribution / deployedCapital
annualisedReturnPct  = capitalEfficiencyPct × (365 / cashCycleDays)
```

- `cashCycleDays` is the cash-conversion cycle (days from cash out to cash in).
- **Annualised return is a simple annualisation assuming the cycle repeats. It
  is explicitly not a forecast and not a guaranteed return** (§7.2, §9).
- If `cashCycleDays` is unknown, `annualisedReturnPct` is `null` and a warning
  is raised — it is never guessed.

**Known limitation (§8.4).** The brief asks for dated cash flows, partial
payments with an outstanding balance, financing rates with funded dates, daily
funding balances and XIRR where dated flows support it. The current engine uses
a single scalar `cashCycleDays` and does **not** model a dated cash-flow ledger.
See `docs/data-dictionary.md` §12.

---

## 9. Break-even and price limits (§10, §18)

```
breakEvenSellingPriceUsd = (landedUnitCost + rebatePerUnit + otherDeductionsPerUnit)
                           / deductionFactor
```

With a manager-set required contribution margin `m` (as a fraction):

```
outboundPerUnit = outboundTotal / soldQty

# Minimum sell price: hold costs, raise price until contribution margin = m
targetNetUnit   = (landedUnitCost + outboundPerUnit) / (1 − m)
targetGrossUnit = (targetNetUnit + rebatePerUnit + otherDeductionsPerUnit) / deductionFactor
minSellPriceUsd = targetGrossUnit

# Maximum buy price: hold selling price, absorb costs, still hit m
maxLandedUnit   = netUnitRevenue − (m × netUnitRevenue + outboundPerUnit)
maxBuyUnitUsd   = maxLandedUnit − permanentInbound / quantity
maxBuyPriceSourceCurrency = maxBuyUnitUsd / fxRate

meetsRequiredContribution = (contributionMarginPct ≥ requiredContributionMarginPct)
```

`minSellPriceUsd` is the **customer-specific minimum sell price**; it must be
calculated the same way every time so quotes stay consistent (§18).

---

## 10. Scenarios (§8.5)

Every scenario is the **same base input re-run through the same engine**, so
results stay comparable and auditable. Defined in `src/lib/scenarios.ts`:

| Scenario | Price | FX | Freight | Delay | Sell-through | Default |
| --- | --- | --- | --- | --- | --- | --- |
| Conservative | ×0.97 | ×1.03 | ×1.10 | +15 d | ×0.90 | — |
| Base | ×1 | ×1 | ×1 | 0 | ×1 | — |
| Upside | configurable | | | | | |
| **Price drop** | stress | | | | | |
| **Customer default** | | | | | | stress on receivable |

Also configurable: selling-price, FX, freight, delay and sell-through factors.
The two explicit stress cases required by §8.5 are **price-drop** and
**customer-default**.

---

## 11. Landed-offer ranking (`src/lib/product-costing.ts`)

To answer "which offer wins?" (§24 Q1), each active offer for a product is
landed independently:

```
fx        = dated rate for the offer's currency (else null → ranked last)
landed    = offer unit price (case → bottle) × fx
            + freight (per unit or allocated)
            + duty (pct of value or per unit)
            + other fees
```

Offers are ranked ascending by landed unit cost. **An offer with no FX rate is
never ranked above one with a known rate** — unknown is not treated as free.

---

## 12. Observed supply de-duplication (§11.1, `src/lib/supply.ts`)

Several brokers often list **one owner's lot**. Counting each listing would
double-count the same physical parcel, so active offers are grouped into
**pools** and each pool is counted once.

Grouping key (highest confidence first):

1. the stored `poolId`, if the offer was linked to a pool on import;
2. else `(product, stock owner, lot reference)`;
3. offers with **no** owner fall back to `(product, supplier)` and are kept
   **`UNVERIFIED`** (never mixed into confirmed totals).

Pool quantity is the **reported parcel** (latest, else largest quantity), not the
sum across brokers. Because one pool can sit in several countries, **location is
not treated as a separate lot** — US + FR is still one parcel.

| Confidence | When | How it is reported |
| --- | --- | --- |
| `CONFIRMED` | owner **and** lot known | counted once in confirmed totals |
| `POSSIBLE` | owner known, lot unknown | separate **possible-overlap** range (may overlap other pools) |
| `UNVERIFIED` | no ownership information | separate **unverified** range |

Possible-overlap and unverified quantities are shown as **ranges and never summed
into the confirmed total**. Offers are bucketed by availability — **FIRM,
INDICATIVE, INCOMING, ON_REQUEST** — and offers older than the freshness window
(default **14 days**) are excluded from active totals.

The same de-duplicated supply feeds the demand-vs-supply alert
(`src/lib/alerts.ts`) and the supplier scorecard's confirmed-availability input
(`src/lib/suppliers.ts`).

---

## 13. Supplier delivery metrics (§18)

Fill rate, on-time delivery and claims are measured from recorded goods receipts
and claims — never estimated.

**Fill rate** for a supplier (and for one order):

```
fill rate = Σ receivedUnits / Σ orderedUnits        (per supplier)
```

Partial deliveries accumulate: three receipts of 40 units against a 100-unit
order give 120/100 only after 120 have actually arrived. **Rejected units are not
counted as received.** Ordered units are counted once per order even when the
order arrives in several receipts.

**On-time delivery**: a receipt is on time when `receiptDate ≤ expectedDate`
(the receipt's promised date, or the order's `expectedDate` if none). On-time % =
on-time receipts ÷ receipts that have a promised date. Receipts with no promised
date are excluded rather than assumed late or on time.

**Claims**: count and value of claims/returns, plus how many are still open.

The supplier scorecard's **delivery component** blends whatever is measurable:

```
fill    = min(fillRate, 100) / 100
ontime  = min(onTimePct, 100) / 100
claims  = 1 − min(claimCount / receiptCount, 1)
delivery = mean(available parts)
```

The composite score adds the delivery component **only when delivery history
exists**, and normalises by the weights actually applied, so a supplier with no
receipts is still scored on cost, freshness and evidence alone:

```
weights = cost 0.5, freshness 0.3, evidence 0.2, delivery 0.3
totalWeight = 1.0 (+ 0.3 when delivery is measurable)
score = Σ(weight × part) / totalWeight × 100
```

---

## 14. Acceptance check (§9 illustration)

The brief's worked example must reconcile exactly. For **1,000 bottles at $30**,
inbound costs **$3,000**, sell at **$40**, outbound **$2,000**, deployed capital
**$35,000**, cash cycle **90 days**:

| Figure | Expected | Formula |
| --- | --- | --- |
| Landed unit cost | **$33.00** | 30 + 3,000/1,000 |
| Gross profit | **$7,000** | (40 − 33) × 1,000 |
| Gross margin | **17.5%** | 7,000 / 40,000 |
| Deal contribution | **$5,000** | 7,000 − 2,000 |
| Contribution margin | **12.5%** | 5,000 / 40,000 |
| Simple deal return | **14.29%** | 5,000 / 35,000 |
| Annualised (90 d) | **57.94%** | 14.29% × 365/90 |

This is asserted in `scripts/verify-pricing.ts` and runs on every change to the
engine.

---

## 15. What is deliberately not modelled yet

- **XIRR / dated cash flows / partial payments** (§8.4).
- **Financing rate, funded dates, daily funding balances** (§8.4).
- **Forecasts and backtesting** (§12) — deferred until enough reliable history
  exists, as the brief requires.
- **Purchasing optimisation and accounting/warehouse integrations** (§17
  Phase 4) — explicitly deferred until foundational data is reliable.
