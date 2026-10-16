// Password hashing and signed session cookies.
//
// Deliberately dependency-free (Node crypto only) so the same helpers work in
// route handlers, the seed script and the proxy. The proxy runs on the Node
// runtime in Next 16, so crypto is available there too.
//
//   passwordHash : "scrypt:<salt hex>:<hash hex>"   (N=16384, r=8, p=1)
//   session      : "<base64url payload>.<base64url hmac-sha256 signature>"
//
// The session is stateless: an HMAC-signed {uid, role, exp} payload. Revoking
// access is done by changing the user's passwordHash or deactivating the
// account — though note a signed session does not consult the DB on every
// request, so deactivation takes effect once the session expires or the app is
// restarted. Changing a user's role likewise takes effect at next sign-in.

import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "pafam_session";
export const SESSION_DAYS = 30;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.trim().length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short (set a random 32+ character value).",
    );
  }
  return value.trim();
}

/** True when a session secret is configured. */
export function authConfigured(): boolean {
  try {
    secret();
    return true;
  } catch {
    return false;
  }
}

// --- Passwords -------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(
  password: string,
  stored: string | null | undefined,
): boolean {
  if (!stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  if (!salt || !hash) return false;
  let calc: Buffer;
  let expected: Buffer;
  try {
    calc = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
    expected = Buffer.from(hash, "hex");
  } catch {
    return false;
  }
  if (calc.length !== expected.length) return false;
  return timingSafeEqual(calc, expected);
}

// --- Sessions --------------------------------------------------------------

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function signSession(uid: string, role: Role): string {
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        uid,
        role,
        exp: Date.now() + SESSION_DAYS * 86_400_000,
      }),
    ),
  );
  const signature = b64url(
    createHmac("sha256", secret()).update(payload).digest(),
  );
  return `${payload}.${signature}`;
}

export function verifySession(token: string | undefined | null): {
  uid: string;
  role: Role;
} | null {
  if (!token) return null;
  // Fail closed: any error (including a missing AUTH_SECRET) means "no session"
  // rather than a server crash.
  try {
    const cut = token.lastIndexOf(".");
    if (cut <= 0) return null;
    const payload = token.slice(0, cut);
    const signature = token.slice(cut + 1);

    const expected = b64url(
      createHmac("sha256", secret()).update(payload).digest(),
    );
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const json = Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const data = JSON.parse(json) as {
      uid?: unknown;
      role?: unknown;
      exp?: unknown;
    };
    if (typeof data.uid !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < Date.now()) return null;
    // A session without a role is from before role-based access existed; treat
    // it as no session rather than guessing (fail closed).
    if (!isRole(data.role)) return null;
    return { uid: data.uid, role: data.role };
  } catch {
    return null;
  }
}

const ROLES: readonly string[] = [
  "ADMIN",
  "MANAGER",
  "PURCHASING",
  "SALES",
  "ACCOUNTS",
  "WAREHOUSE",
];

function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.includes(value);
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
