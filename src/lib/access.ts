// Role-based access control (§19).
//
// The proxy gates every request with this module. Areas are coarse groupings of
// routes; each role is granted a set of areas. ADMIN and MANAGER own everything.
//
// Design notes:
//   - Enforcement is path-based and needs no database query, so it is cheap
//     enough to run on every request inside the proxy.
//   - The role is carried in the signed session token, so changing a user's
//     role takes effect at their next sign-in.
//   - Anything not classified below is treated as `admin` and therefore
//     restricted to ADMIN/MANAGER. New routes are fail-closed by default rather
//     than silently open.

import type { Role } from "@prisma/client";

export type Area =
  | "dashboard"
  | "auth"
  | "market"
  | "purchasing"
  | "trading"
  | "sales"
  | "accounts"
  | "warehouse"
  | "admin";

export const ALL_AREAS: readonly Area[] = [
  "dashboard",
  "auth",
  "market",
  "purchasing",
  "trading",
  "sales",
  "accounts",
  "warehouse",
  "admin",
];

/**
 * Which areas each role may reach.
 *
 *   PURCHASING  owns supplier confirmations, orders, imports and exceptions,
 *               and needs stock visibility while buying.
 *   SALES       owns reviewed customer demands, notes, quotes and tasks, and
 *               needs market/offer visibility to match demand to supply — but
 *               not internal inventory.
 *   ACCOUNTS    owns FX, cost inputs, KPIs and the audit trail.
 *   WAREHOUSE   owns physical quantities and lots.
 *   MANAGER     approves exceptions and buying limits, so sees everything.
 */
export const ROLE_AREAS: Record<Role, readonly Area[]> = {
  ADMIN: ALL_AREAS,
  MANAGER: ALL_AREAS,
  PURCHASING: ["dashboard", "auth", "market", "purchasing", "trading", "warehouse"],
  SALES: ["dashboard", "auth", "market", "trading", "sales"],
  ACCOUNTS: ["dashboard", "auth", "trading", "accounts"],
  WAREHOUSE: ["dashboard", "auth", "warehouse"],
};

// Route prefixes grouped by area. Matched as "starts with, at a path boundary".
const AREA_PREFIXES: Record<Exclude<Area, "dashboard" | "auth" | "admin">, readonly string[]> = {
  market: [
    "/offers",
    "/suppliers",
    "/supply",
    "/products",
    "/pricing",
    "/trends",
    "/compare",
    "/api/offers",
    "/api/suppliers",
    "/api/products",
    "/api/market-prices",
    "/api/compare",
  ],
  purchasing: [
    "/orders",
    "/exceptions",
    "/uploads",
    "/opportunities",
    "/exposure",
    "/api/orders",
    "/api/exceptions",
    "/api/uploads",
  ],
  trading: ["/deals", "/calculator", "/alerts", "/api/deals", "/api/alerts"],
  sales: [
    "/customers",
    "/demands",
    "/notes",
    "/tasks",
    "/quotes",
    "/api/customers",
    "/api/demands",
    "/api/notes",
    "/api/extractions",
    "/api/tasks",
    "/api/quotes",
  ],
  accounts: ["/fx", "/kpis", "/audit", "/api/fx", "/api/audit"],
  warehouse: ["/inventory", "/claims", "/api/inventory", "/api/claims"],
};

// Reachable by every signed-in account regardless of role.
const OPEN_PREFIXES = ["/login", "/forbidden", "/api/auth", "/api/template"];

function matches(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) return false;
  const rest = pathname.slice(prefix.length);
  return rest === "" || rest.startsWith("/") || rest.startsWith(".");
}

/** The area a request belongs to, or null when it needs no role check. */
export function areaForPath(pathname: string): Area | null {
  if (pathname === "/") return "dashboard";
  if (OPEN_PREFIXES.some((p) => matches(pathname, p))) return null;

  // Most specific prefixes first is not required: each path maps to exactly one
  // area, and the tables above are disjoint by construction.
  for (const [area, prefixes] of Object.entries(AREA_PREFIXES)) {
    if (prefixes.some((p) => matches(pathname, p))) return area as Area;
  }
  // Unclassified routes are admin-only by default.
  return "admin";
}

/**
 * Whether `role` may handle this request. Method-aware so a few endpoints can
 * be readable more widely than they are writable.
 */
export function canAccess(role: Role, pathname: string, method = "GET"): boolean {
  // Reading settings is broadly useful; writing thresholds is manager territory.
  if (pathname === "/api/settings") {
    return method === "GET" ? true : role === "ADMIN" || role === "MANAGER" || role === "ACCOUNTS";
  }

  const area = areaForPath(pathname);
  if (area === null) return true; // login page, auth endpoints, blank template
  return ROLE_AREAS[role]?.includes(area) ?? false;
}

/** Human label for an area, used in the "not permitted" message. */
export const AREA_LABELS: Record<Area, string> = {
  dashboard: "Dashboard",
  auth: "Sign-in",
  market: "Market (offers, suppliers, products, pricing, trends)",
  purchasing: "Purchasing (orders, imports, exceptions, exposure)",
  trading: "Trading (deals, calculator, alerts)",
  sales: "Sales (customers, demand, notes, quotes, tasks)",
  accounts: "Accounts (FX, KPIs, audit log)",
  warehouse: "Warehouse (inventory and lots)",
  admin: "Administration",
};
