import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { getTrip } from "@/lib/sheets/trips";
import type { TripRow } from "@/lib/sheets/types";

export type ApiSession = Session;

export async function requireSession(): Promise<
  { session: ApiSession } | { error: NextResponse }
> {
  const session: Session | null = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }
  return { session };
}

export async function requireAdmin(): Promise<
  { session: ApiSession } | { error: NextResponse }
> {
  const result = await requireSession();
  if ("error" in result) return result;
  if (result.session.user.role !== "admin") {
    return { error: NextResponse.json({ error: "Acesso restrito ao admin" }, { status: 403 }) };
  }
  return result;
}

/**
 * Quem pode editar Itinerário/Orçamento/Editar-viagem de uma viagem: o admin (qualquer viagem) ou
 * quem criou aquela viagem específica (`criado_por`) - usuário comum só tem esses privilégios
 * "de dono" na própria viagem, continua restrito nas dos outros (só Lançamentos/Anexos/Roteiro).
 */
export async function requireTripEditor(
  tripId: string
): Promise<{ session: ApiSession; trip: TripRow } | { error: NextResponse }> {
  const result = await requireSession();
  if ("error" in result) return result;

  const trip = await getTrip(tripId);
  if (!trip) {
    return { error: NextResponse.json({ error: "Viagem não encontrada" }, { status: 404 }) };
  }

  const { user } = result.session;
  if (user.role !== "admin" && trip.criado_por !== user.id) {
    return {
      error: NextResponse.json(
        { error: "Só o administrador ou quem criou a viagem pode editar isso" },
        { status: 403 }
      ),
    };
  }
  return { session: result.session, trip };
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
