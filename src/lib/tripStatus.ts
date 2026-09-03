/**
 * Status de uma viagem - deriva do campo `status` da aba Trips (coluna nova) e da data de
 * término. Módulo puro (sem `next`), usado tanto no cliente quanto nas rotas.
 *
 * O campo `status` vazio significa "automático": uma viagem cujo último dia já passou aparece
 * como "concluida", e uma que ainda não terminou aparece como "planejada". Qualquer valor
 * explícito vence o automático - inclusive marcar "planejada" numa viagem já passada, que é a
 * forma de reabrir para edição uma viagem que o automático havia concluído.
 *
 * Viagem "concluida" ou "cancelada" fica bloqueada para edição em todo o app (só o próprio campo
 * status continua editável) - ver `viagemBloqueada` e `tripLockError` em `lib/api-helpers.ts`.
 */

export type TripStatus = "planejada" | "concluida" | "cancelada";

export const TRIP_STATUS_OPTIONS: { value: TripStatus; label: string }[] = [
  { value: "planejada", label: "Planejada" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
];

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  planejada: "Planejada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

/** Classes Tailwind do badge de status (claro/escuro) - reaproveitado no card da lista, no
 * cabeçalho da viagem e na tela Editar. */
export const TRIP_STATUS_BADGE: Record<TripStatus, string> = {
  planejada:
    "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  concluida:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  cancelada:
    "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

interface TripStatusInput {
  status?: string | null;
  data_fim: string;
}

function ehStatusExplicito(v: unknown): v is TripStatus {
  return v === "planejada" || v === "concluida" || v === "cancelada";
}

/** Data de hoje no formato yyyy-MM-dd, no fuso local do aparelho/servidor - mesma granularidade
 * das datas da planilha, que são sempre "data pura" sem horário. */
function hojeISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Status efetivo da viagem (nunca vazio). */
export function statusViagem(trip: TripStatusInput): TripStatus {
  if (ehStatusExplicito(trip.status)) return trip.status;
  const fim = (trip.data_fim ?? "").slice(0, 10);
  // Último dia já passou (data_fim < hoje) => concluída. O próprio dia do término ainda conta
  // como viagem em andamento.
  return fim && fim < hojeISO() ? "concluida" : "planejada";
}

/** Viagem concluída ou cancelada - edição bloqueada em todo o app, exceto o campo status. */
export function viagemBloqueada(trip: TripStatusInput): boolean {
  const s = statusViagem(trip);
  return s === "concluida" || s === "cancelada";
}
