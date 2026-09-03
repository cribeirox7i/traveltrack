import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireTripEditor, tripLockError } from "@/lib/api-helpers";
import { deleteTripDay } from "@/lib/sheets/trips";

/** Remove um dia da grade - ver `deleteTripDay` pra regra completa de reindexação de datas,
 * cascade de compromissos da Agenda cravados na data do dia removido, etc. Admin ou quem criou a
 * viagem - mesma regra do insert, é estrutura de Itinerário. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> }
) {
  const { id, dayId } = await params;
  const auth = await requireTripEditor(id);
  if ("error" in auth) return auth.error;
  const bloqueio = tripLockError(auth.trip);
  if (bloqueio) return bloqueio;

  try {
    await deleteTripDay(id, dayId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao excluir dia", 500);
  }
}
