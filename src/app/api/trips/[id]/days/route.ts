import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import {
  DAY_EDITABLE_FIELDS,
  listTripDays,
  replicateTripDayField,
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

  return NextResponse.json(await listTripDays(id));
}

const replicateSchema = z.object({
  sourceDayId: z.string().min(1),
  field: z.enum(DAY_EDITABLE_FIELDS),
});

/** Copia um único campo (a coluna com o cursor) de um dia para todos os outros dias da viagem. */
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

  const parsed = replicateSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  await replicateTripDayField(id, parsed.data.sourceDayId, parsed.data.field);
  return NextResponse.json({ ok: true });
}
