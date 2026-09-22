import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin, requireSession } from "@/lib/api-helpers";
import {
  createSubclassificacao,
  getClassificacao,
  listSubclassificacoes,
} from "@/lib/sheets/classificacoes";

const createSchema = z.object({
  classificacao_id: z.string().min(1, "Escolha a classificação"),
  nome: z.string().min(1),
});

/** `?classificacao_id=` filtra pra uma classificação só (uso normal - alimentar o select de
 * Subclassificação do form de Itens, que já sabe qual Classificação foi escolhida). Sem o filtro,
 * devolve todas (uso da tela de administração). */
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const classificacaoId = req.nextUrl.searchParams.get("classificacao_id") ?? undefined;
  return NextResponse.json(await listSubclassificacoes(classificacaoId));
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const classificacao = await getClassificacao(parsed.data.classificacao_id);
  if (!classificacao) return errorResponse("Classificação não encontrada", 404);

  try {
    const sub = await createSubclassificacao(parsed.data.classificacao_id, parsed.data.nome);
    return NextResponse.json(sub, { status: 201 });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao criar subclassificação");
  }
}
