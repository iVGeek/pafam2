"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Supplier = { id: string; name: string; country: string | null };

type Offer = {
  id: string;
  supplierId: string;
  originalCode: string;
  brand: string | null;
  fragranceName: string | null;
  concentration: string | null;
  sizeMl: number | null;
  packagingLevel: string;
  currency: string;
  price: number | null;
  priceBasis: string | null;
  unitsPerCase: number | null;
  availableQuantity: number | null;
};

type LineDraft = {
  key: string;
  offerId: string;
  originalCode: string;
  brand: string;
  fragranceName: string;
  concentration: string;
  sizeMl: string;
  packagingLevel: string;
  unitsPerCase: string;
  cases: string;
  unitCost: string;
};

const PACKAGING = ["UNIT", "CASE", "TESTER", "GIFT_SET", "REFILL", "DAMAGED", "UNKNOWN"];

function emptyLine(): LineDraft {
  return {
    key: Math.random().toString(36).slice(2),
    offerId: "",
    originalCode: "",
    brand: "",
    fragranceName: "",
    concentration: "",
    sizeMl: "",
    packagingLevel: "UNIT",
    unitsPerCase: "12",
    cases: "1",
    unitCost: "",
  };
}

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function OrderBuilder({ suppliers, offers }: { suppliers: Supplier[]; offers: Offer[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [currency, setCurrency] = useState("USD");
  const [incoterm, setIncoterm] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supplierOffers = useMemo(
    () => offers.filter((o) => o.supplierId === supplierId),
    [offers, supplierId],
  );

  function update(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickOffer(key: string, offerId: string) {
    if (!offerId) {
      update(key, { offerId: "" });
      return;
    }
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return;
    const upc = offer.unitsPerCase && offer.unitsPerCase > 0 ? offer.unitsPerCase : 1;
    const unitCost =
      offer.price === null
        ? ""
        : String(
            offer.priceBasis === "CASE"
              ? Math.round((offer.price / upc) * 10000) / 10000
              : offer.price,
          );
    update(key, {
      offerId,
      originalCode: offer.originalCode ?? "",
      brand: offer.brand ?? "",
      fragranceName: offer.fragranceName ?? "",
      concentration: offer.concentration ?? "",
      sizeMl: offer.sizeMl === null ? "" : String(offer.sizeMl),
      packagingLevel: offer.packagingLevel,
      unitsPerCase: String(upc),
      unitCost,
    });
    setCurrency(offer.currency || "USD");
  }

  const computed = lines.map((l) => {
    const upc = Math.max(1, Math.trunc(num(l.unitsPerCase)));
    const cases = Math.max(0, Math.trunc(num(l.cases)));
    const units = upc * cases;
    const cost = l.unitCost === "" ? null : num(l.unitCost);
    return { units, cost, total: cost === null ? null : cost * units };
  });
  const grandTotal = computed.reduce((s, c) => s + (c.total ?? 0), 0);
  const totalUnits = computed.reduce((s, c) => s + c.units, 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!supplierId) {
      setError("Choose a supplier.");
      return;
    }
    const payloadLines = lines
      .map((l) => ({
        originalCode: l.originalCode.trim() || null,
        brand: l.brand.trim() || null,
        fragranceName: l.fragranceName.trim() || null,
        concentration: l.concentration.trim() || null,
        sizeMl: l.sizeMl === "" ? null : Math.trunc(num(l.sizeMl)),
        packagingLevel: l.packagingLevel,
        unitsPerCase: Math.max(1, Math.trunc(num(l.unitsPerCase))),
        cases: Math.max(0, Math.trunc(num(l.cases))),
        unitCost: l.unitCost === "" ? null : num(l.unitCost),
      }))
      .filter((l) => l.cases > 0 && (l.originalCode || l.fragranceName));

    if (payloadLines.length === 0) {
      setError("Add at least one line with a product and a case quantity.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, currency, incoterm, notes, lines: payloadLines }),
      });
      const json = (await res.json()) as { order?: { id: string }; error?: string };
      if (!res.ok || !json.order) {
        setError(json.error ?? `Failed to create order (${res.status}).`);
        return;
      }
      router.push(`/orders/${json.order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950";
  const cell = "px-1 py-1 align-top";

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 bg-white p-5 sm:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">Supplier</span>
          <select
            className={input}
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              setLines((prev) => prev.map((l) => ({ ...l, offerId: "" })));
            }}
          >
            <option value="">Select a supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.country ? ` (${s.country})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Currency</span>
          <input className={input} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Incoterm</span>
          <input className={input} value={incoterm} onChange={(e) => setIncoterm(e.target.value)} placeholder="FOB" />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-4">
          <span className="font-medium">Notes</span>
          <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className={cell}>Supplier offer</th>
              <th className={cell}>Code</th>
              <th className={cell}>Brand</th>
              <th className={cell}>Name</th>
              <th className={cell}>Conc.</th>
              <th className={cell}>Size</th>
              <th className={cell}>Pack.</th>
              <th className={cell}>Units/case</th>
              <th className={cell}>Cases</th>
              <th className={cell}>Units</th>
              <th className={cell}>Unit cost</th>
              <th className={cell}>Line total</th>
              <th className={cell}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className={cell}>
                  <select
                    className={input}
                    value={l.offerId}
                    disabled={!supplierId}
                    onChange={(e) => pickOffer(l.key, e.target.value)}
                  >
                    <option value="">Manual</option>
                    {supplierOffers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {`${o.brand ?? ""} ${o.fragranceName ?? ""}`.trim() || o.originalCode}
                        {o.sizeMl ? ` ${o.sizeMl}ml` : ""}
                        {o.price !== null ? ` · ${o.price}` : ""}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={cell}>
                  <input className={input} value={l.originalCode} onChange={(e) => update(l.key, { originalCode: e.target.value })} />
                </td>
                <td className={cell}>
                  <input className={input} value={l.brand} onChange={(e) => update(l.key, { brand: e.target.value })} />
                </td>
                <td className={cell}>
                  <input className={input} value={l.fragranceName} onChange={(e) => update(l.key, { fragranceName: e.target.value })} />
                </td>
                <td className={cell}>
                  <input className={input} value={l.concentration} onChange={(e) => update(l.key, { concentration: e.target.value })} />
                </td>
                <td className={cell}>
                  <input className={`${input} w-16`} value={l.sizeMl} onChange={(e) => update(l.key, { sizeMl: e.target.value })} />
                </td>
                <td className={cell}>
                  <select className={input} value={l.packagingLevel} onChange={(e) => update(l.key, { packagingLevel: e.target.value })}>
                    {PACKAGING.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={cell}>
                  <input type="number" min={1} className={`${input} w-20`} value={l.unitsPerCase} onChange={(e) => update(l.key, { unitsPerCase: e.target.value })} />
                </td>
                <td className={cell}>
                  <input type="number" min={0} className={`${input} w-20`} value={l.cases} onChange={(e) => update(l.key, { cases: e.target.value })} />
                </td>
                <td className={`${cell} whitespace-nowrap tabular-nums`}>{computed[i].units}</td>
                <td className={cell}>
                  <input type="number" min={0} step="0.0001" className={`${input} w-24`} value={l.unitCost} onChange={(e) => update(l.key, { unitCost: e.target.value })} />
                </td>
                <td className={`${cell} whitespace-nowrap tabular-nums`}>
                  {computed[i].total === null ? "—" : money(computed[i].total as number, currency)}
                </td>
                <td className={cell}>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => (prev.length === 1 ? [emptyLine()] : prev.filter((x) => x.key !== l.key)))}
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-zinc-50 font-medium dark:bg-zinc-900">
            <tr>
              <td className="px-1 py-2" colSpan={9}>
                Totals
              </td>
              <td className="px-1 py-2 tabular-nums">{totalUnits}</td>
              <td className="px-1 py-2"></td>
              <td className="px-1 py-2 tabular-nums">{money(grandTotal, currency)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Add line
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Creating…" : "Create order"}
        </button>
      </div>
    </form>
  );
}
