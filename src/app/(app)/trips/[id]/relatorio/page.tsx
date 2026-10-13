"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  useClassificacoes,
  useCollaborators,
  useCountries,
  useMeiosPagamento,
  useOfflineCollection,
  useOfflineTrip,
} from "@/lib/offline/useOfflineData";
import { computeRelatorio, categoriaDoNome, type Categoria } from "@/lib/relatorioCalc";
import { FILTER_SELECT_CLASS } from "@/lib/uiClasses";

interface ItemFinanceiro {
  id: string;
  classificacao_id: string;
  valor: string;
  natureza?: string;
  status?: string;
  pagador_id?: string;
  meio_pagamento_id?: string;
  moeda?: string;
  nome_companhia?: string;
  nome_local?: string;
  numero?: string;
  descricao?: string;
  data?: string;
  data_pagamento?: string;
}

interface CambioEvento {
  id: string;
  moeda: string;
  qtd_moeda: string;
  qtd_reais: string;
  taxa_efetiva: string;
}

const STATUS_OPCOES = [
  { value: "pago", label: "Pago" },
  { value: "a_pagar", label: "A pagar" },
];

function formatMoney(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseValor(v: string | undefined): number {
  if (!v) return 0;
  return Number(String(v).replace(",", ".")) || 0;
}

function nomeItem(i: ItemFinanceiro): string {
  return i.nome_companhia || i.nome_local || i.numero || i.descricao || "Item sem nome";
}

function formatData(d: string | undefined): string {
  if (!d) return "";
  // dd/mm/yyyy or yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }
  return d.slice(0, 10);
}

function StatusBadge({ status }: { status?: string }) {
  if (status === "pago")
    return (
      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        Pago
      </span>
    );
  if (status === "a_pagar")
    return (
      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
        A pagar
      </span>
    );
  return null;
}

export default function RelatorioPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { trip, loading: loadingTrip } = useOfflineTrip<{
    id: string;
    qtd_pessoas: string;
    custo_modo?: "por_pessoa" | "total" | "";
  }>(tripId);
  const { items: days, loading: loadingDays } = useOfflineCollection<
    { id: string } & Record<string, unknown>
  >("tripDays", tripId);
  const { items: itens, loading: loadingItens } = useOfflineCollection<ItemFinanceiro>("itens", tripId);
  const { items: cambios } = useOfflineCollection<CambioEvento>("cambio", tripId);
  const countries = useCountries();
  const classificacoes = useClassificacoes();
  const nomePorClassificacao = useMemo(
    () => Object.fromEntries(classificacoes.map((c) => [c.id, c.nome])),
    [classificacoes]
  );
  const collaborators = useCollaborators(tripId);
  const nomePorColaborador = useMemo(
    () => Object.fromEntries(collaborators.map((c) => [c.id, c.nome])),
    [collaborators]
  );
  const meiosPagamento = useMeiosPagamento().filter((m) => m.ativo === "true");

  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroMeioPagamento, setFiltroMeioPagamento] = useState("");
  const [filtroPagador, setFiltroPagador] = useState("");
  const [expandidas, setExpandidas] = useState<Set<Categoria>>(new Set());

  const loading = loadingTrip || loadingDays || loadingItens;

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>;
  if (!trip) return <p className="text-sm text-red-600 dark:text-red-400">Erro ao carregar relatório.</p>;

  // Filtros afetam só o "Realizado" (itens de fato lançados) - o "Orçado" vem do planejamento por
  // dia (TripDays), que não tem noção de status/pagador/meio de pagamento, então fica constante
  // como referência de comparação mesmo com filtro ativo.
  const itensFiltrados = itens
    .filter((i) => !filtroStatus || i.status === filtroStatus)
    .filter((i) => !filtroMeioPagamento || i.meio_pagamento_id === filtroMeioPagamento)
    .filter((i) => !filtroPagador || i.pagador_id === filtroPagador)
    .map((i) => ({ ...i, classificacaoNome: nomePorClassificacao[i.classificacao_id] ?? "" }));
  const temFiltroAtivo = Boolean(filtroStatus || filtroMeioPagamento || filtroPagador);

  // Itens de débito agrupados por categoria (para o acordeão analítico)
  const itensPorCategoria = new Map<Categoria, (ItemFinanceiro & { classificacaoNome: string })[]>();
  for (const item of itensFiltrados) {
    if (item.natureza !== "debito") continue;
    const cat = categoriaDoNome(item.classificacaoNome ?? "");
    if (!cat) continue;
    const lista = itensPorCategoria.get(cat) ?? [];
    lista.push(item);
    itensPorCategoria.set(cat, lista);
  }

  const cotacoes: Record<string, number> = {};
  for (const c of countries) {
    const code = (c.currency_code || "").trim().toUpperCase();
    const rate = Number(String(c.rate_brl).replace(",", "."));
    if (code && Number.isFinite(rate) && rate > 0 && !cotacoes[code]) cotacoes[code] = rate;
  }

  const relatorio = computeRelatorio(
    tripId,
    Number(trip.qtd_pessoas) || 0,
    days,
    itensFiltrados,
    trip.custo_modo,
    cambios,
    cotacoes
  );

  function toggleCategoria(cat: Categoria) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">Status</label>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className={FILTER_SELECT_CLASS}
          >
            <option value="">Todos</option>
            {STATUS_OPCOES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">Meio de pagamento</label>
          <select
            value={filtroMeioPagamento}
            onChange={(e) => setFiltroMeioPagamento(e.target.value)}
            className={FILTER_SELECT_CLASS}
          >
            <option value="">Todos</option>
            {meiosPagamento.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">Pagador</label>
          <select
            value={filtroPagador}
            onChange={(e) => setFiltroPagador(e.target.value)}
            className={FILTER_SELECT_CLASS}
          >
            <option value="">Todos</option>
            {collaborators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        {temFiltroAtivo && (
          <button
            type="button"
            onClick={() => {
              setFiltroStatus("");
              setFiltroMeioPagamento("");
              setFiltroPagador("");
            }}
            className="mb-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {relatorio.avisosConversao.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {relatorio.avisosConversao.map((aviso) => (
            <p key={aviso}>⚠️ {aviso}</p>
          ))}
        </div>
      )}

      {relatorio.taxasConversao.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Itens em moeda estrangeira convertidos pra R$:{" "}
          {relatorio.taxasConversao
            .filter((t) => t.fonte !== "sem_taxa")
            .map(
              (t) =>
                `${t.moeda} a ${t.taxa.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4,
                })} (${t.fonte === "cambio" ? "custo médio do câmbio" : "cotação do dia"})`
            )
            .join(" · ")}
          .
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {/* Mobile: lista de cards por categoria */}
        <div className="sm:hidden">
          <div className="grid grid-cols-3 gap-1 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-[10px] font-medium uppercase text-slate-500 dark:text-slate-400">
            <span>Orçado</span>
            <span className="text-center">Realizado</span>
            <span className="text-right">Diferença</span>
          </div>
          {relatorio.categorias.map((c) => {
            const diff = c.orcado - c.realizado;
            const itensCategoria = itensPorCategoria.get(c.categoria) ?? [];
            const aberto = expandidas.has(c.categoria);
            return (
              <div key={c.categoria} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                <button
                  type="button"
                  onClick={() => itensCategoria.length > 0 && toggleCategoria(c.categoria)}
                  className="w-full px-3 py-2.5 text-left"
                >
                  <div className="mb-1.5 flex items-center gap-1">
                    {itensCategoria.length > 0 && (
                      <span className={`text-[10px] text-slate-400 transition-transform ${aberto ? "rotate-90" : ""}`}>▶</span>
                    )}
                    <span className="truncate text-xs font-medium capitalize text-slate-700 dark:text-slate-300">{c.categoria}</span>
                    {itensCategoria.length > 0 && (
                      <span className="ml-auto shrink-0 text-[10px] text-slate-400">{itensCategoria.length}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-xs text-slate-800 dark:text-slate-200">
                    <span>{formatMoney(c.orcado)}</span>
                    <span className="text-center">{formatMoney(c.realizado)}</span>
                    <span className={`text-right ${diff < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {formatMoney(diff)}
                    </span>
                  </div>
                </button>

                {aberto && itensCategoria.length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/30">
                    {itensCategoria.map((item) => {
                      const data = formatData(item.data_pagamento || item.data);
                      const moedaStr = item.moeda && item.moeda !== "BRL" && item.moeda !== "" ? item.moeda : null;
                      const valorNum = parseValor(item.valor);
                      const valorStr = moedaStr
                        ? `${moedaStr} ${valorNum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : formatMoney(valorNum);
                      const pagador = item.pagador_id ? nomePorColaborador[item.pagador_id] : undefined;
                      return (
                        <div key={item.id} className="flex items-start justify-between gap-2 px-4 py-2 text-xs">
                          <div className="min-w-0">
                            <p className="truncate text-slate-700 dark:text-slate-300">{nomeItem(item)}</p>
                            <p className="text-[10px] text-slate-400">
                              {[data, pagador].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-0.5">
                            <span className="font-medium text-slate-800 dark:text-slate-200">{valorStr}</span>
                            <StatusBadge status={item.status} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div className="bg-slate-50 dark:bg-slate-950 px-3 py-2.5 font-medium">
            <p className="mb-1.5 text-xs text-slate-700 dark:text-slate-300">Total</p>
            <div className="grid grid-cols-3 gap-1 text-xs text-slate-800 dark:text-slate-200">
              <span>{formatMoney(relatorio.totalOrcado)}</span>
              <span className="text-center">{formatMoney(relatorio.totalDespesas)}</span>
              <span className={`text-right ${relatorio.totalOrcado - relatorio.totalDespesas < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {formatMoney(relatorio.totalOrcado - relatorio.totalDespesas)}
              </span>
            </div>
          </div>
        </div>

        {/* Desktop: tabela tradicional (sm+) */}
        {/* `table-fixed` + largura fixa por coluna - sem isso, trocar de filtro muda os valores
            (menos dígitos = coluna mais estreita), fazendo a Categoria "andar" de lugar. */}
        <table className="hidden w-full table-fixed text-sm sm:table">
          <thead className="bg-slate-50 dark:bg-slate-950 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="w-[34%] px-3 py-2">Categoria</th>
              <th className="w-[22%] px-3 py-2 text-right">Orçado</th>
              <th className="w-[22%] px-3 py-2 text-right">Realizado</th>
              <th className="w-[22%] px-3 py-2 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {relatorio.categorias.map((c) => {
              const diff = c.orcado - c.realizado;
              const itensCategoria = itensPorCategoria.get(c.categoria) ?? [];
              const aberto = expandidas.has(c.categoria);
              return (
                <>
                  <tr
                    key={c.categoria}
                    className={`border-t border-slate-100 dark:border-slate-800 ${itensCategoria.length > 0 ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""}`}
                    onClick={() => itensCategoria.length > 0 && toggleCategoria(c.categoria)}
                  >
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        {itensCategoria.length > 0 ? (
                          <span className={`text-[10px] text-slate-400 transition-transform duration-150 ${aberto ? "rotate-90" : ""}`}>▶</span>
                        ) : (
                          <span className="w-3" />
                        )}
                        <span className="capitalize">{c.categoria}</span>
                        {itensCategoria.length > 0 && (
                          <span className="text-xs text-slate-400">({itensCategoria.length})</span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{formatMoney(c.orcado)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{formatMoney(c.realizado)}</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right ${diff < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {formatMoney(diff)}
                    </td>
                  </tr>
                  {aberto &&
                    itensCategoria.map((item) => {
                      const data = formatData(item.data_pagamento || item.data);
                      const moedaStr = item.moeda && item.moeda !== "BRL" && item.moeda !== "" ? item.moeda : null;
                      const valorNum = parseValor(item.valor);
                      const valorStr = moedaStr
                        ? `${moedaStr} ${valorNum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : formatMoney(valorNum);
                      const pagador = item.pagador_id ? nomePorColaborador[item.pagador_id] : undefined;
                      return (
                        <tr key={item.id} className="bg-slate-50/70 dark:bg-slate-800/30">
                          <td className="px-3 py-1.5">
                            <span className="flex items-center gap-2 pl-5">
                              <span className="h-px w-2 shrink-0 bg-slate-300 dark:bg-slate-600" />
                              <span className="min-w-0">
                                <span className="block truncate text-xs text-slate-700 dark:text-slate-300">{nomeItem(item)}</span>
                                {(data || pagador) && (
                                  <span className="text-[10px] text-slate-400">
                                    {[data, pagador].filter(Boolean).join(" · ")}
                                  </span>
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right text-[11px] text-slate-400">{data}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs text-slate-700 dark:text-slate-300">{valorStr}</td>
                          <td className="px-3 py-1.5 text-right">
                            <StatusBadge status={item.status} />
                          </td>
                        </tr>
                      );
                    })}
                </>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-medium">
              <td className="px-3 py-2">Total</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{formatMoney(relatorio.totalOrcado)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{formatMoney(relatorio.totalDespesas)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                {formatMoney(relatorio.totalOrcado - relatorio.totalDespesas)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Orçamento total</p>
          <p className="mt-1 text-right text-lg font-semibold text-slate-900 dark:text-slate-100">
            {formatMoney(relatorio.totalOrcado)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Receitas (aportes)</p>
          <p className="mt-1 text-right text-lg font-semibold text-slate-900 dark:text-slate-100">
            {formatMoney(relatorio.totalReceitas)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Saldo</p>
          <p
            className={`mt-1 text-right text-lg font-semibold ${
              relatorio.saldo < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {formatMoney(relatorio.saldo)}
          </p>
        </div>
      </div>
    </div>
  );
}
