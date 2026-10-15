import { prisma } from "@/lib/prisma";
import { buildOffersWorkbook } from "@/lib/excel";
import { cleanRow } from "@/lib/clean";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auto-generated cleaned pricelist: re-export every imported row in the system
// template's exact columns and vocabulary. Generated on demand from the stored
// raw rows, so it always reflects the latest cleaning rules.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const upload = await prisma.uploadFile.findUnique({
    where: { id },
    include: {
      rows: { orderBy: { rowNumber: "asc" } },
    },
  });
  if (!upload) {
    return Response.json({ error: "Upload not found." }, { status: 404 });
  }

  const rows = upload.rows.map(
    (row) => cleanRow((row.rawJson ?? {}) as Record<string, unknown>).values,
  );

  const buffer = await buildOffersWorkbook(rows);

  const base = upload.filename.replace(/\.(xlsx|xls|csv)$/i, "");
  const filename = `${base}-cleaned.xlsx`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
