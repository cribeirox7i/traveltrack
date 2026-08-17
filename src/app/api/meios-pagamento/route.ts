import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin, requireSession } from "@/lib/api-helpers";
import { createMeioPagamento, listMeiosPagamento } from "@/lib/sheets/meiosPagamento";

const createSchema = z.object({ nome: z.string().min(1) });

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  return NextResponse.json(await listMeiosPagamento());
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const meio = await createMeioPagamento(parsed.data.nome);
  return NextResponse.json(meio, { status: 201 });
}
