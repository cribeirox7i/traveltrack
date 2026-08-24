import { v4 as uuid } from "uuid";
import { enumerateDates } from "../dateRange";
import { TRIP_TAB_SLUGS } from "../tripTabs";
import {
  OutboxEntry,
  deleteByTrip,
  deleteMany,
  deleteOne,
  enqueueOutbox,
  getMeta,
  getOne,
  listAnexoFilesByTrip,
  listByTrip,
  listOutbox,
  putAll,
  putAllReplacing,
  putAnexoFile,
  putOne,
  removeOutboxByTrip,
  removeOutboxEntry,
  setMeta,
  updateOutboxEntry,
} from "./db";

/** Disparado sempre que dados locais ou a fila de sincronização mudam, pra hooks de UI se atualizarem. */
export const syncEvents = new EventTarget();

function notifyChange() {
  syncEvents.dispatchEvent(new Event("change"));
}

/** Campos de texto de um compromisso da Agenda - o `file` (quando existe) fica fora, guardado à
 * parte no payload do outbox (ver `createAgendaOffline`), porque aqui ele vira `String(value)`
 * ao montar o FormData de reenvio. */
interface AgendaPayload {
  id: string;
  data: string;
  horario: string;
  titulo: string;
  descricao: string;
  url: string;
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

/** Ids de linhas ainda não sincronizadas - protege `putAllReplacing` de apagar uma criação que
 * está na fila mas o servidor ainda não viu. */
async function pendingCreateIds(
  kind: OutboxEntry["kind"],
  tripId?: string
): Promise<Set<string>> {
  const entries = await listOutbox();
  return new Set(
    entries
      .filter((e) => e.kind === kind && (tripId === undefined || e.tripId === tripId))
      .map((e) => (e.payload as { id: string }).id)
  );
}

/** Atualiza a lista de viagens do cache local a partir do servidor. */
export async function pullTrips(): Promise<void> {
  if (!isOnline()) return;
  const trips = await getJson<Record<string, unknown>[]>("/api/trips");
  if (trips) {
    await putAllReplacing("trips", trips as never, undefined, await pendingCreateIds("createTrip"));
    notifyChange();
  }
}

/** Atualiza dias/despesas/receitas/agenda de UMA viagem no cache local - chamado ao abrir a viagem. */
export async function pullTripDetail(tripId: string): Promise<void> {
  if (!isOnline()) return;
  const [days, despesas, receitas, agenda] = await Promise.all([
    getJson<Record<string, unknown>[]>(`/api/trips/${tripId}/days`),
    getJson<Record<string, unknown>[]>(`/api/trips/${tripId}/despesas`),
    getJson<Record<string, unknown>[]>(`/api/trips/${tripId}/receitas`),
    getJson<Record<string, unknown>[]>(`/api/trips/${tripId}/agenda`),
  ]);
  if (days) await putAllReplacing("tripDays", days as never, tripId);
  if (despesas) {
    const protectedIds = await pendingCreateIds("createDespesa", tripId);
    await putAllReplacing("despesas", despesas as never, tripId, protectedIds);
  }
  if (receitas) {
    const protectedIds = await pendingCreateIds("createReceita", tripId);
    await putAllReplacing("receitas", receitas as never, tripId, protectedIds);
  }
  if (agenda) {
    const protectedIds = await pendingCreateIds("createAgenda", tripId);
    await putAllReplacing("agenda", agenda as never, tripId, protectedIds);
  }
  notifyChange();
}

// ---------- Listas de referência (colaboradores da viagem, meios de pagamento) ----------
// Cacheadas em `meta` pra alimentar os selects de Pagador/Meio de pagamento em Despesas mesmo
// offline - atualizadas sempre que a tela de Despesas abre com sinal.

export interface PersonOption {
  id: string;
  nome: string;
}

export async function pullCollaborators(tripId: string): Promise<void> {
  if (!isOnline()) return;
  const list = await getJson<PersonOption[]>(`/api/trips/${tripId}/collaboradores`);
  if (list) {
    await setMeta(`collaborators:${tripId}`, list);
    notifyChange();
  }
}

export async function pullMeiosPagamento(): Promise<void> {
  if (!isOnline()) return;
  const list = await getJson<{ id: string; nome: string; ativo: string }[]>("/api/meios-pagamento");
  if (list) {
    await setMeta("meiosPagamento", list);
    notifyChange();
  }
}

export interface EletricInfo {
  country: string;
  plug_type: string;
  volts: string;
  hertz: string;
}

/** Tabela de referência de voltagem/tomada por país (aba Eletric, mantida manualmente na
 * planilha) - mesma lógica de cache local dos meios de pagamento: não muda por viagem, só
 * precisa ser buscada de novo de vez em quando. */
export async function pullEletric(): Promise<void> {
  if (!isOnline()) return;
  const list = await getJson<EletricInfo[]>("/api/eletric");
  if (list) {
    await setMeta("eletric", list);
    notifyChange();
  }
}

// ---------- "Dados offline" - download completo por viagem, incluindo anexos ----------

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

/** Atualiza só os metadados da lista de anexos (sem baixar os arquivos) - usado pela tela de
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

/** Baixa por completo uma viagem - dias/despesas/receitas + os ARQUIVOS dos anexos (não só o
 * link do Drive) - pro cache local. Chamado ao marcar "Dados offline" e, depois, sempre que algo
 * daquela viagem muda (edição local, sincronização, ou no ciclo periódico/ao voltar o sinal). */
export async function downloadTripFull(tripId: string): Promise<void> {
  if (!isOnline() || downloading.has(tripId)) return;
  downloading.add(tripId);
  try {
    // Sem isso, Despesas/Receitas ficam com as listas de "Pagador"/"Credor"/"Meio de
    // pagamento" vazias offline pra qualquer viagem que só foi marcada aqui, sem o usuário ter
    // aberto manualmente a aba Despesas com sinal antes (só essa aba puxava esses dois caches).
    await Promise.all([pullCollaborators(tripId), pullMeiosPagamento()]);
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
    // Sem isso a viagem fica com todos os dados salvos e mesmo assim cai no fallback /offline
    // quando aberta sem sinal - ver warmTripPages.
    await warmTripPages(tripId);
  } else {
    ids.delete(tripId);
    await setMeta(OFFLINE_TRIPS_KEY, Array.from(ids));
    await deleteByTrip("anexos", tripId);
    await deleteByTrip("anexoFiles", tripId);
    notifyChange();
  }
}

/** O que o botão "Atualizar" (visível em qualquer página do app, ver `RefreshButton`) dispara:
 * envia mutações pendentes e repuxa a lista de viagens - e, se `tripId` for informado (usuário
 * está dentro de uma viagem), também os dados e a lista de anexos dela - reconciliando qualquer
 * exclusão feita por outro aparelho/sessão (ver `putAllReplacing`). Diferente de
 * `downloadOfflineTripsNow`, não baixa arquivos de anexo nem aquece páginas - é uma sincronização
 * rápida de dados, não a preparação pra ficar sem sinal. */
export async function refreshNow(
  tripId?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isOnline()) return { ok: false, error: "Sem conexão" };
  await pushOutbox();
  await pullTrips();
  if (tripId) {
    await pullTripDetail(tripId);
    await pullAnexosList(tripId);
  }
  return { ok: true };
}

