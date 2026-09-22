import { v4 as uuid } from "uuid";
import { appendRows, deleteRow, readSheet, updateRow } from "./repository";
import { ItemRow } from "./types";

/** Campos que o cliente pode enviar na criação/edição de um Item - tudo que NÃO está aqui (id,
 * trip_id, criado_por, criado_em) é calculado pelo servidor ou simplesmente não é mais aceito
 * (whitelist, mesmo padrão de `DAY_PATCHABLE_FIELDS` em trips.ts).
 *
 * Reforma de 2026-09-21: `classificacao_id`/`subclassificacao_id` (FK pras abas Classificacoes/
 * Subclassificacoes) substituem o antigo `categoria`/`tipo`; `financeiro_ativo`/`roteiro_ativo`
 * são os dois interruptores do formulário novo; `natureza` (débito/crédito) virou campo explícito
 * do acordeão Financeiro em vez de calculado a partir da categoria (que era fixa, e classificação
 * agora é dado livre do admin). */
export const ITEM_EDITABLE_FIELDS = [
  "classificacao_id",
  "subclassificacao_id",
  "financeiro_ativo",
  "roteiro_ativo",
  "localizador",
  "nome_companhia",
  "numero",
  "data",
  "horario",
  "origem",
  "destino",
  "nome_local",
  "endereco",
  "data_inicio",
  "hora_inicio",
  "data_fim",
  "hora_fim",
  "url",
  "anexo_file_id",
  "anexo_nome",
  "anexo_url",
  "descricao",
  "valor",
  "moeda",
  "status",
  "natureza",
  "data_pagamento",
  "pagador_id",
  "meio_pagamento_id",
] as const;

export type ItemEditableInput = Partial<Record<(typeof ITEM_EDITABLE_FIELDS)[number], string>> & {
  classificacao_id: string;
};

export async function listItensByTrip(tripId: string): Promise<ItemRow[]> {
  const all = await readSheet<ItemRow>("Itens");
  return all
    .filter((i) => i.trip_id === tripId)
    .sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario));
}

export async function getItem(id: string): Promise<ItemRow | null> {
  const all = await readSheet<ItemRow>("Itens");
  return all.find((i) => i.id === id) ?? null;
}

function buildPatch(input: ItemEditableInput): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const campo of ITEM_EDITABLE_FIELDS) {
    if (input[campo] !== undefined) patch[campo] = input[campo] as string;
  }
  return patch;
}

export async function createItem(
  input: ItemEditableInput & { id?: string; trip_id: string; criado_por: string }
): Promise<ItemRow> {
  const row = {
    id: input.id || uuid(),
    trip_id: input.trip_id,
    criado_por: input.criado_por,
    criado_em: new Date().toISOString(),
    ...buildPatch(input),
  } as ItemRow;
  await appendRows("Itens", [row]);
  return row;
}

export async function updateItem(id: string, input: ItemEditableInput): Promise<void> {
  await updateRow("Itens", id, buildPatch(input));
}

export async function deleteItem(id: string): Promise<void> {
  await deleteRow("Itens", id);
}
