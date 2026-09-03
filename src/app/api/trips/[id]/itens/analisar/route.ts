import { NextRequest, NextResponse } from "next/server";
import { detectarTipoVoucher } from "@/lib/fileValidation";
import { GeminiIndisponivelError, analisarVoucher } from "@/lib/gemini";
import { errorResponse, requireSession, sessionCanAccessTrip, tripLockError } from "@/lib/api-helpers";
import { excedeuLimite } from "@/lib/rateLimit";
import { getTrip } from "@/lib/sheets/trips";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

// O free tier do Gemini permite 10-15 RPM - um teto bem mais apertado por usuário evita que um
// clique duplo ou um retry de rede estourem a cota da conta inteira (compartilhada por todos os
// usuários do app, não é por pessoa do lado do Google).
const LIMITE = 6;
const JANELA_MS = 60_000;

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

  if (excedeuLimite(`analisar:${user.id}`, { limite: LIMITE, janelaMs: JANELA_MS })) {
    return errorResponse("Muitas análises em pouco tempo - aguarde um minuto e tente de novo", 429);
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorResponse("Arquivo ausente");
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(`Arquivo muito grande (máx. ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB)`);
  }

  const mimeType = await detectarTipoVoucher(file);
  if (!mimeType) {
    return errorResponse("Arquivo precisa ser PDF, JPG, JPEG, PNG ou BMP");
  }

  const trip = await getTrip(id);
  if (trip) {
    const bloqueio = tripLockError(trip);
    if (bloqueio) return bloqueio;
  }
  const periodoViagem = trip ? { inicio: trip.data_inicio, fim: trip.data_fim } : undefined;

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const extraido = await analisarVoucher(buffer.toString("base64"), mimeType, periodoViagem);
    return NextResponse.json(extraido);
  } catch (err) {
    if (err instanceof GeminiIndisponivelError) {
      return errorResponse(
        "Não foi possível analisar automaticamente agora - preencha os campos à mão.",
        503
      );
    }
    throw err;
  }
}
