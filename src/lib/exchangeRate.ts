"use client";

/** Cotação de câmbio via Frankfurter (frankfurter.dev, dados do Banco Central Europeu) - sem
 * chave, sem cadastro, atualiza em dias úteis. Mesmo espírito do Open-Meteo/Wikipedia usados no
 * resto do app. */
export async function fetchRateToBRL(currencyCode: string): Promise<number | null> {
  if (!currencyCode || currencyCode === "BRL") return currencyCode === "BRL" ? 1 : null;
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(currencyCode)}&symbols=BRL`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: { BRL?: number } };
    return data.rates?.BRL ?? null;
  } catch {
    return null;
  }
}

/** yyyy-MM-dd no fuso do próprio aparelho - usado só pra comparar "já busquei a cotação hoje?",
 * não precisa ser a data UTC exata do dia útil europeu. */
export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
