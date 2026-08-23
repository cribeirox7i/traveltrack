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
 */
export function computeRelatorio(
  tripId: string,
  qtdPessoas: number,
  days: Record<string, unknown>[],
  despesas: { categoria: string; valor: string | number }[],
  receitas: { valor: string | number }[]
): Relatorio {
  const categorias: RelatorioCategoria[] = CATEGORIAS.map(({ key, dayField }) => {
    const orcadoPorPessoa = days.reduce((sum, day) => sum + (Number(day[dayField]) || 0), 0);
    const orcado = orcadoPorPessoa * qtdPessoas;
    const realizado = despesas
      .filter((d) => d.categoria === key)
      .reduce((sum, d) => sum + (Number(d.valor) || 0), 0);
    return { categoria: key, orcado, realizado };
  });

  const totalOrcado = categorias.reduce((sum, c) => sum + c.orcado, 0);
  const totalDespesas = categorias.reduce((sum, c) => sum + c.realizado, 0);
  const totalReceitas = receitas.reduce((sum, r) => sum + (Number(r.valor) || 0), 0);
  const saldo = totalOrcado - totalDespesas + totalReceitas;

  return { tripId, qtdPessoas, categorias, totalOrcado, totalDespesas, totalReceitas, saldo };
}
