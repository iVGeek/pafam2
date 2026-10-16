import { prisma } from "@/lib/prisma";
import { getTradingSettings } from "@/lib/deals";
import { CalculatorClient } from "./calculator-client";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const [settings, fxRates] = await Promise.all([
    getTradingSettings(),
    prisma.fxRate.findMany({
      where: { quoteCurrency: "USD" },
      orderBy: { rateDate: "desc" },
      select: { baseCurrency: true, rate: true },
    }),
  ]);

  const fxLatest: Record<string, number> = { USD: 1 };
  for (const rate of fxRates) {
    if (fxLatest[rate.baseCurrency] === undefined) {
      fxLatest[rate.baseCurrency] = Number(rate.rate);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CP &amp; SP calculator</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Enter the cost price (CP) to get the selling price (SP) you need for a
          target margin, or enter an SP to see the margin it produces. FX and
          landed costs (freight, duty, other) are applied so figures are always
          in USD.
        </p>
      </div>
      <CalculatorClient
        defaultFx={fxLatest}
        defaultMargin={settings.minContributionMarginPct}
      />
    </div>
  );
}
