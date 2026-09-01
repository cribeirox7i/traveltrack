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

function cacheNameDe(entrada: (typeof defaultCache)[number]) {
  return (entrada.handler as { cacheName?: string }).cacheName;
}

function isCrossOrigin(entrada: (typeof defaultCache)[number]) {
  return cacheNameDe(entrada) === "cross-origin";
}

/** Regra nativa do Serwist que cacheia `.jpg/.jpeg/.gif/.png/.svg/.ico/.webp` - o matcher
 * original é um RegExp puro testado contra QUALQUER URL, sem checar origem. Isso inclui a capa
 * da viagem (`Trips.capa_url`, URL externa escolhida pelo usuário, sem domínio fixo - ver
 * next.config.ts) - o Service Worker intercepta o `<img>`, tenta buscar ele mesmo, e essa busca
 * feita PELO SERVICE WORKER é avaliada pela CSP `connect-src` (não `img-src`, que é só pro
 * `<img>` original) - como o domínio da capa nunca está em `connect-src` (é arbitrário, não dá
 * pra prever), a busca falhava com `net::ERR_FAILED` sem sequer aparecer na aba de rede.
 * Restringe a mesma-origem: imagem externa passa direto pelo navegador (sob `img-src`, que já
 * libera qualquer `https:`), sem o Service Worker interceptar. */
const REGEX_IMAGEM = /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i;
function isStaticImage(entrada: (typeof defaultCache)[number]) {
  return cacheNameDe(entrada) === "static-image-assets";
}

/**
 * `defaultCache` também termina com uma rota curinga própria (`matcher: /.*\/i`, sem `cacheName`
 * - handler `NetworkOnly` puro) que casa com QUALQUER requisição GET, de qualquer origem, como
 * fallback final do roteador do Workbox. Corrigir só "static-image-assets"/"cross-origin" não
 * bastou: depois delas passarem a exigir mesma-origem, era ESTA regra curinga que continuava
 * pegando a imagem externa - mesmo com handler `NetworkOnly` (sem cache nenhum), o Service
 * Worker ainda intercepta e faz o fetch ele mesmo, e é exatamente esse fetch que a CSP
 * `connect-src` barra (ver comentário de `isStaticImage`). Confirmado direto no `sw.js`
 * publicado antes de mexer aqui - via chamada real, não suposição. */
function isCatchAllGenerico(entrada: (typeof defaultCache)[number]) {
  return entrada.matcher instanceof RegExp && entrada.matcher.source === ".*";
}

/** Regra nativa que cacheia as respostas de `/api/*` - o limite original de 16 entradas é menor
 * que o número de rotas de API do app (mais de 30), então cada tela aberta despejava a resposta
 * de outra: uma viagem baixada "por completo" perdia a lista de usuários/ambientes só por o
 * usuário ter navegado por algumas telas depois. Trocado por um limite alto e prazo longo - é o
 * que faz as telas que buscam direto de `/api` (Ambientes, Acessos, Usuários, Config,
 * Parâmetros) mostrarem a última lista salva sem sinal, em vez de ficarem carregando pra sempre.
 * Só GET entra em cache (é o único método que a Cache API aceita), e `/api/auth/*` continua
 * NetworkOnly por uma regra anterior do próprio defaultCache. */
function isApis(entrada: (typeof defaultCache)[number]) {
  return cacheNameDe(entrada) === "apis";
}

/**
 * URL de TELA (documento HTML), em oposição a rota de API, chunk do Next ou arquivo estático.
 * A distinção é por extensão: toda tela do app mora numa URL sem extensão (`/trips/{id}/itens`,
 * `/admin/ambientes`), e todo arquivo servido tem uma (`/icon-192.png`, `/manifest.webmanifest`,
 * `/sw.js`) - sem esse recorte, a regra `app-pages` abaixo passaria à frente das regras de
 * imagem/fonte/script do defaultCache e guardaria asset no cache de páginas.
 */
function isRotaDeTela(pathname: string) {
  return (
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/") &&
    !/\.[a-z0-9]+$/i.test(pathname)
  );
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // TODA tela do app entra neste cache, não só as de viagem. As páginas são rotas dinâmicas
    // (/trips/{id}/{aba}, mas também /admin/ambientes, /parametros...): o JS de cada uma já vem
    // no precache do build, mas o documento de cada URL concreta só existe no cache se aquela
    // URL exata tiver sido pedida com internet antes. Sem uma regra própria, essas navegações
    // caem no cache genérico "others" do defaultCache - limitado a 32 entradas e compartilhado
    // com todo o resto do mesmo domínio, então as páginas eram despejadas facilmente e a
    // abertura offline caía no fallback /offline.
    //
    // Antes esta regra cobria só `/trips*` (cache "trip-pages"), e era exatamente por isso que
    // Ambientes/Acessos/Usuários/Config/Parâmetros continuavam instáveis sem sinal: ficavam
    // disputando as 32 vagas do "others". `warmAppRoutes`/`warmTripPages`
    // (src/lib/offline/sync.ts) preenchem este cache quando o usuário marca a viagem como
    // offline ou clica em "Baixar offline".
    //
    // Requisições RSC ficam de fora de propósito: elas têm a MESMA URL do documento e o cache é
    // indexado por URL, então guardá-las aqui faria uma navegação receber um payload RSC no
    // lugar do HTML. Elas continuam nos caches `pages-rsc*` do defaultCache; se um payload
    // desses faltar, o Next cai numa navegação normal, que esta regra atende.
    {
      matcher: ({ request, url: { pathname }, sameOrigin }) =>
        sameOrigin && isRotaDeTela(pathname) && !request.headers.get("RSC"),
      handler: new NetworkFirst({
        cacheName: "app-pages",
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
    ...defaultCache.map((entrada) => {
      if (isCrossOrigin(entrada)) {
        return {
          ...entrada,
          matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
            !sameOrigin && hostPermitido(url.hostname),
        };
      }
      if (isStaticImage(entrada)) {
        return {
          ...entrada,
          matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
            sameOrigin && REGEX_IMAGEM.test(url.href),
        };
      }
      if (isApis(entrada)) {
        return {
          ...entrada,
          handler: new NetworkFirst({
            cacheName: "apis",
            plugins: [
              {
                // Mesma razão do `cacheWillUpdate` de "app-pages": com a sessão expirada o
                // servidor pode responder um redirect pro /login, e gravar isso sob a URL da
                // API faria a tela offline receber HTML de login onde espera JSON.
                cacheWillUpdate: async ({ response }) =>
                  response.status === 200 && !response.redirected ? response : null,
              },
              new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60 }),
            ],
            networkTimeoutSeconds: 10,
          }),
        };
      }
      if (isCatchAllGenerico(entrada)) {
        return {
          ...entrada,
          matcher: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
            sameOrigin || hostPermitido(url.hostname),
        };
      }
      return entrada;
    }),
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

/** O cache de páginas se chamava "trip-pages" enquanto cobria só as telas de viagem; agora que
 * cobre o app inteiro chama-se "app-pages". Sem esta limpeza, o cache antigo ficaria parado no
 * aparelho de quem já tinha o app instalado, ocupando espaço sem nunca mais ser lido - a troca
 * de nome faz o Service Worker novo ignorá-lo por completo. */
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("trip-pages"));
});
