import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession, sessionCanAccessTrip, tripLockError } from "@/lib/api-helpers";
import { deleteAnexo } from "@/lib/sheets/anexos";
import { deleteAnexoSolto, getAnexoSolto, updateAnexoSolto } from "@/lib/sheets/anexosSoltos";
import { getTrip } from "@/lib/sheets/trips";

const patchSchema = z.object({
  data: z.string().date().optional(),
  descricao: z.string().trim().max(200).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; anexoId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, anexoId } = await params;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const existente = await getAnexoSolto(anexoId);
  if (!existente || existente.trip_id !== id) return errorResponse("Anexo não encontrado", 404);

  const trip = await getTrip(id);
  if (!trip) return errorResponse("Viagem não encontrada", 404);
  const bloqueio = tripLockError(trip);
  if (bloqueio) return bloqueio;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    await updateAnexoSolto(anexoId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH anexo solto falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao atualizar o anexo: ${err.message}` : "Falha ao atualizar o anexo",
      502
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; anexoId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, anexoId } = await params;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const existente = await getAnexoSolto(anexoId);
  if (!existente || existente.trip_id !== id) return errorResponse("Anexo não encontrado", 404);

  const trip = await getTrip(id);
  if (trip) {
    const bloqueio = tripLockError(trip);
    if (bloqueio) return bloqueio;
  }

  await deleteAnexoSolto(anexoId);

  let avisoAnexo: string | undefined;
  if (trip) {
    await deleteAnexo(existente.file_id, trip.id, trip.nome).catch((err) => {
      avisoAnexo = err instanceof Error ? err.message : "Não foi possível remover o arquivo do Drive";
    });
  }

  return NextResponse.json({ ok: true, ...(avisoAnexo ? { avisoAnexo } : {}) });
}
