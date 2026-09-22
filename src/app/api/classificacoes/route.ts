import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin, requireSession } from "@/lib/api-helpers";
import { createClassificacao, listClassificacoes } from "@/lib/sheets/classificacoes";

const createSchema = z.object({ nome: z.string().min(1), icone: z.string().trim().max(8).optional() });

/** Lista global (não é por ambiente - é taxonomia do app inteiro) - qualquer usuário logado lê,
 * pro select de Classificação no cadastro de Itens. Só o admin cria/edita (POST/PATCH). */
export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  return NextResponse.json(await listClassificacoes());
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    const classificacao = await createClassificacao(parsed.data.nome, parsed.data.icone);
    return NextResponse.json(classificacao, { status: 201 });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao criar classificação");
  }
}
