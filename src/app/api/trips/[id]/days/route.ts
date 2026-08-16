import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { DAY_PATCHABLE_FIELDS, listTripDays, saveTripDays, userCanAccessTrip } from "@/lib/sheets/trips";

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

const dayPatchSchema = z
  .object({ id: z.string().min(1) })
  .and(z.object(Object.fromEntries(DAY_PATCHABLE_FIELDS.map((f) => [f, z.string().optional()]))));

const saveSchema = z.object({
  days: z.array(dayPatchSchema),
});

/** Grava todos os dias de uma vez, numa única chamada ao Apps Script (botão "Salvar"). */
export async function PUT(
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

  const parsed = saveSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  await saveTripDays(id, parsed.data.days);
  return NextResponse.json({ ok: true });
}
