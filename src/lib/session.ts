// Server-side session helpers. Lives apart from auth.ts so that auth.ts stays
// free of Next-only imports (it is also used by the seed script).

import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { SESSION_COOKIE, verifySession } from "./auth";

/** Current signed-in user, or null. */
export async function getCurrentUser() {
  const store = await cookies();
  const session = verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await prisma.appUser.findUnique({
    where: { id: session.uid },
  });
  if (!user || !user.active) return null;
  return user;
}