/** Baixa (ou atualiza) de uma vez os DADOS de todas as viagens marcadas "Dados offline".
 * Chamado pelo ciclo automático (ao voltar online, a cada 60s) - de propósito não aquece as
 * páginas, que é um custo bem maior e só faz sentido sob ação explícita do usuário. */
export async function refreshAllOfflineTrips(): Promise<void> {
  for (const tripId of await listOfflineTripIds()) {
    await downloadTripFull(tripId);
  }
}

/**
 * Pede ao servidor o HTML de cada aba da viagem só pra que o service worker guarde essas URLs
 * no cache `trip-pages` (ver src/app/sw.ts). Sem isso, uma viagem podia ter todos os dados no
 * IndexedDB e ainda assim cair no fallback /offline ao ser aberta sem sinal: as telas de viagem
 * são rotas dinâmicas, e o documento de `/trips/{id}/{aba}` só entra em cache quando aquela URL
 * exata é buscada com internet. O JS das abas em si já vem no precache do build.
 *
 * Silencioso por design: é um "melhor esforço" de pré-carregamento - se uma aba falhar, o resto
 * continua, e a única consequência é aquela aba específica não abrir offline.
 */
async function warmTripPages(tripId: string): Promise<void> {
  if (!isOnline()) return;
  await Promise.all(
    TRIP_TAB_SLUGS.map((slug) =>
      fetch(`/trips/${tripId}/${slug}`, { credentials: "same-origin" }).catch(() => {})
    )
  );
}

