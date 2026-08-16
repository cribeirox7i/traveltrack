import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { createDespesa, listDespesasByTrip } from "@/lib/sheets/financas";
import { userCanAccessTrip } from "@/lib/sheets/trips";

const createSchema = z.object({
  id: z.string().min(1).optional(),
  categoria: z.enum(["traslado", "passagem", "alimentacao", "passeio", "hospedagem"]),
  valor: z.number().positive(),
  data: z.string().date(),
  descricao: z.string().optional().default(""),
});

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

  return NextResponse.json(await listDespesasByTrip(id));
}

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

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const despesa = await createDespesa({
    trip_id: id,
    lancado_por: user.id,
    ...parsed.data,
  });
  return NextResponse.json(despesa, { status: 201 });
}
