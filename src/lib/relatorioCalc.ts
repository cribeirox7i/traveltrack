export type Categoria = "traslado" | "passagem" | "alimentacao" | "passeio" | "hospedagem";

const CATEGORIAS: { key: Categoria; dayField: string }[] = [
  { key: "traslado", dayField: "traslado_pp" },
  { key: "passagem", dayField: "passagem_pp" },
  { key: "alimentacao", dayField: "alimentacao_pp" },
  { key: "passeio", dayField: "passeio_pp" },
  { key: "hospedagem", dayField: "hospedagem_pp" },
];

export interface RelatorioCategoria {
  categoria: Categoria;
  orcado: number;
  realizado: number;
}

export interface Relatorio {
  tripId: string;
  qtdPessoas: number;
  categorias: RelatorioCategoria[];
  totalOrcado: number;
  totalDespesas: number;
  totalReceitas: number;
  saldo: number;
}

/**
 * Puro (sem I/O) pra poder ser calculado tanto no servidor (a partir da planilha) quanto no
 * cliente, offline, a partir do cache local em IndexedDB - mesma lógica dos dois lados.
 *
 * `despesas` vem da aba Despesas/Lançamentos e agora mistura as duas naturezas (débito e
 * crédito, ver Natureza em lib/sheets/types.ts) - células antigas sem a coluna `natureza` são
 * tratadas como débito, já que só existiam lançamentos de despesa até essa coluna existir.
 * `receitas` continua existindo à parte só pelos aportes legados da antiga aba Receitas, que não
 * foram migrados para Despesas - ver a página de Lançamentos.
 */
export function computeRelatorio(
  tripId: string,
  qtdPessoas: number,
  days: Record<string, unknown>[],
  despesas: { categoria: string; valor: string | number; natureza?: string }[],
  receitas: { valor: string | number }[],
  // "total": os campos `_pp` de cada dia já são o custo TOTAL do grupo (apesar do nome do campo,
  // herdado de quando só existia o modo por pessoa) - não multiplica por `qtdPessoas` de novo,
  // senão dobraria o orçado. Linhas antigas/viagens sem essa coluna são tratadas como "por_pessoa".
  custoModo: "por_pessoa" | "total" | "" = "por_pessoa"
): Relatorio {
  const debitos = despesas.filter((d) => (d.natureza ?? "debito") !== "credito");
  const creditos = despesas.filter((d) => d.natureza === "credito");

  const categorias: RelatorioCategoria[] = CATEGORIAS.map(({ key, dayField }) => {
    const somaCampos = days.reduce((sum, day) => sum + (Number(day[dayField]) || 0), 0);
    const orcado = custoModo === "total" ? somaCampos : somaCampos * qtdPessoas;
    const realizado = debitos
      .filter((d) => d.categoria === key)
      .reduce((sum, d) => sum + (Number(d.valor) || 0), 0);
    return { categoria: key, orcado, realizado };
  });

  const totalOrcado = categorias.reduce((sum, c) => sum + c.orcado, 0);
  const totalDespesas = categorias.reduce((sum, c) => sum + c.realizado, 0);
  const totalReceitas =
    creditos.reduce((sum, d) => sum + (Number(d.valor) || 0), 0) +
    receitas.reduce((sum, r) => sum + (Number(r.valor) || 0), 0);
  const saldo = totalOrcado - totalDespesas + totalReceitas;

  return { tripId, qtdPessoas, categorias, totalOrcado, totalDespesas, totalReceitas, saldo };
}
