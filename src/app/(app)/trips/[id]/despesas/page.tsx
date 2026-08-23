"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCollaborators, useMeiosPagamento, useOfflineCollection } from "@/lib/offline/useOfflineData";
import { createDespesaOffline, updateDespesaStatusOffline } from "@/lib/offline/sync";

interface Despesa {
  id: string;
  categoria: string;
  valor: string;
  data: string;
  descricao: string;
  pagador_id: string;
  meio_pagamento_id: string;
  status: string;
}

const STATUS_OPTIONS: { value: "pago" | "a_pagar"; label: string }[] = [
  { value: "a_pagar", label: "A pagar" },
  { value: "pago", label: "Pago" },
];

/** Linhas gravadas antes da coluna existir vêm com a célula vazia — tratadas como "a pagar",
 * nunca como um terceiro estado. */
function normalizeStatus(status: string): "pago" | "a_pagar" {
  return status === "pago" ? "pago" : "a_pagar";
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
  const { data: session } = useSession();
  const { items: despesas, loading } = useOfflineCollection<Despesa>("despesas", tripId);
  const collaborators = useCollaborators(tripId);
  const meiosPagamento = useMeiosPagamento().filter((m) => m.ativo === "true");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    categoria: "traslado",
    valor: "",
    data: "",
    descricao: "",
    pagador_id: "",
    meio_pagamento_id: "",
  });

  // Pré-seleciona o próprio usuário como pagador assim que a lista de colaboradores chega.
  useEffect(() => {
    if (form.pagador_id) return;
    const me = session?.user.id;
    if (me && collaborators.some((c) => c.id === me)) {
      setForm((prev) => ({ ...prev, pagador_id: me }));
    }
  }, [collaborators, session, form.pagador_id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await createDespesaOffline(tripId, { ...form, valor: Number(form.valor) });
    setSaving(false);
    setForm((prev) => ({
      categoria: "traslado",
      valor: "",
      data: "",
      descricao: "",
      pagador_id: prev.pagador_id,
      meio_pagamento_id: "",
    }));
  }

  const total = despesas.reduce((sum, d) => sum + (Number(d.valor) || 0), 0);
  const nomePorPagador = Object.fromEntries(collaborators.map((c) => [c.id, c.nome]));
  const nomePorMeio = Object.fromEntries(meiosPagamento.map((m) => [m.id, m.nome]));

  async function handleStatusChange(despesaId: string, status: "pago" | "a_pagar") {
    await updateDespesaStatusOffline(tripId, despesaId, status);
  }

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
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Pagador</label>
          <select
            required
            value={form.pagador_id}
            onChange={(e) => setForm({ ...form, pagador_id: e.target.value })}
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
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Meio de pagamento</label>
          <select
            required
            value={form.meio_pagamento_id}
            onChange={(e) => setForm({ ...form, meio_pagamento_id: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Selecione...
            </option>
            {meiosPagamento.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
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
              <th className="px-3 py-2">Pagador</th>
              <th className="px-3 py-2">Meio de pagamento</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={7}>
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && despesas.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={7}>
                  Nenhuma despesa lançada.
                </td>
              </tr>
            )}
            {despesas.map((d) => {
              const status = normalizeStatus(d.status);
              return (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{d.data}</td>
                  <td className="px-3 py-2 capitalize">{d.categoria}</td>
                  <td className="px-3 py-2">R$ {Number(d.valor).toFixed(2)}</td>
                  <td className="px-3 py-2">{nomePorPagador[d.pagador_id] ?? "—"}</td>
                  <td className="px-3 py-2">{nomePorMeio[d.meio_pagamento_id] ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{d.descricao}</td>
                  <td className="px-3 py-2">
                    <select
                      value={status}
                      onChange={(e) =>
                        handleStatusChange(d.id, e.target.value as "pago" | "a_pagar")
                      }
                      className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${
                        status === "pago"
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
        Total de despesas: <span className="font-semibold">R$ {total.toFixed(2)}</span>
      </p>
    </div>
  );
}
