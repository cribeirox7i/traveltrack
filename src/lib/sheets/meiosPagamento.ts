import { v4 as uuid } from "uuid";
import { appendRows, readSheet, updateRow } from "./repository";
import { MeioPagamentoRow } from "./types";

/**
 * Tabela inteira, sem filtro de dono. Serve pra RESOLVER NOME por id (Relatório/Itens mostram o
 * nome do meio de pagamento de um item lançado por outra pessoa) - não pra montar a lista de
 * escolha de ninguém. Pra isso use `listMeiosPagamentoDoUsuario`.
 */
export async function listMeiosPagamento(): Promise<MeioPagamentoRow[]> {
  return readSheet<MeioPagamentoRow>("MeiosPagamento");
}

/** A lista que um usuário escolhe no formulário: só os dele. Linhas legadas sem `user_id` (de
 * quando a lista era global) ficam de fora - continuam resolvendo o nome nos itens antigos que as
 * referenciam, mas não voltam a aparecer como opção. */
export async function listMeiosPagamentoDoUsuario(userId: string): Promise<MeioPagamentoRow[]> {
  if (!userId) return [];
  const todos = await readSheet<MeioPagamentoRow>("MeiosPagamento");
  return todos.filter((m) => m.user_id === userId);
}

export async function createMeioPagamento(input: {
  nome: string;
  user_id: string;
}): Promise<MeioPagamentoRow> {
  const row: MeioPagamentoRow = {
    id: uuid(),
    nome: input.nome,
    ativo: "true",
    user_id: input.user_id,
  };
  await appendRows("MeiosPagamento", [row]);
  return row;
}

export async function getMeioPagamento(id: string): Promise<MeioPagamentoRow | null> {
  if (!id) return null;
  const todos = await readSheet<MeioPagamentoRow>("MeiosPagamento");
  return todos.find((m) => m.id === id) ?? null;
}

export async function updateMeioPagamento(
  id: string,
  patch: { nome?: string; ativo?: boolean }
): Promise<void> {
  const stringPatch: Record<string, string> = {};
  if (patch.nome !== undefined) stringPatch.nome = patch.nome;
  if (patch.ativo !== undefined) stringPatch.ativo = patch.ativo ? "true" : "false";
  await updateRow("MeiosPagamento", id, stringPatch);
}
