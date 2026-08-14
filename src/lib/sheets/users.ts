import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { appendRows, readSheet, updateRow } from "./repository";
import { UserRow } from "./types";

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const users = await readSheet<UserRow>("Users");
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function listUsers(): Promise<UserRow[]> {
  return readSheet<UserRow>("Users");
}

export async function createUser(input: {
  nome: string;
  email: string;
  senha: string;
  role: "admin" | "user";
}): Promise<UserRow> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new Error("Já existe um usuário com este email");
  }

  const senha_hash = await bcrypt.hash(input.senha, 10);
  const row: UserRow = {
    id: uuid(),
    nome: input.nome,
    email: input.email,
    senha_hash,
    role: input.role,
    ativo: "true",
  };

  await appendRows("Users", [row]);
  return row;
}

export async function setUserActive(id: string, ativo: boolean): Promise<void> {
  await updateRow("Users", id, { ativo: ativo ? "true" : "false" });
}

export async function verifyPassword(user: UserRow, senha: string): Promise<boolean> {
  return bcrypt.compare(senha, user.senha_hash);
}
