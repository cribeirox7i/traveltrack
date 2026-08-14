import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { updateTripDay, userCanAccessTrip } from "@/lib/sheets/trips";

const patchSchema = z.object({
  origem: z.string().optional(),
  destino: z.string().optional(),
  pernoite: z.string().optional(),
  traslado_pp: z.number().nonnegative().optional(),
  passagem_pp: z.number().nonnegative().optional(),
  alimentacao_pp: z.number().nonnegative().optional(),
  passeio_pp: z.number().nonnegative().optional(),
  hospedagem_pp: z.number().nonnegative().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; dayId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, dayId } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  await updateTripDay(dayId, parsed.data);
  return NextResponse.json({ ok: true });
}
