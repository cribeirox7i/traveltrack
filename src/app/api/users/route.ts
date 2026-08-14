import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireAdmin } from "@/lib/api-helpers";
import { createUser, listUsers } from "@/lib/sheets/users";

const createUserSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  senha: z.string().min(6),
  role: z.enum(["admin", "user"]),
});

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const users = await listUsers();
  return NextResponse.json(
    users.map((u) => ({ id: u.id, nome: u.nome, email: u.email, role: u.role, ativo: u.ativo }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const parsed = createUserSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    const user = await createUser(parsed.data);
    return NextResponse.json(
      { id: user.id, nome: user.nome, email: user.email, role: user.role },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Erro ao criar usuário");
  }
}
