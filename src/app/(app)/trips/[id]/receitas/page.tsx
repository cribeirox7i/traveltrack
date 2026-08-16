"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useOfflineCollection } from "@/lib/offline/useOfflineData";
import { createReceitaOffline } from "@/lib/offline/sync";

interface Receita {
  id: string;
  valor: string;
  data: string;
  descricao: string;
}

export default function ReceitasPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { items: receitas, loading } = useOfflineCollection<Receita>("receitas", tripId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ valor: "", data: "", descricao: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await createReceitaOffline(tripId, { ...form, valor: Number(form.valor) });
    setSaving(false);
    setForm({ valor: "", data: "", descricao: "" });
  }

  const total = receitas.reduce((sum, r) => sum + (Number(r.valor) || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
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
            placeholder="Ex.: aporte de fulano"
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
          {saving ? "Lançando..." : "Lançar aporte"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Valor</th>
              <th className="px-3 py-2">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={3}>
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && receitas.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={3}>
                  Nenhum aporte lançado.
                </td>
              </tr>
            )}
            {receitas.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{r.data}</td>
                <td className="px-3 py-2">R$ {Number(r.valor).toFixed(2)}</td>
                <td className="px-3 py-2 text-slate-500">{r.descricao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-600">
        Total de receitas: <span className="font-semibold">R$ {total.toFixed(2)}</span>
      </p>
    </div>
  );
}
