import { v4 as uuid } from "uuid";
import { enumerateDates } from "../dateRange";
import { appendRows, findRowById, readSheet, updateRow, updateRows } from "./repository";
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
  data_fim: string;
  qtd_pessoas: number;
  criado_por: string;
  cidade_origem?: string;
  cidade_origem_lat?: string;
  cidade_origem_lon?: string;
}): Promise<TripRow> {
  const trip: TripRow = {
    id: input.id || uuid(),
    nome: input.nome,
    data_inicio: input.data_inicio,
    data_fim: input.data_fim,
    qtd_pessoas: String(input.qtd_pessoas),
    criado_por: input.criado_por,
    criado_em: new Date().toISOString(),
    cidade_origem: input.cidade_origem ?? "",
    cidade_origem_lat: input.cidade_origem_lat ?? "",
    cidade_origem_lon: input.cidade_origem_lon ?? "",
  };

  const days = enumerateDates(input.data_inicio, input.data_fim);
  const dayRows: TripDayRow[] = days.map((data) => ({
    id: uuid(),
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
  }));

  await appendRows("Trips", [trip]);
  await appendRows("TripDays", dayRows);

  return trip;
}

export async function updateTrip(
  id: string,
  patch: { cidade_origem?: string; cidade_origem_lat?: string; cidade_origem_lon?: string }
): Promise<void> {
  await updateRow("Trips", id, patch);
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
 * na grade — mas gravados pelo mesmo endpoint de "salvar dias", por isso entram na whitelist de
 * patch abaixo junto com os campos editáveis de verdade. */
export const DAY_AUTO_FIELDS = ["temp_min", "temp_max"] as const;

export type DayAutoField = (typeof DAY_AUTO_FIELDS)[number];

/** Coordenadas dos campos de cidade (origem/destino/pernoite) — preenchidas junto quando o
 * autocomplete de cidade grava uma escolha, não digitadas diretamente pelo usuário. */
export const DAY_GEO_FIELDS = [
  "origem_lat",
  "origem_lon",
  "destino_lat",
  "destino_lon",
  "pernoite_lat",
  "pernoite_lon",
] as const;

export type DayGeoField = (typeof DAY_GEO_FIELDS)[number];

export const DAY_PATCHABLE_FIELDS = [
  ...DAY_EDITABLE_FIELDS,
  ...DAY_AUTO_FIELDS,
  ...DAY_GEO_FIELDS,
] as const;

export type DayPatchableField = (typeof DAY_PATCHABLE_FIELDS)[number];

/**
 * Grava de uma vez só (uma única chamada ao Apps Script) os campos de vários dias — usado tanto
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

export async function linkUserToTrip(userId: string, tripId: string): Promise<void> {
  const links = await readSheet<UserTripRow>("UserTrip");
  const already = links.some((l) => l.user_id === userId && l.trip_id === tripId);
  if (already) return;

  await appendRows("UserTrip", [{ id: uuid(), user_id: userId, trip_id: tripId }]);
}

export async function listTripCollaborators(tripId: string): Promise<UserTripRow[]> {
  const links = await readSheet<UserTripRow>("UserTrip");
  return links.filter((l) => l.trip_id === tripId);
}

/**
 * Usuários com acesso à viagem, com nome (pro dropdown de "Pagador" em Despesas) — sempre inclui
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
