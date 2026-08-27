import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireGestor } from "@/lib/api-helpers";
import { createUser, listUsers, listUsersByAmbiente } from "@/lib/sheets/users";

const createUserSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  senha: z.string().min(6),
  role: z.enum(["admin", "gestor", "user"]),
});

export async function GET() {
  const auth = await requireGestor();
  if ("error" in auth) return auth.error;

  const { role } = auth.session.user;
  // Admin sem ambiente no seletor vê todo mundo; com ambiente escolhido, só aquele. Gestor
  // sempre só o ambiente dele - `requireGestor` já garantiu que ele tem um.
  const users =
    role === "admin" && !auth.ambiente
      ? await listUsers()
      : await listUsersByAmbiente(auth.ambiente);

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      role: u.role,
      ativo: u.ativo,
      ambiente_id: u.ambiente_id ?? "",
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireGestor();
  if ("error" in auth) return auth.error;

  const parsed = createUserSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const { role: papelDeQuemCria } = auth.session.user;
  const dados = parsed.data;

  // Gestor só cria usuário comum, e só no ambiente dele - não pode fabricar outro gestor/admin.
  if (papelDeQuemCria === "gestor" && dados.role !== "user") {
    return errorResponse("O gestor só pode criar usuários comuns", 403);
  }

  // O ambiente vem sempre do que está selecionado na barra superior (`auth.ambiente`, resolvido
  // pelo cookie); não há mais seletor de ambiente nesta tela. Admin é a única exceção: um novo
  // usuário "admin" é global (sem ambiente).
  const ambiente_id = dados.role === "admin" ? "" : auth.ambiente;

  // Qualquer papel não-admin precisa de um ambiente, senão nasce um usuário que não enxerga nada.
  if (!ambiente_id && dados.role !== "admin") {
    return errorResponse("Selecione um ambiente na barra superior antes de criar o usuário", 400);
  }

  try {
    const user = await createUser({ ...dados, ambiente_id });
    return NextResponse.json(
      { id: user.id, nome: user.nome, email: user.email, role: user.role },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao criar usuário");
  }
}
