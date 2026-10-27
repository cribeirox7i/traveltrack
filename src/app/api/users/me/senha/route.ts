import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { findUserById, updateUser, verifyPassword } from "@/lib/sheets/users";

const schema = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual"),
  senhaNova: z.string().min(6, "A nova senha precisa ter pelo menos 6 caracteres"),
});

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const { senhaAtual, senhaNova } = parsed.data;

  const user = await findUserById(auth.session.user.id);
  if (!user) return errorResponse("Usuário não encontrado", 404);

  const senhaCorreta = await verifyPassword(user, senhaAtual);
  if (!senhaCorreta) return errorResponse("Senha atual incorreta");

  try {
    await updateUser(user.id, { senha: senhaNova });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Erro ao atualizar senha:", err);
    return errorResponse("Erro ao atualizar senha");
  }
}
