import { v4 as uuid } from "uuid";
import { appendRows, readSheet } from "./repository";
import { Categoria, DespesaRow, ReceitaRow } from "./types";

export async function listDespesasByTrip(tripId: string): Promise<DespesaRow[]> {
  const all = await readSheet<DespesaRow>("Despesas");
  return all
    .filter((d) => d.trip_id === tripId)
    .sort((a, b) => a.data.localeCompare(b.data));
}

export async function createDespesa(input: {
  trip_id: string;
  categoria: Categoria;
  valor: number;
  data: string;
  lancado_por: string;
  descricao: string;
}): Promise<DespesaRow> {
  const row: DespesaRow = {
    id: uuid(),
    trip_id: input.trip_id,
    categoria: input.categoria,
    valor: String(input.valor),
    data: input.data,
    lancado_por: input.lancado_por,
    descricao: input.descricao,
  };
  await appendRows("Despesas", [row]);
  return row;
}

export async function listReceitasByTrip(tripId: string): Promise<ReceitaRow[]> {
  const all = await readSheet<ReceitaRow>("Receitas");
  return all
    .filter((r) => r.trip_id === tripId)
    .sort((a, b) => a.data.localeCompare(b.data));
}

export async function createReceita(input: {
  trip_id: string;
  user_id: string;
  valor: number;
  data: string;
  descricao: string;
}): Promise<ReceitaRow> {
  const row: ReceitaRow = {
    id: uuid(),
    trip_id: input.trip_id,
    user_id: input.user_id,
    valor: String(input.valor),
    data: input.data,
    descricao: input.descricao,
  };
  await appendRows("Receitas", [row]);
  return row;
}
