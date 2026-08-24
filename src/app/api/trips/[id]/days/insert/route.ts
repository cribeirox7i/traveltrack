import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { insertTripDay, userCanAccessTrip } from "@/lib/sheets/trips";

const bodySchema = z.object({ afterDayId: z.string().min(1).nullable() });

/** Insere um dia em branco na grade, logo depois de `afterDayId` (ou no início, se null) - ver
 * `insertTripDay` pra regra completa de deslocamento de datas/Agenda. */
export async function POST(
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

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    await insertTripDay(id, parsed.data.afterDayId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao inserir dia", 500);
  }
}