/** O que o botão "Baixar offline" da tela de viagens dispara: atualiza os dados E deixa as
 * telas de todas as viagens marcadas prontas pra abrir sem sinal. */
export async function downloadOfflineTripsNow(): Promise<void> {
  if (!isOnline()) return;
  await fetch("/trips", { credentials: "same-origin" }).catch(() => {});
  for (const tripId of await listOfflineTripIds()) {
    await downloadTripFull(tripId);
    await warmTripPages(tripId);
  }
  notifyChange();
}

// ---------- Anexos (upload/exclusão continuam exigindo internet - só o cache é offline) ----------

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
/** Depois de tantas tentativas, uma entrada que falha com o mesmo erro de validação (não é
 * problema de rede) provavelmente nunca vai passar sozinha - ex.: um esquema mudou depois que a
 * mutação foi enfileirada num aparelho, e o servidor passou a rejeitar algo que era aceito antes
 * (aconteceu de verdade: `titulo` virou obrigatório em Agenda depois que compromissos sem esse
 * campo já podiam estar na fila de algum aparelho). Sem esse teto, `pushOutbox` reenviava a
 * mesma entrada pra sempre, a cada sync (manual, periódico, ao voltar online) - nem o botão
 * "Atualizar" nem um Ctrl+F5 limpavam, porque o problema mora no IndexedDB, não na página. */
export const MAX_OUTBOX_ATTEMPTS = 5;

