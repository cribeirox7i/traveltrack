import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { getMeioPagamento, updateMeioPagamento } from "@/lib/sheets/meiosPagamento";
import { findUserById } from "@/lib/sheets/users";

const patchSchema = z.object({
  nome: z.string().min(1).optional(),
  ativo: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const meio = await getMeioPagamento(id);
  if (!meio) return errorResponse("Meio de pagamento não encontrado", 404);

  const { user } = auth.session;
  if (meio.user_id !== user.id) {
    // Só o dono edita o próprio; gestor pode editar os dos usuários do ambiente dele; admin, todos.
    if (user.role === "user") return errorResponse("Meio de pagamento não encontrado", 404);
    if (user.role === "gestor") {
      const dono = await findUserById(meio.user_id);
      if (!dono || dono.ambiente_id !== user.ambiente_id) {
        return errorResponse("Meio de pagamento não encontrado", 404);
      }
    }
  }

  await updateMeioPagamento(id, parsed.data);
  return NextResponse.json({ ok: true });
}
