# Data Dictionary

Authoritative reference for every table, field and Excel column in the platform.
The database (Postgres) is the system of record; Excel is import/export only.

- Source of truth for schema: `prisma/schema.prisma`
- Source of truth for Excel columns: `src/lib/columns.ts`
- Conventions: dates are `YYYY-MM-DD`; money is stored as fixed-precision
  `Decimal`; barcodes are **always text** so leading zeros survive; blank means
  **unknown**, never zero.

---

## 1. Core principles

| Rule | Meaning |
| --- | --- |
| Blank ≠ zero | Blank means "we don't know". Zero is a real value and is never inferred. |
| Barcodes as text | EAN/UPC stored as text. A canonical `gtin14` (14-digit padded) is derived for valid GTINs; the source value is always preserved. |
| Offers are observations | A supplier price list is a dated observation, not our own stock. History is append-only; a new list does not overwrite an old price. |
| Unit vs case | A case barcode is never equated to a bottle without a verified `unitsPerCase`. |

---

## 2. Identity and access

### `AppUser`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | text (cuid) | PK |
| `email` | text | unique; login name |
| `name` | text | display name |
| `passwordHash` | text? | `scrypt:<salt>:<hash>`; null until a password is set |
| `role` | enum `Role` | ADMIN, MANAGER, PURCHASING, SALES, ACCOUNTS, WAREHOUSE |
| `active` | boolean | inactive users cannot sign in |

Session is a stateless HMAC-signed cookie valid 30 days (`src/lib/auth.ts`).

---

## 3. Products and matching

### `Product` — internal product master

| Field | Type | Notes |
| --- | --- | --- |
| `internalSku` | text | unique; our SKU |
| `gtin14` | text? | canonical GTIN, padded to 14 digits |
| `brand`, `fragranceName`, `concentration` | text? | identity attributes |
| `sizeMl` | int? | millilitres |
| `genderOrCategory`, `setContents`, `notes` | text? | |

### `BarcodeAlias` — SKU / barcode alias table

| Field | Type | Notes |
| --- | --- | --- |
| `code` | text | barcode **as text**, leading zeros preserved |
| `codeType` | enum `CodeType` | EAN, UPC, GTIN |
| `packagingLevel` | enum `PackagingLevel` | UNIT, CASE, TESTER, GIFT_SET, REFILL, DAMAGED, UNKNOWN |
| `unitsPerCase` | int? | verified conversion factor; null if unknown |
| `sourceValue` | text? | original value exactly as supplied |
| `productId` | FK → Product | |

Unique on `(code, packagingLevel)`. Attributes are checked **after** a barcode
match; the same code on two lists does not prove identical packaging.

---

## 4. Suppliers and supply

### `Supplier`

`name` (unique), `country`, `active`, `notes`.

### `StockOwner`

The party who **actually owns** the stock — may differ from the broker.
`name` (unique), `country`, `notes`.

### `Lot`

A physical stock lot under an owner.
`stockOwnerId`, `lotReference`, `manufactureDate`, `uniqueLotRef`.
Unique on `(stockOwnerId, lotReference)`.

### `StockPool` — one physical parcel of supplier stock (§11.1)

Several brokers can offer **one owner's lot**. Those offers link to a single
pool so the parcel is counted **once**, never summed.

| Field | Notes |
| --- | --- |
| `productId?` | the SKU the pool is for (null until the offer is matched) |
| `stockOwnerId?` | the owner, when known |
| `lotReference?` | the lot/batch reference, when known |
| `label` | human label, e.g. `Owner · LOT-A123` |
| `status` | enum `PoolStatus`: `CONFIRMED` (owner + lot known), `POSSIBLE` (owner known, lot unknown), `UNVERIFIED` (no ownership info) |
| `notes?` | free text |

Offers created on import with a known owner and lot are linked automatically to a
`CONFIRMED` pool; a known owner without a lot yields a `POSSIBLE` pool; offers
with no owner are left unpooled and reported separately as unverified. See
`docs/calculation-spec.md` for how observed supply deduplicates.

### `Offer` — one dated supplier offer observation

Grouped as in the Excel template:

