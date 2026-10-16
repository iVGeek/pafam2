# Test Results

Verification record for the platform. Re-run everything with the commands in
this document — results are reproducible against the local database.

| | |
| --- | --- |
| **Run date** | 16 October 2026 |
| **Node** | v24.20.0 |
| **Database** | PostgreSQL 17 (embedded, localhost:5433) |
| **Overall** | **All 14 suites passed — 0 failures** |

---

## 1. Automated suites

Run against a migrated, seeded database.

| Suite | Command | Result | Covers |
| --- | --- | --- | --- |
| Core | `npm run db:verify` | PASS | End-to-end foundation: import → match → offer → deal. |
| Pricing | `npm run db:verify-pricing` | PASS | Landed cost, margins, contribution, cash return, capital efficiency, **the §9 $30/$40 illustration reconciles exactly**, quantity constraints (MOQ / order multiple / price tiers), incomplete-profitability. |
| Alerts | `npm run db:verify-alerts` | PASS | §13 alert generation with evidence + suggested action; thresholds configurable by brand/SKU. |
| Demands | `npm run db:verify-demands` | PASS | Demand records, status lifecycle, **§20 expired demands excluded from matching**, certainty (EXACT/INFERRED). |
| Suppliers | `npm run db:verify-suppliers` | PASS | Scorecard dimensions, fresh/verified/stock-supported classification, unmeasured dimensions reported as pending. |
| Exposure | `npm run db:verify-exposure` | PASS | §18 exposure caps per SKU, brand, supplier and customer. |
| Opportunities | `npm run db:verify-opportunities` | PASS | §18 ranking (contribution / sell-through / cash cycle / credit / concentration). |
| Customer pricing | `npm run db:verify-customer-pricing` | PASS | §16/§18 customer-specific minimum sell price; **supplier names and buying costs never appear on customer-facing output**. |
| Inventory analytics | `npm run db:verify-inventory-analytics` | PASS | §11.1 available-to-sell = usable on hand − reservations; §18 aging buckets 0-30 / 31-90 / 91-180 / 181-365 / 365+. |
| KPIs | `npm run db:verify-kpis` | PASS | §18 KPI set with named owners; KPIs without inputs report *pending*, never zero. |
| Auto-clean | `npm run db:verify-clean` | PASS | Header aliasing, value cleaning (oz/L→ml, thousands separators, parenthesised negatives, booleans, barcode separators, mojibake), CLEANED INFO audit issues, cleaned-workbook re-export. |
| Auth | `npm run verify:auth` | PASS | Login, scrypt hashing, signed session cookie (uid + role), tampered/forged/expired cookie rejected, **fail-closed** behaviour, unauthenticated requests redirect to `/login`, and §19 role access (`canAccess` / `areaForPath`: per-area allow/deny, admin-only unclassified routes, settings read-open/write-restricted). |
| Role access (live) | manual smoke | PASS | Signed in as a `SALES` user: `/` and `/notes` → 200; `/fx` page → 307 to `/forbidden?next=/fx`; `/api/audit` and `POST /api/orders` → 403 with `{"role":"SALES"}`; header nav omits Exposure, Opportunities, Orders, Inventory, KPIs, Uploads, Exceptions, FX and Audit. |
| Compare | `npm run verify:compare` | PASS | R6/R7 price-list comparison: added / removed / changed / same, price-change % (same currency) and USD change % (cross-currency), quantity change. |
| Orders | `npm run verify:orders` | PASS | R5/R2 order creation in whole cases, Excel export, **PDF and Excel PFI parsing**, variance classification (match / short / over / missing / absent). |
| Product costing | `npm run verify:product-costing` | PASS | R1/R3 landed-cost ranking by supplier, best supplier, break-even and suggested price; **offers with no FX rate rank last, never above a known rate**. |
| Supply pooling | `npm run db:verify-supply` | PASS | §11.1 duplicate supply counted once (two brokers, one owner's lot = one pool, not summed); location ≠ territory; ownership-unknown shown as a separate range; firm/indicative/incoming/on-request kept apart; stale offers excluded; **ingest links broker rows to one pool**. |

Reproduce:

```bash
npm run db:start
npm run db:migrate && npm run db:seed

npm run db:verify-pricing
npm run db:verify-alerts
npm run db:verify-demands
npm run db:verify-suppliers
npm run db:verify-exposure
npm run db:verify-opportunities
npm run db:verify-customer-pricing
npm run db:verify-inventory-analytics
npm run db:verify-kpis
npm run db:verify-clean
npm run db:verify-supply
npm run verify:auth
npm run verify:compare
npm run verify:orders
npm run verify:product-costing
```

`npm run db:verify` starts and owns its own Postgres, so stop the background dev
database first (port 5433 conflict).

---

## 2. Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | **0 errors** |
| Lint | `npm run lint` | **0 errors**, 1 pre-existing warning (`scripts/verify-opportunities.ts:50` — unused `deal2`) |
| Production build | `npm run build` | **Succeeds**; all routes compile |

---

## 3. Acceptance tests (brief §20)

| Acceptance test | Status | Evidence |
| --- | --- | --- |
| Valid UPC and EAN aliases match correctly; leading zeros survive Excel import | PASS | `db:verify` |
| Case barcodes, testers, gift sets and conflicting sizes do not merge incorrectly | PASS | `db:verify` (§6.2 — case never equated to bottle without verified units-per-case) |
| Duplicate file upload creates no extra offers | PASS | `db:verify` (SHA-256 dedup) |
| A new list preserves old prices | PASS | `db:verify` (append-only offer history) |
| One stock pool offered by two brokers is counted once | PASS | `db:verify-supply` (§11.1 — brokers linked to one pool; counted once, not summed) |
| Unknown and stale stock excluded from confirmed totals | PASS | `db:verify` / `db:verify-supply` |
| The **$30 example** reconciles | PASS | `db:verify-pricing` — $33 landed, $7,000 GP, 17.5%, $5,000 contribution, 12.5%, 14.29%, 57.94% |
| Case conversion, MOQ, price tiers, FX, included freight, recoverable taxes produce reviewed results | PASS | `db:verify-pricing` |
| A note with an unclear SKU goes to review | PASS | `db:verify-demands` (unclear stays unresolved) |
| Repeated meeting notes do not duplicate demand | PASS | `db:verify-demands` |
| Approved requirements trigger an eligible profitable match; expired ones do not | PASS | `db:verify-demands` |
| Stock reservations cannot oversell the same lot | PASS | `db:verify-inventory-analytics` |
| Actual purchase, sales and payment records reconcile with accounts | **NOT TESTED — not implemented** | No accounting integration yet (§17 Phase 4) |
| Supplier costs do not appear on customer exports | PASS | `db:verify-customer-pricing` |

**13 of 14 acceptance tests pass.** The 1 not implemented is the accounting
integration (§17 Phase 4) — it is not testable because the underlying records do
not exist yet.

---

## 4. Live smoke tests

Run against a real running server (local, and once against the deployed host).

| Flow | Result |
| --- | --- |
| `/api/health` returns 200 with a reachable, migrated database | PASS |
| Unauthenticated page → 307 redirect to `/login` | PASS |
| Login → 200 + session cookie; tampered cookie → rejected | PASS |
| Supplier Excel upload → validation → offers created | PASS |
| Cleaned-workbook download at `/uploads/[id]/cleaned` | PASS |
| Deal compute → profitability + scenarios | PASS |
| Compare two price lists via `/api/compare` | PASS |
| Order create (whole cases) → Excel export | PASS |
| PFI upload, **both PDF and Excel** → variance classification | PASS |
| `/calculator` and `/products/[id]` render with landed-cost ranking | PASS |
| `/audit` and `/api/audit` return entries; filters work; unauthenticated → 307 | PASS |

Deployed host smoke (`https://pafam2.onrender.com`): `/api/health` 200. Login
requires `AUTH_SECRET` to be set on the host — until then the app fails closed
(redirect to `/login`, login returns 503), which is the intended behaviour.

---

## 5. Known gaps these tests do **not** cover

Documented in `docs/data-dictionary.md` §12 and the README:

- Dated cash flows, partial payments and **XIRR** (§8.4) — cash return is
  approximated from a single cash-cycle-days figure.
- Financing rates and daily funding balances (§8.4).
- Supplier **on-time delivery, fill rate and claims** (§18) — reported *pending*
  on the scorecard; no goods-receipt or delivery-date records exist.
- **Forecasts** (§12) — deliberately deferred until enough reliable history
  exists.

§19 per-role access and §11.1 stock pooling **are** now implemented (see the
Auth, Role-access and Supply-pooling rows in §1) and are no longer gaps.

These are expected to be absent, not failures.
