import { v4 as uuid } from "uuid";
import { sequentialDates } from "../dateRange";
import { APP_API_ROUTES, APP_ROUTES } from "../appRoutes";
import { TRIP_TAB_SLUGS } from "../tripTabs";
import { resolveCountryInfo } from "../countryInfo";
import { fetchRateToBRL, todayISO } from "../exchangeRate";
import {
  OutboxEntry,
  deleteByTrip,
  deleteMany,
  deleteOne,
  deleteTripImage,
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

/** Campos de texto de um Item de viagem - mesma ideia de `AgendaPayload`, com `file` fora (vai à
 * parte no FormData de reenvio). Tipado solto (`Record<string, string>`) porque o conjunto de
 * campos usados varia por categoria - o servidor é quem decide o que é relevante. */
type ItemPayload = Record<string, string> & { id: string };

/** Campos de uma operação de câmbio - todos texto, sem `file`. */
interface CambioPayload {
  id: string;
  data: string;
  moeda: string;
  qtd_moeda: string;
  qtd_reais: string;
  taxa_efetiva: string;
  descricao: string;
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

/** Atualiza dias/agenda/itens/anexos de UMA viagem no cache local - chamado ao abrir a viagem. */
export async function pullTripDetail(tripId: string): Promise<void> {
  if (!isOnline()) return;
  const [days, agenda, itens, anexos, cambio] = await Promise.all([
    getJson<Record<string, unknown>[]>(`/api/trips/${tripId}/days`),
    getJson<Record<string, unknown>[]>(`/api/trips/${tripId}/agenda`),
    getJson<Record<string, unknown>[]>(`/api/trips/${tripId}/itens`),
    getJson<Record<string, unknown>[]>(`/api/trips/${tripId}/anexos`),
    getJson<Record<string, unknown>[]>(`/api/trips/${tripId}/cambio`),
  ]);
  if (days) await putAllReplacing("tripDays", days as never, tripId);
  if (agenda) {
    const protectedIds = await pendingCreateIds("createAgenda", tripId);
    await putAllReplacing("agenda", agenda as never, tripId, protectedIds);
  }
  if (itens) {
    const protectedIds = await pendingCreateIds("createItem", tripId);
    await putAllReplacing("itens", itens as never, tripId, protectedIds);
  }
  // Anexos (soltos e de Item, aba unificada) não têm mutação otimista local (adicionar/editar/
  // remover exigem internet, ver `createAnexoOnline`/`updateAnexoOnline`/`deleteAnexoOnline`),
  // então não precisa de `protectedIds` - não existe uma criação pendente na fila pra proteger.
  if (anexos) await putAllReplacing("anexosSheet", anexos as never, tripId);
  if (cambio) {
    const protectedIds = await pendingCreateIds("createCambio", tripId);
    await putAllReplacing("cambio", cambio as never, tripId, protectedIds);
  }
  notifyChange();
}

// ---------- Listas de referência (colaboradores da viagem, meios de pagamento) ----------
// Cacheadas em `meta` pra alimentar os selects de Pagador/Meio de pagamento em Itens mesmo
// offline - atualizadas sempre que a tela de Itens abre com sinal.

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

/**
 * Meio de pagamento como o cliente vê. `proprio` separa os DOIS usos da lista: só os próprios
 * entram no `<select>` de escolha; o resto vem apenas pra resolver o nome de um item pago por
 * outra pessoa da viagem (sem eles, a tela mostraria o uuid cru). Ver a rota
 * `/api/meios-pagamento` pro recorte por ambiente.
 */
export interface MeioPagamentoInfo {
  id: string;
  nome: string;
  ativo: string;
  user_id: string;
  proprio: boolean;
}

export async function pullMeiosPagamento(): Promise<void> {
  if (!isOnline()) return;
  const list = await getJson<MeioPagamentoInfo[]>("/api/meios-pagamento");
  if (list) {
    await setMeta("meiosPagamento", list);
    notifyChange();
  }
}

export interface CountryInfo {
  id: string;
  country: string;
  plug_type: string;
  volts: string;
  hertz: string;
  currency_code: string;
  currency_name: string;
  currency_symbol: string;
  capital: string;
  ddi: string;
  driving_side: "left" | "right" | "";
  timezone: string;
  flag_emoji: string;
  language: string;
  rate_brl: string;
  rate_date: string;
}

/** Tabela de referência por país (aba Countries - tomada/voltagem curados à mão, o resto
 * auto-preenchido, ver `upsertCountryInfo`) - mesma lógica de cache local dos meios de
 * pagamento: não muda por viagem, só precisa ser buscada de novo de vez em quando. */
export async function pullCountries(): Promise<void> {
  if (!isOnline()) return;
  const list = await getJson<CountryInfo[]>("/api/countries");
  if (list) {
    await setMeta("countries", list);
    notifyChange();
  }
}

export interface ClassificacaoInfo {
  id: string;
  nome: string;
  ativo: string;
  icone: string;
}

export interface SubclassificacaoInfo {
  id: string;
  classificacao_id: string;
  nome: string;
  ativo: string;
  icone: string;
}

/** Taxonomia do cadastro de Itens (Classificação/Subclassificação, curada pelo admin em
 * /admin/classificacoes) - cacheada em `meta` como Countries/MeiosPagamento, pro formulário de
 * Item funcionar offline. Muda pouco (o admin edita de vez em quando), então uma pull por sessão
 * é suficiente - mesma lógica das outras listas de referência. */
export async function pullClassificacoes(): Promise<void> {
  if (!isOnline()) return;
  const list = await getJson<ClassificacaoInfo[]>("/api/classificacoes");
  if (list) {
    await setMeta("classificacoes", list);
    notifyChange();
  }
}

export async function pullSubclassificacoes(): Promise<void> {
  if (!isOnline()) return;
  const list = await getJson<SubclassificacaoInfo[]>("/api/subclassificacoes");
  if (list) {
    await setMeta("subclassificacoes", list);
    notifyChange();
  }
}

/** Manda pro servidor os campos de um país resolvidos localmente (ver `lib/countryInfo.ts`/
 * `lib/exchangeRate.ts`) pra completar a linha dele na aba Countries - silencioso, uma falha
 * aqui só significa que aquele país continua sem esses dados até a próxima tentativa. */
export async function upsertCountryInfo(
  country: string,
  fields: Record<string, string>
): Promise<void> {
  if (!isOnline()) return;
  try {
    const res = await fetch("/api/countries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, fields }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`upsertCountryInfo(${country}) falhou:`, body.error ?? res.status);
    }
  } catch (err) {
    // sem sinal no meio da chamada, ou o servidor caiu - próxima tentativa de "Atualizar" cobre.
    console.error(`upsertCountryInfo(${country}) falhou:`, err);
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
  const anexos = await getJson<AnexoInfoLike[]>(`/api/trips/${tripId}/drive-files`);
  if (!anexos) return;
  await putAll(
    "anexos",
    anexos.map((a) => ({ ...a, id: a.fileId, trip_id: tripId }))
  );
  notifyChange();
}

/** Baixa por completo uma viagem - dias/agenda/itens + os ARQUIVOS dos anexos (não só o
 * link do Drive) - pro cache local. Chamado ao marcar "Dados offline" e, depois, sempre que algo
 * daquela viagem muda (edição local, sincronização, ou no ciclo periódico/ao voltar o sinal). */
export async function downloadTripFull(tripId: string): Promise<void> {
  if (!isOnline() || downloading.has(tripId)) return;
  downloading.add(tripId);
  try {
    // Sem isso, Itens fica com as listas de "Pagador"/"Meio de pagamento" vazias offline pra
    // qualquer viagem que só foi marcada aqui, sem o usuário ter aberto manualmente a aba Itens
    // com sinal antes (só essa aba puxava esses dois caches).
    await Promise.all([pullCollaborators(tripId), pullMeiosPagamento()]);
    await pullTripDetail(tripId);

    const anexos = await getJson<AnexoInfoLike[]>(`/api/trips/${tripId}/drive-files`);
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
      const blob = await getBlob(`/api/trips/${tripId}/drive-files/${anexo.fileId}`);
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
    // quando aberta sem sinal - ver warmTripPages. `warmAppRoutes` entra junto porque marcar
    // uma viagem é o momento em que o usuário declara "vou ficar sem sinal": preparar só as
    // telas dela deixava o resto do app quebrado justamente aí.
    await Promise.all([warmTripPages(tripId), warmAppRoutes()]);
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
    const days = await listByTrip("tripDays", tripId);
    await fetchAndSaveWeather(tripId, days as unknown as WeatherableDay[]);
    await refreshCountriesAndRates(days as unknown as CountryableDay[]);
  }
  return { ok: true };
}

interface WeatherableDay {
  id: string;
  data: string;
  pernoite: string;
}

interface WeatherApiResult {
  min: number;
  max: number;
  chuva: number | null;
  vento: number | null;
  source: "forecast" | "historico";
}

/** Busca e grava temperatura/chuva/vento de cada dia com Pernoite preenchido - antes era um
 * botão próprio na aba Roteiro, virou parte do "Atualizar" global (ver `refreshNow`) pra
 * concentrar as atualizações num lugar só, a pedido do usuário. Cache por cidade+data exata
 * (não só mês/dia, como antes) - previsão real muda dia a dia, não dá pra reaproveitar entre
 * anos como a média histórica antiga permitia. */
export async function fetchAndSaveWeather(tripId: string, days: WeatherableDay[]): Promise<void> {
  const cache: Record<string, WeatherApiResult | null> = {};
  const updates: {
    id: string;
    temp_min: string;
    temp_max: string;
    chuva_mm: string;
    vento_kmh: string;
  }[] = [];

  for (const day of days) {
    const city = day.pernoite?.trim();
    const data = day.data?.slice(0, 10);
    if (!city || !data) continue;
    const cacheKey = `${city.toLowerCase()}|${data}`;
    if (!(cacheKey in cache)) {
      try {
        const res = await fetch(
          `/api/weather?city=${encodeURIComponent(city)}&date=${data}`
        );
        const body = res.ok ? await res.json() : { weather: null };
        cache[cacheKey] = body.weather;
      } catch {
        cache[cacheKey] = null;
      }
    }
    const result = cache[cacheKey];
    if (!result) continue;
    updates.push({
      id: day.id,
      temp_min: result.min.toFixed(1),
      temp_max: result.max.toFixed(1),
      chuva_mm: result.chuva !== null ? result.chuva.toFixed(1) : "",
      vento_kmh: result.vento !== null ? result.vento.toFixed(0) : "",
    });
  }

  if (updates.length) await saveDaysOffline(tripId, updates);
}

interface CountryableDay {
  origem_pais: string;
  destino_pais: string;
  pernoite_pais: string;
}

/** Resolve (datasets estáticos, sem chave - ver `lib/countryInfo.ts`) e grava na aba Countries o
 * que faltar pros países do roteiro desta viagem, e atualiza a cotação de câmbio de cada moeda
 * envolvida se a que está salva não é de hoje - também parte do "Atualizar" global. Silencioso:
 * um país que não resolve, ou uma cotação que falha, não trava o resto nem os outros países. */
export async function refreshCountriesAndRates(days: CountryableDay[]): Promise<void> {
  const paises = new Set<string>();
  for (const day of days) {
    for (const p of [day.origem_pais, day.destino_pais, day.pernoite_pais]) {
      if (p?.trim()) paises.add(p.trim());
    }
  }
  if (paises.size === 0) return;

  await pullCountries();
  const cached = ((await getMeta("countries")) as CountryInfo[] | undefined) ?? [];
  const hoje = todayISO();

  for (const pais of paises) {
    const existing = cached.find((c) => c.country.trim().toLowerCase() === pais.toLowerCase());
    let currencyCode = existing?.currency_code || "";

    const faltaEstatico =
      !existing || !existing.currency_code || !existing.timezone || !existing.language;
    if (faltaEstatico) {
      const resolved = await resolveCountryInfo(pais);
      if (resolved) {
        await upsertCountryInfo(pais, resolved);
        currencyCode = currencyCode || resolved.currency_code;
      }
    }

    if (!currencyCode) continue;
    const cotacaoDesatualizada = !existing || existing.rate_date !== hoje;
    if (cotacaoDesatualizada) {
      const rate = await fetchRateToBRL(currencyCode);
      if (rate !== null) {
        await upsertCountryInfo(pais, { rate_brl: String(rate), rate_date: hoje });
      }
    }
  }

  await pullCountries();
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
  await Promise.all([
    fetch(`/trips/${tripId}`, { credentials: "same-origin" }).catch(() => {}),
    // "editar" fica fora de TRIP_TAB_SLUGS (não é uma aba da navegação, é uma tela à parte),
    // então era a única tela de viagem que continuava caindo em "Sem conexão" mesmo com a
    // viagem inteira baixada.
    ...[...TRIP_TAB_SLUGS, "editar"].map((slug) =>
      fetch(`/trips/${tripId}/${slug}`, { credentials: "same-origin" }).catch(() => {})
    ),
    // Única leitura por viagem que não tem espelho no IndexedDB: é a lista de quem tem acesso,
    // usada pela tela Acessos (admin). Sem isso, aquela tela abre offline mas com a lista de
    // colaboradores vazia justamente pra viagem que o usuário se preparou pra levar.
    fetch(`/api/user-trip?trip_id=${tripId}`, { credentials: "same-origin" }).catch(() => {}),
  ]);
}

/**
 * Mesma ideia de `warmTripPages`, para as telas que não pertencem a nenhuma viagem
 * (`APP_ROUTES`) e para as respostas de referência que elas leem direto da API
 * (`APP_API_ROUTES`) - ver src/lib/appRoutes.ts. Sem isso, marcar uma viagem como offline
 * preparava só as telas dela: Ambientes, Acessos, Usuários, Config e Parâmetros continuavam
 * dependendo de o usuário ter aberto cada uma com internet por acaso, e ainda assim eram
 * despejadas do cache pelo limite baixo do cache genérico (ver src/app/sw.ts).
 *
 * Silencioso como o irmão: é pré-carregamento de melhor esforço, uma rota que falhe (ou que
 * responda 403 pro papel do usuário) só significa que aquela tela não abre offline.
 */
async function warmAppRoutes(): Promise<void> {
  if (!isOnline()) return;
  await Promise.all(
    [...APP_ROUTES, ...APP_API_ROUTES].map((rota) =>
      fetch(rota, { credentials: "same-origin" }).catch(() => {})
    )
  );
}

/** O que o botão "Baixar offline" da tela de viagens dispara: atualiza os dados E deixa as
 * telas do app - as de todas as viagens marcadas e as fixas - prontas pra abrir sem sinal.
 * Devolve quantas viagens foram preparadas pra que o botão possa confirmar o que fez (ver
 * `DownloadOfflineButton`). */
export async function downloadOfflineTripsNow(): Promise<{ viagens: number }> {
  if (!isOnline()) return { viagens: 0 };
  await warmAppRoutes();
  const tripIds = await listOfflineTripIds();
  for (const tripId of tripIds) {
    await downloadTripFull(tripId);
    await warmTripPages(tripId);
  }
  notifyChange();
  return { viagens: tripIds.length };
}

// ---------- Anexos (upload/exclusão continuam exigindo internet - só o cache é offline) ----------

export async function uploadAnexoAndRefresh(
  tripId: string,
  form: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`/api/trips/${tripId}/drive-files`, { method: "POST", body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? "Erro ao enviar anexo" };
  }
  await refreshIfOffline(tripId);
  notifyChange();
  return { ok: true };
}

export async function deleteAnexoAndRefresh(tripId: string, fileId: string): Promise<void> {
  await fetch(`/api/trips/${tripId}/drive-files/${fileId}`, { method: "DELETE" });
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
        if (entry.tripId) {
          const teveUpload =
            (entry.kind === "createItem" ||
              entry.kind === "updateItem" ||
              entry.kind === "createAgenda" ||
              entry.kind === "updateAgenda") &&
            Boolean((entry.payload as { file?: File }).file);
          if (teveUpload) {
            // O upload do anexo só termina no servidor durante este push - a linha otimista local
            // nasceu sem o arquivo de verdade (Item só com `_anexoPendenteNome`, marcador local
            // que não é coluna nenhuma - ver createItemOffline; Agenda com `anexo_nome` mas sem
            // `anexo_file_id` - ver createAgendaOffline). `refreshIfOffline` só re-busca a viagem
            // quando ela está
            // marcada "Dados offline"; sem esse pull aqui, quem NÃO marcou a viagem via ficava
            // com "sem anexo" na tela pro resto da sessão mesmo com o arquivo salvo certo no
            // Drive (o próprio servidor sempre esteve certo).
            await pullTripDetail(entry.tripId);
          } else {
            await refreshIfOffline(entry.tripId);
          }
        }
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
      case "createItem": {
        const { file, ...fields } = entry.payload as ItemPayload & { file?: File };
        if (file) {
          const form = new FormData();
          for (const [key, value] of Object.entries(fields)) form.set(key, value);
          form.set("file", file);
          res = await fetch(`/api/trips/${entry.tripId}/itens`, { method: "POST", body: form });
        } else {
          res = await fetch(`/api/trips/${entry.tripId}/itens`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fields),
          });
        }
        break;
      }
      case "updateItem": {
        const { itemId, file, ...fields } = entry.payload as Omit<ItemPayload, "id"> & {
          itemId: string;
          file?: File;
        };
        if (file) {
          const form = new FormData();
          for (const [key, value] of Object.entries(fields)) form.set(key, value);
          form.set("file", file);
          res = await fetch(`/api/trips/${entry.tripId}/itens/${itemId}`, {
            method: "PATCH",
            body: form,
          });
        } else {
          res = await fetch(`/api/trips/${entry.tripId}/itens/${itemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fields),
          });
        }
        break;
      }
      case "deleteItem": {
        const { itemId } = entry.payload as { itemId: string };
        res = await fetch(`/api/trips/${entry.tripId}/itens/${itemId}`, { method: "DELETE" });
        break;
      }
      case "createCambio":
        res = await fetch(`/api/trips/${entry.tripId}/cambio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.payload),
        });
        break;
      case "updateCambio": {
        const { cambioId, ...fields } = entry.payload as Omit<CambioPayload, "id"> & {
          cambioId: string;
        };
        res = await fetch(`/api/trips/${entry.tripId}/cambio/${cambioId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        break;
      }
      case "deleteCambio": {
        const { cambioId } = entry.payload as { cambioId: string };
        res = await fetch(`/api/trips/${entry.tripId}/cambio/${cambioId}`, { method: "DELETE" });
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
  qtd_dias: number;
  qtd_pessoas: number;
  cidade_origem?: string;
  cidade_origem_lat?: string;
  cidade_origem_lon?: string;
  capa_url?: string;
  custo_modo?: "por_pessoa" | "total";
}): Promise<string> {
  const id = uuid();
  const datas = sequentialDates(input.data_inicio, input.qtd_dias);
  const trip = {
    id,
    nome: input.nome,
    data_inicio: input.data_inicio,
    data_fim: datas[datas.length - 1],
    qtd_pessoas: String(input.qtd_pessoas),
    criado_por: "",
    criado_em: new Date().toISOString(),
    cidade_origem: input.cidade_origem ?? "",
    cidade_origem_lat: input.cidade_origem_lat ?? "",
    cidade_origem_lon: input.cidade_origem_lon ?? "",
    capa_url: input.capa_url ?? "",
    custo_modo: input.custo_modo ?? "por_pessoa",
  };
  await putOne("trips", trip);

  const days = datas.map((data) => ({
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
    chuva_mm: "",
    vento_kmh: "",
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

/** Exclui a viagem no servidor (cascade de diárias/acessos/anexos, ver `deleteTrip` em trips.ts)
 * e limpa todo o cache local dela. Diferente das outras mutações, exige conexão - é destrutivo e
 * admin-only, não faz sentido enfileirar pra tentar mais tarde enquanto o usuário já vê a viagem
 * sumir da lista. */
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
  await deleteByTrip("anexos", tripId);
  await deleteByTrip("anexoFiles", tripId);
  await deleteByTrip("agenda", tripId);
  await deleteByTrip("itens", tripId);
  await deleteByTrip("anexosSheet", tripId);
  await deleteByTrip("cambio", tripId);
  await deleteTripImage(tripId);
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

/** Cria um Item de viagem otimista - `fields` é o mesmo conjunto de campos aceito pela API (ver
 * `ITEM_EDITABLE_FIELDS` em lib/sheets/itens.ts), fora `file`, incluindo `natureza` (campo
 * explícito do acordeão Financeiro desde a reforma de 2026-09-21 - não é mais calculado no
 * servidor a partir de categoria). Devolve o id local do item criado - usado por `duplicarItem`
 * (tela Itens) pra já abrir a edição da cópia sem precisar esperar sincronizar. */
export async function createItemOffline(
  tripId: string,
  fields: Record<string, string>,
  file?: File | null
): Promise<string> {
  const id = uuid();
  await putOne("itens", {
    id,
    trip_id: tripId,
    natureza: "",
    // Marcador só local (nunca vai pro servidor - não faz parte de `fields`/`payload` abaixo):
    // pro badge da lista mostrar "pendente de sincronização" antes de a linha em `Anexos`
    // existir de verdade. Some sozinho quando `pullTripDetail` re-busca o item depois do push.
    _anexoPendenteNome: file?.name ?? "",
    criado_por: "",
    criado_em: new Date().toISOString(),
    ...fields,
  });
  const payload: ItemPayload & { file?: File } = { id, ...fields };
  if (file) payload.file = file;
  await enqueueOutbox({ localId: uuid(), kind: "createItem", tripId, payload });
  notifyChange();
  void pushOutbox();
  return id;
}

export async function updateItemOffline(
  tripId: string,
  itemId: string,
  fields: Record<string, string>,
  file?: File | null
): Promise<void> {
  const existing = await getOne("itens", itemId);
  await putOne("itens", {
    ...(existing ?? { trip_id: tripId }),
    id: itemId,
    ...fields,
    ...(file ? { _anexoPendenteNome: file.name } : {}),
  });
  const payload: Omit<ItemPayload, "id"> & { itemId: string; file?: File } = {
    itemId,
    ...fields,
  };
  if (file) payload.file = file;
  await enqueueOutbox({ localId: uuid(), kind: "updateItem", tripId, payload });
  notifyChange();
  void pushOutbox();
}

export async function deleteItemOffline(tripId: string, itemId: string): Promise<void> {
  await deleteOne("itens", itemId);
  await enqueueOutbox({ localId: uuid(), kind: "deleteItem", tripId, payload: { itemId } });
  notifyChange();
  void pushOutbox();
}

// ---------- Câmbio (menu Financeiro > Câmbio) ----------
// Mutação otimista + fila, igual aos Itens (sem `file`). `criado_por`/`criado_por_role` são do
// servidor, mas a linha local já nasce com o autor atual pra tela poder liberar Editar/Excluir
// pro próprio registro mesmo antes de sincronizar - o backend continua sendo a garantia.

interface CambioFields {
  data: string;
  moeda: string;
  qtd_moeda: string;
  qtd_reais: string;
  taxa_efetiva: string;
  descricao: string;
}

export async function createCambioOffline(
  tripId: string,
  fields: CambioFields,
  autor: { id: string; role: string }
): Promise<void> {
  const id = uuid();
  await putOne("cambio", {
    id,
    trip_id: tripId,
    ...fields,
    criado_por: autor.id,
    criado_por_role: autor.role,
    criado_em: new Date().toISOString(),
  });
  const payload: CambioPayload = { id, ...fields };
  await enqueueOutbox({ localId: uuid(), kind: "createCambio", tripId, payload });
  notifyChange();
  void pushOutbox();
}

export async function updateCambioOffline(
  tripId: string,
  cambioId: string,
  fields: CambioFields
): Promise<void> {
  const existing = await getOne("cambio", cambioId);
  await putOne("cambio", { ...(existing ?? { trip_id: tripId }), id: cambioId, ...fields });
  await enqueueOutbox({
    localId: uuid(),
    kind: "updateCambio",
    tripId,
    payload: { cambioId, ...fields },
  });
  notifyChange();
  void pushOutbox();
}

export async function deleteCambioOffline(tripId: string, cambioId: string): Promise<void> {
  await deleteOne("cambio", cambioId);
  await enqueueOutbox({ localId: uuid(), kind: "deleteCambio", tripId, payload: { cambioId } });
  notifyChange();
  void pushOutbox();
}

// ---------- Anexos (aba Anexos unificada - soltos e de Item, 2026-09-24) ----------
// Upload/edição/remoção exigem internet na hora, sem outbox (o arquivo em si não é enfileirável
// de forma prática) - a leitura funciona offline via `pullTripDetail`/
// `useOfflineCollection("anexosSheet", tripId)`. `item_id` vazio = solto (só a tela solta de
// Anexos cria/edita/exclui); preenchido = pertence a um Item (só a tela de Itens cria/exclui -
// não edita `data`/`descricao`, que nem existem pra esse caso).

export interface AnexoInfo {
  id: string;
  trip_id: string;
  item_id: string;
  data: string;
  descricao: string;
  file_id: string;
  nome: string;
  url: string;
  criado_por: string;
  criado_em: string;
}

export async function createAnexoOnline(
  tripId: string,
  input: { itemId?: string; data?: string; descricao?: string; file: File }
): Promise<{ ok: true; anexo: AnexoInfo } | { ok: false; error: string }> {
  if (!isOnline()) return { ok: false, error: "Sem conexão - adicionar anexo precisa de internet" };

  const form = new FormData();
  if (input.itemId) form.set("item_id", input.itemId);
  if (input.data) form.set("data", input.data);
  if (input.descricao) form.set("descricao", input.descricao);
  form.set("file", input.file);
  let res: Response;
  try {
    res = await fetch(`/api/trips/${tripId}/anexos`, { method: "POST", body: form });
  } catch {
    return { ok: false, error: "Sem conexão - adicionar anexo precisa de internet" };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error ?? "Erro ao adicionar anexo" };

  const anexo = body as AnexoInfo;
  await putOne("anexosSheet", anexo as never);
  notifyChange();
  return { ok: true, anexo };
}

/** Só faz sentido pra anexo solto - ver comentário da seção. */
export async function updateAnexoOnline(
  tripId: string,
  anexoId: string,
  patch: { data?: string; descricao?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isOnline()) return { ok: false, error: "Sem conexão - editar anexo precisa de internet" };

  let res: Response;
  try {
    res = await fetch(`/api/trips/${tripId}/anexos/${anexoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    return { ok: false, error: "Sem conexão - editar anexo precisa de internet" };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error ?? "Erro ao editar anexo" };

  const existing = await getOne("anexosSheet", anexoId);
  if (existing) await putOne("anexosSheet", { ...existing, ...patch });
  notifyChange();
  return { ok: true };
}

export async function deleteAnexoOnline(
  tripId: string,
  anexoId: string
): Promise<{ ok: true; avisoAnexo?: string } | { ok: false; error: string }> {
  if (!isOnline()) return { ok: false, error: "Sem conexão - remover anexo precisa de internet" };

  let res: Response;
  try {
    res = await fetch(`/api/trips/${tripId}/anexos/${anexoId}`, { method: "DELETE" });
  } catch {
    return { ok: false, error: "Sem conexão - remover anexo precisa de internet" };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error ?? "Erro ao remover anexo" };

  await deleteOne("anexosSheet", anexoId);
  notifyChange();
  return { ok: true, avisoAnexo: body.avisoAnexo };
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
