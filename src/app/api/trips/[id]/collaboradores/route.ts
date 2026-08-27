import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession, sessionCanAccessTrip } from "@/lib/api-helpers";
import { listTripCollaboratorsWithNames } from "@/lib/sheets/trips";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { user } = auth.session;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  return NextResponse.json(await listTripCollaboratorsWithNames(id, user.id));
}