| Group | Fields |
| --- | --- |
| Identity | `status` (ACTIVE/STALE/EXPIRED), `offerId`, `supplierId`, `productId?`, `stockOwnerId?`, `lotId?`, `poolId?` |
| Source & dates | `listDate`, `validUntil`, `lastStockConfirmation`, `sourceFileId`, `sourceRow` |
| Product (as supplied) | `originalCode`, `originalCodeType`, `brand`, `fragranceName`, `concentration`, `sizeMl`, `genderOrCategory`, `setContents` |
| Packaging & condition | `packagingLevel`, `hasCap`, `hasBox`, `sealed`, `damageStatus`, `batchOrLotRef`, `manufactureDate` |
| Price & quantity | `currency`, `price`, `priceBasis`, `unitsPerCase`, `availableQuantity`, `quantityUnit`, `moq`, `orderMultiple`, `priceTierMin`, `priceTierMax` |
| Logistics & terms | `stockCountry`, `warehouse`, `countryOfOrigin`, `incoterm`, `namedPlace`, `readyDate`, `leadTimeDays`, `paymentTerms`, `freightInclusions` |
| Eligibility & evidence | `permittedDestinations`, `permittedChannels`, `usSuitability`, `authenticityDocs`, `stockOwnerRef`, `uniqueLotReference`, `stockConfidence` |

`productId` is null until the row is matched to the product master.

---

## 5. Uploads, validation and audit

### `UploadFile` — one uploaded file

`filename`, `storedName`, **`sha256`** (dedup key), `fileSize`, `supplierId`,
`listDate`, `rowCount`/`validRows`/`invalidRows`, `status`
(PENDING/VALIDATED/FAILED/DUPLICATE), `message`, `uploadedBy`.

Re-uploading a file with the same `sha256` is detected as a duplicate and
creates no new offers.

### `UploadRow` — every raw source row, kept verbatim

`uploadFileId`, `rowNumber`, `rawJson`, `status` (OK/EXCEPTION/DUPLICATE),
`offerId?`. Unique on `(uploadFileId, rowNumber)`.

### `ValidationIssue` — exception queue

`uploadFileId`, `uploadRowId?`, `code`, `field`, `message`,
`severity` (ERROR/WARNING/INFO), `resolved`, `resolvedBy`, `resolvedAt`,
`resolution`.

`INFO` severity is also used for auto-cleaning audit entries (see §7).

### `AuditLog` — immutable trail of sensitive changes

`actor`, `action`, `entityType`, `entityId`, `before` (json), `after` (json),
`details`, `uploadFileId?`. Viewable at **/audit**.

### `Setting`

Key/value JSON store for manager-configurable thresholds (min margins,
capital limits, freshness windows, KPI owners, alert settings).

---

## 6. Trading

### `FxRate` — dated exchange rate

`baseCurrency`, `quoteCurrency` (default USD), **`rate` = USD per 1 unit of
base**, `rateDate`, `source`, `booked`. Unique on
`(baseCurrency, quoteCurrency, rateDate, source)`.

### `Customer`

`name` (unique), `company`, `contactName`/`contactEmail`/`contactPhone`,
`destinationCountry`, `destinationCity`, `channels`, `accountOwner`,
`currency`, `paymentTerms`, `creditLimit`, `notes`, `active`.

### `Demand` — one dated record per customer requirement

| Group | Fields |
| --- | --- |
| Status | `status` (WISHLIST/REQUEST/QUOTE/CONFIRMED/FULFILLED/LOST/EXPIRED), `certainty` (EXACT/INFERRED) |
| Product | `productId?`, `barcode?`, `internalSku?`, `brand?`, `fragranceName?`, `concentration?`, `sizeMl?`, `packagingRequirement?` |
| Commercial | `quantity`, `quantityUnit`, `targetPrice`, `currency`, `deliveryBasis`, `destination`, `neededBy`, `paymentTerms` |
| Evidence | `evidence`, `meetingDate`, `owner`, `lastReconfirmed` |
| Uncertainty | `extractionConfidence`, `matchConfidence`, `approved`, `approvedBy`, `expiryDate` |

Demands are never overwritten — each requirement is its own dated row.

### `Deal` — a scored buying/quote opportunity (P&L)

Inputs: `supplierId`, `productId?`, `customerId?`, `offerId?`, `quantity`,
`buyCurrency`, `buyPrice`, `buyPriceBasis`, `unitsPerCase`, `fxRate`,
`fxRateDate`, `fxSource`, `sellingPriceUsd`.

Computed (recomputed and stored on every save, for audit):
`landedUnitCost`, `netUnitRevenue`, `grossProfit`, `grossMarginPct`,
`dealContribution`, `contributionMarginPct`, `cashRequirement`,
`cashCycleDays`, `capitalEfficiencyPct`, `annualisedReturnPct`,
`suggestedSellPrice`.

Integrity: `incomplete` (boolean) + `missingInputs` (json). A deal with unknown
material costs is flagged incomplete — never shown as a false zero-cost result.
Also `status` (DRAFT/REVIEWED/APPROVED/WON/LOST), `lostReason`, `owner`.

### `DealCost` — one cost line on a deal

`category` (enum `CostCategory`: FREIGHT, INSURANCE, DUTY, BROKERAGE, HANDLING,
TAX, RECOVERABLE, OUTBOUND, COMMISSION, FEES, STORAGE, FINANCING, CREDIT_LOSS,
OTHER), `label`, `amount`, `currency`, **`recoverable`** (affects cash funding
but not permanent cost), `driver` (allocation basis), `notes`.

