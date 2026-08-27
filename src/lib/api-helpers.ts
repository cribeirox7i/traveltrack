import { auth } from "@/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { getTrip, userCanAccessTrip } from "@/lib/sheets/trips";
import type { TripRow } from "@/lib/sheets/types";

export type ApiSession = Session;

/** Cookie onde o admin global guarda o ambiente que está navegando (seletor da TopBar). Só tem
 * efeito pra quem é admin - qualquer outro papel usa o `ambiente_id` da própria sessão, então
 * forjar este cookie não abre porta nenhuma. */
export const AMBIENTE_COOKIE = "ambiente_ativo";

export async function requireSession(): Promise<
  { session: ApiSession } | { error: NextResponse }
> {
  const session: Session | null = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }
  return { session };
}

/**
 * O ambiente que vale pra esta requisição.
 *
 * Pro admin: o que ele escolheu no seletor (cookie), ou "" = "todos os ambientes" (visão global).
 * Pra qualquer outro papel: SEMPRE o `ambiente_id` da sessão, ignorando o cookie - é o ponto que
 * garante que gestor/usuário não consigam se mover pra outro ambiente mexendo no navegador.
 */
export async function ambienteAtivo(session: ApiSession): Promise<string> {
  if (session.user.role !== "admin") return session.user.ambiente_id ?? "";
  const store = await cookies();
  return store.get(AMBIENTE_COOKIE)?.value ?? "";
}

/**
 * "Esta sessão alcança esta viagem?" - junta papel + ambiente ativo + vínculo de UserTrip num só
 * lugar. Toda rota de viagem passa por aqui em vez de chamar `userCanAccessTrip` com os argumentos
 * soltos: assim o ambiente nunca fica de fora por esquecimento num call site novo.
 */
export async function sessionCanAccessTrip(
  session: ApiSession,
  tripId: string
): Promise<boolean> {
  const { user } = session;
  const ambiente = await ambienteAtivo(session);
  return userCanAccessTrip(user.id, user.role, ambiente, tripId);
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
 * Admin global OU gestor. Usado nas telas que o gestor administra dentro do ambiente dele
 * (Usuários, Acessos, meios de pagamento dos usuários) - a rota ainda precisa filtrar pelo
 * `ambiente` devolvido aqui, que é o único ambiente que o gestor pode tocar.
 */
export async function requireGestor(): Promise<
  { session: ApiSession; ambiente: string } | { error: NextResponse }
> {
  const result = await requireSession();
  if ("error" in result) return result;

  const { role } = result.session.user;
  if (role !== "admin" && role !== "gestor") {
    return {
      error: NextResponse.json(
        { error: "Acesso restrito ao administrador ou gestor do ambiente" },
        { status: 403 }
      ),
    };
  }

  const ambiente = await ambienteAtivo(result.session);
  // Gestor sem ambiente é dado inconsistente (só admin pode não ter ambiente) - barra em vez de
  // cair no caso "" que, pro admin, significa "todos os ambientes".
  if (role === "gestor" && !ambiente) {
    return {
      error: NextResponse.json({ error: "Gestor sem ambiente definido" }, { status: 403 }),
    };
  }

  return { session: result.session, ambiente };
}

/**
 * Quem pode editar Itinerário/Orçamento/Editar-viagem de uma viagem: o admin (qualquer viagem), o
 * gestor (qualquer viagem do ambiente dele) ou quem criou aquela viagem específica
 * (`criado_por`) - usuário comum só tem esses privilégios "de dono" na própria viagem, continua
 * restrito nas dos outros (só Itens/Roteiro).
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
  const naoEncontrada = NextResponse.json({ error: "Viagem não encontrada" }, { status: 404 });

  if (user.role !== "admin") {
    // Viagem de outro ambiente responde 404, não 403: um 403 confirmaria que aquele id existe
    // em algum lugar do sistema, o que já é informação de outro tenant.
    if (trip.ambiente_id !== user.ambiente_id) return { error: naoEncontrada };

    if (user.role !== "gestor" && trip.criado_por !== user.id) {
      return {
        error: NextResponse.json(
          { error: "Só o administrador, o gestor ou quem criou a viagem pode editar isso" },
          { status: 403 }
        ),
      };
    }
  }

  return { session: result.session, trip };
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
