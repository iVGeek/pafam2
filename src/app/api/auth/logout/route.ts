import { SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Clears the session cookie. Returns a redirect (303) so a plain HTML form
// submit works with no JavaScript.
export async function POST() {
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/login",
      "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`,
    },
  });
}
