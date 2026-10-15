import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight diagnostics: confirms the process is up and whether the database
// is reachable and migrated. Returns the raw DB error when it is not, which is
// otherwise hidden behind a production 500.
export async function GET() {
  const maskedUrl = (process.env.DATABASE_URL ?? "").replace(/:[^:@/]+@/, ":****@");
  const info: Record<string, unknown> = {
    ok: false,
    node: process.version,
    databaseUrl: maskedUrl || "(unset)",
  };

  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "Setting"
    `;
    info.ok = true;
    info.settings = rows[0]?.count ?? 0;
  } catch (error) {
    info.error = error instanceof Error ? error.message : String(error);
  }

  return Response.json(info, { status: info.ok ? 200 : 500 });
}
