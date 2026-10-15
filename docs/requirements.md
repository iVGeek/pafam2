# Perfume Wholesale Trading Platform — Requirements

Audience: staff and the software development team
Main selling market: **USA**
Brief date: 10 October 2026

## 1. Overview

Build a central trading platform that:

- Imports supplier **Excel** lists
- Matches perfume products by **EAN** or **UPC**
- Calculates **deal profitability**
- Tracks observed **supply and prices**
- Matches **stock to customer demand**

Excel is used for **import/export**. The authoritative records and history live in a **database**.

## 2. Core Workflow

The end-to-end trading flow:

1. Import supplier Excel list
2. Match / map products by **EAN** or **UPC**
3. Calculate deal profitability
   *(product, landed cost, fees, FX, freight, duty fees, payment terms)*
4. Track observed supply and prices
5. Match stock to customer demand

## 3. Essential Rules

1. **Keep source files and versions** — keep original files and file versions; record which file each row came from.
2. **No duplicate imports** — re-importing the same file must not create duplicate records.
3. **Prices are observations over time** — supplier price lists are observations, not our own stock.
4. **Fresh / verified / stock-supported** — distinguish data that is fresh, verified, and backed by genuine stock.

## 4. Deliverables Required from the Team

1. Standard **Excel template**
2. **Data dictionary**
3. **Database model**
4. **Upload and review screens**
5. **Trading dashboard**
6. **Customer demand dashboard**
7. **Calculation specification**
8. **Working pilot**
9. **Test results**
10. **Staff operating guide**

**Acceptance:** agree **measurable acceptance targets before full development**.

## 5. Supplier Excel Format and Product Matching

### 5.1 Standard supplier template

- One row per supplier **offer** for a specific SKU, packaging condition, stock lot, location and quantity price tier.
- Use **blank** for unknown values — **never zero**.
- Keep the supplier's **original EAN and description**.

| Field group | Required columns |
| --- | --- |
| Source and dates | Supplier ID and name, offer ID, list date, valid until, last stock confirmation, source file and row |
| Product identity | Original EAN or UPC **as text**, internal SKU, brand, fragrance name, concentration, size in ml, gender or category, set contents |
| Packaging and condition | Retail pack or tester, with or without cap and box, sealed or unboxed, damage status, batch or lot reference, manufacture date if verified |
| Price and quantity | Currency, price, price basis per unit or case, units per case, available quantity, quantity unit, MOQ, order multiple, price tier minimum and maximum |
| Logistics and terms | Stock country and warehouse, country of origin, Incoterm and named place, ready date, lead time, payment terms, freight inclusions |
| Eligibility and evidence | Permitted destination and channels, US suitability status, authenticity documents, stock owner ID, unique lot reference, stock confidence |

## 6. Matching Logic

1. **Barcodes as text** — store barcodes as text to retain leading zeros. Validate length and check digit. Create a canonical **GTIN** representation padded to **14 digits** for valid GTINs, while **preserving the source value**.
2. **SKU & alias table** — maintain an internal SKU and barcode alias table. Confirm **unit vs case** barcodes and packaging level; **never** equate a case barcode to a bottle without a verified units-per-case conversion.
3. **Attribute checks after barcode match** — check brand, fragrance, concentration, size, set contents and condition after barcode matching. The same code on supplier lists does **not** prove identical packaging, condition or authenticity.
4. **Exception queue** — route missing, conflicting or invalid barcodes to an exception queue. Description matching may **suggest** candidates but must **not merge** products automatically.
5. **Separate packaging types** — separate retail packs, testers, gift sets, refills and damaged packaging in comparisons. Allow an **approved comparison group** for related products **without merging** their inventory.

Reference: **GS1 GTIN**

## 7. Profitability and Cash Deployment

### 7.1 Compare executable offers in USD

- Use a **dated exchange rate expressed as USD per unit of source currency**. Retain original currency, rate source, rate date and any booked rate.
- Convert **case prices to bottle prices** before comparing.
- Run **quantity scenarios** because MOQ, price tiers and freight change the result.

### 7.2 Metrics

| Metric | Calculation or instruction |
| --- | --- |
| Landed unit cost | Purchase price in USD + allocated inbound freight, insurance, duty, brokerage, handling, nonrecoverable taxes and inbound fees, per sellable unit |
| Net unit revenue | Selling price less discounts, rebates, returns allowance and customer deductions |
| Gross profit and margin | Gross profit = net revenue − landed cost; gross margin % = gross profit ÷ net revenue |
| Deal contribution | Gross profit less outbound delivery, commission, transaction fees, storage, financing and expected credit loss |
| Contribution margin | Deal contribution ÷ net revenue; keep markup, calculated on cost, separate |
| Cash return | Cash received dates less actual cash paid dates. For partial payments, show outstanding balance and dated cash flows |
| Capital efficiency | Deal contribution ÷ defined deployed capital. For simple deals show annualised simple return = return × 365 ÷ cash cycle days; **do not present it as guaranteed return** |

