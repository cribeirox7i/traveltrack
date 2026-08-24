import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { deleteTripDay, userCanAccessTrip } from "@/lib/sheets/trips";

/** Remove um dia da grade - ver `deleteTripDay` pra regra completa de reindexação de datas,
 * cascade de compromissos da Agenda cravados na data do dia removido, etc. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, dayId } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  try {
    await deleteTripDay(id, dayId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao excluir dia", 500);
  }
}
