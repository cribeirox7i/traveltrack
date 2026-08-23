import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { listDespesasByTrip, updateDespesaStatus } from "@/lib/sheets/financas";
import { userCanAccessTrip } from "@/lib/sheets/trips";

const patchSchema = z.object({
  status: z.enum(["pago", "a_pagar"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; despesaId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, despesaId } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
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
