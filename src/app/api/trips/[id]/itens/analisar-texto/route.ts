import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GeminiIndisponivelError, analisarTextoNotificacao } from "@/lib/gemini";
import { errorResponse, requireSession, sessionCanAccessTrip } from "@/lib/api-helpers";
import { excedeuLimite } from "@/lib/rateLimit";

const LIMITE = 6;
const JANELA_MS = 60_000;

const bodySchema = z.object({ texto: z.string().min(1).max(2000) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { user } = auth.session;

  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  if (excedeuLimite(`analisar-texto:${user.id}`, { limite: LIMITE, janelaMs: JANELA_MS })) {
    return errorResponse("Muitas analises em pouco tempo - aguarde um minuto e tente de novo", 429);
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    const extraido = await analisarTextoNotificacao(parsed.data.texto);
    return NextResponse.json(extraido);
  } catch (err) {
    if (err instanceof GeminiIndisponivelError) {
      const detalhe = err.message ?? "sem detalhe";
      console.error("[analisar-texto] GeminiIndisponivelError:", detalhe);
      return errorResponse(`Nao foi possivel analisar automaticamente: ${detalhe}`, 503);
    }
    throw err;
  }
}
