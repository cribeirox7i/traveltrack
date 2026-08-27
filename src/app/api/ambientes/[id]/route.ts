import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/api-helpers";
import { getAmbiente, updateAmbiente } from "@/lib/sheets/ambientes";

const patchSchema = z.object({
  nome: z.string().min(1).optional(),
  ativo: z.boolean().optional(),
});

/**
 * Só PATCH: não existe DELETE de ambiente de propósito. Apagar deixaria usuários e viagens
 * apontando pra um tenant inexistente (some da lista de todo mundo, sem forma de recuperar pela
 * UI). Desativar (`ativo: false`) resolve o caso de uso sem esse risco.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const existente = await getAmbiente(id);
  if (!existente) return errorResponse("Ambiente não encontrado", 404);

  try {
    await updateAmbiente(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao atualizar ambiente");
  }
}
