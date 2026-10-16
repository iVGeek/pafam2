// Global request gate. In Next 16 the middleware convention is renamed to
// proxy, and proxy defaults to the Node.js runtime — so the Node crypto-based
// session verifier in lib/auth is safe to use here.
//
// Everything is private by default: only the login page, the login/logout
// endpoints and the Render health probe are reachable without a session.

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (session) {
    // Signed in: bounce away from the login page.
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

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

export const config = {
  // Static assets, the health probe and the auth endpoints are never gated.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/auth/login|api/auth/logout).*)",
  ],
};
