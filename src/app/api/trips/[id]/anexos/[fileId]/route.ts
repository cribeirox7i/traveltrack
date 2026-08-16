import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { deleteAnexo, downloadAnexo } from "@/lib/sheets/anexos";
import { userCanAccessTrip } from "@/lib/sheets/trips";

/** Baixa o arquivo em si (bytes), usado para guardar o anexo offline no aparelho. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, fileId } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const { name, mimeType, base64Data } = await downloadAnexo(fileId);
  const buffer = Buffer.from(base64Data, "base64");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, fileId } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  await deleteAnexo(fileId);
  return NextResponse.json({ ok: true });
}
