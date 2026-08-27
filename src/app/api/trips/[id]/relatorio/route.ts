import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession, sessionCanAccessTrip } from "@/lib/api-helpers";
import { buildRelatorio } from "@/lib/sheets/relatorio";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const relatorio = await buildRelatorio(id);
  if (!relatorio) return errorResponse("Viagem não encontrada", 404);
  return NextResponse.json(relatorio);
}
