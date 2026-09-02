"use client";

import { useEffect, useState } from "react";
import { InfoDisclaimer } from "@/components/InfoDisclaimer";
import { apiFetch, mensagemErro } from "@/lib/apiFetch";
import { useOnlineStatus } from "@/lib/offline/useOfflineData";

interface Ambiente {
  id: string;
  nome: string;
  ativo: string;
  criado_em: string;
}

/**
 * CRUD de ambientes (tenants), admin-only. Não existe exclusão de propósito: apagar um ambiente
 * deixaria usuários e viagens apontando pra um tenant inexistente, sem forma de recuperar pela UI.
 * Desativar tira do seletor e do fluxo de criação, sem quebrar o que já existe.
 */
export default function AmbientesAdminPage() {
  const [ambientes, setAmbientes] = useState<Ambiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  // Nenhuma alteração desta tela é enfileirável no outbox (criar ambiente, renomear, ativar/
  // desativar são operações do servidor, sem equivalente local), então sem sinal ela é só
  // leitura - o que o Service Worker tiver guardado da última visita com internet.
  const online = useOnlineStatus();

  async function load() {
    setLoading(true);
    setErroLista(null);
    const res = await apiFetch<Ambiente[]>("/api/ambientes");
    if (res.ok) setAmbientes(res.data);
    else setErroLista(mensagemErro(res.error));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErro(null);
    const res = await apiFetch("/api/ambientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    setSaving(false);
    if (!res.ok) {
      setErro(res.error);
      return;
    }
    setNome("");
    load();
  }

  function iniciarEdicao(a: Ambiente) {
    setEditandoId(a.id);
    setNomeEdicao(a.nome);
    setErroEdicao(null);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setNomeEdicao("");
    setErroEdicao(null);
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoId) return;
    setSalvandoEdicao(true);
    setErroEdicao(null);
    const res = await apiFetch(`/api/ambientes/${editandoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nomeEdicao }),
    });
    setSalvandoEdicao(false);
    if (!res.ok) {
      setErroEdicao(res.error);
      return;
    }
    cancelarEdicao();
    load();
  }

  async function alternarAtivo(a: Ambiente) {
    const res = await apiFetch(`/api/ambientes/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: a.ativo === "false" }),
    });
    if (!res.ok) {
      setErro(res.error);
      return;
    }
    load();
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Ambientes</h1>

      <InfoDisclaimer>
        Cada ambiente é um espaço isolado: usuários de um ambiente não veem viagens nem usuários de
        outro. Cada ambiente tem seu gestor, que cadastra os usuários comuns dele. Ambiente
        desativado não aparece mais no seletor, mas nada do que já existe nele é apagado.
      </InfoDisclaimer>

      <form
        onSubmit={criar}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Nome do ambiente
          </label>
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Família, Amigos, Empresa"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !online}
          title={online ? undefined : "Criar ambiente precisa de internet"}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Criando..." : "Criar ambiente"}
        </button>
      </form>

      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

      <ul className="flex flex-col gap-2">
        {loading && <li className="text-sm text-slate-500 dark:text-slate-400">Carregando...</li>}
        {!loading && erroLista && (
          <li className="text-sm text-red-600 dark:text-red-400">{erroLista}</li>
        )}
        {!loading && !erroLista && ambientes.length === 0 && (
          <li className="text-sm text-slate-500 dark:text-slate-400">
            Nenhum ambiente cadastrado ainda.
          </li>
        )}
        {ambientes.map((a) => {
          const inativo = a.ativo === "false";
          const editando = editandoId === a.id;
          return (
            <li
              key={a.id}
              className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
            >
              {editando ? (
                <form onSubmit={salvarEdicao} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    required
                    autoFocus
                    value={nomeEdicao}
                    onChange={(e) => setNomeEdicao(e.target.value)}
                    className="w-full flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
                  />
                  <div className="flex shrink-0 gap-3">
                    <button
                      type="submit"
                      disabled={salvandoEdicao}
                      className="text-xs font-medium text-slate-900 hover:underline disabled:opacity-50 dark:text-slate-100"
                    >
                      {salvandoEdicao ? "Salvando..." : "Salvar"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelarEdicao}
                      className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`truncate text-sm font-medium ${
                      inativo
                        ? "text-slate-400 line-through dark:text-slate-500"
                        : "text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    🏢 {a.nome}
                  </span>
                  <div className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      onClick={() => iniciarEdicao(a)}
                      disabled={!online}
                      title={online ? undefined : "Renomear precisa de internet"}
                      className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-100"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => alternarAtivo(a)}
                      disabled={!online}
                      title={online ? undefined : "Ativar/desativar precisa de internet"}
                      className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-100"
                    >
                      {inativo ? "Ativar" : "Desativar"}
                    </button>
                  </div>
                </div>
              )}
              {editando && erroEdicao && (
                <p className="text-xs text-red-600 dark:text-red-400">{erroEdicao}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
