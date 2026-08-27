import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AMBIENTE_COOKIE, errorResponse, requireAdmin } from "@/lib/api-helpers";
import { getAmbiente } from "@/lib/sheets/ambientes";

const schema = z.object({
  /** Vazio = "todos os ambientes" (visão global do admin). */
  ambiente_id: z.string(),
});

/**
 * Troca o ambiente que o admin está navegando (seletor da TopBar). Só admin: gestor e usuário
 * comum são presos ao `ambiente_id` da sessão, e `ambienteAtivo` ignora este cookie pra eles -
 * então nem faria efeito, mas responder 403 aqui deixa a regra explícita em vez de silenciosa.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const { ambiente_id } = parsed.data;
  if (ambiente_id) {
    const ambiente = await getAmbiente(ambiente_id);
    if (!ambiente) return errorResponse("Ambiente não encontrado", 404);
  }

  const res = NextResponse.json({ ok: true, ambiente_id });
  if (ambiente_id) {
    res.cookies.set(AMBIENTE_COOKIE, ambiente_id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  } else {
    res.cookies.delete(AMBIENTE_COOKIE);
  }
  return res;
}