## 8. Calculation Controls

1. **Define each cost once.** Respect Incoterm inclusions to prevent double counting. Allocate shipment costs by a documented driver such as chargeable weight, volume or value; **allocated totals must reconcile to the shipment**.
2. **Recoverable taxes** affect cash funding but must **not** be included as permanent cost. Track refundable deposits, supplier advances and customer deposits in cash flows.
3. **Broker-confirmed inputs.** Use broker-confirmed duty and import inputs for the specific origin, classification and date. Missing material costs must show **incomplete profitability**, not a false zero-cost result.
4. **Financing.** Store the financing rate and the dates funded. For several payments or receipts, use **daily funding balances**; use **XIRR** only where dated cash flows support it.
5. **Scenarios.** Show **conservative, base and upside** cases for selling price, FX, freight, delay and sell-through. Include a **price-drop** and **customer-default** stress case.

## 9. Illustration Only

Buy **1,000 bottles at $30**. Inbound costs total **$3,000**: landed cost is **$33 per bottle**. Sell at **$40**: gross profit is **$7,000** and gross margin **17.5%**. Outbound and other deal costs total **$2,000**: contribution is **$5,000** and contribution margin **12.5%**. On **$35,000** deployed capital, simple deal return is **14.29%**. A 90-day cycle implies **57.94%** simple annualised return, assuming repetition; it is **not a forecast**.

## 10. Buying Recommendation Output

Show:

- Supplier
- Exact SKU
- Executable quantity
- Customer matches
- Demand status
- Landed cost
- Suggested selling price
- Contribution
- Cash requirement
- Expected collection date
- Missing assumptions

Apply manager-set **minimum margins**, **capital limits** and **approval rules**.

## 11. Inventory Visibility and Market Trends

### 11.1 Inventory by SKU and territory

- **Own stock:** on hand, reserved, quarantined, available to sell and in transit, by warehouse and lot. **Available to sell = usable on hand − reservations**; do not include inbound units before receipt.
- **Supplier stock:** latest valid confirmed quantity per distinct **stock owner and lot**. Show reported quantity, confirmation date, location, destination eligibility and confidence.
- **Avoid duplicate supply:** several brokers can offer one owner's lot. Link confirmed duplicates to **one stock pool**. Where ownership is unknown, flag possible overlap and show a range or unverified quantity separately.
- **Location ≠ territory:** stock eligible for both USA and another market remains **one physical pool** and must not be summed twice in global totals.
- **Unknown stays unknown.** Keep firm stock, indicative availability, incoming shipments and quantity-on-request **separate**. Expired or stale offers leave active totals but remain in history.

Label the dashboard **“Observed available supply”** with source count, confirmation freshness and coverage. An estimate of total territory stock needs independent coverage evidence and a documented estimation method; **do not extrapolate from supplier counts alone**.

## 12. Trend Dashboard per Exact SKU

- Plot **7, 30, 90 and 180-day** supplier ask prices and comparable landed costs: minimum, median, range and **number of independent stock owners**. Keep **actual purchase prices, actual wholesale sale prices, customer target prices and public retail prices as separate series**.
- Plot active confirmed stock, independent supplier count, stock-outs, inbound units, customer demand and our sell-through. Show **date gaps** rather than inventing observations.
- Compare **equivalent quantities, conditions, delivery terms and territories**. Use a **matched-supplier series** where possible so changing supplier mix does not masquerade as a price trend.
- If weighting prices by stock quantity, use only **verified deduplicated quantities**; show the **unweighted median as well**. Apply configurable **freshness windows and outlier flags**.
- Build **forecasts only after enough reliable history exists**. Backtest against a **simple baseline**, show **forecast ranges** and account for seasonality, promotions and stock-outs.

## 13. Alerts and Trading Actions

Alert on:

- New profitable offers matching demand
- Significant price changes
- Rising demand with falling supply
- Stale supplier confirmations
- Falling margins
- Aged inventory
- Overdue collections
- Expiring wishlists

Include the **evidence** and a **suggested action**. Thresholds must be **configurable by brand or SKU**.

