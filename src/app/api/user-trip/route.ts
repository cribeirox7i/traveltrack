import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireGestor } from "@/lib/api-helpers";
import {
  getTrip,
  linkUserToTrip,
  listTripCollaborators,
  unlinkUserFromTrip,
} from "@/lib/sheets/trips";
import { findUserById } from "@/lib/sheets/users";
import type { ApiSession } from "@/lib/api-helpers";

const schema = z.object({
  user_id: z.string().min(1),
  trip_id: z.string().min(1),
});

/**
 * Um vínculo só é permitido se a viagem E o usuário estiverem no ambiente de quem está mexendo -
 * é o que impede dar acesso de uma viagem daqui pra alguém de outro tenant (o caminho mais
 * direto de furar o isolamento, já que UserTrip não tem coluna de ambiente).
 *
 * Admin sem ambiente no seletor ainda precisa que viagem e usuário estejam no MESMO ambiente
 * entre si - vincular através de tenants nunca é intencional.
 */
async function validarVinculo(
  session: ApiSession,
  ambiente: string,
  userId: string,
  tripId: string
): Promise<string | null> {
  const [trip, alvo] = await Promise.all([getTrip(tripId), findUserById(userId)]);
  if (!trip) return "Viagem não encontrada";
  if (!alvo) return "Usuário não encontrado";

  if (session.user.role !== "admin" || ambiente) {
    if (trip.ambiente_id !== ambiente) return "Viagem não encontrada";
    if (alvo.ambiente_id !== ambiente) return "Usuário não encontrado";
  } else if (trip.ambiente_id !== alvo.ambiente_id) {
    return "Usuário e viagem são de ambientes diferentes";
  }

  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireGestor();
  if ("error" in auth) return auth.error;

  const tripId = req.nextUrl.searchParams.get("trip_id");
  if (!tripId) return errorResponse("Informe trip_id na query");

  const trip = await getTrip(tripId);
  if (!trip) return errorResponse("Viagem não encontrada", 404);
  if (auth.session.user.role !== "admin" && trip.ambiente_id !== auth.ambiente) {
    return errorResponse("Viagem não encontrada", 404);
  }

  return NextResponse.json(await listTripCollaborators(tripId));
}

export async function POST(req: NextRequest) {
  const auth = await requireGestor();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const erro = await validarVinculo(
    auth.session,
    auth.ambiente,
    parsed.data.user_id,
    parsed.data.trip_id
  );
  if (erro) return errorResponse(erro, 404);

  await linkUserToTrip(parsed.data.user_id, parsed.data.trip_id);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireGestor();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const erro = await validarVinculo(
    auth.session,
    auth.ambiente,
    parsed.data.user_id,
    parsed.data.trip_id
  );
  if (erro) return errorResponse(erro, 404);

  await unlinkUserFromTrip(parsed.data.user_id, parsed.data.trip_id);
  return NextResponse.json({ ok: true });
}
