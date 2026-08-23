import { v4 as uuid } from "uuid";
import { appendRows, deleteRow, readSheet, updateRow } from "./repository";
import { AgendaRow } from "./types";

/** Ordena por data e, dentro do dia, por horário - é assim que a tela monta cada acordeão. */
function ordenar(rows: AgendaRow[]): AgendaRow[] {
  return rows.sort(
    (a, b) => a.data.localeCompare(b.data) || (a.horario ?? "").localeCompare(b.horario ?? "")
  );
}

export async function listAgendaByTrip(tripId: string): Promise<AgendaRow[]> {
  const all = await readSheet<AgendaRow>("Agenda");
  return ordenar(all.filter((a) => a.trip_id === tripId));
}

export async function createAgenda(input: {
  id?: string;
  trip_id: string;
  data: string;
  horario: string;
  descricao: string;
  url?: string;
  anexo_file_id?: string;
  anexo_nome?: string;
  anexo_url?: string;
  criado_por: string;
}): Promise<AgendaRow> {
  const row: AgendaRow = {
    id: input.id || uuid(),
    trip_id: input.trip_id,
    data: input.data,
    horario: input.horario,
    descricao: input.descricao,
    url: input.url ?? "",
    anexo_file_id: input.anexo_file_id ?? "",
    anexo_nome: input.anexo_nome ?? "",
    anexo_url: input.anexo_url ?? "",
    criado_por: input.criado_por,
    criado_em: new Date().toISOString(),
  };
  await appendRows("Agenda", [row]);
  return row;
}

export async function updateAgenda(
  id: string,
  patch: Partial<
    Pick<
      AgendaRow,
      "data" | "horario" | "descricao" | "url" | "anexo_file_id" | "anexo_nome" | "anexo_url"
    >
  >
): Promise<void> {
  await updateRow("Agenda", id, patch as Record<string, string>);
}

export async function deleteAgenda(id: string): Promise<void> {
  await deleteRow("Agenda", id);
}

export async function getAgenda(id: string): Promise<AgendaRow | null> {
  const all = await readSheet<AgendaRow>("Agenda");
  return all.find((a) => a.id === id) ?? null;
}
