import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ambienteAtivo, errorResponse, requireSession } from "@/lib/api-helpers";
import { createMeioPagamento, listMeiosPagamento } from "@/lib/sheets/meiosPagamento";
import { findUserById, listUsers, listUsersByAmbiente } from "@/lib/sheets/users";

const createSchema = z.object({
  nome: z.string().min(1),
  /** Dono. Ausente = pra si mesmo. Só gestor/admin podem cadastrar pra outro usuário. */
  user_id: z.string().optional(),
});

/**
 * A lista que o cliente recebe cumpre DOIS papéis, e por isso não é só "os meus":
 *
 * - `proprio: true` são os do próprio usuário - os únicos que aparecem no `<select>` de escolha.
 * - o resto vem só pra RESOLVER NOME: um item pago por outra pessoa da viagem guarda o
 *   `meio_pagamento_id` dela, e sem esses registros o Relatório/Itens mostraria o uuid cru.
 *
 * O recorte é o ambiente: nunca vaza meio de pagamento de outro tenant.
 */
export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { user } = auth.session;
  const ambiente = await ambienteAtivo(auth.session);

  const doAmbiente =
    user.role === "admin" && !ambiente ? await listUsers() : await listUsersByAmbiente(ambiente);
  const idsDoAmbiente = new Set(doAmbiente.map((u) => u.id));

  const todos = await listMeiosPagamento();
  const visiveis = todos.filter((m) => idsDoAmbiente.has(m.user_id) || m.user_id === user.id);

  return NextResponse.json(
    visiveis.map((m) => ({
      id: m.id,
      nome: m.nome,
      ativo: m.ativo,
      user_id: m.user_id ?? "",
      proprio: m.user_id === user.id,
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const { user } = auth.session;
  const alvoId = parsed.data.user_id ?? user.id;

  if (alvoId !== user.id) {
    // Cadastrar pra outra pessoa é privilégio de gestor (dentro do ambiente dele) e do admin.
    if (user.role === "user") {
      return errorResponse("Você só pode cadastrar meios de pagamento pra você", 403);
    }
    const alvo = await findUserById(alvoId);
    if (!alvo) return errorResponse("Usuário não encontrado", 404);
    if (user.role === "gestor" && alvo.ambiente_id !== user.ambiente_id) {
      return errorResponse("Usuário não encontrado", 404);
    }
  }

  const meio = await createMeioPagamento({ nome: parsed.data.nome, user_id: alvoId });
  return NextResponse.json(meio, { status: 201 });
}
