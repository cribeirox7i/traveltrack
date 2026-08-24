/**
 * Tempo (temperatura, chuva, vento) por cidade e data, via Open-Meteo (API pública, sem
 * chave/credencial) - dois caminhos dependendo de quão longe a data está de hoje:
 *
 * - Até 16 dias à frente: previsão REAL (`/v1/forecast`), inclui o dia exato pedido.
 * - Além disso (a maioria das viagens, planejadas com meses de antecedência): não tem previsão
 *   disponível - faz a MÉDIA histórica do mesmo dia/mês nos últimos anos (`/v1/archive`), como
 *   aproximação de "época do ano". `source` no retorno diz qual dos dois foi usado, pra tela
 *   poder avisar o usuário (a média histórica não é "o tempo vai fazer X", é só uma estimativa).
 */

interface GeoResult {
  latitude: number;
  longitude: number;
}

export type WeatherSource = "forecast" | "historico";

export interface WeatherResult {
  min: number;
  max: number;
  /** Chuva acumulada do dia (mm) - previsão real quando `source` é "forecast", média histórica
   * dos últimos anos quando "historico". */
  chuva: number | null;
  /** Rajada máxima do dia (km/h) - mesma regra de `chuva` acima. */
  vento: number | null;
  source: WeatherSource;
}

const PAST_YEARS = 3;
const FORECAST_MAX_DIAS = 16;
const FETCH_TIMEOUT_MS = 8000;
const DAILY_FIELDS = "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max";

/** fetch com timeout: sem isso, uma cidade sem resposta da Open-Meteo trava o loop de busca inteiro. */
async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Variações do texto da cidade a tentar, da mais específica pra mais genérica, até achar geocoding. */
function cityVariants(city: string): string[] {
  const trimmed = city.trim();
  const beforeComma = trimmed.split(/[,\--]/)[0].trim();
  const noAccents = stripAccents(trimmed);
  const firstWords = trimmed.split(/\s+/).slice(0, 2).join(" ");

  return Array.from(new Set([trimmed, beforeComma, noAccents, firstWords].filter(Boolean)));
}

async function geocodeOne(query: string): Promise<GeoResult | null> {
  const res = await fetchWithTimeout(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=pt&format=json`
  );
  if (!res) return null;
  const data = await res.json();
  const first = data?.results?.[0];
  if (!first) return null;
  return { latitude: first.latitude, longitude: first.longitude };
}

/** Tenta o nome da cidade como veio; se não achar, tenta variações mais genéricas (a "mais próxima" com dados disponíveis). */
async function geocodeCity(city: string): Promise<GeoResult | null> {
  for (const variant of cityVariants(city)) {
    const geo = await geocodeOne(variant);
    if (geo) return geo;
  }
  return null;
}

function diasAPartirDeHoje(dateISO: string): number {
  const MS_DIA = 86_400_000;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${dateISO.slice(0, 10)}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / MS_DIA);
}

async function fetchForecast(geo: GeoResult, dateISO: string): Promise<WeatherResult | null> {
  const res = await fetchWithTimeout(
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&start_date=${dateISO}&end_date=${dateISO}&daily=${DAILY_FIELDS}&timezone=auto`
  );
  if (!res) return null;
  const data = await res.json();
  const tMax = data?.daily?.temperature_2m_max?.[0];
  const tMin = data?.daily?.temperature_2m_min?.[0];
  if (typeof tMax !== "number" || typeof tMin !== "number") return null;
  return {
    min: tMin,
    max: tMax,
    chuva: data?.daily?.precipitation_sum?.[0] ?? null,
    vento: data?.daily?.windspeed_10m_max?.[0] ?? null,
    source: "forecast",
  };
}

async function fetchHistoricalAverage(geo: GeoResult, dateISO: string): Promise<WeatherResult | null> {
  const [, mm, dd] = dateISO.slice(0, 10).split("-");
  const currentYear = new Date().getFullYear();

  const mins: number[] = [];
  const maxs: number[] = [];
  const chuvas: number[] = [];
  const ventos: number[] = [];
  for (let i = 1; i <= PAST_YEARS; i++) {
    const pastDate = `${currentYear - i}-${mm}-${dd}`;
    const res = await fetchWithTimeout(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${geo.latitude}&longitude=${geo.longitude}&start_date=${pastDate}&end_date=${pastDate}&daily=${DAILY_FIELDS}&timezone=auto`
    );
    if (!res) continue;
    const data = await res.json();
    const tMax = data?.daily?.temperature_2m_max?.[0];
    const tMin = data?.daily?.temperature_2m_min?.[0];
    const chuva = data?.daily?.precipitation_sum?.[0];
    const vento = data?.daily?.windspeed_10m_max?.[0];
    if (typeof tMax === "number") maxs.push(tMax);
    if (typeof tMin === "number") mins.push(tMin);
    if (typeof chuva === "number") chuvas.push(chuva);
    if (typeof vento === "number") ventos.push(vento);
  }

  if (!mins.length || !maxs.length) return null;
  const media = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    min: media(mins),
    max: media(maxs),
    chuva: chuvas.length ? media(chuvas) : null,
    vento: ventos.length ? media(ventos) : null,
    source: "historico",
  };
}

/**
 * Tempo pra uma cidade numa data específica - previsão real se a data cair dentro dos próximos
 * `FORECAST_MAX_DIAS` dias, senão a média histórica do mesmo dia/mês nos últimos anos. `null` se
 * a cidade não geocodificar ou nenhuma das duas fontes tiver dado.
 */
export async function weatherForCity(city: string, dateISO: string): Promise<WeatherResult | null> {
  const geo = await geocodeCity(city);
  if (!geo) return null;

  const dias = diasAPartirDeHoje(dateISO);
  if (dias >= 0 && dias <= FORECAST_MAX_DIAS) {
    const previsao = await fetchForecast(geo, dateISO);
    if (previsao) return previsao;
    // Previsão falhou por algum motivo transitório - cai pro histórico em vez de ficar sem nada.
  }
  return fetchHistoricalAverage(geo, dateISO);
}
