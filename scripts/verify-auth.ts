// Verifies password hashing and session signing/tamper detection. Pure
// crypto — no database or server required.
// Run: npx tsx scripts/verify-auth.ts
import { loadEnvFile } from "node:process";
try {
  loadEnvFile();
} catch {}

import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  authConfigured,
} from "../src/lib/auth";
import { canAccess, areaForPath } from "../src/lib/access";

let failures = 0;
function assert(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}

assert("auth is configured (AUTH_SECRET present)", authConfigured());

// --- Passwords ---
const hash = hashPassword("s3cret-password");
assert("hash has scrypt format", hash.startsWith("scrypt:") && hash.split(":").length === 3);
assert("hash is salted (two hashes differ)", hashPassword("same") !== hashPassword("same"));
assert("correct password verifies", verifyPassword("s3cret-password", hash));
assert("wrong password rejected", !verifyPassword("wrong", hash));
assert("null stored hash rejected", !verifyPassword("x", null));
assert("garbage stored hash rejected", !verifyPassword("x", "not-a-hash"));

// --- Sessions ---
const token = signSession("user-123", "SALES");
assert("session round-trips to uid", verifySession(token)?.uid === "user-123");
assert("session round-trips to role", verifySession(token)?.role === "SALES");
assert("empty token rejected", verifySession("") === null);
assert("undefined token rejected", verifySession(undefined) === null);
assert("garbage token rejected", verifySession("garbage") === null);
assert("missing signature rejected", verifySession("onlypayload") === null);

const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
assert("tampered signature rejected", verifySession(tampered) === null);

const [payload] = token.split(".");
const forged = `${payload}.${Buffer.from("deadbeef").toString("base64url")}`;
assert("forged signature rejected", verifySession(forged) === null);

// --- Role-based access (§19) ---
assert("dashboard is open to every role", canAccess("WAREHOUSE", "/"));
assert("login area needs no role check", areaForPath("/login") === null);
assert("auth endpoints need no role check", areaForPath("/api/auth/logout") === null);

assert("sales can reach customer notes", canAccess("SALES", "/notes"));
assert("purchasing cannot reach customer notes", !canAccess("PURCHASING", "/notes"));
assert("warehouse cannot reach customer demands", !canAccess("WAREHOUSE", "/demands"));

assert("accounts can reach FX", canAccess("ACCOUNTS", "/fx"));
assert("sales cannot reach FX", !canAccess("SALES", "/fx"));
assert("purchasing cannot read the audit log", !canAccess("PURCHASING", "/api/audit"));

assert("accounts owns cash flow", canAccess("ACCOUNTS", "/cashflow") && canAccess("ACCOUNTS", "/api/cashflow", "POST"));
assert("accounts owns invoices and financing", canAccess("ACCOUNTS", "/invoices") && canAccess("ACCOUNTS", "/api/financing", "POST"));
assert("sales cannot reach cash flow", !canAccess("SALES", "/cashflow") && !canAccess("SALES", "/api/invoices"));
assert("purchasing cannot record payments", !canAccess("PURCHASING", "/api/invoices/x/payments", "POST"));

assert("purchasing can reach orders", canAccess("PURCHASING", "/orders"));
assert("warehouse cannot create orders", !canAccess("WAREHOUSE", "/api/orders"));
assert("warehouse owns inventory", canAccess("WAREHOUSE", "/inventory"));

assert("warehouse owns the claims log", canAccess("WAREHOUSE", "/claims") && canAccess("WAREHOUSE", "/api/claims"));
assert("purchasing can reach claims", canAccess("PURCHASING", "/api/claims"));
assert("sales cannot reach claims", !canAccess("SALES", "/claims"));
assert("purchasing records goods receipts", canAccess("PURCHASING", "/api/orders/x/receipts", "POST"));
assert("sales cannot record goods receipts", !canAccess("SALES", "/api/orders/x/receipts", "POST"));

assert("manager reaches everything", canAccess("MANAGER", "/kpis") && canAccess("MANAGER", "/orders"));
assert("admin reaches an unclassified route", canAccess("ADMIN", "/some/new/route"));
assert("an unclassified route is admin-only", !canAccess("SALES", "/some/new/route"));

assert("reading settings is open", canAccess("SALES", "/api/settings", "GET"));
assert("writing settings is manager-only", !canAccess("SALES", "/api/settings", "PUT"));
assert("manager may write settings", canAccess("MANAGER", "/api/settings", "PUT"));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
