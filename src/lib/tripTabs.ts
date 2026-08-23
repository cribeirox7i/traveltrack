/** Abas de uma viagem, agrupadas em 3 seções (Financeiro / Roteiro / Anexos). Fica fora de
 * `components/TripTabs.tsx` porque a camada de sincronização offline (`lib/offline/sync.ts`)
 * também precisa da lista achatada de slugs — pra aquecer o cache do service worker com a URL
 * de cada aba — e não deve depender de um módulo de componente React.
 *
 * As URLs continuam todas em `/trips/{id}/{slug}`, sem prefixo de grupo: agrupar é só uma
 * mudança de navegação, não de rota — evita mexer nas 7 pastas de página e no aquecimento de
 * cache offline, que já indexa por esses mesmos slugs. */
export const TRIP_TAB_SLUGS = [
  "orcamento",
  "despesas",
  "receitas",
  "relatorio",
  "agenda",
  "mapa",
  "anexos",
] as const;

export type TripTabSlug = (typeof TRIP_TAB_SLUGS)[number];

export interface TripTabGroup {
  key: string;
  label: string;
  tabs: { slug: TripTabSlug; label: string }[];
}

export const TRIP_TAB_GROUPS: TripTabGroup[] = [
  {
    key: "financeiro",
    label: "Financeiro",
    tabs: [
      { slug: "orcamento", label: "Orçamento" },
      { slug: "despesas", label: "Despesas" },
      { slug: "receitas", label: "Receitas" },
      { slug: "relatorio", label: "Relatório" },
    ],
  },
  {
    key: "roteiro",
    label: "Roteiro",
    tabs: [
      { slug: "agenda", label: "Agenda" },
      { slug: "mapa", label: "Mapa" },
    ],
  },
  {
    key: "anexos",
    label: "Anexos",
    tabs: [{ slug: "anexos", label: "Anexos" }],
  },
];

/** Grupo dono de um slug — usado pra destacar o item certo na navegação de nível 1 a partir do
 * pathname atual. */
export function groupOfSlug(slug: string): TripTabGroup | undefined {
  return TRIP_TAB_GROUPS.find((g) => g.tabs.some((t) => t.slug === slug));
}
