/**
 * Resumo das operações de câmbio de uma viagem, agrupado por moeda. Puro (sem I/O) pra rodar
 * igual no servidor e no cliente offline - mesmo padrão de `relatorioCalc.ts`.
 *
 * `custo_medio` é ponderado pelo valor: `Σ qtd_reais / Σ qtd_moeda` (o R$ que cada unidade da
 * moeda de fato custou no conjunto das operações). `taxa_efetiva_media` é a média das taxas
 * informadas, ponderada pela quantidade de moeda - fica igual ao `custo_medio` quando o usuário
 * informa a taxa coerente com `qtd_reais/qtd_moeda`, mas os dois são guardados separados porque o
 * app não força essa coerência.
 */
export interface CambioEventoLike {
  moeda: string;
  qtd_moeda: string | number;
  qtd_reais: string | number;
  taxa_efetiva: string | number;
}

export interface ResumoMoeda {
  moeda: string;
  eventos: number;
  totalMoeda: number;
  totalReais: number;
  custoMedio: number;
  taxaEfetivaMedia: number;
}

function num(v: string | number): number {
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Item de viagem em moeda estrangeira, expresso em R$: `BRL`/vazio fica inalterado; qualquer
 * outra moeda é convertida pelo custo médio ponderado do câmbio daquela moeda (`Σ qtd_reais /
 * Σ qtd_moeda`); sem câmbio registrado da moeda, cai na `cotacaoFallback` (ex.:
 * `Countries.rate_brl`) e marca `fonte: "cotacao"`; sem nem isso, devolve o valor original e
 * `fonte: "sem_taxa"` (quem chama decide o que fazer - nunca somar como se fosse R$). Puro, roda
 * igual no servidor e no cliente offline. */
export type FonteConversao = "reais" | "cambio" | "cotacao" | "sem_taxa";

export interface ConversaoBRL {
  valorBRL: number;
  moeda: string;
  taxa: number;
  fonte: FonteConversao;
}

export function converterValorParaBRL(
  valor: string | number,
  moeda: string,
  medioPorMoeda: Record<string, number>,
  cotacaoFallback: Record<string, number> = {}
): ConversaoBRL {
  const v = num(valor);
  const codigo = (moeda || "").trim().toUpperCase();
  if (!codigo || codigo === "BRL") {
    return { valorBRL: v, moeda: "BRL", taxa: 1, fonte: "reais" };
  }
  const medio = medioPorMoeda[codigo];
  if (medio && medio > 0) {
    return { valorBRL: v * medio, moeda: codigo, taxa: medio, fonte: "cambio" };
  }
  const cotacao = cotacaoFallback[codigo];
  if (cotacao && cotacao > 0) {
    return { valorBRL: v * cotacao, moeda: codigo, taxa: cotacao, fonte: "cotacao" };
  }
  // Sem câmbio nem cotação: não dá pra converter, e somar o número como se fosse real seria
  // pior que não somar. Entra como 0 - o aviso no relatório diz que falta registrar o câmbio.
  return { valorBRL: 0, moeda: codigo, taxa: 0, fonte: "sem_taxa" };
}

/** `{ USD: 5.42, EUR: 6.1 }` - custo médio ponderado (R$ por unidade) de cada moeda com câmbio
 * registrado. Atalho sobre `resumoCambioPorMoeda` pra quem só quer a taxa de conversão. */
export function custoMedioPorMoeda(cambios: CambioEventoLike[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of resumoCambioPorMoeda(cambios)) {
    if (r.custoMedio > 0) out[r.moeda] = r.custoMedio;
  }
  return out;
}

export function resumoCambioPorMoeda(cambios: CambioEventoLike[]): ResumoMoeda[] {
  const porMoeda = new Map<string, CambioEventoLike[]>();
  for (const c of cambios) {
    const moeda = (c.moeda || "").trim().toUpperCase();
    if (!moeda) continue;
    const lista = porMoeda.get(moeda) ?? [];
    lista.push(c);
    porMoeda.set(moeda, lista);
  }

  return [...porMoeda.entries()]
    .map(([moeda, lista]) => {
      const totalMoeda = lista.reduce((s, c) => s + num(c.qtd_moeda), 0);
      const totalReais = lista.reduce((s, c) => s + num(c.qtd_reais), 0);
      const somaTaxaPonderada = lista.reduce(
        (s, c) => s + num(c.qtd_moeda) * num(c.taxa_efetiva),
        0
      );
      return {
        moeda,
        eventos: lista.length,
        totalMoeda,
        totalReais,
        custoMedio: totalMoeda > 0 ? totalReais / totalMoeda : 0,
        taxaEfetivaMedia: totalMoeda > 0 ? somaTaxaPonderada / totalMoeda : 0,
      };
    })
    .sort((a, b) => a.moeda.localeCompare(b.moeda));
}
