import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession, sessionCanAccessTrip } from "@/lib/api-helpers";
import { deleteAnexo } from "@/lib/sheets/anexos";
import { deleteItemAnexo, getItemAnexo } from "@/lib/sheets/itemAnexos";
import { getTrip } from "@/lib/sheets/trips";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; anexoId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, itemId, anexoId } = await params;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  // Confere que o anexo é mesmo deste item/viagem antes de apagar - mesmo cuidado de IDOR do
  // resto do app (ver driveDeleteFile/driveDownloadFile em anexos.ts).
  const anexo = await getItemAnexo(anexoId);
  if (!anexo || anexo.item_id !== itemId || anexo.trip_id !== id) {
    return errorResponse("Anexo não encontrado", 404);
  }

  const trip = await getTrip(id);

  await deleteItemAnexo(anexoId);
  let avisoAnexo: string | undefined;
  if (trip) {
    await deleteAnexo(anexo.file_id, trip.id, trip.nome).catch((err) => {
      avisoAnexo = err instanceof Error ? err.message : "Não foi possível remover o arquivo do Drive";
    });
  }

  return NextResponse.json({ ok: true, ...(avisoAnexo ? { avisoAnexo } : {}) });
}
