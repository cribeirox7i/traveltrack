"use client";

/**
 * Busca uma imagem ilustrativa de uma cidade na Wikipedia em português - direto do navegador,
 * igual à Open-Meteo (API pública, sem chave, CORS aberto via `origin=*`). Dois passos porque o
 * endpoint de resumo (`page/summary`) exige o título exato da página, e o nome da cidade como
 * digitado/escolhido no autocomplete raramente bate 100% com isso (acento, "cidade vs. estado",
 * desambiguação) - a busca de texto livre (`action=query&list=search`) resolve pro título certo
 * primeiro.
 */

const WIKI_BASE = "https://pt.wikipedia.org";

export interface CityImage {
  cidade: string;
  titulo: string;
  imageUrl: string;
  pageUrl: string;
}

interface SearchResult {
  query?: { search?: { title: string }[] };
}

interface SummaryResult {
  title: string;
  thumbnail?: { source: string };
  originalimage?: { source: string };
  content_urls?: { desktop?: { page?: string } };
}

async function findTitle(query: string): Promise<string | null> {
  const url = `${WIKI_BASE}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&srlimit=1&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as SearchResult;
  return data.query?.search?.[0]?.title ?? null;
}

async function getSummary(title: string): Promise<SummaryResult | null> {
  const url = `${WIKI_BASE}/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as SummaryResult;
}

/** Devolve `null` silenciosamente pra qualquer falha (cidade sem página, sem imagem de capa,
 * sem sinal...) - uma foto ilustrativa que não aparece não é motivo pra erro visível.
 *
 * Busca o nome puro da cidade primeiro, não "cidade + país" - testado na prática e o país junto
 * às vezes piora o resultado da busca de texto livre em vez de ajudar (ex.: "Sintra Portugal"
 * cai na página de um dos palácios de lá, "Quinta da Regaleira", enquanto "Sintra" sozinho acha
 * a página certa da cidade). O país só entra como segunda tentativa, se a primeira não achar
 * nada - útil pra desambiguar nomes de cidade que se repetem em vários países. */
export async function findCityImage(cidade: string, pais?: string): Promise<CityImage | null> {
  try {
    const title = (await findTitle(cidade)) ?? (pais ? await findTitle(`${cidade} ${pais}`) : null);
    if (!title) return null;

    const summary = await getSummary(title);
    const imageUrl = summary?.thumbnail?.source ?? summary?.originalimage?.source;
    if (!summary || !imageUrl) return null;

    return {
      cidade,
      titulo: summary.title,
      imageUrl,
      pageUrl: summary.content_urls?.desktop?.page ?? `${WIKI_BASE}/wiki/${encodeURIComponent(title)}`,
    };
  } catch {
    return null;
  }
}
