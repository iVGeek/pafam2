import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { money, usd } from "@/lib/format";
import { NewCustomerForm } from "./new-customer-form";
import SearchBar from "@/components/SearchBar";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    take: 200,
    include: { _count: { select: { demands: true, deals: true, quotes: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          One customer record linked to company, US destination, channels, agreed currency,
          payment terms and credit limit.
        </p>
      </div>
      <SearchBar placeholder="Search…" />

      <NewCustomerForm />

      <section className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Destination</th>
              <th className="px-4 py-2">Channels</th>
              <th className="px-4 py-2">Owner</th>
              <th className="px-4 py-2">Terms</th>
              <th className="px-4 py-2 text-right">Credit limit</th>
              <th className="px-4 py-2 text-right">Demand</th>
              <th className="px-4 py-2 text-right">Deals</th>
              <th className="px-4 py-2 text-right">Quotes</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                  No customers yet.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-2">
                    {c.name}
                    {c.company ? (
                      <span className="ml-1 text-xs text-zinc-500">{c.company}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {[c.destinationCity, c.destinationCountry].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{c.channels ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{c.accountOwner ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{c.paymentTerms ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {c.creditLimit === null ? "—" : money(Number(c.creditLimit))}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    <Link href={`/demands?customer=${c.id}`} className="hover:underline">
                      {c._count.demands}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{c._count.deals}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{c._count.quotes}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-zinc-500">
        Credit limits shown in USD. Total credit limit:{" "}
        {usd(
          customers.reduce((sum, c) => sum + (c.creditLimit === null ? 0 : Number(c.creditLimit)), 0),
        )}
        .
      </p>
    </div>
  );
}
