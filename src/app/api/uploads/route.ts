import { prisma } from "@/lib/prisma";
import { importOffersWorkbook } from "@/lib/ingest";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export async function GET() {
  const uploads = await prisma.uploadFile.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { supplier: { select: { name: true } } },
  });
  return Response.json({ uploads });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { error: "No file provided. Attach an .xlsx file in the 'file' field." },
      { status: 400 },
    );
  }

  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    return Response.json(
      { error: "Only .xlsx or .xlsm files are accepted. Use the published template." },
      { status: 415 },
    );
  }

  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `File is too large (max ${MAX_BYTES / 1024 / 1024} MB).` },
      { status: 413 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const actor = (form.get("uploadedBy") as string | null) || "web-upload";

  try {
    const summary = await importOffersWorkbook(arrayBuffer, {
      filename: file.name,
      uploadedBy: actor,
    });
    return Response.json(summary, {
      status: summary.status === "FAILED" ? 422 : 200,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown import error.";
    await prisma.uploadFile.create({
      data: {
        filename: file.name,
        sha256: "",
        status: "FAILED",
        message,
        uploadedBy: actor,
      },
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
