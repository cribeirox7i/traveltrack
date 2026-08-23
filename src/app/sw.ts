import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // As telas de viagem são rotas DINÂMICAS (/trips/{id}/{aba}): o JS de cada aba já vem no
    // precache do build, mas o documento de cada URL concreta só existe no cache se aquela URL
    // exata tiver sido pedida com internet antes. Sem uma regra própria, essas navegações caem
    // no cache genérico "others" do defaultCache — limitado a 32 entradas e compartilhado com
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
            // /trips/... com um redirect pro /login — sem esta checagem, o HTML da tela de
            // login ficaria salvo sob a URL da viagem e seria servido no lugar dela offline,
            // por até 30 dias. Confirmado na prática: um "Baixar offline" deslogado gravava
            // a tela de login no cache da viagem.
            cacheWillUpdate: async ({ response }) =>
              response.status === 200 && !response.redirected ? response : null,
          },
          new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
        networkTimeoutSeconds: 10,
      }),
    },
    // defaultCache cobre o resto: assets estáticos, payloads RSC e demais navegações. Dados de
    // viagem (dias/despesas/receitas) offline são responsabilidade da camada IndexedDB em
    // src/lib/offline, não deste cache.
    ...defaultCache,
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