### `Quote` / `QuoteLine` — customer-facing quote

Quote: `quoteNumber` (unique), `customerId`, `status`
(DRAFT/APPROVED/SENT/ACCEPTED/DECLINED/EXPIRED), `currency`, `validUntil`,
`paymentTerms`, `deliveryBasis`, `destination`, `approvedBy`, `approvedAt`.

Line: `dealId?`, `productId?`, `description`, `quantity`, `unitPrice`,
`currency`.

> Quote exports **never** contain supplier names or buying costs.

---

## 7. Inventory

### `InventoryItem` — own stock by SKU / warehouse / lot

`status` (USABLE/IN_TRANSIT/QUARANTINED/DAMAGED), `warehouse`, `territory`,
`lotRef`, `batchRef`, `quantity`, `unitCostUsd`, `acquiredDate`, `dealId?`.

**Available to sell = usable on hand − active reservations.** Inbound units are
not counted before receipt.

### `InventoryReservation`

`inventoryItemId`, `quantity`, `status` (ACTIVE/FULFILLED/RELEASED),
`demandId?`, `dealId?`, `customerId?`, `createdBy`, `resolvedAt`.
Reservations reduce available-to-sell but do not change physical on-hand until
fulfilled. Overselling the same lot is blocked.

---

## 8. Intelligence

### `MarketPrice` — separate price series (§12)

`productId`, `kind` (PUBLIC_RETAIL / WHOLESALE_SALE / OTHER), `price`,
`currency`, `observedDate`, `source`, `territory`.
Kept separate from supplier asks and our own trades — never mixed.

### `Note` — captured conversation (Plaud / reMarkable / manual)

`source` (PLAUD/REMARKABLE/MANUAL), `status` (RECEIVED/REVIEWED/ARCHIVED),
`customerId?`, `meetingDate`, `staffMember`, `filename`, `sourceLocation`,
`rawText` (verbatim, never overwritten), `summary`.

### `NoteExtraction` — one claim pulled from a note

`kind` (PRODUCT_MENTION/QUANTITY/TARGET_PRICE/DEADLINE/CHANNEL_RESTRICTION/
OBJECTION/COMPETITOR_QUOTE/FOLLOW_UP), `status` (PENDING/APPROVED/REJECTED),
`productText`, `barcode`, `quantity`, `targetPrice`, `currency`, `neededBy`,
`dueDate`, `detail`, **`excerpt`** (exact source text), `pageRef`, `confidence`,
`appliedDemandId?`, `reviewedBy`.

Staff approve extractions **before** they become live demand. Unclear values
stay unresolved; nothing is invented.

### `FollowUpTask`

`noteId?`, `customerId?`, `demandId?`, `title`, `detail`, `dueDate`, `owner`,
`status` (OPEN/DONE/CANCELLED), `completedAt`.

---

## 9. Orders and proforma invoices

### `PurchaseOrder`

`reference` (unique), `supplierId`, `status` (DRAFT/SENT/CONFIRMED/RECEIVED/
CANCELLED), `currency`, `fxRate`, `incoterm`, `notes`, `createdBy`.

### `OrderLine`

`orderId`, `productId?`, `originalCode`, `brand`, `fragranceName`,
`concentration`, `sizeMl`, `packagingLevel`, `unitsPerCase`, **`cases`**,
**`units`** (= cases × unitsPerCase, whole boxes only), `unitCost`, `currency`.

### `PfiDocument` / `PfiLine` — supplier proforma invoice (PDF or Excel)

Document: `orderId`, `filename`, `sourceType` (PDF|EXCEL), `lineCount`.
Line: `originalCode`, `brand`, `name`, `unitPrice`, `currency`, `quantity`,
`unitsPerCase`, `rawText` (original text, always kept).

PFI lines are matched to order lines by internal SKU → code → brand/name/size,
then classified `match` / `short` / `over` / `missing` / `absent`.

---

## 10. Excel template columns

The canonical template (`src/lib/columns.ts`, downloadable at **/api/template**)
uses these columns for both import and export so files round-trip cleanly.

