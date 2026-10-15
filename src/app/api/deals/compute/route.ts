import { computeDeal, getTradingSettings, type RawDealInput } from "@/lib/deals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stateless profitability + scenario computation for the live calculator.
export async function POST(request: Request) {
  let body: RawDealInput;
  try {
    body = (await request.json()) as RawDealInput;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const settings = await getTradingSettings();
  const withRules: RawDealInput = {
    ...body,
    requiredContributionMarginPct:
      body.requiredContributionMarginPct ?? settings.minContributionMarginPct,
  };

  const { result, scenarios } = computeDeal(withRules);
  return Response.json({ result, scenarios, settings });
}
