/**
 * Temperatura histórica (mín/máx) por cidade, via Open-Meteo (API pública, sem chave/credencial).
 * Como as viagens costumam ser planejadas com meses de antecedência, não dá pra usar previsão
 * (só cobre ~16 dias à frente) — em vez disso, faz a média da temperatura do mesmo dia/mês nos
 * últimos anos (clima histórico), como aproximação de "época do ano". Não é a previsão de "agora".
 */

interface GeoResult {
  latitude: number;
  longitude: number;
}

export interface TempRange {
  min: number;
  max: number;
}

const PAST_YEARS = 3;
const FETCH_TIMEOUT_MS = 8000;

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
  const beforeComma = trimmed.split(/[,\-–]/)[0].trim();
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

/** Retorna a média (°C) de mín/máx do dia `month/day` nos últimos anos, ou null se não achar cidade/dados. */
export async function averageTemperatureForCity(
  city: string,
  month: number,
  day: number
): Promise<TempRange | null> {
  const geo = await geocodeCity(city);
  if (!geo) return null;

  const currentYear = new Date().getFullYear();
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  const mins: number[] = [];
  const maxs: number[] = [];
  for (let i = 1; i <= PAST_YEARS; i++) {
    const dateStr = `${currentYear - i}-${mm}-${dd}`;
    const res = await fetchWithTimeout(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${geo.latitude}&longitude=${geo.longitude}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
    );
    if (!res) continue;
    const data = await res.json();
    const tMax = data?.daily?.temperature_2m_max?.[0];
    const tMin = data?.daily?.temperature_2m_min?.[0];
    if (typeof tMax === "number") maxs.push(tMax);
    if (typeof tMin === "number") mins.push(tMin);
  }

  if (!mins.length || !maxs.length) return null;
  return {
    min: mins.reduce((a, b) => a + b, 0) / mins.length,
    max: maxs.reduce((a, b) => a + b, 0) / maxs.length,
  };
}
