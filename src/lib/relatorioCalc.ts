import type { CambioEventoLike, ConversaoBRL } from "./cambioCalc";
import { converterValorParaBRL, custoMedioPorMoeda } from "./cambioCalc";

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

/** Taxa usada pra converter itens de uma moeda estrangeira em R$ no relatório - uma por moeda
 * envolvida. `fonte` diz se veio do câmbio da viagem (custo médio ponderado) ou da cotação do
 * dia (`Countries.rate_brl`), pra tela poder avisar. */
export interface TaxaConversao {
  moeda: string;
  taxa: number;
  fonte: ConversaoBRL["fonte"];
  itens: number;
}

export interface Relatorio {
  tripId: string;
  qtdPessoas: number;
  categorias: RelatorioCategoria[];
  totalOrcado: number;
  totalDespesas: number;
  totalReceitas: number;
  saldo: number;
  /** Taxas aplicadas a itens em moeda estrangeira (vazio quando tudo é em R$). */
  taxasConversao: TaxaConversao[];
  /** Mensagens pra faixa de aviso - hoje, itens que não tinham câmbio da moeda e caíram na
   * cotação do dia, ou itens sem taxa nenhuma (contados como 0). */
  avisosConversao: string[];
}

interface ItemRelatorio {
  categoria: string;
  valor: string | number;
  natureza?: string;
  moeda?: string;
}

/**
 * Puro (sem I/O) pra poder ser calculado tanto no servidor (a partir da planilha) quanto no
 * cliente, offline, a partir do cache local em IndexedDB - mesma lógica dos dois lados.
 *
 * `itens` vem da aba Itens (categorias 1-6, as únicas com campo financeiro - ver
 * `categoriaNatureza` em lib/sheets/types.ts). Documento/Outro nunca têm `valor`, então não
 * afetam o cálculo mesmo participando da lista inteira sem filtro prévio.
 *
 * `cambios` são os eventos da aba Câmbio da viagem: item com `moeda` diferente de BRL/vazio é
 * convertido pra R$ pelo custo médio ponderado daquela moeda. `cotacoes` (`{ USD: 5.4, ... }`,
 * montado a partir de `Countries.rate_brl`) é a queda quando não há câmbio registrado da moeda -
 * nesse caso o relatório ganha um aviso. Sem câmbio nem cotação, o item entra como 0 e também
 * gera aviso - nunca se soma valor em moeda estrangeira como se fosse real.
 */
export function computeRelatorio(
  tripId: string,
  qtdPessoas: number,
  days: Record<string, unknown>[],
  itens: ItemRelatorio[],
  // "total": os campos `_pp` de cada dia já são o custo TOTAL do grupo (apesar do nome do campo,
  // herdado de quando só existia o modo por pessoa) - não multiplica por `qtdPessoas` de novo,
  // senão dobraria o orçado. Linhas antigas/viagens sem essa coluna são tratadas como "por_pessoa".
  custoModo: "por_pessoa" | "total" | "" = "por_pessoa",
  cambios: CambioEventoLike[] = [],
  cotacoes: Record<string, number> = {}
): Relatorio {
  const medioPorMoeda = custoMedioPorMoeda(cambios);

  // Converte cada item pra R$ uma vez, guardando a conversão pra montar os avisos/taxas depois.
  const convertidos = itens.map((i) => ({
    ...i,
    conv: converterValorParaBRL(i.valor, i.moeda ?? "", medioPorMoeda, cotacoes),
  }));

  const debitos = convertidos.filter((i) => i.natureza === "debito");
  const creditos = convertidos.filter((i) => i.natureza === "credito");

  const categorias: RelatorioCategoria[] = CATEGORIAS.map(({ key, dayField }) => {
    const somaCampos = days.reduce((sum, day) => sum + (Number(day[dayField]) || 0), 0);
    const orcado = custoModo === "total" ? somaCampos : somaCampos * qtdPessoas;
    const realizado = debitos
      .filter((d) => d.categoria === key)
      .reduce((sum, d) => sum + d.conv.valorBRL, 0);
    return { categoria: key, orcado, realizado };
  });

  const totalOrcado = categorias.reduce((sum, c) => sum + c.orcado, 0);
  const totalDespesas = categorias.reduce((sum, c) => sum + c.realizado, 0);
  const totalReceitas = creditos.reduce((sum, i) => sum + i.conv.valorBRL, 0);
  const saldo = totalOrcado - totalDespesas + totalReceitas;

  // Taxas e avisos a partir das conversões que não foram "reais" puros.
  const porMoeda = new Map<string, TaxaConversao>();
  for (const { conv } of convertidos) {
    if (conv.fonte === "reais") continue;
    const atual = porMoeda.get(conv.moeda);
    if (atual) atual.itens += 1;
    else porMoeda.set(conv.moeda, { moeda: conv.moeda, taxa: conv.taxa, fonte: conv.fonte, itens: 1 });
  }
  const taxasConversao = [...porMoeda.values()].sort((a, b) => a.moeda.localeCompare(b.moeda));

  const avisosConversao: string[] = [];
  for (const t of taxasConversao) {
    if (t.fonte === "cotacao") {
      avisosConversao.push(
        `${t.itens} ${t.itens === 1 ? "item" : "itens"} em ${t.moeda} sem câmbio registrado - convertido${
          t.itens === 1 ? "" : "s"
        } pela cotação do dia (${t.taxa.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}).`
      );
    } else if (t.fonte === "sem_taxa") {
      avisosConversao.push(
        `${t.itens} ${t.itens === 1 ? "item" : "itens"} em ${t.moeda} sem câmbio nem cotação - contado${
          t.itens === 1 ? "" : "s"
        } como R$ 0. Registre um câmbio dessa moeda.`
      );
    }
  }

  return {
    tripId,
    qtdPessoas,
    categorias,
    totalOrcado,
    totalDespesas,
    totalReceitas,
    saldo,
    taxasConversao,
    avisosConversao,
  };
}
