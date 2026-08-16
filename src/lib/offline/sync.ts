import { v4 as uuid } from "uuid";
import { enumerateDates } from "../dateRange";
import {
  OutboxEntry,
  deleteByTrip,
  deleteMany,
  enqueueOutbox,
  getMeta,
  listAnexoFilesByTrip,
  listByTrip,
  listOutbox,
  putAll,
  putAnexoFile,
  putOne,
  removeOutboxEntry,
  setMeta,
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

async function getBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.blob();
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

// ---------- "Dados offline" — download completo por viagem, incluindo anexos ----------

const OFFLINE_TRIPS_KEY = "offlineTripIds";

export async function listOfflineTripIds(): Promise<string[]> {
  const ids = await getMeta(OFFLINE_TRIPS_KEY);
  return Array.isArray(ids) ? (ids as string[]) : [];
}

export async function isTripOffline(tripId: string): Promise<boolean> {
  return (await listOfflineTripIds()).includes(tripId);
}

interface AnexoInfoLike {
  fileId: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  categoria: string;
  criadoEm: string;
}

const downloading = new Set<string>();

/** Atualiza só os metadados da lista de anexos (sem baixar os arquivos) — usado pela tela de
 * Anexos pra qualquer viagem, marcada offline ou não. O download dos arquivos em si só acontece
 * via `downloadTripFull`, quando a viagem está marcada. */
export async function pullAnexosList(tripId: string): Promise<void> {
  if (!isOnline()) return;
  const anexos = await getJson<AnexoInfoLike[]>(`/api/trips/${tripId}/anexos`);
  if (!anexos) return;
  await putAll(
    "anexos",
    anexos.map((a) => ({ ...a, id: a.fileId, trip_id: tripId }))
  );
  notifyChange();
}

/** Baixa por completo uma viagem — dias/despesas/receitas + os ARQUIVOS dos anexos (não só o
 * link do Drive) — pro cache local. Chamado ao marcar "Dados offline" e, depois, sempre que algo
 * daquela viagem muda (edição local, sincronização, ou no ciclo periódico/ao voltar o sinal). */
export async function downloadTripFull(tripId: string): Promise<void> {
  if (!isOnline() || downloading.has(tripId)) return;
  downloading.add(tripId);
  try {
    await pullTripDetail(tripId);

    const anexos = await getJson<AnexoInfoLike[]>(`/api/trips/${tripId}/anexos`);
    if (!anexos) return;

    const existingMeta = await listByTrip("anexos", tripId);
    const existingFiles = await listAnexoFilesByTrip(tripId);
    const currentIds = new Set(anexos.map((a) => a.fileId));

    await putAll(
      "anexos",
      anexos.map((a) => ({ ...a, id: a.fileId, trip_id: tripId }))
    );

    const staleMetaIds = existingMeta.filter((m) => !currentIds.has(m.id)).map((m) => m.id);
    await deleteMany("anexos", staleMetaIds);

    const staleFileIds = existingFiles
      .filter((f) => !currentIds.has(f.fileId))
      .map((f) => f.fileId);
    await deleteMany("anexoFiles", staleFileIds);

    const existingFileIds = new Set(existingFiles.map((f) => f.fileId));
    const toDownload = anexos.filter((a) => !existingFileIds.has(a.fileId));
    for (const anexo of toDownload) {
      const blob = await getBlob(`/api/trips/${tripId}/anexos/${anexo.fileId}`);
      if (!blob) continue;
      await putAnexoFile({
        fileId: anexo.fileId,
        trip_id: tripId,
        name: anexo.name,
        mimeType: anexo.mimeType,
        blob,
      });
      notifyChange();
    }

    notifyChange();
  } finally {
    downloading.delete(tripId);
  }
}

async function refreshIfOffline(tripId: string): Promise<void> {
  if (await isTripOffline(tripId)) void downloadTripFull(tripId);
}

/** Liga/desliga "Dados offline" pra uma viagem. Ligar baixa tudo (incl. anexos) na hora; desligar
 * apaga os anexos baixados daquele aparelho e para de atualizar sozinho. */
export async function setTripOffline(tripId: string, enabled: boolean): Promise<void> {
  const ids = new Set(await listOfflineTripIds());
  if (enabled) {
    ids.add(tripId);
    await setMeta(OFFLINE_TRIPS_KEY, Array.from(ids));
    notifyChange();
    if (typeof navigator !== "undefined") {
      navigator.storage?.persist?.().catch(() => {});
    }
    await downloadTripFull(tripId);
  } else {
    ids.delete(tripId);
    await setMeta(OFFLINE_TRIPS_KEY, Array.from(ids));
    await deleteByTrip("anexos", tripId);
    await deleteByTrip("anexoFiles", tripId);
    notifyChange();
  }
}

async function refreshAllOfflineTrips(): Promise<void> {
  for (const tripId of await listOfflineTripIds()) {
    await downloadTripFull(tripId);
  }
}

// ---------- Anexos (upload/exclusão continuam exigindo internet — só o cache é offline) ----------

export async function uploadAnexoAndRefresh(
  tripId: string,
  form: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`/api/trips/${tripId}/anexos`, { method: "POST", body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? "Erro ao enviar anexo" };
  }
  await refreshIfOffline(tripId);
  notifyChange();
  return { ok: true };
}

export async function deleteAnexoAndRefresh(tripId: string, fileId: string): Promise<void> {
  await fetch(`/api/trips/${tripId}/anexos/${fileId}`, { method: "DELETE" });
  await deleteMany("anexos", [fileId]);
  await deleteMany("anexoFiles", [fileId]);
  await refreshIfOffline(tripId);
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
        if (entry.tripId) await refreshIfOffline(entry.tripId);
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
    refreshAllOfflineTrips().catch(() => {});
    notifyChange();
  });
  window.addEventListener("offline", notifyChange);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isOnline()) {
      pushOutbox().catch(() => {});
    }
  });
  setInterval(() => {
    if (isOnline()) {
      pushOutbox().catch(() => {});
      refreshAllOfflineTrips().catch(() => {});
    }
  }, 60_000);

  if (isOnline()) {
    pullTrips().catch(() => {});
    pushOutbox().catch(() => {});
    refreshAllOfflineTrips().catch(() => {});
  }
}

export type { DataTab } from "./db";
