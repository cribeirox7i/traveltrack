import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiSession,
  canManageByHierarchy,
  errorResponse,
  requireSession,
  sessionCanAccessTrip,
  tripLockError,
} from "@/lib/api-helpers";
import { deleteCambio, getCambio, updateCambio } from "@/lib/sheets/cambio";
import { getTrip } from "@/lib/sheets/trips";

const numeroPositivo = z
  .string()
  .trim()
  .min(1, "Preencha os valores")
  .refine((v) => {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && n > 0;
  }, "Valor precisa ser um número maior que zero");

const patchSchema = z.object({
  data: z.string().date(),
  moeda: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Moeda precisa ser um código de 3 letras (ex.: USD)"),
  qtd_moeda: numeroPositivo,
  qtd_reais: numeroPositivo,
  taxa_efetiva: numeroPositivo,
  descricao: z.string().trim().max(200).optional().default(""),
});

/** Resolve viagem + evento + hierarquia. Devolve `{ error }` pronto pra retornar, ou os dados. */
async function resolver(tripId: string, cambioId: string, session: ApiSession) {
  if (!(await sessionCanAccessTrip(session, tripId))) {
    return { error: errorResponse("Sem acesso a esta viagem", 403) };
  }

  const cambio = await getCambio(cambioId);
  // 404 (não 403) pra evento de outra viagem: não confirma que aquele id existe em outro lugar.
  if (!cambio || cambio.trip_id !== tripId) {
    return { error: errorResponse("Evento de câmbio não encontrado", 404) };
  }

  const trip = await getTrip(tripId);
  if (!trip) return { error: errorResponse("Viagem não encontrada", 404) };
  const bloqueio = tripLockError(trip);
  if (bloqueio) return { error: bloqueio };

  if (!(await canManageByHierarchy(session, cambio.criado_por))) {
    return { error: errorResponse("Sem permissão para alterar este registro", 403) };
  }

  return { cambio };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cambioId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, cambioId } = await params;
  const r = await resolver(id, cambioId, auth.session);
  if ("error" in r) return r.error;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    await updateCambio(cambioId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH cambio falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao salvar o câmbio: ${err.message}` : "Falha ao salvar o câmbio",
      502
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; cambioId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, cambioId } = await params;
  const r = await resolver(id, cambioId, auth.session);
  if ("error" in r) return r.error;

  try {
    await deleteCambio(cambioId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE cambio falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao excluir o câmbio: ${err.message}` : "Falha ao excluir o câmbio",
      502
    );
  }
}
