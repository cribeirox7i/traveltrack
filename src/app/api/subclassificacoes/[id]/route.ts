import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/api-helpers";
import { getSubclassificacao, updateSubclassificacao } from "@/lib/sheets/classificacoes";

const patchSchema = z.object({
  nome: z.string().min(1).optional(),
  ativo: z.boolean().optional(),
  icone: z.string().trim().max(8).optional(),
});

/** Só PATCH, mesma razão de Classificações/Ambientes - sem DELETE, só `ativo`. Trocar de
 * classificação (a FK) não é uma operação suportada aqui: a subclassificação nasceu dentro de uma
 * classificação e continua lá - se fizer sentido em outra, é uma nova linha. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const existente = await getSubclassificacao(id);
  if (!existente) return errorResponse("Subclassificação não encontrada", 404);

  try {
    await updateSubclassificacao(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao atualizar subclassificação");
  }
}
