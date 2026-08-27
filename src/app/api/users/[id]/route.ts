import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireGestor } from "@/lib/api-helpers";
import { findUserById, updateUser } from "@/lib/sheets/users";

const patchSchema = z.object({
  nome: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "gestor", "user"]).optional(),
  ativo: z.boolean().optional(),
  senha: z.string().min(6).optional(),
  /** Mover usuário de ambiente é privilégio do admin (ver abaixo). */
  ambiente_id: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireGestor();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const alvo = await findUserById(id);
  if (!alvo) return errorResponse("Usuário não encontrado", 404);

  const souGestor = auth.session.user.role === "gestor";
  if (souGestor) {
    // Gestor só toca em usuário comum do próprio ambiente, e não pode mudar papel nem ambiente -
    // caso contrário se promoveria (ou promoveria alguém) fora do escopo dele.
    if (alvo.ambiente_id !== auth.ambiente) return errorResponse("Usuário não encontrado", 404);
    if (alvo.role !== "user") {
      return errorResponse("O gestor só pode editar usuários comuns", 403);
    }
    if (parsed.data.role !== undefined && parsed.data.role !== "user") {
      return errorResponse("O gestor não pode alterar o papel do usuário", 403);
    }
    if (parsed.data.ambiente_id !== undefined) {
      return errorResponse("O gestor não pode mover usuário de ambiente", 403);
    }
  }

  // Pro gestor, `ambiente_id` nunca chega ao patch (ele já foi barrado acima se tentou mandar).
  const patch = { ...parsed.data };
  if (souGestor) delete patch.ambiente_id;

  try {
    await updateUser(id, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao atualizar usuário");
  }
}
