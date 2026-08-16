import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/api-helpers";
import { updateUser } from "@/lib/sheets/users";

const patchSchema = z.object({
  nome: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "user"]).optional(),
  ativo: z.boolean().optional(),
  senha: z.string().min(6).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    await updateUser(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao atualizar usuário");
  }
}
