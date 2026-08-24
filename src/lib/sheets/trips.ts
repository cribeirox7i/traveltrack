import { v4 as uuid } from "uuid";
import { addDays, diffDays, sequentialDates } from "../dateRange";
import {
  appendRows,
  deleteRow,
  deleteRowsByField,
  findRowById,
  readSheet,
  updateRow,
  updateRows,
} from "./repository";
import { deleteAnexo, deleteTripFolder } from "./anexos";
import { listAgendaByTrip } from "./agenda";
import { TripDayRow, TripRow, UserRow, UserTripRow } from "./types";

export async function listAllTrips(): Promise<TripRow[]> {
  return readSheet<TripRow>("Trips");
}

export async function listTripIdsForUser(userId: string): Promise<Set<string>> {
  const links = await readSheet<UserTripRow>("UserTrip");
  return new Set(links.filter((l) => l.user_id === userId).map((l) => l.trip_id));
}

export async function listTripsForUser(
  userId: string,
  role: "admin" | "user"
): Promise<TripRow[]> {
  const trips = await listAllTrips();
  if (role === "admin") return trips;
  const allowed = await listTripIdsForUser(userId);
  return trips.filter((t) => allowed.has(t.id));
}

export async function userCanAccessTrip(
  userId: string,
  role: "admin" | "user",
  tripId: string
): Promise<boolean> {
  if (role === "admin") return true;
  const allowed = await listTripIdsForUser(userId);
  return allowed.has(tripId);
}

export async function getTrip(id: string): Promise<TripRow | null> {
  return findRowById<TripRow>("Trips", id);
}

export async function createTrip(input: {
  id?: string;
  nome: string;
  data_inicio: string;
  qtd_dias: number;
  qtd_pessoas: number;
  criado_por: string;
  cidade_origem?: string;
  cidade_origem_lat?: string;
  cidade_origem_lon?: string;
  capa_url?: string;
  custo_modo?: "por_pessoa" | "total";
  /** Ids dos dias já gerados no cliente (modo offline) - reaproveitados aqui em vez de gerar
   * ids novos, senão o cliente e o servidor acabam criando duas linhas por dia (uma com o id
   * local, outra com o id gerado agora), duplicando a grade de diárias quando a sincronização
   * puxa os dias do servidor de volta pro IndexedDB. */
  dayIds?: string[];
}): Promise<TripRow> {
  const days = sequentialDates(input.data_inicio, input.qtd_dias);
  const trip: TripRow = {
    id: input.id || uuid(),
    nome: input.nome,
    data_inicio: input.data_inicio,
    // Não é mais um campo digitado à parte - sempre o último dia gerado, derivado da
    // quantidade de dias (ver comentário em TripRow, types.ts).
    data_fim: days[days.length - 1],
    qtd_pessoas: String(input.qtd_pessoas),
    criado_por: input.criado_por,
    criado_em: new Date().toISOString(),
    cidade_origem: input.cidade_origem ?? "",
    cidade_origem_lat: input.cidade_origem_lat ?? "",
    cidade_origem_lon: input.cidade_origem_lon ?? "",
    capa_url: input.capa_url ?? "",
    custo_modo: input.custo_modo ?? "por_pessoa",
  };

  const dayIds = input.dayIds && input.dayIds.length === days.length ? input.dayIds : null;
  const dayRows: TripDayRow[] = days.map((data, i) => ({
    id: dayIds ? dayIds[i] : uuid(),
    trip_id: trip.id,
    data,
    origem: "",
    destino: "",
    pernoite: "",
    traslado_pp: "0",
    passagem_pp: "0",
    alimentacao_pp: "0",
    passeio_pp: "0",
    hospedagem_pp: "0",
    temp_min: "",
    temp_max: "",
    origem_lat: "",
    origem_lon: "",
    destino_lat: "",
    destino_lon: "",
    pernoite_lat: "",
    pernoite_lon: "",
    origem_pais: "",
    destino_pais: "",
    pernoite_pais: "",
  }));

  await appendRows("Trips", [trip]);
  await appendRows("TripDays", dayRows);

  return trip;
}

export async function updateTrip(
  id: string,
  patch: {
    cidade_origem?: string;
    cidade_origem_lat?: string;
    cidade_origem_lon?: string;
    capa_url?: string;
    custo_modo?: "por_pessoa" | "total";
  }
): Promise<void> {
  await updateRow("Trips", id, patch);
}

export interface DeleteTripResult {
  /** false quando a pasta de anexos no Drive não pôde ser removida - a viagem em si foi
   * excluída de qualquer forma; ver o porquê da ordem em `deleteTrip`. */
  anexosRemovidos: boolean;
  avisoAnexos?: string;
}

