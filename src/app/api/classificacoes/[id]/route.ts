import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/api-helpers";
import { getClassificacao, updateClassificacao } from "@/lib/sheets/classificacoes";

const patchSchema = z.object({
  nome: z.string().min(1).optional(),
  ativo: z.boolean().optional(),
});

/** Só PATCH: sem DELETE de propósito, mesmo motivo de Ambientes - um Item já classificado com
 * este id ficaria órfão. `ativo: false` tira das opções de cadastro sem apagar nada. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const existente = await getClassificacao(id);
  if (!existente) return errorResponse("Classificação não encontrada", 404);

  try {
    await updateClassificacao(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao atualizar classificação");
  }
}
