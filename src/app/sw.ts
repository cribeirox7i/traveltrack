import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Hosts externos que o app consulta - todos servem dado público, sem credencial: geocoding e
 * clima (open-meteo), datasets de país e bandeiras (jsdelivr), cotação (frankfurter) e os tiles
 * do mapa (openstreetmap). Ver a regra "cross-origin" mais abaixo. */
const CROSS_ORIGIN_PERMITIDOS = [
  "open-meteo.com",
  "cdn.jsdelivr.net",
  "api.frankfurter.dev",
  "tile.openstreetmap.org",
];

function hostPermitido(hostname: string) {
  return CROSS_ORIGIN_PERMITIDOS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

function isCrossOrigin(entrada: (typeof defaultCache)[number]) {
  const handler = entrada.handler as { cacheName?: string };
  return handler.cacheName === "cross-origin";
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // As telas de viagem são rotas DINÂMICAS (/trips/{id}/{aba}): o JS de cada aba já vem no
    // precache do build, mas o documento de cada URL concreta só existe no cache se aquela URL
    // exata tiver sido pedida com internet antes. Sem uma regra própria, essas navegações caem
    // no cache genérico "others" do defaultCache - limitado a 32 entradas e compartilhado com
    // todo o resto do mesmo domínio, então as páginas de viagem eram despejadas facilmente e a
    // abertura offline caía no fallback /offline. Aqui elas ganham um cache dedicado e grande,
    // que `warmTripPages` (src/lib/offline/sync.ts) preenche na hora em que o usuário marca a
    // viagem como offline ou clica em "Baixar offline".
    //
    // Requisições RSC ficam de fora de propósito: elas têm a MESMA URL do documento e o cache é
    // indexado por URL, então guardá-las aqui faria uma navegação receber um payload RSC no
    // lugar do HTML. Elas continuam nos caches `pages-rsc*` do defaultCache; se um payload
    // desses faltar, o Next cai numa navegação normal, que esta regra atende.
    {
      matcher: ({ request, url: { pathname }, sameOrigin }) =>
        sameOrigin && pathname.startsWith("/trips") && !request.headers.get("RSC"),
      handler: new NetworkFirst({
        cacheName: "trip-pages",
        plugins: [
          {
            // Só guarda a página de verdade. Com a sessão expirada, o servidor responde
            // /trips/... com um redirect pro /login - sem esta checagem, o HTML da tela de
            // login ficaria salvo sob a URL da viagem e seria servido no lugar dela offline,
            // por até 30 dias. Confirmado na prática: um "Baixar offline" deslogado gravava
            // a tela de login no cache da viagem.
            cacheWillUpdate: async ({ response }) =>
              response.status === 200 && !response.redirected ? response : null,

            // Sem isto, uma falha total (rede caiu E a URL não está no cache) faz o NetworkFirst
            // rejeitar, o que vira "Uncaught (in promise) no-response" + um aviso de FetchEvent
            // no console. O `fallbacks` global lá embaixo não cobre esse caso: ele só casa com
            // `destination === "document"`, e `warmTripPages` (sync.ts) aquece as páginas com um
            // `fetch()` comum, cujo destination é vazio - então justamente o aquecimento em
            // segundo plano, que falha com naturalidade num sinal ruim, era o que sujava o
            // console. Aqui a falha vira uma resposta silenciosa: navegação de verdade cai na
            // tela /offline, e o fetch de aquecimento só recebe um 503 que o `.catch` dele já
            // ignora.
            handlerDidError: async ({ request }) =>
              request.destination === "document"
                ? await caches.match("/offline", { ignoreSearch: true })
                : new Response("", { status: 503, statusText: "offline" }),
          },
          new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
        networkTimeoutSeconds: 10,
      }),
    },
    // defaultCache cobre o resto: assets estáticos, payloads RSC e demais navegações. Dados de
    // viagem (dias/despesas/receitas) offline são responsabilidade da camada IndexedDB em
    // src/lib/offline, não deste cache.
    //
    // A regra "cross-origin" nativa do defaultCache é trocada por uma versão com allowlist: a
    // original casa com QUALQUER host de fora (`!sameOrigin`) e guardaria no cache do aparelho a
    // resposta de qualquer API externa que o app venha a chamar, inclusive uma autenticada. Só os
    // hosts abaixo são consultados hoje, e todos servem dado público sem credencial.
    ...defaultCache.map((entrada) =>
      isCrossOrigin(entrada)
        ? {
            ...entrada,
            matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              !sameOrigin && hostPermitido(url.hostname),
          }
        : entrada
    ),
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
