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
const token = signSession("user-123");
assert("session round-trips to uid", verifySession(token)?.uid === "user-123");
assert("empty token rejected", verifySession("") === null);
assert("undefined token rejected", verifySession(undefined) === null);
assert("garbage token rejected", verifySession("garbage") === null);
assert("missing signature rejected", verifySession("onlypayload") === null);

const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
assert("tampered signature rejected", verifySession(tampered) === null);

const [payload] = token.split(".");
const forged = `${payload}.${Buffer.from("deadbeef").toString("base64url")}`;
assert("forged signature rejected", verifySession(forged) === null);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