/**
 * Exclui a viagem e faz cascade em tudo que depende dela: diárias, despesas, receitas, agenda,
 * vínculos de acesso (UserTrip) e a pasta de anexos no Drive (que já cobre os anexos avulsos e
 * os da agenda, todos na mesma pasta da viagem).
 *
 * A ordem aqui importa e não é acidental. A planilha vem primeiro (linhas dependentes, depois a
 * própria viagem) e só no fim, isolada num try/catch, a pasta do Drive. Antes as duas coisas
 * saíam juntas num `Promise.all` com a exclusão da viagem depois: quando a chamada do Drive
 * falhava - o que acontece se o Apps Script não tiver o escopo de autorização do Drive -, a
 * rejeição pulava o `deleteRow("Trips")` **depois** de as diárias/despesas/receitas já terem
 * sido apagadas, deixando a viagem meio-excluída (ainda na lista, porém vazia).
 *
 * Remover os anexos é desejável, mas não é motivo para bloquear a exclusão: quem pediu para
 * excluir a viagem quer a viagem fora, e uma pasta órfã no Drive é reportada para quem chamou
 * em vez de virar um erro que desfaz nada.
 */
export async function deleteTrip(tripId: string): Promise<DeleteTripResult> {
  const trip = await getTrip(tripId);

  await Promise.all([
    deleteRowsByField("TripDays", "trip_id", tripId),
    deleteRowsByField("Despesas", "trip_id", tripId),
    deleteRowsByField("Receitas", "trip_id", tripId),
    deleteRowsByField("UserTrip", "trip_id", tripId),
    deleteRowsByField("Agenda", "trip_id", tripId),
  ]);

  await deleteRow("Trips", tripId);

  if (!trip) return { anexosRemovidos: false };

  try {
    await deleteTripFolder(tripId, trip.nome);
    return { anexosRemovidos: true };
  } catch (err) {
    return {
      anexosRemovidos: false,
      avisoAnexos: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listTripDays(tripId: string): Promise<TripDayRow[]> {
  const days = await readSheet<TripDayRow>("TripDays");
  return days
    .filter((d) => d.trip_id === tripId)
    .sort((a, b) => a.data.localeCompare(b.data));
}

export const DAY_COST_FIELDS = [
  "traslado_pp",
  "passagem_pp",
  "alimentacao_pp",
  "passeio_pp",
  "hospedagem_pp",
] as const;

export type DayCostField = (typeof DAY_COST_FIELDS)[number];

export const DAY_TEXT_FIELDS = ["origem", "destino", "pernoite"] as const;

export type DayTextField = (typeof DAY_TEXT_FIELDS)[number];

export const DAY_EDITABLE_FIELDS = [...DAY_COST_FIELDS, ...DAY_TEXT_FIELDS] as const;

export type DayEditableField = (typeof DAY_EDITABLE_FIELDS)[number];

/** Campos preenchidos automaticamente pelo app (busca de temperatura), não pelo usuário digitando
 * na grade - mas gravados pelo mesmo endpoint de "salvar dias", por isso entram na whitelist de
 * patch abaixo junto com os campos editáveis de verdade. */
export const DAY_AUTO_FIELDS = ["temp_min", "temp_max"] as const;

export type DayAutoField = (typeof DAY_AUTO_FIELDS)[number];

/** Coordenadas + país dos campos de cidade (origem/destino/pernoite) - preenchidos junto quando
 * o autocomplete de cidade grava uma escolha, não digitados diretamente pelo usuário. Faltavam
 * os `_pais` aqui quando esse campo foi adicionado - a whitelist descartava silenciosamente o
 * país antes de chegar na planilha, mesmo com o Apps Script já implantado (bug de código, não
 * de deploy pendente). */
export const DAY_GEO_FIELDS = [
  "origem_lat",
  "origem_lon",
  "destino_lat",
  "destino_lon",
  "pernoite_lat",
  "pernoite_lon",
  "origem_pais",
  "destino_pais",
  "pernoite_pais",
] as const;

export type DayGeoField = (typeof DAY_GEO_FIELDS)[number];

export const DAY_PATCHABLE_FIELDS = [
  ...DAY_EDITABLE_FIELDS,
  ...DAY_AUTO_FIELDS,
  ...DAY_GEO_FIELDS,
] as const;

export type DayPatchableField = (typeof DAY_PATCHABLE_FIELDS)[number];

/**
 * Grava de uma vez só (uma única chamada ao Apps Script) os campos de vários dias - usado tanto
 * pelo botão "Salvar" da tela de diárias (campos editáveis) quanto pela busca de temperatura, que
 * grava sozinha assim que a busca termina, sem esperar o usuário clicar em "Salvar".
 * Ignora silenciosamente ids que não pertencem à viagem informada.
 */
export async function saveTripDays(
  tripId: string,
  rows: Array<{ id: string } & Partial<Record<DayPatchableField, string>>>
): Promise<void> {
  const days = await listTripDays(tripId);
  const validIds = new Set(days.map((d) => d.id));

  const updates = rows
    .filter((r) => validIds.has(r.id))
    .map((r) => {
      const patch: Record<string, string> = {};
      for (const field of DAY_PATCHABLE_FIELDS) {
        if (r[field] !== undefined) patch[field] = r[field] as string;
      }
      return { id: r.id, patch };
    })
    .filter((u) => Object.keys(u.patch).length > 0);

  if (!updates.length) return;
  await updateRows("TripDays", updates);
}

/**
 * Muda a data de início da viagem, deslocando TODOS os dias da grade (e os compromissos da
 * Agenda que caem em alguma dessas datas) pela mesma diferença de dias - a duração da viagem
 * (quantidade de dias) não muda, só desliza no calendário inteira. `data_fim` da viagem é
 * recalculado junto (mesmo delta). Não mexe em Despesas/Receitas - são um livro-caixa
 * independente da grade de dias, não "pertencem" a um dia específico como a Agenda.
 */
export async function changeTripStartDate(tripId: string, novaDataInicio: string): Promise<void> {
  const trip = await findRowById<TripRow>("Trips", tripId);
  if (!trip) throw new Error("Viagem não encontrada");
  const delta = diffDays(novaDataInicio, trip.data_inicio);
  if (delta === 0) return;

  const days = await listTripDays(tripId);
  const mapaDatas = new Map<string, string>();
  const updatesDias = days.map((d) => {
    const novaData = addDays(d.data, delta);
    mapaDatas.set(d.data, novaData);
    return { id: d.id, patch: { data: novaData } };
  });
  if (updatesDias.length) await updateRows("TripDays", updatesDias);

  const agenda = await listAgendaByTrip(tripId);
  const updatesAgenda = agenda
    .filter((a) => mapaDatas.has(a.data))
    .map((a) => ({ id: a.id, patch: { data: mapaDatas.get(a.data)! } }));
  if (updatesAgenda.length) await updateRows("Agenda", updatesAgenda);

  await updateRow("Trips", tripId, {
    data_inicio: novaDataInicio,
    data_fim: addDays(trip.data_fim, delta),
  });
}

/**
 * Insere um dia em branco na grade, na posição logo depois de `afterDayId` (ou no início da
 * viagem, se `afterDayId` for null) - único lugar onde a duração da viagem pode crescer (ver
 * changeTripStartDate, que só desliza, não estica). Todos os dias que ficam depois do ponto de
 * inserção (e os compromissos da Agenda cravados nas datas deles) deslocam 1 dia pra frente,
 * pra grade continuar sequencial sem furo a partir de `data_inicio`. `data_fim` da viagem cresce
 * junto.
 */
export async function insertTripDay(tripId: string, afterDayId: string | null): Promise<void> {
  const trip = await findRowById<TripRow>("Trips", tripId);
  if (!trip) throw new Error("Viagem não encontrada");
  const days = await listTripDays(tripId); // já vem ordenado por data

  let insertIndex = 0;
  if (afterDayId) {
    const idx = days.findIndex((d) => d.id === afterDayId);
    if (idx === -1) throw new Error("Dia de referência não encontrado");
    insertIndex = idx + 1;
  }

  const novoId = uuid();
  const novoDia: TripDayRow = {
    id: novoId,
    trip_id: tripId,
    data: "",
    origem: "",
    destino: "",
    pernoite: "",
    traslado_pp: "0",
    passagem_pp: "0",
    alimentacao_pp: "0",
    passeio_pp: "0",
    hospedagem_pp: "0",
    temp_min: "",
    temp_max: "",
    origem_lat: "",
    origem_lon: "",
    destino_lat: "",
    destino_lon: "",
    pernoite_lat: "",
    pernoite_lon: "",
    origem_pais: "",
    destino_pais: "",
    pernoite_pais: "",
  };

  const ordenados: TripDayRow[] = [...days];
  ordenados.splice(insertIndex, 0, novoDia);
  const novasDatas = sequentialDates(trip.data_inicio, ordenados.length);

  const mapaDatas = new Map<string, string>();
  const updatesDias: { id: string; patch: Record<string, string> }[] = [];
  ordenados.forEach((d, i) => {
    const novaData = novasDatas[i];
    if (d.id === novoId) {
      novoDia.data = novaData;
      return;
    }
    if (d.data !== novaData) {
      mapaDatas.set(d.data, novaData);
      updatesDias.push({ id: d.id, patch: { data: novaData } });
    }
  });

  await appendRows("TripDays", [novoDia]);
  if (updatesDias.length) await updateRows("TripDays", updatesDias);

  if (mapaDatas.size) {
    const agenda = await listAgendaByTrip(tripId);
    const updatesAgenda = agenda
      .filter((a) => mapaDatas.has(a.data))
      .map((a) => ({ id: a.id, patch: { data: mapaDatas.get(a.data)! } }));
    if (updatesAgenda.length) await updateRows("Agenda", updatesAgenda);
  }

  await updateRow("Trips", tripId, { data_fim: novasDatas[novasDatas.length - 1] });
}

/**
 * Remove um dia da grade - único lugar onde a duração da viagem pode encolher. Os dias
 * seguintes ao removido (e os compromissos da Agenda cravados nas datas deles) deslocam 1 dia
 * pra trás, fechando o buraco - a grade continua sequencial a partir de `data_inicio`, sem furo.
 * Compromissos da Agenda cravados exatamente na data do dia removido não têm mais nenhum dia da
 * grade pra "pertencer" - são apagados junto (com o anexo no Drive, best-effort), não ficam
 * órfãos escondidos na planilha. `data_fim` da viagem encolhe junto.
 */
export async function deleteTripDay(tripId: string, dayId: string): Promise<void> {
  const trip = await findRowById<TripRow>("Trips", tripId);
  if (!trip) throw new Error("Viagem não encontrada");
  const days = await listTripDays(tripId);
  const alvo = days.find((d) => d.id === dayId);
  if (!alvo) throw new Error("Dia não encontrado");
  if (days.length <= 1) throw new Error("A viagem precisa ter pelo menos 1 dia");

  const restantes = days.filter((d) => d.id !== dayId);
  const novasDatas = sequentialDates(trip.data_inicio, restantes.length);

  const mapaDatas = new Map<string, string>();
  const updatesDias: { id: string; patch: Record<string, string> }[] = [];
  restantes.forEach((d, i) => {
    const novaData = novasDatas[i];
    if (d.data !== novaData) {
      mapaDatas.set(d.data, novaData);
      updatesDias.push({ id: d.id, patch: { data: novaData } });
    }
  });

  const agenda = await listAgendaByTrip(tripId);
  const doDiaExcluido = agenda.filter((a) => a.data === alvo.data);
  const paraDeslocar = agenda.filter((a) => mapaDatas.has(a.data));

  for (const item of doDiaExcluido) {
    if (item.anexo_file_id) {
      try {
        await deleteAnexo(item.anexo_file_id);
      } catch {
        // best-effort - a limpeza do anexo não pode travar a exclusão do dia em si
      }
    }
    await deleteRow("Agenda", item.id);
  }
  if (paraDeslocar.length) {
    await updateRows(
      "Agenda",
      paraDeslocar.map((a) => ({ id: a.id, patch: { data: mapaDatas.get(a.data)! } }))
    );
  }

  await deleteRow("TripDays", dayId);
  if (updatesDias.length) await updateRows("TripDays", updatesDias);

  await updateRow("Trips", tripId, {
    data_fim: novasDatas[novasDatas.length - 1] ?? trip.data_inicio,
  });
}

export async function linkUserToTrip(userId: string, tripId: string): Promise<void> {
  const links = await readSheet<UserTripRow>("UserTrip");
  const already = links.some((l) => l.user_id === userId && l.trip_id === tripId);
  if (already) return;

  await appendRows("UserTrip", [{ id: uuid(), user_id: userId, trip_id: tripId }]);
}

export async function unlinkUserFromTrip(userId: string, tripId: string): Promise<void> {
  const links = await readSheet<UserTripRow>("UserTrip");
  const link = links.find((l) => l.user_id === userId && l.trip_id === tripId);
  if (!link) return;

  await deleteRow("UserTrip", link.id);
}

export async function listTripCollaborators(tripId: string): Promise<UserTripRow[]> {
  const links = await readSheet<UserTripRow>("UserTrip");
  return links.filter((l) => l.trip_id === tripId);
}

/**
 * Usuários com acesso à viagem, com nome (pro dropdown de "Pagador" em Despesas) - sempre inclui
 * `currentUserId`, mesmo sem vínculo explícito em UserTrip: cobre o caso comum do admin/criador
 * da viagem nunca ter se auto-vinculado, o que deixaria o dropdown vazio pra quem mais usa.
 */
export async function listTripCollaboratorsWithNames(
  tripId: string,
  currentUserId: string
): Promise<{ id: string; nome: string }[]> {
  const [links, users] = await Promise.all([listTripCollaborators(tripId), readSheet<UserRow>("Users")]);
  const userIds = new Set(links.map((l) => l.user_id));
  userIds.add(currentUserId);

  return users
    .filter((u) => userIds.has(u.id))
    .map((u) => ({ id: u.id, nome: u.nome }));
}
