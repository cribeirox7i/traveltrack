import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession, sessionCanAccessTrip } from "@/lib/api-helpers";
import { listItemAnexosByTrip } from "@/lib/sheets/itemAnexos";

/** Anexos EXTRAS de todos os Itens da viagem, numa lista só (não por item) - usado pelo cache
 * offline (`pullTripDetail`, mesmo padrão de `/itens`/`/despesas`) e pelo formulário de edição,
 * que filtra por `item_id` no cliente em vez de uma chamada por item. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  return NextResponse.json(await listItemAnexosByTrip(id));
}