export async function pushOutbox(): Promise<void> {
  if (pushing || !isOnline()) return;
  pushing = true;
  try {
    const entries = await listOutbox();
    for (const entry of entries) {
      if (entry.attempts >= MAX_OUTBOX_ATTEMPTS) continue; // travada - ver discardOutboxEntry
      const result = await sendOutboxEntry(entry);
      if (result === "network-error") break; // provavelmente caiu a conexão de novo - para e tenta depois
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

/** Descarta uma mutação que ficou travada (ver `MAX_OUTBOX_ATTEMPTS`) - a alteração que ela
 * representava (uma despesa, um compromisso...) nunca chegou ao servidor e não vai mais tentar;
 * quem chama decide se avisa o usuário que aquele dado precisa ser refeito. */
export async function discardOutboxEntry(localId: string): Promise<void> {
  await removeOutboxEntry(localId);
  notifyChange();
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
      case "createAgenda": {
        const { file, ...fields } = entry.payload as AgendaPayload & { file?: File };
        if (file) {
          // O File fica gravado no próprio IndexedDB (o algoritmo de clone estruturado suporta
          // Blob/File nativamente), então mesmo enfileirado offline ele sobrevive até a
          // sincronização - não precisa reabrir o seletor de arquivo depois de voltar o sinal.
          const form = new FormData();
          for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
          form.set("file", file);
          res = await fetch(`/api/trips/${entry.tripId}/agenda`, { method: "POST", body: form });
        } else {
          res = await fetch(`/api/trips/${entry.tripId}/agenda`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fields),
          });
        }
        break;
      }
      case "updateAgenda": {
        const { agendaId, file, ...fields } = entry.payload as Omit<AgendaPayload, "id"> & {
          agendaId: string;
          file?: File;
        };
        if (file) {
          const form = new FormData();
          for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
          form.set("file", file);
          res = await fetch(`/api/trips/${entry.tripId}/agenda/${agendaId}`, {
            method: "PATCH",
            body: form,
          });
        } else {
          res = await fetch(`/api/trips/${entry.tripId}/agenda/${agendaId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fields),
          });
        }
        break;
      }
      case "deleteAgenda": {
        const { agendaId } = entry.payload as { agendaId: string };
        res = await fetch(`/api/trips/${entry.tripId}/agenda/${agendaId}`, { method: "DELETE" });
        break;
      }
      case "updateDespesaStatus": {
        const { despesaId, status } = entry.payload as { despesaId: string; status: string };
        res = await fetch(`/api/trips/${entry.tripId}/despesas/${despesaId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        break;
      }
      case "updateReceitaStatus": {
        const { receitaId, status } = entry.payload as { receitaId: string; status: string };
        res = await fetch(`/api/trips/${entry.tripId}/receitas/${receitaId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        break;
      }
      default:
        return "Ação desconhecida na fila";
    }

    if (res.ok) return "ok";
    // Erro real do servidor (validação, acesso, etc.) - não é falta de sinal, não trava a fila.
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
  cidade_origem?: string;
  cidade_origem_lat?: string;
  cidade_origem_lon?: string;
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
    cidade_origem: input.cidade_origem ?? "",
    cidade_origem_lat: input.cidade_origem_lat ?? "",
    cidade_origem_lon: input.cidade_origem_lon ?? "",
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
  await putAll("tripDays", days);

  // Manda os mesmos ids dos dias já gravados localmente - o servidor reaproveita em vez de
  // gerar novos, senão a sincronização puxaria de volta um segundo conjunto de dias (ids
  // diferentes, mesmas datas) e duplicaria a grade de diárias.
  await enqueueOutbox({
    localId: uuid(),
    kind: "createTrip",
    payload: { id, ...input, dayIds: days.map((d) => d.id) },
  });
  notifyChange();
  void pushOutbox();
  return id;
}

/** Exclui a viagem no servidor (cascade de diárias/despesas/receitas/acessos/anexos, ver
 * `deleteTrip` em trips.ts) e limpa todo o cache local dela. Diferente das outras mutações,
 * exige conexão - é destrutivo e admin-only, não faz sentido enfileirar pra tentar mais tarde
 * enquanto o usuário já vê a viagem sumir da lista. */
export async function deleteTripOffline(
  tripId: string
): Promise<{ ok: true; avisoAnexos?: string } | { ok: false; error: string }> {
  if (!isOnline()) return { ok: false, error: "Sem conexão - conecte-se para excluir a viagem" };

  const res = await fetch(`/api/trips/${tripId}`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body.error ?? "Erro ao excluir viagem" };
  }

  await deleteOne("trips", tripId);
  await deleteByTrip("tripDays", tripId);
  await deleteByTrip("despesas", tripId);
  await deleteByTrip("receitas", tripId);
  await deleteByTrip("anexos", tripId);
  await deleteByTrip("anexoFiles", tripId);
  await deleteByTrip("agenda", tripId);
  await removeOutboxByTrip(tripId);

  const ids = new Set(await listOfflineTripIds());
  ids.delete(tripId);
  await setMeta(OFFLINE_TRIPS_KEY, Array.from(ids));

  notifyChange();
  // A viagem saiu; se a pasta de anexos no Drive resistiu, isso é um aviso, não uma falha.
  return body.anexosRemovidos === false && body.avisoAnexos
    ? { ok: true, avisoAnexos: body.avisoAnexos }
    : { ok: true };
}

export async function createDespesaOffline(
  tripId: string,
  input: {
    categoria: string;
    valor: number;
    data: string;
    descricao: string;
    pagador_id: string;
    meio_pagamento_id: string;
    /** Débito (padrão, dinheiro saindo) ou crédito (dinheiro entrando, ex.: um aporte) - ver
     * Natureza em lib/sheets/types.ts. */
    natureza?: "debito" | "credito";
  }
): Promise<void> {
  const id = uuid();
  await putOne("despesas", {
    id,
    trip_id: tripId,
    lancado_por: "",
    status: input.natureza === "credito" ? "a_receber" : "a_pagar",
    natureza: "debito",
    ...input,
    valor: String(input.valor),
  });
  await enqueueOutbox({
    localId: uuid(),
    kind: "createDespesa",
    tripId,
    payload: { id, ...input },
  });
  notifyChange();
  void pushOutbox();
}

/** Marca um lançamento (aba Despesas, débito ou crédito) como concluído/pendente. Diferente da
 * criação, é um PATCH direto (sem outbox dedicado além do próprio `updateDespesaStatus` na
 * fila) - o registro já existe no servidor, então não há necessidade de reconciliar ids como em
 * `createTripOffline`. Aceita os dois vocabulários (pago/a_pagar para débito, recebido/
 * a_receber para crédito) porque a mesma coluna `status` serve às duas naturezas - ver
 * StatusLancamento em lib/sheets/types.ts. */
export async function updateDespesaStatusOffline(
  tripId: string,
  despesaId: string,
  status: "pago" | "a_pagar" | "recebido" | "a_receber"
): Promise<void> {
  const existing = await getOne("despesas", despesaId);
  if (existing) await putOne("despesas", { ...existing, status });
  await enqueueOutbox({
    localId: uuid(),
    kind: "updateDespesaStatus",
    tripId,
    payload: { despesaId, status },
  });
  notifyChange();
  void pushOutbox();
}

export async function createReceitaOffline(
  tripId: string,
  input: { valor: number; data: string; descricao: string; credor_id: string }
): Promise<void> {
  const id = uuid();
  await putOne("receitas", {
    id,
    trip_id: tripId,
    user_id: "",
    status: "a_receber",
    ...input,
    valor: String(input.valor),
  });
  await enqueueOutbox({
    localId: uuid(),
    kind: "createReceita",
    tripId,
    payload: { id, ...input },
  });
  notifyChange();
  void pushOutbox();
}

/** Ver `updateDespesaStatusOffline` - mesma lógica, para receitas. */
export async function updateReceitaStatusOffline(
  tripId: string,
  receitaId: string,
  status: "recebido" | "a_receber"
): Promise<void> {
  const existing = await getOne("receitas", receitaId);
  if (existing) await putOne("receitas", { ...existing, status });
  await enqueueOutbox({
    localId: uuid(),
    kind: "updateReceitaStatus",
    tripId,
    payload: { receitaId, status },
  });
  notifyChange();
  void pushOutbox();
}

export interface DayPatch {
  id: string;
  [field: string]: string;
}

export async function saveDaysOffline(tripId: string, days: DayPatch[]): Promise<void> {
  // `putAll` substitui o registro inteiro pela chave - como `days` aqui traz só os campos que
  // mudaram, gravar o patch puro apagaria os campos não editados (ex.: `data` do dia), quebrando
  // a ordenação da tela. Mescla com o que já está salvo localmente antes de gravar.
  const merged = await Promise.all(
    days.map(async (patch) => {
      const existing = await getOne("tripDays", patch.id);
      return { ...(existing ?? {}), ...patch, trip_id: tripId };
    })
  );
  await putAll("tripDays", merged);
  await enqueueOutbox({ localId: uuid(), kind: "saveDays", tripId, payload: { days } });
  notifyChange();
  void pushOutbox();
}

export async function createAgendaOffline(
  tripId: string,
  input: {
    data: string;
    horario: string;
    titulo: string;
    descricao: string;
    url: string;
    file?: File | null;
  }
): Promise<void> {
  const id = uuid();
  await putOne("agenda", {
    id,
    trip_id: tripId,
    data: input.data,
    horario: input.horario,
    titulo: input.titulo,
    descricao: input.descricao,
    url: input.url,
    // Anexo ainda não existe no Drive enquanto a mutação está só na fila - a linha local nasce
    // sem ele; quando a sincronização de fato enviar o arquivo, `pullTripDetail` traz de volta
    // a linha completa (com anexo_file_id/nome/url) do servidor.
    anexo_file_id: "",
    anexo_nome: input.file?.name ?? "",
    anexo_url: "",
    criado_por: "",
    criado_em: new Date().toISOString(),
  });
  const payload: AgendaPayload & { file?: File } = {
    id,
    data: input.data,
    horario: input.horario,
    titulo: input.titulo,
    descricao: input.descricao,
    url: input.url,
  };
  if (input.file) payload.file = input.file;
  await enqueueOutbox({ localId: uuid(), kind: "createAgenda", tripId, payload });
  notifyChange();
  void pushOutbox();
}

export async function updateAgendaOffline(
  tripId: string,
  agendaId: string,
  input: {
    data: string;
    horario: string;
    titulo: string;
    descricao: string;
    url: string;
    file?: File | null;
  }
): Promise<void> {
  const existing = await getOne("agenda", agendaId);
  await putOne("agenda", {
    ...(existing ?? { trip_id: tripId }),
    id: agendaId,
    data: input.data,
    horario: input.horario,
    titulo: input.titulo,
    descricao: input.descricao,
    url: input.url,
    // Se um arquivo novo foi anexado agora, o nome já reflete isso na tela mesmo antes de
    // sincronizar; o `anexo_file_id`/`anexo_url` de fato só chegam depois do upload, via
    // `pullTripDetail` - mesma lógica de `createAgendaOffline`.
    ...(input.file ? { anexo_nome: input.file.name } : {}),
  });
  const payload: Omit<AgendaPayload, "id"> & { agendaId: string; file?: File } = {
    agendaId,
    data: input.data,
    horario: input.horario,
    titulo: input.titulo,
    descricao: input.descricao,
    url: input.url,
  };
  if (input.file) payload.file = input.file;
  await enqueueOutbox({ localId: uuid(), kind: "updateAgenda", tripId, payload });
  notifyChange();
  void pushOutbox();
}

export async function deleteAgendaOffline(tripId: string, agendaId: string): Promise<void> {
  await deleteOne("agenda", agendaId);
  await enqueueOutbox({
    localId: uuid(),
    kind: "deleteAgenda",
    tripId,
    payload: { agendaId },
  });
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
