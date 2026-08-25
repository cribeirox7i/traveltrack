import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

/**
 * CSP montada a partir das origens que o app realmente usa - qualquer host novo (API, CDN,
 * tiles de mapa) precisa entrar aqui, senão o navegador bloqueia a chamada em produção:
 * - open-meteo: geocoding (autocomplete de cidade) e previsão/histórico de temperatura
 * - jsdelivr: datasets estáticos de país (moeda, DDI, fuso) e bandeiras
 * - frankfurter: cotação de moeda
 * - tile.openstreetmap.org: imagens dos tiles do mapa do roteiro
 * `'unsafe-inline'` em script-src é exigido pelo runtime do Next (scripts inline de hidratação
 * e o bootstrap do App Router); trocar por nonce exigiria middleware por requisição.
 *
 * Ao religar a leitura automática de anexo (LEITURA_AUTOMATICA_ATIVA em AnexoUpload.tsx), o
 * Tesseract baixa o pacote de idioma do CDN dele - o host precisará entrar em connect-src.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // `https:` aberto só para imagem: a capa da viagem (`Trips.capa_url`) é uma URL que o próprio
  // usuário cola, de qualquer site - restringir a uma allowlist quebraria o campo.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    "https://geocoding-api.open-meteo.com",
    "https://api.open-meteo.com",
    "https://archive-api.open-meteo.com",
    "https://cdn.jsdelivr.net",
    "https://api.frankfurter.dev",
  ].join(" "),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // O @serwist/next injeta uma config de webpack no objeto do Next mesmo com o serwist
  // desligado em dev (disable, abaixo) - isso por si só faz o Turbopack (usado em `next dev`)
  // recusar o build achando que é engano. `turbopack: {}` confirma que é intencional.
  turbopack: {},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // O `next dev` deste projeto roda em Turbopack (não mudamos isso), que o Serwist ainda não
  // suporta - desliga em dev pra não quebrar o dia a dia. `npm run build` já força `--webpack`
  // (só nesse comando) justamente pra gerar o service worker de produção sem esse conflito.
  disable: process.env.NODE_ENV !== "production",
  // Por padrão o Serwist recarrega a página inteira toda vez que a conexão volta a ficar
  // online - péssimo em ações que fazem várias chamadas seguidas (ex.: "Buscar temperaturas",
  // uma requisição por dia/cidade), onde uma oscilação de sinal no meio dispara um reload no
  // pior momento e derruba a tela com erro. Deixamos o app controlar isso sozinho (já reagimos
  // a "voltar online" via initSync, sem precisar recarregar a página toda).
  reloadOnOnline: false,
});

export default withSerwist(nextConfig);
