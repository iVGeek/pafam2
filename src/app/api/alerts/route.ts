import { computeAlerts, getAlertSettings } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [alerts, settings] = await Promise.all([computeAlerts(), getAlertSettings()]);
  return Response.json({ alerts, settings });
}
