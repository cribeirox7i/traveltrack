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

export async function updateUser(
  id: string,
  patch: {
    nome?: string;
    email?: string;
    role?: "admin" | "user";
    ativo?: boolean;
    senha?: string;
  }
): Promise<void> {
  const stringPatch: Record<string, string> = {};

  if (patch.nome !== undefined) stringPatch.nome = patch.nome;

  if (patch.email !== undefined) {
    const existing = await findUserByEmail(patch.email);
    if (existing && existing.id !== id) {
      throw new Error("Já existe um usuário com este email");
    }
    stringPatch.email = patch.email;
  }

  if (patch.role !== undefined) stringPatch.role = patch.role;
  if (patch.ativo !== undefined) stringPatch.ativo = patch.ativo ? "true" : "false";
  if (patch.senha !== undefined) stringPatch.senha_hash = await bcrypt.hash(patch.senha, 10);

  await updateRow("Users", id, stringPatch);
}

export async function verifyPassword(user: UserRow, senha: string): Promise<boolean> {
  return bcrypt.compare(senha, user.senha_hash);
}
