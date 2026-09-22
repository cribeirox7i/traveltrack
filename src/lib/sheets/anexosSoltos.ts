import { v4 as uuid } from "uuid";
import { appendRows, deleteRow, readSheet, updateRow } from "./repository";
import { AnexoSoltoRow } from "./types";

/** Anexos soltos de uma viagem (aba `Anexos`, ver comentário em `AnexoSoltoRow`) - só data,
 * descrição e arquivo, sem vínculo com Item. Mesmo padrão de `listItemAnexosByTrip`: uma leitura
 * por viagem, sem filtro por linha específica. */
export async function listAnexosSoltosByTrip(tripId: string): Promise<AnexoSoltoRow[]> {
  const all = await readSheet<AnexoSoltoRow>("Anexos");
  return all
    .filter((a) => a.trip_id === tripId)
    .sort((a, b) => (b.data + b.criado_em).localeCompare(a.data + a.criado_em));
}

export async function getAnexoSolto(id: string): Promise<AnexoSoltoRow | null> {
  const all = await readSheet<AnexoSoltoRow>("Anexos");
  return all.find((a) => a.id === id) ?? null;
}

export async function createAnexoSolto(input: {
  tripId: string;
  data: string;
  descricao: string;
  fileId: string;
  nome: string;
  url: string;
  criadoPor: string;
}): Promise<AnexoSoltoRow> {
  const row: AnexoSoltoRow = {
    id: uuid(),
    trip_id: input.tripId,
    data: input.data,
    descricao: input.descricao,
    file_id: input.fileId,
    nome: input.nome,
    url: input.url,
    criado_por: input.criadoPor,
    criado_em: new Date().toISOString(),
  };
  await appendRows("Anexos", [row]);
  return row;
}

/** Só `data`/`descricao` são editáveis - trocar o arquivo é excluir e subir outro (mesmo padrão
 * do anexo principal de Item, que também não permite "editar" o arquivo em si). */
export async function updateAnexoSolto(
  id: string,
  patch: { data?: string; descricao?: string }
): Promise<void> {
  const stringPatch: Record<string, string> = {};
  if (patch.data !== undefined) stringPatch.data = patch.data;
  if (patch.descricao !== undefined) stringPatch.descricao = patch.descricao;
  await updateRow("Anexos", id, stringPatch);
}

export async function deleteAnexoSolto(id: string): Promise<void> {
  await deleteRow("Anexos", id);
}
