/** Abas de uma viagem, agrupadas em 3 seções (Roteiro / Financeiro / Anexos). Fica fora de
 * `components/TripTabs.tsx` porque a camada de sincronização offline (`lib/offline/sync.ts`)
 * também precisa da lista achatada de slugs - pra aquecer o cache do service worker com a URL
 * de cada aba - e não deve depender de um módulo de componente React.
 *
 * As URLs continuam todas em `/trips/{id}/{slug}`, sem prefixo de grupo: agrupar é só uma
 * mudança de navegação, não de rota - evita mexer nas pastas de página e no aquecimento de
 * cache offline, que já indexa por esses mesmos slugs.
 *
 * O slug da segunda aba de Roteiro continua "agenda" (é a pasta/rota já existente, com a
 * tabela Agenda por trás) - só o RÓTULO virou "Roteiro" na navegação; edição de cidades saiu
 * de lá e mora só em Itinerário agora. */
export const TRIP_TAB_SLUGS = [
  "itinerario",
  "agenda",
  "mapa",
  "itens",
  "orcamento",
  "relatorio",
] as const;

export type TripTabSlug = (typeof TRIP_TAB_SLUGS)[number];

export interface TripTabGroup {
  key: string;
  label: string;
  tabs: { slug: TripTabSlug; label: string }[];
}

export const TRIP_TAB_GROUPS: TripTabGroup[] = [
  {
    key: "roteiro",
    label: "Roteiro",
    tabs: [
      { slug: "itinerario", label: "Itinerário" },
      { slug: "agenda", label: "Roteiro" },
      { slug: "mapa", label: "Mapa" },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    tabs: [
      { slug: "orcamento", label: "Orçamento" },
      { slug: "relatorio", label: "Relatório" },
    ],
  },
  {
    key: "itens",
    label: "Itens",
    tabs: [{ slug: "itens", label: "Itens" }],
  },
];

/** Grupo dono de um slug - usado pra destacar o item certo na navegação de nível 1 a partir do
 * pathname atual. */
export function groupOfSlug(slug: string): TripTabGroup | undefined {
  return TRIP_TAB_GROUPS.find((g) => g.tabs.some((t) => t.slug === slug));
}
