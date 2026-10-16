# Staff Operating Guide

How to run the platform day to day. Written for trading staff, not developers.

- Sign in at **/login**. Your account is `admin@pafam2.local` on first setup;
  ask an administrator for your own account and password.
- Everything you import is kept. Originals are never overwritten — the database
  is the record, Excel is import/export only.
- **Blank means "we don't know". Never type 0 for an unknown value.**

---

## 1. Daily route

| Step | Go to | Do |
| --- | --- | --- |
| 1 | **Alerts** | Work the alert list; each one names the evidence and a suggested action. |
| 2 | **Tasks** | Clear overdue follow-ups. |
| 3 | **Opportunities** | Ranked by contribution, sell-through, cash cycle, credit and concentration. |
| 4 | **Exceptions** | Resolve import problems so new lists load cleanly. |
| 5 | **Orders** | Progress open purchase orders and check PFI variances. |

---

## 2. Importing a supplier list

1. Go to **Uploads** → **Upload**.
2. Get the template first if the supplier is new: **Download template**
   (`/api/template`). The template and the import use the same columns, so
   files round-trip cleanly.
3. Drop the supplier's Excel file. The system:
   - reads it, matches columns, and **auto-cleans** obvious noise (header
     synonyms, oz/L → ml, thousands separators, `yes`/`no`, barcode separators,
     mojibake);
   - records every clean-up it made;
   - routes bad rows to the **exception queue** instead of guessing.
4. Open the upload to review it. Download the **cleaned** workbook to see
   exactly what changed before you rely on it.
5. Re-uploading the **same file** is safe — the file hash is checked, and a
   duplicate import creates **no** new offers (§3.2 of the brief).

**Never** invent a barcode or a quantity. If it's unclear, leave it blank and let
it go to exceptions.

### Matching products

- Matching is by **EAN/UPC first**, then attributes (brand, fragrance,
  concentration, size, set contents).
- Leading zeros in barcodes are preserved — barcodes are stored as text.
- A case barcode is **never** treated as a bottle without a verified
  units-per-case figure.
- The same code on two lists does **not** prove the same packaging, condition or
  authenticity — the system checks attributes after the barcode match and will
  not auto-merge description matches.

---

## 3. FX rates

Go to **FX**. Rates are **USD per 1 unit of the source currency**, dated.

- Add a rate with its **date** and **source**. A *booked* rate is used in
  preference to a market rate on the same date.
- Comparison is always in USD; the original currency and rate date are always
  kept on the record.

---

## 4. Pricing a deal

Go to **Deals** → **New** (or **CP/SP** for a quick cost/price check).

Enter:

1. **Supplier and offer** — quantity, currency, price, and whether the price is
   per unit or per case (units per case is required for a case price).
2. **FX** — the dated rate for that currency.
3. **Inbound costs** — freight, insurance, duty, brokerage, handling. Tick
   **recoverable** for anything refundable (it affects cash, not permanent cost).
   Confirm **inbound costs are complete**; if you can't, the deal is flagged
   *incomplete* rather than showing a false zero cost.
4. **Selling price** and any deductions (discount, rebate, returns allowance).
5. **Outbound costs** — delivery, commission, fees, storage, financing, credit
   loss.

You get landed cost, gross margin, **contribution**, cash requirement, capital
efficiency and a simple annualised return.

> **Annualised return is a simple annualisation assuming the cycle repeats. It
> is not a forecast and not a guarantee.** If the cash cycle is unknown it is
> not shown.

### Checking a deal before committing

- **Scenarios** re-run the same deal as Conservative / Base / Upside, plus a
  **price-drop** stress and a **customer-default** stress.
- **Max buy price** and **min sell price** come straight from the required
  contribution margin set by a manager, so two staff quoting the same deal get
  the same answer.

---

## 5. Customer demand

Go to **Demand**. Each requirement is its own dated record — do not overwrite an
old one.

