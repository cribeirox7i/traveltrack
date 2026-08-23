import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  // O @serwist/next injeta uma config de webpack no objeto do Next mesmo com o serwist
  // desligado em dev (disable, abaixo) - isso por si só faz o Turbopack (usado em `next dev`)
  // recusar o build achando que é engano. `turbopack: {}` confirma que é intencional.
  turbopack: {},
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
