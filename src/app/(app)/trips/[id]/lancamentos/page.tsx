"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCollaborators, useMeiosPagamento, useOfflineCollection } from "@/lib/offline/useOfflineData";
import { createDespesaOffline, updateDespesaStatusOffline } from "@/lib/offline/sync";
import { AnexoUpload } from "@/components/AnexoUpload";

interface Despesa {
  id: string;
  categoria: string;
  valor: string;
  data: string;
  descricao: string;
  pagador_id: string;
  meio_pagamento_id: string;
  status: string;
  natureza: string;
}

/** Aportes lançados antes desta página existir - só leitura aqui (ver nota no topo do arquivo). */
interface ReceitaLegada {
  id: string;
  valor: string;
  data: string;
  descricao: string;
  credor_id: string;
  status: string;
}

type Natureza = "debito" | "credito";

/** Linha unificada pra renderização - de onde ela veio (`origin`) decide qual endpoint
 * PATCH/offline-function usar pra trocar o status. */
interface Lancamento {
  id: string;
  origin: "despesas" | "receitas";
  natureza: Natureza;
  categoria: string;
  valor: string;
  data: string;
  descricao: string;
  pessoaId: string;
  meioPagamentoId: string;
  statusBruto: string;
}

const CATEGORIAS = [
  { value: "traslado", label: "Traslado" },
  { value: "passagem", label: "Passagem" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "passeio", label: "Passeio" },
  { value: "hospedagem", label: "Hospedagem" },
  { value: "aporte", label: "Aporte" },
];

const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS.map((c) => [c.value, c.label])
);

/** Concluído (pago/recebido) ou pendente (a pagar/a receber) - o rótulo exato depende da
 * natureza, mas o estado binário é o mesmo, então normaliza pra isso antes de decidir o que
 * mostrar. Célula vazia (linha antiga, de antes da coluna existir) sempre vira pendente. */
function isConcluido(natureza: Natureza, statusBruto: string): boolean {
  return natureza === "credito" ? statusBruto === "recebido" : statusBruto === "pago";
}

function statusValor(natureza: Natureza, concluido: boolean): "pago" | "a_pagar" | "recebido" | "a_receber" {
  if (natureza === "credito") return concluido ? "recebido" : "a_receber";
  return concluido ? "pago" : "a_pagar";
}

function statusLabel(natureza: Natureza, concluido: boolean): string {
  if (natureza === "credito") return concluido ? "Recebido" : "A receber";
  return concluido ? "Pago" : "A pagar";
}

