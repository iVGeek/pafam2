import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authConfigured, COOKIE_OPTIONS, SESSION_COOKIE, signSession, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      {
        error:
          "Server authentication is not configured (AUTH_SECRET is missing). Set it and restart.",
      },
      { status: 503 },
    );
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return Response.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const user = await prisma.appUser.findUnique({ where: { email } });
  // Same message for unknown user / wrong password / inactive, so the endpoint
  // does not reveal which accounts exist.
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return Response.json(
      { error: "Incorrect email or password." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  response.cookies.set(SESSION_COOKIE, signSession(user.id), COOKIE_OPTIONS);
  return response;
}
