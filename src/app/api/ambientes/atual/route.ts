import { NextResponse } from "next/server";
import { ambienteAtivo, requireSession } from "@/lib/api-helpers";

/**
 * Qual ambiente vale pra esta sessão agora. Existe porque o ambiente do admin mora num cookie
 * httpOnly (o JS da página não consegue ler) - o seletor da TopBar precisa perguntar ao servidor
 * em que ambiente ele está. Pra gestor/usuário devolve o da própria sessão.
 */
export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  return NextResponse.json({ ambiente_id: await ambienteAtivo(auth.session) });
}
