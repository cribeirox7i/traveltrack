import { v4 as uuid } from "uuid";
import { appendRows, deleteRow, findRowById, readSheet, updateRow } from "./repository";
import { CambioRow } from "./types";

/** Campos que o cliente pode enviar num POST/PATCH de câmbio - tudo que não está aqui (`id`,
 * `trip_id`, `criado_por`, `criado_em`) é do servidor. Campo fora desta lista é descartado em
 * silêncio pelo Zod da rota, então adicionar coluna nova exige lembrar de incluir aqui. */
export const CAMBIO_EDITABLE_FIELDS = [
  "data",
  "moeda",
  "qtd_moeda",
  "qtd_reais",
  "taxa_efetiva",
  "descricao",
] as const;

export async function listCambioByTrip(tripId: string): Promise<CambioRow[]> {
  const all = await readSheet<CambioRow>("Cambio");
  return all
    .filter((c) => c.trip_id === tripId)
    .sort((a, b) => (a.data + a.criado_em).localeCompare(b.data + b.criado_em));
}

export async function getCambio(id: string): Promise<CambioRow | null> {
  return findRowById<CambioRow>("Cambio", id);
}

export async function createCambio(input: {
  id?: string;
  tripId: string;
  data: string;
  moeda: string;
  qtd_moeda: string;
  qtd_reais: string;
  taxa_efetiva: string;
  descricao: string;
  criadoPor: string;
}): Promise<CambioRow> {
  const row: CambioRow = {
    id: input.id || uuid(),
    trip_id: input.tripId,
    data: input.data,
    moeda: input.moeda,
    qtd_moeda: input.qtd_moeda,
    qtd_reais: input.qtd_reais,
    taxa_efetiva: input.taxa_efetiva,
    descricao: input.descricao,
    criado_por: input.criadoPor,
    criado_em: new Date().toISOString(),
  };
  await appendRows("Cambio", [row]);
  return row;
}

export async function updateCambio(
  id: string,
  patch: Partial<Record<(typeof CAMBIO_EDITABLE_FIELDS)[number], string>>
): Promise<void> {
  await updateRow("Cambio", id, patch);
}

export async function deleteCambio(id: string): Promise<void> {
  await deleteRow("Cambio", id);
}
