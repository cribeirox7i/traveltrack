import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession, sessionCanAccessTrip, tripLockError } from "@/lib/api-helpers";
import { deleteChecklistItem, getChecklistItem, updateChecklistItem } from "@/lib/sheets/checklist";
import { getTrip } from "@/lib/sheets/trips";

const patchSchema = z.object({
  descritivo: z.string().trim().min(1, "Descritivo é obrigatório").max(500).optional(),
  data_alvo: z.string().date().optional().or(z.literal("")).optional(),
  status: z.enum(["true", "false"]).optional(),
});

async function resolver(tripId: string, checkId: string, session: import("@/lib/api-helpers").ApiSession) {
  if (!(await sessionCanAccessTrip(session, tripId))) {
    return { error: errorResponse("Sem acesso a esta viagem", 403) };
  }

  const item = await getChecklistItem(checkId);
  if (!item || item.trip_id !== tripId) {
    return { error: errorResponse("Item não encontrado", 404) };
  }

  // Só o dono do item pode alterar.
  if (item.user_id !== session.user.id) {
    return { error: errorResponse("Sem permissão para alterar este item", 403) };
  }

  const trip = await getTrip(tripId);
  if (!trip) return { error: errorResponse("Viagem não encontrada", 404) };
  const bloqueio = tripLockError(trip);
  if (bloqueio) return { error: bloqueio };

  return { item };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; checkId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, checkId } = await params;
  const r = await resolver(id, checkId, auth.session);
  if ("error" in r) return r.error;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const patch: Record<string, string> = {};
  if (parsed.data.descritivo !== undefined) patch.descritivo = parsed.data.descritivo;
  if (parsed.data.data_alvo !== undefined) patch.data_alvo = parsed.data.data_alvo ?? "";
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;

  if (!Object.keys(patch).length) return errorResponse("Nenhum campo para atualizar");

  try {
    await updateChecklistItem(checkId, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH checklist falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao salvar o item: ${err.message}` : "Falha ao salvar o item",
      502
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; checkId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, checkId } = await params;
  const r = await resolver(id, checkId, auth.session);
  if ("error" in r) return r.error;

  try {
    await deleteChecklistItem(checkId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE checklist falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao excluir o item: ${err.message}` : "Falha ao excluir o item",
      502
    );
  }
}
