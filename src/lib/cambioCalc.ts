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
