import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/api-helpers";
import { linkUserToTrip, listTripCollaborators, unlinkUserFromTrip } from "@/lib/sheets/trips";

const schema = z.object({
  user_id: z.string().min(1),
  trip_id: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const tripId = req.nextUrl.searchParams.get("trip_id");
  if (!tripId) return errorResponse("Informe trip_id na query");

  return NextResponse.json(await listTripCollaborators(tripId));
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  await linkUserToTrip(parsed.data.user_id, parsed.data.trip_id);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  await unlinkUserFromTrip(parsed.data.user_id, parsed.data.trip_id);
  return NextResponse.json({ ok: true });
}
