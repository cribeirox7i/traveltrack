import { v4 as uuid } from "uuid";
import { appendRows, deleteRow, readSheet } from "./repository";
import { ItemAnexoRow } from "./types";

/** Anexos extras de UMA viagem inteira, não filtrados por item - a tela de Itens já busca tudo
 * de uma vez (mesmo padrão de `listItensByTrip`) e filtra por `item_id` no cliente, em vez de uma
 * chamada por item. */
export async function listItemAnexosByTrip(tripId: string): Promise<ItemAnexoRow[]> {
  const all = await readSheet<ItemAnexoRow>("ItemAnexos");
  return all
    .filter((a) => a.trip_id === tripId)
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}

export async function getItemAnexo(id: string): Promise<ItemAnexoRow | null> {
  const all = await readSheet<ItemAnexoRow>("ItemAnexos");
  return all.find((a) => a.id === id) ?? null;
}

export async function createItemAnexo(input: {
  itemId: string;
  tripId: string;
  fileId: string;
  nome: string;
  url: string;
  criadoPor: string;
}): Promise<ItemAnexoRow> {
  const row: ItemAnexoRow = {
    id: uuid(),
    item_id: input.itemId,
    trip_id: input.tripId,
    file_id: input.fileId,
    nome: input.nome,
    url: input.url,
    criado_por: input.criadoPor,
    criado_em: new Date().toISOString(),
  };
  await appendRows("ItemAnexos", [row]);
  return row;
}

export async function deleteItemAnexo(id: string): Promise<void> {
  await deleteRow("ItemAnexos", id);
}
