import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession, sessionCanAccessTrip, tripLockError } from "@/lib/api-helpers";
import { createReceita, listReceitasByTrip } from "@/lib/sheets/financas";
import { getTrip } from "@/lib/sheets/trips";

const createSchema = z.object({
  id: z.string().min(1).optional(),
  valor: z.number().positive(),
  data: z.string().date(),
  descricao: z.string().optional().default(""),
  credor_id: z.string().min(1),
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

  return NextResponse.json(await listReceitasByTrip(id));
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
  if (trip) {
    const bloqueio = tripLockError(trip);
    if (bloqueio) return bloqueio;
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const receita = await createReceita({
    trip_id: id,
    user_id: user.id,
    ...parsed.data,
  });
  return NextResponse.json(receita, { status: 201 });
}