Separate **confirmed unfilled orders**, **current wishlists** and **probability-weighted opportunities**. Never add them blindly: the same customer requirement may appear in notes, a quote and an order.

## 14. Customer Notes, Wishlists and Sales Workflow

### 14.1 Customer record and demand fields

Maintain **one customer ID** linked to company, contacts, US delivery destination, selling channels, account owner, agreed currency, payment terms, credit limit and purchasing history. Store each demand as a **separate dated record**.

| Demand field | What staff must capture |
| --- | --- |
| Product and flexibility | Exact SKU or EAN, brand, fragrance, size, concentration, packaging requirement; approved substitutes if any |
| Commercial requirement | Quantity and unit, target price and currency, delivery basis, destination, needed by date, payment terms |
| Status and evidence | Wishlist, active request, quote, confirmed order, fulfilled, lost or expired; evidence link, meeting date, owner, last reconfirmation |
| Uncertainty | Explicit requirement or inferred interest, extraction confidence, match confidence, staff approval and expiry date |

## 15. Plaud and reMarkable Ingestion

1. **Naming convention** — use: customer ID, meeting date and staff member. Confirm the customer identity before attaching a note. Preserve the original transcript or note and its source location.
2. **Plaud** — start with transcript and summary exports. Evaluate its documented **Zapier, MCP or CLI** options in a technical pilot against the actual company account; choose the supported route that meets access and reliability needs. **Do not assume an unrestricted public API.**
3. **reMarkable** — start with exported text or PDF. Its supported cloud integrations include Google Drive, Dropbox and OneDrive; exported cloud files may be PDF. Use handwriting conversion or OCR where necessary and validate SKU numbers carefully. **Do not assume live notebook access through an API.**
4. **Extraction** — extract product mentions, quantities, target prices, delivery deadlines, channel restrictions, objections, competitor quotes and follow-up tasks. Attach the **exact source excerpt or page** to each extracted claim.
5. **Staff approval** — staff approve extracted demands **before activation**. If size, EAN, currency, units or price is unclear, keep it **unresolved**. **Never invent a barcode, promise or quantity.**
6. **Merge recurring mentions** into the same open requirement with **version history**. A note must **not** silently overwrite a confirmed order or create duplicate demand.

## 16. Turn Notes into Sales Actions

- When an approved supplier offer matches a customer requirement, calculate **customer-specific delivered contribution** and flag the opportunity.
- Prepare a **quote** with quantity, validity, delivery terms and payment terms for **staff approval**.
- Track **follow-ups, acceptance and why a quote was lost**.
- Use notes to identify price sensitivity, preferred brands, unacceptable packaging and replenishment patterns. **General brand interest may inform prospecting; it is not firm SKU demand.**
- **Customer quotes must never reveal supplier names or buying costs.**

## 17. Implementation Sequence

- **Phase 1 — Data foundation:** standard Excel template, product master, supplier mappings, validation queue, dated offers and upload audit log. Staff clean a representative sample before migration.
- **Phase 2 — Trading engine:** landed costs, quantity tiers, profitability scenarios, own inventory, reservations, customer demand and approved quote exports.
- **Phase 3 — Intelligence:** market price and supply charts, alerts, Plaud and reMarkable imports, reviewed note extraction and follow-up tasks.
- **Phase 4 — Advanced decisions:** demand forecasts, purchasing optimisation and accounting or warehouse connections **after foundational data is reliable**.

## 18. Improve Buying and Selling Decisions

- **Rank suppliers** by executable landed cost, fill rate, on-time delivery, claims, authenticity evidence, payment terms and confirmation accuracy; **cheapest quoted price alone is insufficient**.
- **Rank opportunities** by contribution, credible sell-through, cash cycle, customer credit and concentration risk. **Cap speculative buying and exposure** per SKU, brand, supplier and customer.
- Calculate **maximum buy price** from conservative achievable selling price less all deal costs and required contribution. Calculate the **customer-specific minimum sell price** consistently.
- Track inventory **aging buckets** of 0–30, 31–90, 91–180, 181–365 and over 365 days; show days of cover, stock turn, markdown exposure and profit by lot.
- Track **quote conversion, lost-sale reasons, realised versus expected margin, supplier fill rate, customer repeat purchases, overdue debt and cash deployment**. Tie each KPI to a **named owner**.

## 19. Controls and Ownership

