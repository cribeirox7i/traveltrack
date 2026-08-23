/** Abas de uma viagem. Fica fora de `components/TripTabs.tsx` porque a camada de sincronização
 * offline (`lib/offline/sync.ts`) também precisa da lista — pra aquecer o cache do service
 * worker com a URL de cada aba — e não deve depender de um módulo de componente React. */
export const TRIP_TAB_SLUGS = [
  "orcamento",
  "despesas",
  "receitas",
  "anexos",
  "mapa",
  "relatorio",
] as const;

export type TripTabSlug = (typeof TRIP_TAB_SLUGS)[number];

export const TRIP_TABS: { slug: TripTabSlug; label: string }[] = [
  { slug: "orcamento", label: "Orçamento" },
  { slug: "despesas", label: "Despesas" },
  { slug: "receitas", label: "Receitas" },
  { slug: "anexos", label: "Anexos" },
  { slug: "mapa", label: "Mapa" },
  { slug: "relatorio", label: "Relatório" },
];
