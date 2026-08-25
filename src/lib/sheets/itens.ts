import { v4 as uuid } from "uuid";
import { appendRows, deleteRow, readSheet, updateRow } from "./repository";
import { CategoriaItem, ItemRow, categoriaNatureza } from "./types";

/** Campos que o cliente pode enviar na criação/edição de um Item - tudo que NÃO está aqui (id,
 * trip_id, natureza, criado_por, criado_em) é calculado pelo servidor, nunca aceito do payload
 * (mesmo padrão de whitelist que `DAY_PATCHABLE_FIELDS` usa em trips.ts). */
export const ITEM_EDITABLE_FIELDS = [
  "categoria",
  "tipo",
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
  "tipo_documento",
  "passageiro_id",
  "url",
  "anexo_file_id",
  "anexo_nome",
  "anexo_url",
  "descricao",
  "valor",
  "data_pagamento",
  "pagador_id",
  "meio_pagamento_id",
] as const;

export type ItemEditableInput = Partial<Record<(typeof ITEM_EDITABLE_FIELDS)[number], string>> & {
  categoria: CategoriaItem;
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

/** Monta a linha completa a partir do input editável, calculando `natureza` a partir da
 * categoria (nunca um valor livre do cliente - ver `categoriaNatureza`). */
function buildPatch(input: ItemEditableInput): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const campo of ITEM_EDITABLE_FIELDS) {
    if (input[campo] !== undefined) patch[campo] = input[campo] as string;
  }
  patch.natureza = categoriaNatureza(input.categoria) ?? "";
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
