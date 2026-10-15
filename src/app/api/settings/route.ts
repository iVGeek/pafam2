import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keys the UI is allowed to write. Unknown keys are rejected so a stray call
// cannot silently create settings the engine never reads.
const WRITABLE_KEYS = new Set([
  "min_contribution_margin_pct",
  "max_deal_capital_usd",
  "default_currency",
  "default_cash_cycle_days",
  "alert_price_move_pct",
  "alert_stale_days",
  "alert_aged_inventory_days",
  "alert_expiring_days",
  "alert_margin_drop_pct",
  "alert_overrides",
  "exposure_caps",
  "customer_pricing",
  "kpi_owners",
]);

export async function GET() {
  const rows = await prisma.setting.findMany({ orderBy: { key: "asc" } });
  const values: Record<string, unknown> = {};
  for (const row of rows) values[row.key] = row.value;
  return Response.json({ settings: values });
}

type Body = { key?: string; value?: unknown; values?: Record<string, unknown> };

export async function PUT(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const entries: [string, unknown][] = body.values
    ? Object.entries(body.values)
    : body.key
      ? [[body.key, body.value]]
      : [];

  if (entries.length === 0) {
    return Response.json({ error: "Provide key/value or values." }, { status: 400 });
  }

  const unknown = entries.map(([k]) => k).filter((k) => !WRITABLE_KEYS.has(k));
  if (unknown.length) {
    return Response.json({ error: `Unknown setting key(s): ${unknown.join(", ")}.` }, { status: 400 });
  }

  for (const [key, value] of entries) {
    if (key === "alert_overrides" && (value === null || typeof value !== "object" || Array.isArray(value))) {
      return Response.json(
        { error: "alert_overrides must be an object of the shape { brands, skus }." },
        { status: 400 },
      );
    }
    if (key === "exposure_caps" && (value === null || typeof value !== "object" || Array.isArray(value))) {
      return Response.json(
        { error: "exposure_caps must be an object of the shape { sku, brand, supplier, customer, defaults }." },
        { status: 400 },
      );
    }
    if (key === "customer_pricing" && (value === null || typeof value !== "object" || Array.isArray(value))) {
      return Response.json(
        { error: "customer_pricing must be an object of the shape { defaultMarginPct, overrides }." },
        { status: 400 },
      );
    }
    if (key === "kpi_owners" && (value === null || typeof value !== "object" || Array.isArray(value))) {
      return Response.json(
        { error: "kpi_owners must be an object mapping a KPI key to an owner name." },
        { status: 400 },
      );
    }
  }

  const updated: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    const record = await prisma.setting.upsert({
      where: { key },
      update: { value: value as object, updatedBy: "web" },
      create: { key, value: value as object, updatedBy: "web" },
    });
    updated[key] = record.value;
    await prisma.auditLog.create({
      data: { actor: "web", action: "setting.updated", entityType: "Setting", entityId: key, after: { value: value as object } },
    });
  }

  return Response.json({ settings: updated });
}
