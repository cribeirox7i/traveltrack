import { v4 as uuid } from "uuid";
import { appendRows, deleteRow, readSheet, updateRow } from "./repository";
import { AnexoRow } from "./types";

/** Todos os anexos de uma viagem, soltos e de Item juntos (aba `Anexos` unificada) - quem chama
 * filtra por `item_id` no cliente quando precisa só de um dos dois grupos (mesmo padrão de
 * `listItensByTrip`: uma leitura por viagem, sem filtro por linha específica no servidor). */
export async function listAnexosByTrip(tripId: string): Promise<AnexoRow[]> {
  const all = await readSheet<AnexoRow>("Anexos");
  return all
    .filter((a) => a.trip_id === tripId)
    .sort((a, b) => (b.data + b.criado_em).localeCompare(a.data + a.criado_em));
}

export async function getAnexo(id: string): Promise<AnexoRow | null> {
  const all = await readSheet<AnexoRow>("Anexos");
  return all.find((a) => a.id === id) ?? null;
}

export async function createAnexo(input: {
  tripId: string;
  /** Vazio/ausente = anexo solto. Preenchido = pertence a este Item. */
  itemId?: string;
  data?: string;
  descricao?: string;
  fileId: string;
  nome: string;
  url: string;
  criadoPor: string;
}): Promise<AnexoRow> {
  const row: AnexoRow = {
    id: uuid(),
    trip_id: input.tripId,
    item_id: input.itemId ?? "",
    data: input.data ?? "",
    descricao: input.descricao ?? "",
    file_id: input.fileId,
    nome: input.nome,
    url: input.url,
    criado_por: input.criadoPor,
    criado_em: new Date().toISOString(),
  };
  await appendRows("Anexos", [row]);
  return row;
}

/** Só `data`/`descricao` são editáveis - trocar o arquivo é excluir e subir outro. Só faz
 * sentido pra anexo solto (a tela de Itens não oferece edição, só analisar/remover). */
export async function updateAnexo(
  id: string,
  patch: { data?: string; descricao?: string }
): Promise<void> {
  const stringPatch: Record<string, string> = {};
  if (patch.data !== undefined) stringPatch.data = patch.data;
  if (patch.descricao !== undefined) stringPatch.descricao = patch.descricao;
  await updateRow("Anexos", id, stringPatch);
}

export async function deleteAnexo(id: string): Promise<void> {
  await deleteRow("Anexos", id);
}
