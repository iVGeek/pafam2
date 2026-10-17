"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CASH_FLOW_TYPES = [
  "BUY_PAYMENT",
  "SELL_RECEIPT",
  "FINANCING_IN",
  "FINANCING_OUT",
  "RECOVERABLE_REFUND",
  "DEPOSIT_SUPPLIER",
  "DEPOSIT_CUSTOMER",
  "ADJUSTMENT",
  "OTHER",
];

const inputCls =
  "rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950";
const btnCls =
  "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

export function CashFlowForm({ deals }: { deals: { id: string; label: string }[] }) {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState("SELL_RECEIPT");
  const [amountUsd, setAmountUsd] = useState("");
  const [dealId, setDealId] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/cashflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, type, amountUsd, dealId: dealId || null, reference, note }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to record cash flow.");
        return;
      }
      setAmountUsd("");
      setReference("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record cash flow.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-medium">Record a cash flow</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {CASH_FLOW_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Amount (USD, magnitude)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Deal (optional)</span>
          <select value={dealId} onChange={(e) => setDealId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Reference</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !amountUsd} className={btnCls}>
          {busy ? "Saving…" : "Record cash flow"}
        </button>
        <span className="text-xs text-zinc-500">
          Sign is set by type (payments out are negative, receipts positive).
        </span>
        {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
      </div>
    </form>
  );
}

export function DeleteCashFlowButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch(`/api/cashflow/${id}`, { method: "DELETE" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
    >
      Delete
    </button>
  );
}

export function InvoiceForm({ orders }: { orders: { id: string; label: string }[] }) {
  const router = useRouter();
  const [type, setType] = useState("SUPPLIER");
  const [orderId, setOrderId] = useState("");
  const [reference, setReference] = useState("");
  const [total, setTotal] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          orderId: orderId || null,
          reference,
          total,
          dueDate: dueDate || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to create invoice.");
        return;
      }
      setReference("");
      setTotal("");
      setDueDate("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-medium">New invoice / bill</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            <option value="SUPPLIER">Supplier (we owe)</option>
            <option value="CUSTOMER">Customer (they owe)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Order (optional)</span>
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Reference</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Total (USD)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Due date</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !total} className={btnCls}>
          {busy ? "Saving…" : "Create invoice"}
        </button>
        {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
      </div>
    </form>
  );
}

export function InvoicePaymentControl({ id, balance }: { id: string; balance: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to record payment.");
        return;
      }
      setAmount("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={pay} className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        step="0.01"
        max={balance}
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-24 rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
      />
      <button type="submit" disabled={busy || !amount} className="rounded border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
        Pay
      </button>
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </form>
  );
}

export function FinancingForm({ orders }: { orders: { id: string; label: string }[] }) {
  const router = useRouter();
  const [fromDate, setFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [principalUsd, setPrincipalUsd] = useState("");
  const [rateAnnual, setRateAnnual] = useState("");
  const [repaidDate, setRepaidDate] = useState("");
  const [orderId, setOrderId] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/financing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromDate,
          principalUsd,
          rateAnnual: rateAnnual || null,
          repaidDate: repaidDate || null,
          toDate: repaidDate || null,
          orderId: orderId || null,
          description,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to record financing.");
        return;
      }
      setPrincipalUsd("");
      setRateAnnual("");
      setDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record financing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-medium">Financing facility</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">From date</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Principal (USD)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={principalUsd}
            onChange={(e) => setPrincipalUsd(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Annual rate (e.g. 0.12)</span>
          <input
            type="number"
            min={0}
            step="0.0001"
            value={rateAnnual}
            onChange={(e) => setRateAnnual(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Repaid date (optional)</span>
          <input type="date" value={repaidDate} onChange={(e) => setRepaidDate(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-zinc-500">Order (optional)</span>
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-zinc-500">Description</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !principalUsd} className={btnCls}>
          {busy ? "Saving…" : "Record financing"}
        </button>
        {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
      </div>
    </form>
  );
}
