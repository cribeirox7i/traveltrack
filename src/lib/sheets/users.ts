import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { appendRows, readSheet, updateRow } from "./repository";
import { Role, UserRow } from "./types";

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const users = await readSheet<UserRow>("Users");
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  if (!id) return null;
  const users = await readSheet<UserRow>("Users");
  return users.find((u) => u.id === id) ?? null;
}

/**
 * Todos os usuários, sem filtro. Só o admin global pode consumir isso direto - qualquer tela ou
 * rota de gestor precisa passar por `listUsersByAmbiente`, senão vaza usuário de outro ambiente.
 */
export async function listUsers(): Promise<UserRow[]> {
  return readSheet<UserRow>("Users");
}

/** Usuários de UM ambiente. `ambienteId` vazio devolve lista vazia de propósito: "sem ambiente"
 * não é um ambiente que se possa listar (é o estado do admin global), e devolver todos aqui seria
 * exatamente o vazamento que o multitenant existe pra evitar. */
export async function listUsersByAmbiente(ambienteId: string): Promise<UserRow[]> {
  if (!ambienteId) return [];
  const users = await readSheet<UserRow>("Users");
  return users.filter((u) => u.ambiente_id === ambienteId);
}

export async function createUser(input: {
  nome: string;
  email: string;
  senha: string;
  role: Role;
  ambiente_id: string;
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
    ambiente_id: input.ambiente_id,
  };

  await appendRows("Users", [row]);
  return row;
}

export async function updateUser(
  id: string,
  patch: {
    nome?: string;
    email?: string;
    role?: Role;
    ativo?: boolean;
    senha?: string;
    ambiente_id?: string;
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
  if (patch.ambiente_id !== undefined) stringPatch.ambiente_id = patch.ambiente_id;
  if (patch.ativo !== undefined) stringPatch.ativo = patch.ativo ? "true" : "false";
  if (patch.senha !== undefined) stringPatch.senha_hash = await bcrypt.hash(patch.senha, 10);

  await updateRow("Users", id, stringPatch);
}

export async function verifyPassword(user: UserRow, senha: string): Promise<boolean> {
  return bcrypt.compare(senha, user.senha_hash);
}