| Group | Column | Key | Requirement |
| --- | --- | --- | --- |
| Matching keys | Barcode / Code | `original_code` | **required** |
| | Code Type | `code_type` | optional |
| | Internal SKU | `internal_sku` | optional |
| | Brand | `brand` | recommended |
| | Fragrance / Product Name | `fragrance_name` | recommended |
| | Concentration | `concentration` | optional |
| | Size (ml) | `size_ml` | optional |
| | Gender / Category | `gender_category` | optional |
| | Set Contents | `set_contents` | optional |
| Source & dates | Supplier | `supplier_name` | **required** |
| | Supplier Offer ID | `supplier_offer_id` | optional |
| | List Date | `list_date` | recommended |
| | Valid Until | `valid_until` | optional |
| | Last Stock Confirmation | `last_stock_confirmation` | optional |
| Packaging & condition | Packaging Level | `packaging_level` | **required** |
| | Units / Case | `units_per_case` | optional |
| | Has Cap / Has Box / Sealed | `has_cap`, `has_box`, `sealed` | optional |
| | Damage Status | `damage_status` | optional |
| | Batch / Lot Ref | `batch_lot_ref` | optional |
| | Manufacture Date | `manufacture_date` | optional |
| Price & quantity | Currency | `currency` | **required** |
| | Price | `price` | **required** |
| | Price Basis | `price_basis` | optional |
| | Available Quantity | `available_quantity` | **required** |
| | Quantity Unit | `quantity_unit` | optional |
| | MOQ | `moq` | optional |
| | Order Multiple | `order_multiple` | optional |
| | Price Tier From / To | `price_tier_min`, `price_tier_max` | optional |
| Logistics & terms | Stock Country, Warehouse, Country of Origin | | optional |
| | Incoterm, Named Place, Ready Date, Lead Time (days) | | optional |
| | Payment Terms, Freight Inclusions | | optional |
| Eligibility & evidence | Permitted Destinations, Permitted Channels, US Suitability, Authenticity Docs | | optional |
| Ownership | Stock Owner, Stock Owner Ref, Unique Lot Reference, Stock Confidence | | optional |

### Automatic cleaning on import

Header names are aliased to the canonical keys above, and values are cleaned
before validation: concentration/currency/packaging synonyms, oz/L → ml, numbers
with thousands separators and parenthesised negatives, boolean text, barcode
separator characters, and common mojibake. Every change is recorded as an
`INFO`-severity `ValidationIssue` and the cleaned workbook is re-exportable at
**/uploads/[id]/cleaned**.

---

## 11. Enumerations

| Enum | Values |
| --- | --- |
| `Role` | ADMIN, MANAGER, PURCHASING, SALES, ACCOUNTS, WAREHOUSE |
| `CodeType` | EAN, UPC, GTIN |
| `PackagingLevel` | UNIT, CASE, TESTER, GIFT_SET, REFILL, DAMAGED, UNKNOWN |
| `OfferStatus` | ACTIVE, STALE, EXPIRED |
| `PoolStatus` | CONFIRMED, POSSIBLE, UNVERIFIED |
| `UploadStatus` | PENDING, VALIDATED, FAILED, DUPLICATE |
| `UploadRowStatus` | OK, EXCEPTION, DUPLICATE |
| `IssueSeverity` | ERROR, WARNING, INFO |
| `CostCategory` | FREIGHT, INSURANCE, DUTY, BROKERAGE, HANDLING, TAX, RECOVERABLE, OUTBOUND, COMMISSION, FEES, STORAGE, FINANCING, CREDIT_LOSS, OTHER |
| `DealStatus` | DRAFT, REVIEWED, APPROVED, WON, LOST |
| `DemandStatus` | WISHLIST, REQUEST, QUOTE, CONFIRMED, FULFILLED, LOST, EXPIRED |
| `DemandCertainty` | EXACT, INFERRED |
| `QuoteStatus` | DRAFT, APPROVED, SENT, ACCEPTED, DECLINED, EXPIRED |
| `InventoryStatus` | USABLE, IN_TRANSIT, QUARANTINED, DAMAGED |
| `ReservationStatus` | ACTIVE, FULFILLED, RELEASED |
| `MarketPriceKind` | PUBLIC_RETAIL, WHOLESALE_SALE, OTHER |
| `NoteSource` | PLAUD, REMARKABLE, MANUAL |
| `NoteStatus` | RECEIVED, REVIEWED, ARCHIVED |
| `ExtractionKind` | PRODUCT_MENTION, QUANTITY, TARGET_PRICE, DEADLINE, CHANNEL_RESTRICTION, OBJECTION, COMPETITOR_QUOTE, FOLLOW_UP |
| `ExtractionStatus` | PENDING, APPROVED, REJECTED |
| `TaskStatus` | OPEN, DONE, CANCELLED |
| `OrderStatus` | DRAFT, SENT, CONFIRMED, RECEIVED, CANCELLED |

---

## 12. Known gaps

These fields/tables are **not yet implemented** and are intentionally absent:

- Dated cash-flow ledger and XIRR (§8.4) — only a scalar `cashCycleDays` exists.
- Financing rate / funded dates / daily funding balances (§8.4).
- Supplier `promisedDate` / `actualDeliveryDate` and a claims log (§18) — so
  on-time delivery and claims show as *pending* on the supplier scorecard.
