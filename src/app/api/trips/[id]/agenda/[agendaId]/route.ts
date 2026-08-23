import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { deleteAgenda, getAgenda } from "@/lib/sheets/agenda";
import { deleteAnexo } from "@/lib/sheets/anexos";
import { userCanAccessTrip } from "@/lib/sheets/trips";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; agendaId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, agendaId } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const agenda = await getAgenda(agendaId);
  if (!agenda || agenda.trip_id !== id) {
    return errorResponse("Compromisso não encontrado", 404);
  }

  await deleteAgenda(agendaId);

  // O anexo vai junto, mas sem poder derrubar a exclusão do compromisso — mesma lição da
  // exclusão de viagem: uma limpeza acessória no Drive não decide se a operação principal
  // deu certo (ver deleteTrip em lib/sheets/trips.ts).
  if (!agenda.anexo_file_id) return NextResponse.json({ ok: true, anexoRemovido: true });

  try {
    await deleteAnexo(agenda.anexo_file_id);
    return NextResponse.json({ ok: true, anexoRemovido: true });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      anexoRemovido: false,
      avisoAnexo: err instanceof Error ? err.message : String(err),
    });
  }
}
