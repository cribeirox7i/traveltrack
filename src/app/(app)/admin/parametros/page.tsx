"use client";

import { useEffect, useState } from "react";

interface ParametroItem {
  id: string;
  chave: string;
  valor: string;
  descricao: string;
}

export default function ParametrosAdminPage() {
  const [parametros, setParametros] = useState<ParametroItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ chave: "", valor: "", descricao: "" });
  const [saving, setSaving] = useState(false);
  const [settingUpSheets, setSettingUpSheets] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/parametros");
    if (res.ok) setParametros(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/parametros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setForm({ chave: "", valor: "", descricao: "" });
    load();
  }

  async function handleSetupSheets() {
    setSettingUpSheets(true);
    setSetupMessage(null);
    const res = await fetch("/api/admin/setup-sheets", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSettingUpSheets(false);

    if (!res.ok) {
      setSetupMessage(data.error ?? "Erro ao configurar planilha");
      return;
    }

    const abas = data.abasCriadas?.length ? data.abasCriadas.join(", ") : "nenhuma (já existiam)";
    const colunas: Record<string, string[]> = data.colunasAdicionadas ?? {};
    const colunasTexto = Object.entries(colunas)
      .map(([aba, campos]) => `${aba} (${campos.join(", ")})`)
      .join("; ");

    setSetupMessage(
      `Planilha verificada. Abas criadas: ${abas}.` +
        (colunasTexto ? ` Colunas adicionadas: ${colunasTexto}.` : " Nenhuma coluna nova.")
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Config</h1>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <p className="mb-2 text-sm text-slate-600 dark:text-slate-400">
          Garante que a planilha do Google Sheets tenha todas as abas e cabeçalhos esperados pelo
          app (não apaga dados existentes).
        </p>
        <button
          onClick={handleSetupSheets}
          disabled={settingUpSheets}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {settingUpSheets ? "Verificando..." : "Verificar/criar abas na planilha"}
        </button>
        {setupMessage && <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{setupMessage}</p>}
      </div>

      {/* Meios de pagamento saíram daqui: viraram dado POR USUÁRIO e moram em "Parâmetros"
          (`/parametros`), que todo mundo vê. Esta tela ficou só com o que é do SISTEMA. */}

      <form
        onSubmit={handleSave}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex-1 min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Chave</label>
          <input
            required
            value={form.chave}
            onChange={(e) => setForm({ ...form, chave: e.target.value })}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Valor</label>
          <input
            required
            value={form.valor}
            onChange={(e) => setForm({ ...form, valor: e.target.value })}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
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
          {saving ? "Salvando..." : "Salvar parâmetro"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950 text-left text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Chave</th>
              <th className="px-4 py-2">Valor</th>
              <th className="px-4 py-2">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400" colSpan={3}>
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && parametros.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400" colSpan={3}>
                  Nenhum parâmetro cadastrado.
                </td>
              </tr>
            )}
            {parametros.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2 font-mono text-xs">{p.chave}</td>
                <td className="px-4 py-2">{p.valor}</td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{p.descricao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
