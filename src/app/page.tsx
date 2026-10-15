import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { usd } from "@/lib/format";

export const dynamic = "force-dynamic";

function Stat({
  href,
  label,
  value,
  hint,
}: {
  href: string;
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
    >
      <div className="text-sm text-zinc-600 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{hint}</div>
    </Link>
  );
}

export default async function Home() {
  const [
    activeOffers,
    openExceptions,
    matchedOffers,
    openDeals,
    approvedDemand,
    customers,
    fxRates,
    contributionAgg,
  ] = await Promise.all([
    prisma.offer.count({ where: { status: "ACTIVE" } }),
    prisma.validationIssue.count({ where: { resolved: false } }),
    prisma.offer.count({ where: { productId: { not: null } } }),
    prisma.deal.count({ where: { status: { in: ["DRAFT", "REVIEWED", "APPROVED"] } } }),
    prisma.demand.count({ where: { approved: true } }),
    prisma.customer.count(),
    prisma.fxRate.count(),
    prisma.deal.aggregate({
      where: { status: { in: ["REVIEWED", "APPROVED", "WON"] } },
      _sum: { dealContribution: true, cashRequirement: true },
    }),
  ]);

  const unmatched = activeOffers - matchedOffers;
  const contribution = Number(contributionAgg._sum.dealContribution ?? 0);
  const cash = Number(contributionAgg._sum.cashRequirement ?? 0);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Trading dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Import supplier offers, match to the product master, then size each buy in USD with
          landed cost, contribution and cash return.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          href="/offers"
          label="Active offers"
          value={activeOffers}
          hint={`${matchedOffers} matched · ${Math.max(unmatched, 0)} unmatched`}
        />
        <Stat
          href="/deals"
          label="Open deals"
          value={openDeals}
          hint={`${usd(contribution)} contribution · ${usd(cash)} cash`}
        />
        <Stat
          href="/demands"
          label="Approved demand"
          value={approvedDemand}
          hint={`${customers} customer(s) on file`}
        />
        <Stat
          href="/exceptions"
          label="Open exceptions"
          value={openExceptions}
          hint="Rows needing review before trading"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tool
          href="/offers"
          title="Find the best deal"
          body="Rank supplier offers by executable USD landed cost and match them to approved customer demand."
        />
        <Tool
          href="/deals/new"
          title="Size a deal"
          body="Convert case prices to bottle prices, run conservative/base/upside and stress scenarios, and see cash return."
        />
        <Tool
          href="/demands"
          title="Capture demand"
          body="Record what each customer wants, at what price and quantity, and approve it before it drives buying."
        />
        <Tool
          href="/uploads"
          title="Import supplier offers"
          body="Upload an Excel file built from the published template. Problems go to the exception queue."
        />
        <Tool
          href="/customers"
          title="Customers"
          body="US destinations, channels, agreed currency, payment terms and credit limits."
        />
        <Tool
          href="/fx"
          title="Exchange rates"
          body={`${fxRates} dated rate(s). Every comparison uses USD per one unit of the source currency.`}
        />
        <Tool
          href="/quotes"
          title="Quotes"
          body="Customer-facing quotes with validity and terms. Exports never reveal suppliers or buying costs."
        />
        <Tool
          href="/suppliers"
          title="Suppliers"
          body="Rank suppliers by executable landed cost, freshness, evidence and other measured dimensions."
        />
        <Tool
          href="/exposure"
          title="Exposure & caps"
          body="Cap speculative buying and exposure per SKU, brand, supplier and customer."
        />
        <Tool
          href="/opportunities"
          title="Opportunity ranking"
          body="Rank matched deals by contribution, credible sell-through, cash cycle, customer credit and concentration risk."
        />
        <Tool
          href="/pricing"
          title="Customer pricing"
          body="Customer-specific minimum sell price, from each account's required margin and payment-term cash cycle."
        />
        <Tool
          href="/inventory"
          title="Own inventory"
          body="Own stock by SKU, warehouse and lot. Available to sell = usable on hand minus active reservations."
        />
        <Tool
          href="/trends"
          title="Price & supply trends"
          body="Per exact SKU over 7/30/90/180 days: supplier ask min–median–max, independent owner count, customer targets and our own trades as separate series."
        />
        <Tool
          href="/alerts"
          title="Alerts"
          body="Buy opportunities, price moves, demand-vs-supply gaps, stale confirmations, margin drops, aged stock and expiring demand, each with evidence and a suggested action."
        />
        <Tool
          href="/kpis"
          title="KPIs"
          body="Quote conversion, lost-sale reasons, repeat purchases, cash deployment, exposure and stock turn — each tied to a named owner."
        />
        <Tool
          href="/notes"
          title="Meeting notes"
          body="Capture Plaud and reMarkable notes, extract claims with their exact source, review them, and merge recurring mentions into one live demand."
        />
        <Tool
          href="/tasks"
          title="Follow-up tasks"
          body="Turn approved note claims into dated follow-ups so nothing agreed in a meeting is lost."
        />
      </section>
    </div>
  );
}

function Tool({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-zinc-200 bg-white p-5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
    >
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
    </Link>
  );
}
