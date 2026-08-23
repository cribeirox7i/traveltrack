import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { listReceitasByTrip, updateReceitaStatus } from "@/lib/sheets/financas";
import { userCanAccessTrip } from "@/lib/sheets/trips";

const patchSchema = z.object({
  status: z.enum(["recebido", "a_receber"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; receitaId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, receitaId } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  // Mesmo motivo da rota de despesas: garante que a linha pertence a esta viagem.
  const receitas = await listReceitasByTrip(id);
  if (!receitas.some((r) => r.id === receitaId)) {
    return errorResponse("Receita não encontrada", 404);
  }

  await updateReceitaStatus(receitaId, parsed.data.status);
  return NextResponse.json({ ok: true });
}