Capture: exact SKU or barcode, brand, size, concentration, packaging
requirement, quantity and unit, target price and currency, delivery basis,
destination, needed-by date, payment terms, evidence link, meeting date, owner,
and expiry.

- Mark it **wishlist**, **request**, **quote** or **confirmed** honestly.
- Choose **explicit** or **inferred** certainty. General brand interest is
  *not* firm SKU demand.
- The same customer requirement can appear in a note, a quote and an order —
  the system keeps them separate and never adds them blindly.

### Notes (Plaud / reMarkable / manual)

Go to **Notes**. Paste or upload the transcript. The original text is preserved
verbatim and never overwritten.

The system extracts candidate claims (product mentions, quantities, target
prices, deadlines, objections, competitor quotes, follow-ups) — **each with the
exact source excerpt**. These stay **pending** until you approve them. If size,
barcode, currency, units or price are unclear, leave it unresolved. **Never
invent a barcode, promise or quantity.**

Approved extractions become demand records. Repeated meeting notes about the
same requirement update the open record rather than creating duplicates.

---

## 6. Quoting a customer

Go to **Quotes** → **New**.

- Prepare the quote with quantity, validity, delivery terms and payment terms.
- A quote needs **approval** before it is sent.
- **Customer quotes never show supplier names or buying costs** — that is
  enforced on the export, not by convention.
- When a quote is declined or lost, record the **lost reason** — it feeds the
  lost-sale-reasons KPI.

---

## 7. Ordering and proforma invoices

Go to **Orders** → **New**.

1. Pick the supplier and build lines in **whole cases** (cases × units per case
   = units). Partial cases are not accepted.
2. Export the order to **Excel** to send to the supplier.
3. When the supplier sends a **proforma invoice**, open the order and upload it
   as **PDF or Excel**. The system extracts the lines and compares them with the
   order, marking each line:
   - `match` — quantity and price agree
   - `short` / `over` — quantity differs
   - `missing` — on the order, not on the PFI
   - `absent` — on the PFI, not on the order
4. Advance the order status: Draft → Sent → Confirmed → Received (or Cancelled).
5. **Set a promised delivery date** on the order when the supplier commits one —
   this is what on-time delivery is measured against.

### Receiving stock (goods receipts)

Open the order → **Goods receipts**. You can record a receipt two ways:

- **By hand** — enter the arrival date, the promised date, and per line how many
  units arrived (**received**) and how many were rejected (damaged / wrong).
- **From Excel** — download the order's receipt template, fill in the received
  and rejected quantities, and import it. Rows are matched to order lines by
  code.

Partial deliveries are normal: record each arrival as it happens, and the order's
**fill rate** builds up to the units actually received ÷ units ordered.
**Rejected units are not counted as received.** A receipt is on time if it
arrived on or before the promised date.

### Claims and returns

Go to **Claims**. Log shortages, damage, quality issues, late deliveries and
returns against the supplier, with units and value. Claims count against the
supplier on the **scorecard** even after they are resolved. Warehouse and
Purchasing can log and resolve claims; Sales and Accounts cannot.

---

## 8. Inventory and reservations

Go to **Inventory**.

- **Available to sell = usable on hand − active reservations.** Inbound units
  are not counted before they are received.
- Reserve stock against a demand, deal or customer. You **cannot** oversell the
  same lot.
- Quarantined and damaged stock is tracked separately and is not available to
  sell.
- Aging is bucketed 0–30 / 31–90 / 91–180 / 181–365 / 365+ days.

---

## 9. Reading the dashboards

