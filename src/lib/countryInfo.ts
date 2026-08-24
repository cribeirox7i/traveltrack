"use client";

/**
 * Resolve moeda/capital/DDI/lado de direção/fuso/bandeira de um país a partir de datasets
 * estáticos públicos (arquivos JSON hospedados no jsDelivr, sem chave, sem cadastro) - a
 * REST Countries (a API "de verdade" pra isso) passou a exigir conta+chave depois de uma
 * migração pra v5, então isso aqui usa a mesma base de dados original (mledoze/countries, de
 * onde a REST Countries em si nasceu) direto, mais dois datasets complementares pro que falta
 * nela (lado de direção do trânsito, fuso horário por país).
 *
 * Os três arquivos são carregados uma vez só (cacheados em memória neste módulo, não expiram -
 * são ~250 países, dado essencialmente estático) e reaproveitados pra qualquer país pedido
 * depois, na mesma sessão da página.
 */

interface MledozeCountry {
  name: { common: string };
  cca2: string;
  currencies?: Record<string, { name: string; symbol: string }>;
  idd?: { root?: string; suffixes?: string[] };
  capital?: string[];
  translations?: Record<string, { common: string }>;
  flag?: string;
  languages?: Record<string, string>;
}

interface DrivingSideEntry {
  country: string;
  side: "left" | "right";
}

interface TimezoneMeta {
  countries: Record<string, { zones: string[] }>;
}

let mledozeCache: Promise<MledozeCountry[]> | null = null;
let drivingSideCache: Promise<DrivingSideEntry[]> | null = null;
let timezoneMetaCache: Promise<TimezoneMeta> | null = null;

function fetchJson<T>(url: string): Promise<T | null> {
  return fetch(url)
    .then((res) => (res.ok ? (res.json() as Promise<T>) : null))
    .catch(() => null);
}

function loadMledoze(): Promise<MledozeCountry[]> {
  if (!mledozeCache) {
    mledozeCache = fetchJson<MledozeCountry[]>(
      "https://cdn.jsdelivr.net/gh/mledoze/countries@master/dist/countries.json"
    ).then((data) => data ?? []);
  }
  return mledozeCache;
}

function loadDrivingSide(): Promise<DrivingSideEntry[]> {
  if (!drivingSideCache) {
    drivingSideCache = fetchJson<DrivingSideEntry[]>(
      "https://cdn.jsdelivr.net/gh/samayo/country-json@master/src/country-by-driving-side.json"
    ).then((data) => data ?? []);
  }
  return drivingSideCache;
}

function loadTimezoneMeta(): Promise<TimezoneMeta> {
  if (!timezoneMetaCache) {
    timezoneMetaCache = fetchJson<TimezoneMeta>(
      "https://cdn.jsdelivr.net/npm/moment-timezone@0.5/data/meta/latest.json"
    ).then((data) => data ?? { countries: {} });
  }
  return timezoneMetaCache;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export interface ResolvedCountryInfo {
  [key: string]: string;
  currency_code: string;
  currency_name: string;
  currency_symbol: string;
  capital: string;
  ddi: string;
  driving_side: "left" | "right" | "";
  timezone: string;
  flag_emoji: string;
  /** Idioma principal do país - só o primeiro quando há vários (ex.: Suíça tem 4), mesma
   * simplificação já aceita pra fuso horário com múltiplas zonas. */
  language: string;
}

/**
 * `paisPt` é o nome do país como a Open-Meteo devolveu (português, ex.: "Estados Unidos",
 * "Japão") - bate contra `translations.por.common` do mledoze, não contra o nome em inglês.
 * Devolve `null` se o país não for encontrado em nenhum dataset (nome muito diferente do
 * esperado) - quem chama decide o que fazer (tipicamente: não mostra a linha desse país).
 */
export async function resolveCountryInfo(paisPt: string): Promise<ResolvedCountryInfo | null> {
  const alvo = normalize(paisPt);
  const [paises, driving, tzMeta] = await Promise.all([
    loadMledoze(),
    loadDrivingSide(),
    loadTimezoneMeta(),
  ]);

  const pais = paises.find((c) => normalize(c.translations?.por?.common ?? "") === alvo);
  if (!pais) return null;

  const moeda = pais.currencies ? Object.entries(pais.currencies)[0] : null;
  // Só cola o sufixo se for o único - é o que faz `root+suffix` virar o código completo do país
  // (ex.: Japão root="+8" suffix="1" -> "+81"). Países que compartilham código com vários outros
  // por código de área (EUA/Canadá/Caribe, todos "+1") têm uma LISTA de sufixos - um por área -,
  // e colar só o primeiro (ex.: "+1201", código de área de Nova Jersey) passaria a impressão
  // errada de que aquele é "o" código do país. Nesses casos mostra só a raiz ("+1").
  const ddi = pais.idd?.root
    ? pais.idd.suffixes?.length === 1
      ? `${pais.idd.root}${pais.idd.suffixes[0]}`
      : pais.idd.root
    : "";

  const drivingEntry = driving.find((d) => normalize(d.country) === normalize(pais.name.common));

  // Um país com mais de um fuso (EUA, Brasil, Rússia...) fica com o primeiro da lista - é uma
  // simplificação aceita: mostrar "a" hora do país, não todas, já que a tela não sabe em qual
  // região exata da cidade a pessoa está sem uma geolocalização de verdade.
  const timezone = tzMeta.countries[pais.cca2]?.zones?.[0] ?? "";
  const language = pais.languages ? Object.values(pais.languages)[0] : "";

  return {
    currency_code: moeda?.[0] ?? "",
    currency_name: moeda?.[1]?.name ?? "",
    currency_symbol: moeda?.[1]?.symbol ?? "",
    capital: pais.capital?.[0] ?? "",
    ddi,
    driving_side: drivingEntry?.side ?? "",
    timezone,
    flag_emoji: pais.flag ?? "",
    language: language ?? "",
  };
}
