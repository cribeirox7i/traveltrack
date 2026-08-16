import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { deleteAnexo } from "@/lib/sheets/anexos";
import { userCanAccessTrip } from "@/lib/sheets/trips";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, fileId } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  await deleteAnexo(fileId);
  return NextResponse.json({ ok: true });
}
