"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  useCollaborators,
  useMeiosPagamento,
  useOfflineCollection,
  useOfflineTrip,
} from "@/lib/offline/useOfflineData";
import { computeRelatorio } from "@/lib/relatorioCalc";
import { FILTER_SELECT_CLASS } from "@/lib/uiClasses";

interface ItemFinanceiro {
  id: string;
  categoria: string;
  valor: string;
  natureza?: string;
  status?: string;
  pagador_id?: string;
  meio_pagamento_id?: string;
}

const STATUS_OPCOES = [
  { value: "pago", label: "Pago" },
  { value: "a_pagar", label: "A pagar" },
];

function formatMoney(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const collaborators = useCollaborators(tripId);
  const meiosPagamento = useMeiosPagamento().filter((m) => m.ativo === "true");

  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroMeioPagamento, setFiltroMeioPagamento] = useState("");
  const [filtroPagador, setFiltroPagador] = useState("");

  const loading = loadingTrip || loadingDays || loadingItens;

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>;
  if (!trip) return <p className="text-sm text-red-600 dark:text-red-400">Erro ao carregar relatório.</p>;

  // Filtros afetam só o "Realizado" (itens de fato lançados) - o "Orçado" vem do planejamento por
  // dia (TripDays), que não tem noção de status/pagador/meio de pagamento, então fica constante
  // como referência de comparação mesmo com filtro ativo.
  const itensFiltrados = itens
    .filter((i) => !filtroStatus || i.status === filtroStatus)
    .filter((i) => !filtroMeioPagamento || i.meio_pagamento_id === filtroMeioPagamento)
    .filter((i) => !filtroPagador || i.pagador_id === filtroPagador);
  const temFiltroAtivo = Boolean(filtroStatus || filtroMeioPagamento || filtroPagador);

  const relatorio = computeRelatorio(
    tripId,
    Number(trip.qtd_pessoas) || 0,
    days,
    itensFiltrados,
    trip.custo_modo
  );

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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {/* `table-fixed` + largura fixa por coluna (definida no `<th>`) - sem isso, a largura de
            cada coluna se ajusta ao conteúdo mais largo daquela renderização, e trocar de filtro
            muda os valores (menos dígitos = coluna mais estreita), fazendo a Categoria "andar"
            de lugar mesmo sem nada mudar nela. */}
        <table className="w-full table-fixed text-sm">
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
              return (
                <tr key={c.categoria} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="truncate px-3 py-2 capitalize">{c.categoria}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatMoney(c.orcado)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{formatMoney(c.realizado)}</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right ${diff < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {formatMoney(diff)}
                  </td>
                </tr>
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
