import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession, sessionCanAccessTrip, tripLockError } from "@/lib/api-helpers";
import { listDespesasByTrip, updateDespesaStatus } from "@/lib/sheets/financas";
import { getTrip } from "@/lib/sheets/trips";

// Os dois vocabulários possíveis (débito e crédito compartilham a mesma coluna `status` na
// aba Despesas - ver StatusLancamento em lib/sheets/types.ts). Não valida aqui qual vocabulário
// combina com a natureza da linha; um lançamento de crédito com status "pago" em vez de
// "recebido" seria inofensivo (só a label na tela ficaria estranha), não vale a complexidade de
// buscar a linha só pra checar a natureza antes de aceitar o patch.
const patchSchema = z.object({
  status: z.enum(["pago", "a_pagar", "recebido", "a_receber"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; despesaId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, despesaId } = await params;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const trip = await getTrip(id);
  if (trip) {
    const bloqueio = tripLockError(trip);
    if (bloqueio) return bloqueio;
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  // Confere que a despesa é mesmo desta viagem antes de escrever: o id da linha sozinho não
  // prova nada, e sem isso o acesso a uma viagem qualquer permitiria alterar a despesa de outra.
  const despesas = await listDespesasByTrip(id);
  if (!despesas.some((d) => d.id === despesaId)) {
    return errorResponse("Despesa não encontrada", 404);
  }

  await updateDespesaStatus(despesaId, parsed.data.status);
  return NextResponse.json({ ok: true });
}
