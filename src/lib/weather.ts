/**
 * Temperatura média histórica por cidade, via Open-Meteo (API pública, sem chave/credencial).
 * Como as viagens costumam ser planejadas com meses de antecedência, não dá pra usar previsão
 * (só cobre ~16 dias à frente) — em vez disso, faz a média da temperatura do mesmo dia/mês nos
 * últimos anos (clima histórico), como aproximação de "época do ano".
 */

interface GeoResult {
  latitude: number;
  longitude: number;
}

const PAST_YEARS = 3;

async function geocodeCity(city: string): Promise<GeoResult | null> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const first = data?.results?.[0];
  if (!first) return null;
  return { latitude: first.latitude, longitude: first.longitude };
}

/** Retorna a média (°C) do dia `month/day` nos últimos anos, ou null se não achar a cidade/dados. */
export async function averageTemperatureForCity(
  city: string,
  month: number,
  day: number
): Promise<number | null> {
  const geo = await geocodeCity(city);
  if (!geo) return null;

  const currentYear = new Date().getFullYear();
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  const temps: number[] = [];
  for (let i = 1; i <= PAST_YEARS; i++) {
    const dateStr = `${currentYear - i}-${mm}-${dd}`;
    try {
      const res = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${geo.latitude}&longitude=${geo.longitude}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_mean&timezone=auto`
      );
      if (!res.ok) continue;
      const data = await res.json();
      const t = data?.daily?.temperature_2m_mean?.[0];
      if (typeof t === "number") temps.push(t);
    } catch {
      // ano com falha (ex.: data inválida em ano não-bissexto) - segue tentando os demais
    }
  }

  if (!temps.length) return null;
  return temps.reduce((a, b) => a + b, 0) / temps.length;
}
