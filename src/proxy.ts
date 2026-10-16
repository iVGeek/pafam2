// Global request gate. In Next 16 the middleware convention is renamed to
// proxy, and proxy defaults to the Node.js runtime — so the Node crypto-based
// session verifier in lib/auth is safe to use here.
//
// Two checks, in order:
//   1. Authentication — is there a valid signed session? (fail closed)
//   2. Authorisation  — may this role reach this area? (§19)

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { canAccess } from "@/lib/access";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  // --- 1. Authentication ---
  if (!session) {
    if (pathname === "/login" || pathname === "/api/auth/login") {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed in: bounce away from the login page.
  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // --- 2. Authorisation (§19) ---
  if (!canAccess(session.role, pathname, request.method)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "Your role does not permit this action.",
          role: session.role,
        },
        { status: 403 },
      );
    }
    const url = new URL("/forbidden", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Static assets, the health probe and the auth endpoints are never gated.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/auth/login|api/auth/logout|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
