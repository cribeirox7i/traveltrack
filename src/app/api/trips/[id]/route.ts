import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin, requireSession } from "@/lib/api-helpers";
import {
  changeTripStartDate,
  deleteTrip,
  getTrip,
  updateTrip,
  userCanAccessTrip,
} from "@/lib/sheets/trips";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const trip = await getTrip(id);
  if (!trip) return errorResponse("Viagem não encontrada", 404);
  return NextResponse.json(trip);
}

const patchSchema = z.object({
  cidade_origem: z.string().optional(),
  cidade_origem_lat: z.string().optional(),
  cidade_origem_lon: z.string().optional(),
  capa_url: z.string().optional(),
  custo_modo: z.enum(["por_pessoa", "total"]).optional(),
  // Não é um campo qualquer da linha - mudar isso desloca a grade inteira de dias (e a Agenda
  // junto), ver `changeTripStartDate`. Tratado à parte abaixo, não entra no `updateTrip` genérico.
  data_inicio: z.string().date().optional(),
});

/** Admin-only: todo campo aqui (cidade de origem/Mapa, capa/modo de custo/data início do
 * Dashboard) pertence a uma aba que usuário comum não pode editar. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const { data_inicio, ...resto } = parsed.data;

  try {
    if (data_inicio) await changeTripStartDate(id, data_inicio);
    if (Object.keys(resto).length) await updateTrip(id, resto);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao atualizar viagem", 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const trip = await getTrip(id);
  if (!trip) return errorResponse("Viagem não encontrada", 404);

  try {
    const result = await deleteTrip(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Sem isso, uma falha aqui (ex.: ação nova do Codigo.gs ainda não publicada numa nova
    // versão do Web App) vira um 500 sem corpo - o cliente só via "Erro ao excluir viagem"
    // genérico, sem pista nenhuma do motivo real.
    return errorResponse(err instanceof Error ? err.message : "Erro ao excluir viagem", 500);
  }
}
