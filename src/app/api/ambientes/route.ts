import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin, requireSession } from "@/lib/api-helpers";
import { createAmbiente, listAmbientes } from "@/lib/sheets/ambientes";

const createSchema = z.object({ nome: z.string().min(1) });

/**
 * Admin recebe a lista inteira (é ele quem gerencia e quem troca de ambiente no seletor).
 * Qualquer outro papel recebe SÓ o próprio ambiente - serve pra TopBar mostrar em que ambiente a
 * pessoa está, sem revelar que outros existem nem quantos são.
 */
export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const todos = await listAmbientes();
  const { user } = auth.session;
  const visiveis =
    user.role === "admin" ? todos : todos.filter((a) => a.id === user.ambiente_id);

  return NextResponse.json(visiveis);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    const ambiente = await createAmbiente(parsed.data.nome);
    return NextResponse.json(ambiente, { status: 201 });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao criar ambiente");
  }
}
