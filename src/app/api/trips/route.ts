import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { createTrip, listTripsForUser } from "@/lib/sheets/trips";

const createTripSchema = z.object({
  id: z.string().min(1).optional(),
  nome: z.string().min(1),
  data_inicio: z.string().date(),
  qtd_dias: z.number().int().positive(),
  qtd_pessoas: z.number().int().positive(),
  cidade_origem: z.string().optional(),
  cidade_origem_lat: z.string().optional(),
  cidade_origem_lon: z.string().optional(),
  capa_url: z.string().optional(),
  custo_modo: z.enum(["por_pessoa", "total"]).optional(),
  dayIds: z.array(z.string().min(1)).optional(),
});

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { user } = auth.session;
  const trips = await listTripsForUser(user.id, user.role);
  return NextResponse.json(trips);
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const parsed = createTripSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const trip = await createTrip({
    ...parsed.data,
    criado_por: auth.session.user.id,
  });
  return NextResponse.json(trip, { status: 201 });
}
