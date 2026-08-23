"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCollaborators, useOfflineCollection } from "@/lib/offline/useOfflineData";
import { createReceitaOffline, updateReceitaStatusOffline } from "@/lib/offline/sync";

interface Receita {
  id: string;
  valor: string;
  data: string;
  descricao: string;
  credor_id: string;
  status: string;
}

const STATUS_OPTIONS: { value: "recebido" | "a_receber"; label: string }[] = [
  { value: "a_receber", label: "A receber" },
  { value: "recebido", label: "Recebido" },
];

/** Mesma lógica de `normalizeStatus` em Despesas - linhas antigas sem a coluna viram "a receber". */
function normalizeStatus(status: string): "recebido" | "a_receber" {
  return status === "recebido" ? "recebido" : "a_receber";
}

export default function ReceitasPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const { items: receitas, loading } = useOfflineCollection<Receita>("receitas", tripId);
  const collaborators = useCollaborators(tripId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ valor: "", data: "", descricao: "", credor_id: "" });

  // Pré-seleciona o próprio usuário como credor assim que a lista de colaboradores chega.
  useEffect(() => {
    if (form.credor_id) return;
    const me = session?.user.id;
    if (me && collaborators.some((c) => c.id === me)) {
      setForm((prev) => ({ ...prev, credor_id: me }));
    }
  }, [collaborators, session, form.credor_id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await createReceitaOffline(tripId, { ...form, valor: Number(form.valor) });
    setSaving(false);
    setForm((prev) => ({ valor: "", data: "", descricao: "", credor_id: prev.credor_id }));
  }

  const total = receitas.reduce((sum, r) => sum + (Number(r.valor) || 0), 0);
  const nomePorCredor = Object.fromEntries(collaborators.map((c) => [c.id, c.nome]));

  async function handleStatusChange(receitaId: string, status: "recebido" | "a_receber") {
    await updateReceitaStatusOffline(tripId, receitaId, status);
  }

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
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Credor</label>
          <select
            required
            value={form.credor_id}
            onChange={(e) => setForm({ ...form, credor_id: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Selecione...
            </option>
            {collaborators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
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
              <th className="px-3 py-2">Credor</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={5}>
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && receitas.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={5}>
                  Nenhum aporte lançado.
                </td>
              </tr>
            )}
            {receitas.map((r) => {
              const status = normalizeStatus(r.status);
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{r.data}</td>
                  <td className="px-3 py-2">R$ {Number(r.valor).toFixed(2)}</td>
                  <td className="px-3 py-2">{nomePorCredor[r.credor_id] ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-500">{r.descricao}</td>
                  <td className="px-3 py-2">
                    <select
                      value={status}
                      onChange={(e) =>
                        handleStatusChange(r.id, e.target.value as "recebido" | "a_receber")
                      }
                      className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${
                        status === "recebido"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-600">
        Total de receitas: <span className="font-semibold">R$ {total.toFixed(2)}</span>
      </p>
    </div>
  );
}
