import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  // O @serwist/next injeta uma config de webpack no objeto do Next mesmo com o serwist
  // desligado em dev (disable, abaixo) — isso por si só faz o Turbopack (usado em `next dev`)
  // recusar o build achando que é engano. `turbopack: {}` confirma que é intencional.
  turbopack: {},
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // O `next dev` deste projeto roda em Turbopack (não mudamos isso), que o Serwist ainda não
  // suporta — desliga em dev pra não quebrar o dia a dia. `npm run build` já força `--webpack`
  // (só nesse comando) justamente pra gerar o service worker de produção sem esse conflito.
  disable: process.env.NODE_ENV !== "production",
});

export default withSerwist(nextConfig);
