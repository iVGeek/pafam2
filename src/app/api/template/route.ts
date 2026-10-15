import { buildTemplateWorkbook } from "@/lib/excel";

export const runtime = "nodejs";

export async function GET() {
  const buffer = await buildTemplateWorkbook();
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="pafam2-offer-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
