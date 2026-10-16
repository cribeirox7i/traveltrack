import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession, sessionCanAccessTrip, tripLockError } from "@/lib/api-helpers";
import { createChecklistItem, listChecklistByTripAndUser } from "@/lib/sheets/checklist";
import { getTrip } from "@/lib/sheets/trips";

const createSchema = z.object({
  id: z.string().min(1).optional(),
  descritivo: z.string().trim().min(1, "Descritivo é obrigatório").max(500),
  data_alvo: z.string().date().optional().or(z.literal("")).default(""),
  criado_em: z.string().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  try {
    const items = await listChecklistByTripAndUser(id, auth.session.user.id);
    return NextResponse.json(items);
  } catch (err) {
    console.error("GET checklist falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao carregar o checklist: ${err.message}` : "Falha ao carregar o checklist",
      502
    );
  }
}

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

  const trip = await getTrip(id);
  if (!trip) return errorResponse("Viagem não encontrada", 404);
  const bloqueio = tripLockError(trip);
  if (bloqueio) return bloqueio;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    const criado = await createChecklistItem({
      id: parsed.data.id,
      tripId: id,
      userId: user.id,
      descritivo: parsed.data.descritivo,
      data_alvo: parsed.data.data_alvo ?? "",
      criadoEm: parsed.data.criado_em,
    });
    return NextResponse.json(criado, { status: 201 });
  } catch (err) {
    console.error("POST checklist falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao salvar o item: ${err.message}` : "Falha ao salvar o item",
      502
    );
  }
}
