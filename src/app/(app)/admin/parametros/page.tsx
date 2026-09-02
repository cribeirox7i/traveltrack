"use client";

import { useEffect, useState } from "react";
import { apiFetch, mensagemErro } from "@/lib/apiFetch";
import { useOnlineStatus } from "@/lib/offline/useOfflineData";

interface ParametroItem {
  id: string;
  chave: string;
  valor: string;
  descricao: string;
}

interface SetupSheetsResult {
  abasCriadas?: string[];
  colunasAdicionadas?: Record<string, string[]>;
}

export default function ParametrosAdminPage() {
  const [parametros, setParametros] = useState<ParametroItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [form, setForm] = useState({ chave: "", valor: "", descricao: "" });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [settingUpSheets, setSettingUpSheets] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  // Nada desta tela é enfileirável no outbox (salvar parâmetro e criar abas na planilha são
  // operações do servidor, sem equivalente local), então sem sinal ela é só leitura - o que o
  // Service Worker tiver guardado da última visita com internet.
  const online = useOnlineStatus();

  async function load() {
    setLoading(true);
    setErroLista(null);
    const res = await apiFetch<ParametroItem[]>("/api/parametros");
    // A resposta de erro do servidor é um objeto `{error}`, não uma lista - guardá-la em
    // `parametros` sem checar fazia o `.map()` do JSX quebrar a tela inteira.
    if (res.ok && Array.isArray(res.data)) setParametros(res.data);
    else if (!res.ok) setErroLista(mensagemErro(res.error));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErro(null);
    const res = await apiFetch("/api/parametros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      setErro(res.error);
      return;
    }
    setForm({ chave: "", valor: "", descricao: "" });
    load();
  }

  async function handleSetupSheets() {
    setSettingUpSheets(true);
    setSetupMessage(null);
    const res = await apiFetch<SetupSheetsResult>("/api/admin/setup-sheets", { method: "POST" });
    setSettingUpSheets(false);

    if (!res.ok) {
      setSetupMessage(res.error);
      return;
    }

    const data = res.data;
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
          disabled={settingUpSheets || !online}
          title={online ? undefined : "Verificar/criar abas precisa de internet"}
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
          disabled={saving || !online}
          title={online ? undefined : "Salvar parâmetro precisa de internet"}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar parâmetro"}
        </button>
      </form>

      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

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
            {!loading && erroLista && (
              <tr>
                <td className="px-4 py-3 text-red-600 dark:text-red-400" colSpan={3}>
                  {erroLista}
                </td>
              </tr>
            )}
            {!loading && !erroLista && parametros.length === 0 && (
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