export default function LancamentosPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const { items: despesas, loading: loadingDespesas } = useOfflineCollection<Despesa>(
    "despesas",
    tripId
  );
  // Aportes lançados na antiga aba Receitas continuam aparecendo aqui (histórico), mas novos
  // lançamentos de crédito vão todos pra Despesas (com natureza="credito") - ver createDespesaOffline.
  const { items: receitasLegadas, loading: loadingReceitas } = useOfflineCollection<ReceitaLegada>(
    "receitas",
    tripId
  );
  const { items: days } = useOfflineCollection<{ id: string; data: string }>("tripDays", tripId);
  const collaborators = useCollaborators(tripId);
  const meiosPagamento = useMeiosPagamento().filter((m) => m.ativo === "true");
  const [saving, setSaving] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [form, setForm] = useState({
    natureza: "debito" as Natureza,
    categoria: "traslado",
    valor: "",
    data: "",
    descricao: "",
    pessoa_id: "",
    meio_pagamento_id: "",
  });

  // Pré-seleciona o próprio usuário assim que a lista de colaboradores chega.
  useEffect(() => {
    if (form.pessoa_id) return;
    const me = session?.user.id;
    if (me && collaborators.some((c) => c.id === me)) {
      setForm((prev) => ({ ...prev, pessoa_id: me }));
    }
  }, [collaborators, session, form.pessoa_id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await createDespesaOffline(tripId, {
      categoria: form.categoria,
      valor: Number(form.valor),
      data: form.data,
      descricao: form.descricao,
      pagador_id: form.pessoa_id,
      meio_pagamento_id: form.meio_pagamento_id,
      natureza: form.natureza,
    });
    setSaving(false);
    setForm((prev) => ({
      natureza: prev.natureza,
      categoria: prev.natureza === "credito" ? "aporte" : "traslado",
      valor: "",
      data: "",
      descricao: "",
      pessoa_id: prev.pessoa_id,
      meio_pagamento_id: "",
    }));
  }

  const lancamentos: Lancamento[] = [
    ...despesas.map((d) => ({
      id: d.id,
      origin: "despesas" as const,
      natureza: (d.natureza === "credito" ? "credito" : "debito") as Natureza,
      categoria: d.categoria,
      valor: d.valor,
      data: d.data,
      descricao: d.descricao,
      pessoaId: d.pagador_id,
      meioPagamentoId: d.meio_pagamento_id,
      statusBruto: d.status,
    })),
    ...receitasLegadas.map((r) => ({
      id: r.id,
      origin: "receitas" as const,
      natureza: "credito" as Natureza,
      categoria: "",
      valor: r.valor,
      data: r.data,
      descricao: r.descricao,
      pessoaId: r.credor_id,
      meioPagamentoId: "",
      statusBruto: r.status,
    })),
  ].sort((a, b) => a.data.localeCompare(b.data));

  const totalDebito = lancamentos
    .filter((l) => l.natureza === "debito")
    .reduce((sum, l) => sum + (Number(l.valor) || 0), 0);
  const totalCredito = lancamentos
    .filter((l) => l.natureza === "credito")
    .reduce((sum, l) => sum + (Number(l.valor) || 0), 0);

  const datasDaViagem = [...days].map((d) => d.data).sort((a, b) => a.localeCompare(b));
  const nomePorPessoa = Object.fromEntries(collaborators.map((c) => [c.id, c.nome]));
  const nomePorMeio = Object.fromEntries(meiosPagamento.map((m) => [m.id, m.nome]));

  async function handleStatusChange(l: Lancamento, concluido: boolean) {
    const status = statusValor(l.natureza, concluido);
    if (l.origin === "despesas") {
      await updateDespesaStatusOffline(tripId, l.id, status);
    }
    // Aportes legados (origin "receitas") não têm mais tela de edição - ficam como estavam
    // quando a antiga aba Receitas foi descontinuada.
  }

  const loading = loadingDespesas || loadingReceitas;

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="min-w-[130px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Natureza</label>
          <select
            value={form.natureza}
            onChange={(e) => {
              const natureza = e.target.value as Natureza;
              setForm({
                ...form,
                natureza,
                categoria: natureza === "credito" ? "aporte" : "traslado",
              });
            }}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          >
            <option value="debito">Débito</option>
            <option value="credito">Crédito</option>
          </select>
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Categoria</label>
          <select
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[120px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Valor</label>
          <input
            type="number"
            min={0}
            step="0.01"
            required
            value={form.valor}
            onChange={(e) => setForm({ ...form, valor: e.target.value })}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Data</label>
          <input
            type="date"
            required
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            {form.natureza === "credito" ? "Quem contribuiu" : "Quem pagou"}
          </label>
          <select
            required
            value={form.pessoa_id}
            onChange={(e) => setForm({ ...form, pessoa_id: e.target.value })}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
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
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Meio de pagamento</label>
          <select
            required
            value={form.meio_pagamento_id}
            onChange={(e) => setForm({ ...form, meio_pagamento_id: e.target.value })}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
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
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Descrição</label>
          <input
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Lançando..." : "Lançar"}
        </button>
      </form>

      {/* Anexo fica fora do <form> de propósito: não é campo do lançamento (a aba Despesas não tem
          vínculo com anexo), é um atalho pra guardar o comprovante sem ter que ir até a aba Anexos
          - o arquivo vai pro mesmo lugar de sempre, na categoria escolhida. */}
      <div>
        {!uploadOpen ? (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600"
          >
            📎 Anexar comprovante
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Anexar comprovante
              </p>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700"
              >
                Fechar
              </button>
            </div>
            <AnexoUpload
              tripId={tripId}
              datasDaViagem={datasDaViagem}
              categoriaInicial={form.categoria === "aporte" ? "outros" : form.categoria}
            />
            <p className="text-xs text-slate-400 dark:text-slate-500">
              O arquivo vai para a aba Anexos da viagem, na categoria escolhida.
            </p>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Natureza</th>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Valor</th>
              <th className="px-3 py-2">Pessoa</th>
              <th className="px-3 py-2">Meio de pagamento</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-3 text-slate-500 dark:text-slate-400" colSpan={8}>
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && lancamentos.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-slate-500 dark:text-slate-400" colSpan={8}>
                  Nenhum lançamento ainda.
                </td>
              </tr>
            )}
            {lancamentos.map((l) => {
              const concluido = isConcluido(l.natureza, l.statusBruto);
              return (
                <tr key={`${l.origin}-${l.id}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">{l.data}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        l.natureza === "credito"
                          ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {l.natureza === "credito" ? "Crédito" : "Débito"}
                    </span>
                  </td>
                  <td className="px-3 py-2 capitalize">
                    {CATEGORIA_LABEL[l.categoria] ?? l.categoria ?? "-"}
                  </td>
                  <td className="px-3 py-2">R$ {Number(l.valor).toFixed(2)}</td>
                  <td className="px-3 py-2">{nomePorPessoa[l.pessoaId] ?? "-"}</td>
                  <td className="px-3 py-2">{nomePorMeio[l.meioPagamentoId] ?? "-"}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{l.descricao}</td>
                  <td className="px-3 py-2">
                    {l.origin === "despesas" ? (
                      <select
                        value={concluido ? "concluido" : "pendente"}
                        onChange={(e) => handleStatusChange(l, e.target.value === "concluido")}
                        className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${
                          concluido
                            ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        <option value="pendente">{statusLabel(l.natureza, false)}</option>
                        <option value="concluido">{statusLabel(l.natureza, true)}</option>
                      </select>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          concluido
                            ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                        }`}
                        title="Lançamento antigo (aba Receitas descontinuada) - status não editável aqui"
                      >
                        {statusLabel(l.natureza, concluido)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400">
        <p>
          Total débito: <span className="font-semibold">R$ {totalDebito.toFixed(2)}</span>
        </p>
        <p>
          Total crédito: <span className="font-semibold">R$ {totalCredito.toFixed(2)}</span>
        </p>
        <p>
          Saldo:{" "}
          <span
            className={`font-semibold ${totalCredito - totalDebito < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
          >
            R$ {(totalCredito - totalDebito).toFixed(2)}
          </span>
        </p>
      </div>
    </div>
  );
}
