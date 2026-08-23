import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin, requireSession } from "@/lib/api-helpers";
import { deleteTrip, getTrip, updateTrip, userCanAccessTrip } from "@/lib/sheets/trips";

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
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  await updateTrip(id, parsed.data);
  return NextResponse.json({ ok: true });
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
    await deleteTrip(id);
  } catch (err) {
    // Sem isso, uma falha aqui (ex.: ação nova do Codigo.gs ainda não publicada numa nova
    // versão do Web App) vira um 500 sem corpo — o cliente só via "Erro ao excluir viagem"
    // genérico, sem pista nenhuma do motivo real.
    return errorResponse(err instanceof Error ? err.message : "Erro ao excluir viagem", 500);
  }
  return NextResponse.json({ ok: true });
}
