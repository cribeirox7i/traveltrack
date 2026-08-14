import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/api-helpers";
import { listParametros, upsertParametro } from "@/lib/sheets/parametros";

const upsertSchema = z.object({
  chave: z.string().min(1),
  valor: z.string(),
  descricao: z.string().optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  return NextResponse.json(await listParametros());
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = upsertSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const row = await upsertParametro(parsed.data);
  return NextResponse.json(row, { status: 201 });
}
