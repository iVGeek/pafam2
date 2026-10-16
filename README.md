# Perfumes+ — Perfume Wholesale Trading Platform

A central trading platform for perfume wholesale. It imports supplier Excel
lists, matches products by EAN/UPC, calculates deal profitability, tracks
observed supply and prices, and matches stock to customer demand.

Main selling market: **USA**. Brief dated 10 October 2026.

Excel is used for **import/export**. The authoritative records and history live
in **PostgreSQL**.

---

## What it does

| Area | Screens |
| --- | --- |
| **Data intake** | Uploads (Excel import, auto-clean, audit), Exceptions (validation queue), Products (master + barcode alias table), Template download |
| **Trading engine** | Deals (full P&L), CP/SP calculator, Opportunities, Exposure, Pricing, Compare (diff two price lists), Orders + PFI variance |
| **Customers** | Customers, Demand, Notes (Plaud / reMarkable / manual), Tasks, Quotes |
| **Intelligence** | Trends, Alerts, KPIs (with named owners), Dashboard |
| **Own stock** | Inventory, aging buckets, reservations (no overselling) |
| **Reference** | FX (dated rates), Suppliers (scorecard), Audit log, Login |

### Core rules the platform enforces

- **Barcodes as text** — leading zeros survive; a canonical 14-digit GTIN is
  derived and the source value is preserved.
- **Case ≠ bottle** — a case barcode is never treated as a bottle without a
  verified units-per-case conversion.
- **Offers are observations** — a new price list never overwrites an old price;
  history is append-only.
- **No duplicate imports** — re-uploading the same file (by SHA-256) creates no
  new offers.
- **Blank ≠ zero** — unknown stays unknown.
- **Incomplete profitability** — a deal with unknown material costs is flagged
  incomplete, never shown as a false zero-cost result.
- **Quotes never leak supply-side data** — customer exports contain no supplier
  names or buying costs.
- **Roles are enforced, fail-closed** — each account opens only its role's areas;
  unclassified routes are admin-only. See `docs/staff-guide.md` §11.

Full field reference: [`docs/data-dictionary.md`](docs/data-dictionary.md).
How every money figure is calculated: [`docs/calculation-spec.md`](docs/calculation-spec.md).
How staff use it: [`docs/staff-guide.md`](docs/staff-guide.md).
The original brief: [`docs/requirements.md`](docs/requirements.md).

---

## Stack

- **Next.js 16** (App Router, TypeScript, React 19) + **Tailwind CSS 4**
- **PostgreSQL** via **Prisma 6**
- **ExcelJS** for import/export, **unpdf** for PDF proforma invoices
- Sessions: stateless HMAC-signed cookie over scrypt password hashes (no
  external auth dependency)

---

## Quick start (local)

Requires Node 24+.

```bash
npm install

# 1. start the local embedded Postgres (port 5433)
npm run db:start

# 2. apply migrations and seed shared defaults
npm run db:migrate
npm run db:seed

# 3. run the app
npm run dev
```

Open http://localhost:3000 and sign in as `admin@pafam2.local` with
`ADMIN_PASSWORD` from `.env` (defaults to `change-me`).

`.env` is git-ignored — copy `.env.example` and fill in:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pafam2?schema=public
AUTH_SECRET=<random 32+ chars>
ADMIN_PASSWORD=<initial admin password>
```

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` / `lint` | Standard Next.js |
| `npm run db:start` | Start the local embedded Postgres |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:seed` | Seed shared defaults (idempotent) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:verify` | Run the core verification suite |
| `npm run db:verify-*` | Targeted suites (pricing, alerts, demands, suppliers, exposure, opportunities, customer-pricing, inventory-analytics, kpis, clean) |
| `npm run verify:auth` | Auth / session / fail-closed checks |
| `npm run verify:compare` | Price-list comparison checks |
| `npm run verify:orders` | Order + PFI checks |
| `npm run verify:product-costing` | Landed-cost ranking checks |
| `npm run railway:setup` | One-shot Railway deployment setup |

---

## Deployment

Two supported targets. Both run `prisma migrate deploy && prisma db seed &&
npm run start`, and both use `/api/health` as the health check (it returns 200
only when the database is reachable and migrated).

**Railway** — `railway.toml` (Nixpacks). One-shot setup:

```bash
npm run railway:setup
```

or by hand: create the project, add the Postgres plugin, set `DATABASE_URL` to
`${{Postgres.DATABASE_URL}}`, plus `AUTH_SECRET` and `ADMIN_PASSWORD`, then
connect the repo for auto-deploy.

**Render** — `render.yaml` blueprint, same variables and start command.

---

## Project layout

```
prisma/
  schema.prisma          data model (26-section brief mapped to tables)
  migrations/            committed migrations
  seed.ts                idempotent shared defaults
src/
  app/                   App Router pages + API routes
  lib/                   domain logic (pricing, matching, ingest, trends, ...)
scripts/
  verify*.ts             verification suites
  dev-db.mjs             local embedded Postgres
docs/
  requirements.md        the original brief (authoritative)
  data-dictionary.md     every table, field and Excel column
  calculation-spec.md    how every money figure is calculated
  staff-guide.md         day-to-day operating guide
  test-results.md        verification record and acceptance-test status
```

---

## Known gaps

Deliberately not yet implemented, and documented as such:

- Dated cash flows, partial payments and **XIRR** (brief §8.4) — cash return is
  currently approximated from a single cash-cycle-days figure.
- Financing rates and daily funding balances (§8.4).
- Supplier **on-time delivery, fill rate and claims** (§18) — shown as *pending*
  on the scorecard until goods-receipt and delivery-date records exist.
- **Forecasts** (§12) — deferred until enough reliable history exists, as the
  brief requires.

See [`docs/requirements.md`](docs/requirements.md) for the full brief and
`docs/data-dictionary.md` §12 for the field-level version of this list.

---

## Accepted advisories

`npm audit` reports one remaining high-severity advisory with **no patched
release**: `braces` (CVE-2026-93687, stack-exhaustion DoS via deeply nested
patterns; advisory GHSA-vfj7-8cjw-p6xm, affected `<= 3.0.3`, patched: none).

It is reachable only through `eslint-config-next` → `@next/eslint-plugin-next` →
`fast-glob` → `micromatch` → `braces`, i.e. **local lint tooling**. It is a
devDependency, is not bundled into the Next.js server or client build, and is
never reachable at runtime, so it cannot be triggered in a deployed instance.
The other advisories reachable through the dependency tree (`uuid` via `exceljs`,
`deepmerge-ts` via `prisma`) are forced to patched versions with `overrides` in
`package.json`.
