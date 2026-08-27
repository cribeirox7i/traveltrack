import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { listParametros } from "@/lib/sheets/parametros";

/** Subconjunto de Parametros seguro pra qualquer usuário logado ler (não só admin) - a rota
 * `/api/parametros` normal é admin-only porque lista tudo. Adicionar uma chave nova aqui exige
 * decisão consciente (é o que fica exposto a todo mundo), então a lista é explícita. */
const CHAVES_PUBLICAS = ["plug_img_url"];

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const todos = await listParametros();
  const publicos = Object.fromEntries(
    todos.filter((p) => CHAVES_PUBLICAS.includes(p.chave)).map((p) => [p.chave, p.valor])
  );
  return NextResponse.json(publicos);
}