- **Purchasing** owns supplier confirmations.
- **Sales** owns reviewed customer demands.
- **Accounts** owns FX, cost inputs, collections and reconciliation.
- **Warehouse** owns physical quantities and lots.
- A **manager** approves master data exceptions and buying limits.
- Give users **role-based access**, keep an **audit log**, **back up data and test restoration**. Restrict customer notes and commercial costs to authorised staff.
- For each deal capture **US destination and channel eligibility, lot traceability, packaging and label evidence, origin and import review status**.
- Have the **broker or appropriate adviser confirm current import requirements and perfume transport requirements before execution**; this brief does not supply legal clearance.

## 20. Acceptance Tests Before Launch

- Valid UPC and EAN aliases match correctly; leading zeros survive Excel import; case barcodes, testers, gift sets and conflicting sizes do not merge incorrectly.
- Duplicate file upload creates no extra offers; a new list preserves old prices; one stock pool offered by two brokers is counted once; unknown and stale stock are excluded from confirmed totals.
- The **$30 example** reconciles; case conversion, MOQ, price tiers, FX, included freight, recoverable taxes, partial receipts and returns produce reviewed results.
- A note with an unclear SKU goes to review. Repeated meeting notes do not duplicate demand; approved requirements trigger an eligible profitable match; expired requirements do not.
- Stock reservations cannot oversell the same lot; actual purchase, sales and payment records reconcile with accounts; supplier costs do not appear on customer exports.

## 21. Verified Reference Links

These references support product identification and note export routes. They do **not** establish that a connector is available on our account, or that quoted stock is authentic.

- **GS1 GTIN identification:** https://www.gs1.org/standards/id-keys/gtin
- **GS1 barcode verification:** https://www.gs1.org/services/verified-by-gs1
- **GS1 canonical number representation:** https://www.gs1.org/edi-xml/technical-user-guide/Item_Numbers
- **Plaud export guidance:** https://support.plaud.ai/hc/en-us/articles/50835453223705-Export-recordings-transcripts-and-summaries
- **Plaud data access guidance:** https://support.plaud.ai/hc/en-us/articles/60726890231449-How-can-I-get-API-access-to-my-Plaud-data
- **reMarkable integrations:** https://support.remarkable.com/articles/Knowledge/Integrations
- **reMarkable handwriting conversion:** https://support.remarkable.com/articles/Knowledge/Convert-handwritten-notes-into-text

## 22. Pilot and Handover

- **Pilot data:** use several real supplier formats, overlapping stock offers, different currencies, case prices, retail packs, testers and a sample of customer notes. Include **completed deals** so estimated calculations can be compared with actual outcomes. Agree the expected **file sizes, user count, refresh frequency and import performance targets**.
- **Before launch**, demonstrate one complete workflow:
  **import → validated SKU → confirmed stock → customer demand → landed margin → reviewed quote → order → receipt → sale → collection → realised margin.**
- Deliver a **documented exception process** and a **data export** so records can be moved to another system if needed.

## 23. Definition of Completion

The system is ready when staff can:

- identify a **profitable, executable buying opportunity for a specific customer without manually joining supplier lists**,
- **trace every recommendation to its source and assumptions**, and
- **reconcile inventory and realised profit to actual transactions**.

**Confidence:** high in the proposed data and trading framework. Medium in the exact automation route for device integrations until it is tested on the company accounts. Market coverage and future prices remain dependent on the available evidence.

## 24. Core Business Questions

The platform must answer:

1. **Margin / best deal** — How much can we sell profitably, and which offer wins?
   *Best deal by real cost identifies: product (EAN/UPC), quantity, landed cost, fees, FX, freight, duty fees, and payment terms → optimal source.*
   Given a product (EAN/UPC) and quantity, find the best deal accounting for:
   - product identity (EAN/UPC)
   - quantity
   - landed cost
   - fees
   - FX (currency conversion)
   - freight
   - duty fees
   - payment terms

2. **Demand** — Who wants this product, at what price and quantity, and how strong is the demand?

3. **Profit / Cash / Risk** — How much can we sell profitably, how much cash is required, and how long until the cash returns?

4. **Market trend** — Are prices rising or falling, is supply tightening, and are we holding stock that should be sold?

5. **Offer quality** — Which offers are fresh, verified, territory eligible, and supported by genuine stock?

## 25. Core Entities (working set)

| Entity | Description |
| --- | --- |
| Products | Perfume SKUs keyed by EAN / UPC |
| Suppliers | Vendors offering stock |
| Offers | Supplier supply + price observations over time |
| Customers | Buyers with demand |
| Demand | Requested product, price, quantity, strength |
| Deals | P&L: cost, fees, FX, freight, duty, terms, margin |
| Price History | Observed price and supply changes over time |
| Territory / Licensing | Territory eligibility for offers |

## 26. Notes

- This document is a living record; sections are added as steps are defined.
