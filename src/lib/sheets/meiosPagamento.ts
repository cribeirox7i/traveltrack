import { v4 as uuid } from "uuid";
import { appendRows, readSheet, updateRow } from "./repository";
import { MeioPagamentoRow } from "./types";

export async function listMeiosPagamento(): Promise<MeioPagamentoRow[]> {
  return readSheet<MeioPagamentoRow>("MeiosPagamento");
}

export async function createMeioPagamento(nome: string): Promise<MeioPagamentoRow> {
  const row: MeioPagamentoRow = { id: uuid(), nome, ativo: "true" };
  await appendRows("MeiosPagamento", [row]);
  return row;
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
