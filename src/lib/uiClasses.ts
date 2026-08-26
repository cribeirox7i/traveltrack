/** Largura padrão pra todo `<select>` de filtro/ordenação (Itens, Relatório, etc.) - sem isso,
 * cada select fica do tamanho do próprio texto selecionado, e a barra de filtros "pula" de
 * largura conforme a opção escolhida em cada campo. `w-40` cobre a opção mais longa em uso hoje
 * ("Cartão de Crédito BB") sem cortar. */
export const FILTER_SELECT_CLASS =
  "w-40 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs";
