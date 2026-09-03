import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireTripEditor, tripLockError } from "@/lib/api-helpers";
import { insertTripDay } from "@/lib/sheets/trips";

const bodySchema = z.object({ afterDayId: z.string().min(1).nullable() });

/** Insere um dia em branco na grade, logo depois de `afterDayId` (ou no início, se null) - ver
 * `insertTripDay` pra regra completa de deslocamento de datas/Agenda. Admin ou quem criou a
 * viagem: mexer na estrutura de dias é parte de Itinerário, que usuário comum só edita nas
 * próprias viagens. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireTripEditor(id);
  if ("error" in auth) return auth.error;
  const bloqueio = tripLockError(auth.trip);
  if (bloqueio) return bloqueio;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    await insertTripDay(id, parsed.data.afterDayId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao inserir dia", 500);
  }
}
