"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useOfflineCollection } from "@/lib/offline/useOfflineData";
import { createDespesaOffline } from "@/lib/offline/sync";

interface Despesa {
  id: string;
  categoria: string;
  valor: string;
  data: string;
  descricao: string;
}

const CATEGORIAS = [
  { value: "traslado", label: "Traslado" },
  { value: "passagem", label: "Passagem" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "passeio", label: "Passeio" },
  { value: "hospedagem", label: "Hospedagem" },
];

export default function DespesasPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { items: despesas, loading } = useOfflineCollection<Despesa>("despesas", tripId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    categoria: "traslado",
    valor: "",
    data: "",
    descricao: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await createDespesaOffline(tripId, { ...form, valor: Number(form.valor) });
    setSaving(false);
    setForm({ categoria: "traslado", valor: "", data: "", descricao: "" });
  }

  const total = despesas.reduce((sum, d) => sum + (Number(d.valor) || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Categoria</label>
          <select
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[120px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Valor</label>
          <input
            type="number"
            min={0}
            step="0.01"
            required
            value={form.valor}
            onChange={(e) => setForm({ ...form, valor: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Data</label>
          <input
            type="date"
            required
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Descrição</label>
          <input
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Lançando..." : "Lançar despesa"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Valor</th>
              <th className="px-3 py-2">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={4}>
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && despesas.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={4}>
                  Nenhuma despesa lançada.
                </td>
              </tr>
            )}
            {despesas.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{d.data}</td>
                <td className="px-3 py-2 capitalize">{d.categoria}</td>
                <td className="px-3 py-2">R$ {Number(d.valor).toFixed(2)}</td>
                <td className="px-3 py-2 text-slate-500">{d.descricao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-600">
        Total de despesas: <span className="font-semibold">R$ {total.toFixed(2)}</span>
      </p>
    </div>
  );
}
