import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOffersWorkbook, type ParsedWorkbook } from "@/lib/excel";
import { cleanRow } from "@/lib/clean";
import {
  comparePriceLists,
  toPriceListRow,
  type FxMap,
  type PriceListRow,
} from "@/lib/compare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function latestFx(): Promise<FxMap> {
  const rates = await prisma.fxRate.findMany({
    where: { quoteCurrency: "USD" },
    orderBy: { rateDate: "desc" },
    select: { baseCurrency: true, rate: true },
  });
  const map: FxMap = { USD: 1 };
  for (const rate of rates) {
    if (map[rate.baseCurrency] === undefined) {
      map[rate.baseCurrency] = Number(rate.rate);
    }
  }
  return map;
}

function rowsOf(parsed: ParsedWorkbook): PriceListRow[] {
  return parsed.rows.map((row) =>
    toPriceListRow(cleanRow(row.values).values, row.rowNumber),
  );
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }

  const left = form.get("left");
  const right = form.get("right");
  if (!(left instanceof File) || !(right instanceof File)) {
    return NextResponse.json(
      { error: "Provide two files: 'left' and 'right'." },
      { status: 400 },
    );
  }

  const [leftBuf, rightBuf] = await Promise.all([
    left.arrayBuffer(),
    right.arrayBuffer(),
  ]);

  let leftParsed: ParsedWorkbook;
  let rightParsed: ParsedWorkbook;
  try {
    leftParsed = await parseOffersWorkbook(Buffer.from(leftBuf));
    rightParsed = await parseOffersWorkbook(Buffer.from(rightBuf));
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not read the file(s): ${
          err instanceof Error ? err.message : "unknown error"
        }. Use .xlsx files exported from the template.`,
      },
      { status: 400 },
    );
  }

  const fx = await latestFx();
  const result = comparePriceLists(
    rowsOf(leftParsed),
    rowsOf(rightParsed),
    fx,
  );

  return NextResponse.json({
    ...result,
    leftName: left.name,
    rightName: right.name,
    leftHeaders: leftParsed.headers,
    rightHeaders: rightParsed.headers,
    unknownHeaders: [
      ...leftParsed.unknownHeaders.map((h) => `${left.name}: ${h}`),
      ...rightParsed.unknownHeaders.map((h) => `${right.name}: ${h}`),
    ],
  });
}
