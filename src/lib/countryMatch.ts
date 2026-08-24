import { CountryInfo } from "./offline/sync";

/** Normaliza pra comparar nome de país com tolerância a acento/maiúscula/espaço - a Open-Meteo
 * devolve o país em português (ex.: "Estados Unidos", "Japão"), e não há garantia de que a
 * grafia na aba Countries bata 100% com isso, então a comparação ignora acentuação e caixa. */
export function normalizeCountry(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export function findCountry(lista: CountryInfo[], pais: string): CountryInfo | null {
  if (!pais) return null;
  const alvo = normalizeCountry(pais);
  return lista.find((c) => normalizeCountry(c.country) === alvo) ?? null;
}
