// "atrativo" é o nome novo do que a coluna de Orçamento/TripDays ainda chama de "passeio"
// internamente (`passeio_pp`) - ver decisão de não renomear coluna de planilha em produção só
// por causa do rótulo, no plano "Itens de Viagem + OCR de vouchers".
export type Categoria = "traslado" | "passagem" | "alimentacao" | "atrativo" | "hospedagem";

const CATEGORIAS: { key: Categoria; dayField: string }[] = [
  { key: "traslado", dayField: "traslado_pp" },
  { key: "passagem", dayField: "passagem_pp" },
  { key: "alimentacao", dayField: "alimentacao_pp" },
  { key: "atrativo", dayField: "passeio_pp" },
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
 * `itens` vem da aba Itens (categorias 1-6, as únicas com campo financeiro - ver
 * `categoriaNatureza` em lib/sheets/types.ts). Documento/Outro nunca têm `valor`, então não
 * afetam o cálculo mesmo participando da lista inteira sem filtro prévio.
 */
export function computeRelatorio(
  tripId: string,
  qtdPessoas: number,
  days: Record<string, unknown>[],
  itens: { categoria: string; valor: string | number; natureza?: string }[],
  // "total": os campos `_pp` de cada dia já são o custo TOTAL do grupo (apesar do nome do campo,
  // herdado de quando só existia o modo por pessoa) - não multiplica por `qtdPessoas` de novo,
  // senão dobraria o orçado. Linhas antigas/viagens sem essa coluna são tratadas como "por_pessoa".
  custoModo: "por_pessoa" | "total" | "" = "por_pessoa"
): Relatorio {
  const debitos = itens.filter((i) => i.natureza === "debito");
  const creditos = itens.filter((i) => i.natureza === "credito");

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
  const totalReceitas = creditos.reduce((sum, i) => sum + (Number(i.valor) || 0), 0);
  const saldo = totalOrcado - totalDespesas + totalReceitas;

  return { tripId, qtdPessoas, categorias, totalOrcado, totalDespesas, totalReceitas, saldo };
}
