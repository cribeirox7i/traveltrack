"use client";

import { useParams } from "next/navigation";
import { useOfflineCollection, useOfflineTrip } from "@/lib/offline/useOfflineData";
import { computeRelatorio } from "@/lib/relatorioCalc";

export default function RelatorioPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { trip, loading: loadingTrip } = useOfflineTrip<{ id: string; qtd_pessoas: string }>(tripId);
  const { items: days, loading: loadingDays } = useOfflineCollection<
    { id: string } & Record<string, unknown>
  >("tripDays", tripId);
  const { items: despesas, loading: loadingDespesas } = useOfflineCollection<{
    id: string;
    categoria: string;
    valor: string;
    natureza?: string;
  }>("despesas", tripId);
  const { items: receitas, loading: loadingReceitas } = useOfflineCollection<{
    id: string;
    valor: string;
  }>("receitas", tripId);

  const loading = loadingTrip || loadingDays || loadingDespesas || loadingReceitas;

  if (loading) return <p className="text-sm text-slate-500">Carregando...</p>;
  if (!trip) return <p className="text-sm text-red-600">Erro ao carregar relatório.</p>;

  const relatorio = computeRelatorio(tripId, Number(trip.qtd_pessoas) || 0, days, despesas, receitas);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Orçado</th>
              <th className="px-3 py-2">Realizado</th>
              <th className="px-3 py-2">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {relatorio.categorias.map((c) => {
              const diff = c.orcado - c.realizado;
              return (
                <tr key={c.categoria} className="border-t border-slate-100">
                  <td className="px-3 py-2 capitalize">{c.categoria}</td>
                  <td className="px-3 py-2">R$ {c.orcado.toFixed(2)}</td>
                  <td className="px-3 py-2">R$ {c.realizado.toFixed(2)}</td>
                  <td className={`px-3 py-2 ${diff < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    R$ {diff.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-medium">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2">R$ {relatorio.totalOrcado.toFixed(2)}</td>
              <td className="px-3 py-2">R$ {relatorio.totalDespesas.toFixed(2)}</td>
              <td className="px-3 py-2">
                R$ {(relatorio.totalOrcado - relatorio.totalDespesas).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Orçamento total</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            R$ {relatorio.totalOrcado.toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Receitas (aportes)</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            R$ {relatorio.totalReceitas.toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Saldo</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              relatorio.saldo < 0 ? "text-red-600" : "text-emerald-600"
            }`}
          >
            R$ {relatorio.saldo.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}
