import { v4 as uuid } from "uuid";
import { appendRows, findRowById, readSheet, updateRow, updateRows } from "./repository";
import { TripDayRow, TripRow, UserTripRow } from "./types";

function toDateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = toDateOnly(start);
  const last = toDateOnly(end);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

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
  nome: string;
  data_inicio: string;
  data_fim: string;
  qtd_pessoas: number;
  criado_por: string;
}): Promise<TripRow> {
  const trip: TripRow = {
    id: uuid(),
    nome: input.nome,
    data_inicio: input.data_inicio,
    data_fim: input.data_fim,
    qtd_pessoas: String(input.qtd_pessoas),
    criado_por: input.criado_por,
    criado_em: new Date().toISOString(),
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
  }));

  await appendRows("Trips", [trip]);
  await appendRows("TripDays", dayRows);

  return trip;
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

export async function updateTripDay(
  dayId: string,
  patch: Partial<Record<DayCostField, number>> & Partial<Record<DayTextField, string>>
): Promise<void> {
  const stringPatch: Record<string, string> = {};
  for (const field of DAY_COST_FIELDS) {
    if (patch[field] !== undefined) {
      stringPatch[field] = String(patch[field]);
    }
  }
  for (const field of DAY_TEXT_FIELDS) {
    if (patch[field] !== undefined) {
      stringPatch[field] = patch[field] as string;
    }
  }
  await updateRow("TripDays", dayId, stringPatch);
}

export type ReplicateScope = "all" | "down";

/**
 * Copia um único campo (a coluna onde o cursor estava) para os demais dias, usando o valor
 * informado pelo cliente (não o que já está salvo na planilha) — evita usar um valor
 * desatualizado quando o usuário replica antes do campo ter salvo individualmente.
 * scope "all" atinge todos os dias da viagem; "down" só os dias a partir do dia de origem
 * (inclusive), na ordem cronológica.
 */
export async function replicateTripDayField(
  tripId: string,
  sourceDayId: string,
  field: DayEditableField,
  value: string,
  scope: ReplicateScope = "all"
): Promise<void> {
  const days = await listTripDays(tripId);
  const sourceIndex = days.findIndex((d) => d.id === sourceDayId);
  if (sourceIndex === -1) throw new Error("Dia de origem não encontrado");

  const targets = scope === "down" ? days.slice(sourceIndex) : days;
  const updates = targets.map((d) => ({ id: d.id, patch: { [field]: value } }));
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