| Screen | Answers |
| --- | --- |
| **Dashboard** | Today's picture: alerts, opportunities, exposure. |
| **Opportunities** | Which deals to do, ranked. Exposure caps are applied per SKU, brand, supplier and customer. |
| **Exposure** | How much capital is committed against the caps. |
| **Pricing** | Price history for a product. Real observations only — no interpolated points. |
| **Trends** | 7/30/90/180-day ask prices and landed costs: min, median, range and number of independent stock owners. Supplier asks, our purchases, our wholesale sales, customer targets and public retail are **separate series**. |
| **Compare** | Diff two supplier price lists or offers — added, removed, changed and unchanged lines, in USD. |
| **Products** | Product master, and per product the ranked landed cost by supplier with best supplier, break-even and suggested price. |
| **Supply** | Observed available supply, deduplicated: each owner's lot counted once even when several brokers list it. Firm, indicative, incoming and on-request kept apart; unknown ownership shown as a range. |
| **KPIs** | Quote conversion, lost-sale reasons, realised vs expected margin, fill rate, repeat purchases, overdue debt, cash deployment, exposure, stock turn. Each has a **named owner**. KPIs whose inputs don't exist yet are shown as **pending**, never as zero. |
| **Claims** | Supplier claims and returns (shortage, damage, quality, late, return): count, value, open vs resolved. Feeds the supplier scorecard. |
| **Alerts** | Configurable thresholds by brand or SKU; each alert carries evidence and a suggested action. |
| **Audit** | Who changed what, when, with before/after values. |

---

## 10. Rules that are enforced, not advisory

- Supplier names and buying costs **never** appear on customer quote exports.
- A deal with unknown material costs is flagged **incomplete** — never a false
  zero-cost result.
- A price without a dated FX rate is **not ranked** above one with a rate.
- Duplicate file uploads create no new offers.
- Stock reservations cannot oversell a lot.
- Unknown stock, indicative availability, incoming shipments and
  quantity-on-request are kept **separate** — they are never summed into one
  "available" number.
- Expired or stale offers leave active totals but remain in history.

---

## 11. Roles and access

Every account has one role, and the role decides which parts of the platform the
account can open. The role is shown next to your name in the header. If you open
something your role does not cover you get a **Not permitted** page (or a 403 on
an API call) that names your role and lists what you *can* open.

| Role | Owns / can open |
| --- | --- |
| **ADMIN** | Everything, including user accounts. |
| **MANAGER** | Everything — approves master-data exceptions and buying limits. |
| **PURCHASING** | Dashboard, Market (offers, suppliers, products, pricing, trends, compare), Purchasing (orders, imports, exceptions, exposure, opportunities), Trading (deals, calculator, alerts), Inventory. |
| **SALES** | Dashboard, Market, Trading, and Sales (customers, demand, notes, quotes, tasks). Does **not** see internal inventory, FX, KPIs or the audit log. |
| **ACCOUNTS** | Dashboard, Trading, and Accounts (FX, KPIs, audit log). |
| **WAREHOUSE** | Dashboard, Inventory, and Claims (goods shortages, damage, returns). |

Notes:

- **Customer notes and commercial costs are restricted** to the roles above
  (§19): only SALES/MANAGER/ADMIN reach notes, customers, demand and quotes;
  only ACCOUNTS/MANAGER/ADMIN reach FX, KPIs and the audit log.
- **Writing thresholds is manager territory.** Reading settings is open to
  everyone; changing minimum margins, exposure caps, alert thresholds or KPI
  owners is limited to ADMIN, MANAGER and ACCOUNTS.
- **Goods receipts are recorded by Purchasing** (who own the order and the
  supplier confirmation); **Warehouse owns inventory lots and claims** (§18).
- Changing a user's role takes effect **the next time they sign in** — the role
  is part of their signed session.
- New routes that haven't been classified are admin-only by default (fail
  closed), not open.
- Any unclassified area denies by default rather than allowing by default.

---

## 12. Known limitations

Be aware these are not modelled yet — do not expect the system to compute them:

- **Dated cash flows, partial payments and XIRR** — cash return is approximated
  from a single cash-cycle-days figure.
- **Financing rates and daily funding balances.**
- **Forecasts** — deliberately not produced until enough reliable history
  exists.

---

## 13. Getting help

- Every screen links to its data. If a number looks wrong, check the underlying
  record and the **Audit** log first.
- The full field reference is `docs/data-dictionary.md`.
- How every money figure is calculated is `docs/calculation-spec.md`.
