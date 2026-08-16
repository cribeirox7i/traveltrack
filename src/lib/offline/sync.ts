import { v4 as uuid } from "uuid";
import { enumerateDates } from "../dateRange";
import {
  DataTab,
  OutboxEntry,
  enqueueOutbox,
  listOutbox,
  putAll,
  putOne,
  removeOutboxEntry,
  updateOutboxEntry,
} from "./db";

/** Disparado sempre que dados locais ou a fila de sincronização mudam, pra hooks de UI se atualizarem. */
export const syncEvents = new EventTarget();

function notifyChange() {
  syncEvents.dispatchEvent(new Event("change"));
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Atualiza a lista de viagens do cache local a partir do servidor. */
export async function pullTrips(): Promise<void> {
  if (!isOnline()) return;
  const trips = await getJson<Record<string, unknown>[]>("/api/trips");
  if (trips) {
    await putAll("trips", trips as never);
    notifyChange();
  }
}

/** Atualiza dias/despesas/receitas de UMA viagem no cache local — chamado ao abrir a viagem. */
export async function pullTripDetail(tripId: string): Promise<void> {
  if (!isOnline()) return;
  const [days, despesas, receitas] = await Promise.all([
    getJson<Record<string, unknown>[]>(`/api/trips/${tripId}/days`),
    getJson<Record<string, unknown>[]>(`/api/trips/${tripId}/despesas`),
    getJson<Record<string, unknown>[]>(`/api/trips/${tripId}/receitas`),
  ]);
  if (days) await putAll("tripDays", days as never);
  if (despesas) await putAll("despesas", despesas as never);
  if (receitas) await putAll("receitas", receitas as never);
  notifyChange();
}

let pushing = false;

/** Reenvia a fila de mutações pendentes contra os endpoints /api/* já existentes, em ordem. */
export async function pushOutbox(): Promise<void> {
  if (pushing || !isOnline()) return;
  pushing = true;
  try {
    const entries = await listOutbox();
    for (const entry of entries) {
      const result = await sendOutboxEntry(entry);
      if (result === "network-error") break; // provavelmente caiu a conexão de novo — para e tenta depois
      if (result === "ok") {
        await removeOutboxEntry(entry.localId);
      } else {
        await updateOutboxEntry({
          ...entry,
          attempts: entry.attempts + 1,
          lastError: result,
        });
      }
      notifyChange();
    }
  } finally {
    pushing = false;
  }
}

async function sendOutboxEntry(entry: OutboxEntry): Promise<"ok" | "network-error" | string> {
  try {
    let res: Response;
    switch (entry.kind) {
      case "createTrip":
        res = await fetch("/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.payload),
        });
        break;
      case "createDespesa":
        res = await fetch(`/api/trips/${entry.tripId}/despesas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.payload),
        });
        break;
      case "createReceita":
        res = await fetch(`/api/trips/${entry.tripId}/receitas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.payload),
        });
        break;
      case "saveDays":
        res = await fetch(`/api/trips/${entry.tripId}/days`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.payload),
        });
        break;
      default:
        return "Ação desconhecida na fila";
    }

    if (res.ok) return "ok";
    // Erro real do servidor (validação, acesso, etc.) — não é falta de sinal, não trava a fila.
    const data = await res.json().catch(() => ({}));
    return data.error ?? `Erro ${res.status}`;
  } catch {
    return "network-error";
  }
}

// ---------- Ações otimistas usadas pelas telas (grava local + enfileira + tenta sincronizar) ----------

export async function createTripOffline(input: {
  nome: string;
  data_inicio: string;
  data_fim: string;
  qtd_pessoas: number;
}): Promise<string> {
  const id = uuid();
  const trip = {
    id,
    nome: input.nome,
    data_inicio: input.data_inicio,
    data_fim: input.data_fim,
    qtd_pessoas: String(input.qtd_pessoas),
    criado_por: "",
    criado_em: new Date().toISOString(),
  };
  await putOne("trips", trip);

  const days = enumerateDates(input.data_inicio, input.data_fim).map((data) => ({
    id: uuid(),
    trip_id: id,
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
  await putAll("tripDays", days);

  await enqueueOutbox({ localId: uuid(), kind: "createTrip", payload: { id, ...input } });
  notifyChange();
  void pushOutbox();
  return id;
}

export async function createDespesaOffline(
  tripId: string,
  input: { categoria: string; valor: number; data: string; descricao: string }
): Promise<void> {
  const id = uuid();
  await putOne("despesas", { id, trip_id: tripId, lancado_por: "", ...input, valor: String(input.valor) });
  await enqueueOutbox({
    localId: uuid(),
    kind: "createDespesa",
    tripId,
    payload: { id, ...input },
  });
  notifyChange();
  void pushOutbox();
}

export async function createReceitaOffline(
  tripId: string,
  input: { valor: number; data: string; descricao: string }
): Promise<void> {
  const id = uuid();
  await putOne("receitas", { id, trip_id: tripId, user_id: "", ...input, valor: String(input.valor) });
  await enqueueOutbox({
    localId: uuid(),
    kind: "createReceita",
    tripId,
    payload: { id, ...input },
  });
  notifyChange();
  void pushOutbox();
}

export interface DayPatch {
  id: string;
  [field: string]: string;
}

export async function saveDaysOffline(tripId: string, days: DayPatch[]): Promise<void> {
  await putAll(
    "tripDays",
    days.map((d) => ({ ...d, trip_id: tripId }))
  );
  await enqueueOutbox({ localId: uuid(), kind: "saveDays", tripId, payload: { days } });
  notifyChange();
  void pushOutbox();
}

// ---------- Ciclo de vida ----------

let initialized = false;

/** Chamar uma vez no boot do app (client-side). Sincroniza ao voltar a ficar online, ao focar a aba e periodicamente. */
export function initSync(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("online", () => {
    pullTrips().catch(() => {});
    pushOutbox().catch(() => {});
    notifyChange();
  });
  window.addEventListener("offline", notifyChange);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isOnline()) {
      pushOutbox().catch(() => {});
    }
  });
  setInterval(() => {
    if (isOnline()) pushOutbox().catch(() => {});
  }, 60_000);

  if (isOnline()) {
    pullTrips().catch(() => {});
    pushOutbox().catch(() => {});
  }
}

export type { DataTab };
