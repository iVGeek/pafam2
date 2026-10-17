import Link from "next/link";
import { computeAlerts, getAlertOverrides, getAlertSettings, type AlertSeverity } from "@/lib/alerts";
import { AlertSettingsForm } from "./alert-settings-form";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  high: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
  warn: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
  info: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
};

const TYPE_LABEL: Record<string, string> = {
  OFFER_MATCHES_DEMAND: "Buy opportunity",
  PRICE_MOVE: "Price movement",
  DEMAND_VS_SUPPLY: "Demand vs supply",
  STALE_OFFER: "Stale confirmation",
  MARGIN_DROP: "Margin drop",
  AGED_INVENTORY: "Aged inventory",
  DEMAND_EXPIRING: "Expiring demand",
  EXPOSURE_CAP: "Exposure cap",
};

export default async function AlertsPage() {
  const [alerts, settings, overrides] = await Promise.all([
    computeAlerts(),
    getAlertSettings(),
    getAlertOverrides(),
  ]);

  const counts = alerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.severity] = (acc[a.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Alerts</h1>
        <p className="text-xs text-zinc-500">
          {alerts.length} active · {counts.high ?? 0} high · {counts.warn ?? 0} warn · {counts.info ?? 0} info
        </p>
      </div>

      <AlertSettingsForm
        fields={[
          { key: "alert_price_move_pct", label: "Price move %", value: settings.priceMovePct },
          { key: "alert_stale_days", label: "Stale offer (days)", value: settings.staleDays },
          { key: "alert_aged_inventory_days", label: "Aged inventory (days)", value: settings.agedInventoryDays },
          { key: "alert_expiring_days", label: "Demand expiry (days)", value: settings.expiringDays },
          { key: "alert_margin_drop_pct", label: "Margin drop (points)", value: settings.marginDropPct },
        ]}
        overrides={JSON.stringify(overrides, null, 2)}
      />

      {alerts.length === 0 ? (
        <p className="text-sm text-zinc-500">No alerts. Everything looks current.</p>
      ) : (
        <ul className="space-y-3">
          {alerts.map((a) => (
            <li key={a.id} className={`rounded-lg border p-4 ${SEVERITY_STYLE[a.severity]}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium uppercase ${
                    a.severity === "high"
                      ? "bg-red-600 text-white"
                      : a.severity === "warn"
                        ? "bg-amber-500 text-white"
                        : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                  }`}
                >
                  {a.severity}
                </span>
                <span className="text-xs text-zinc-500">{TYPE_LABEL[a.type] ?? a.type}</span>
                <span className="text-sm font-medium">{a.title}</span>
              </div>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">{a.detail}</p>
              <ul className="mt-2 list-disc pl-5 text-xs text-zinc-500">
                {a.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-xs text-zinc-500">
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Suggested action:</span>{" "}
                  {a.suggestedAction}
                </span>
                {a.href ? (
                  <Link className="text-xs text-blue-600 hover:underline dark:text-blue-400" href={a.href}>
                    Open
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
