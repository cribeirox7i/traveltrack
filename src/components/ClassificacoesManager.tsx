"use client";

import { useEffect, useMemo, useState } from "react";
import { InfoDisclaimer } from "@/components/InfoDisclaimer";
import { apiFetch, mensagemErro } from "@/lib/apiFetch";
import { useOnlineStatus } from "@/lib/offline/useOfflineData";

interface Classificacao {
  id: string;
  nome: string;
  ativo: "true" | "false";
  criado_em: string;
  icone: string;
}

interface Subclassificacao {
  id: string;
  classificacao_id: string;
  nome: string;
  ativo: "true" | "false";
  criado_em: string;
  icone: string;
}

/**
 * CRUD de Classificação/Subclassificação (taxonomia do cadastro de Itens, ver ClassificacaoRow/
 * SubclassificacaoRow) - admin-only, mesmo padrão de /admin/ambientes: sem exclusão, só `ativo`.
 * Uma subclassificação sempre nasce dentro de uma classificação (FK `classificacao_id`) - a lista
 * inteira de subclassificações é carregada uma vez e agrupada no cliente, em vez de uma chamada
 * por classificação.
 *
 * Vive dentro de `/admin/parametros` (Config) como uma seção, não como tela/menu próprio - pedido
 * explícito do usuário (2026-09-22): não vale um item de navegação só pra isso.
 */
export function ClassificacoesManager() {
  const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);
  const [subclassificacoes, setSubclassificacoes] = useState<Subclassificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const online = useOnlineStatus();

  const [nomeNova, setNomeNova] = useState("");
  const [iconeNova, setIconeNova] = useState("");
  const [criando, setCriando] = useState(false);
  const [erroNova, setErroNova] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [iconeEdicao, setIconeEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);

  // Subclassificação em edição/criação - `subEditandoId` compartilha o mesmo estado de nome pra
  // qualquer classificação (só uma edição de sub por vez, na tela toda).
  const [subNovaPorClassificacao, setSubNovaPorClassificacao] = useState<Record<string, string>>({});
  const [subIconeNovaPorClassificacao, setSubIconeNovaPorClassificacao] = useState<Record<string, string>>({});
  const [subCriandoEm, setSubCriandoEm] = useState<string | null>(null);
  const [subErroPorClassificacao, setSubErroPorClassificacao] = useState<Record<string, string>>({});
  const [subEditandoId, setSubEditandoId] = useState<string | null>(null);
  const [subNomeEdicao, setSubNomeEdicao] = useState("");
  const [subIconeEdicao, setSubIconeEdicao] = useState("");
  const [subSalvandoEdicao, setSubSalvandoEdicao] = useState(false);
  const [subErroEdicao, setSubErroEdicao] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErroLista(null);
    const [resClass, resSub] = await Promise.all([
      apiFetch<Classificacao[]>("/api/classificacoes"),
      apiFetch<Subclassificacao[]>("/api/subclassificacoes"),
    ]);
    if (resClass.ok) setClassificacoes(resClass.data);
    else setErroLista(mensagemErro(resClass.error));
    if (resSub.ok) setSubclassificacoes(resSub.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const subsPorClassificacao = useMemo(() => {
    const map: Record<string, Subclassificacao[]> = {};
    for (const s of subclassificacoes) {
      (map[s.classificacao_id] ??= []).push(s);
    }
    return map;
  }, [subclassificacoes]);

  async function criarClassificacao(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true);
    setErroNova(null);
    const res = await apiFetch("/api/classificacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nomeNova, icone: iconeNova }),
    });
    setCriando(false);
    if (!res.ok) {
      setErroNova(res.error);
      return;
    }
    setNomeNova("");
    setIconeNova("");
    load();
  }

  function iniciarEdicao(c: Classificacao) {
    setEditandoId(c.id);
    setNomeEdicao(c.nome);
    setIconeEdicao(c.icone);
    setErroEdicao(null);
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoId) return;
    setSalvandoEdicao(true);
    setErroEdicao(null);
    const res = await apiFetch(`/api/classificacoes/${editandoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nomeEdicao, icone: iconeEdicao }),
    });
    setSalvandoEdicao(false);
    if (!res.ok) {
      setErroEdicao(res.error);
      return;
    }
    setEditandoId(null);
    load();
  }

  async function alternarAtivo(c: Classificacao) {
    const res = await apiFetch(`/api/classificacoes/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: c.ativo === "false" }),
    });
    if (res.ok) load();
  }

  async function criarSubclassificacao(e: React.FormEvent, classificacaoId: string) {
    e.preventDefault();
    const nome = (subNovaPorClassificacao[classificacaoId] ?? "").trim();
    if (!nome) return;
    setSubCriandoEm(classificacaoId);
    setSubErroPorClassificacao((prev) => ({ ...prev, [classificacaoId]: "" }));
    const res = await apiFetch("/api/subclassificacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classificacao_id: classificacaoId,
        nome,
        icone: subIconeNovaPorClassificacao[classificacaoId] ?? "",
      }),
    });
    setSubCriandoEm(null);
    if (!res.ok) {
      setSubErroPorClassificacao((prev) => ({ ...prev, [classificacaoId]: res.error }));
      return;
    }
    setSubNovaPorClassificacao((prev) => ({ ...prev, [classificacaoId]: "" }));
    setSubIconeNovaPorClassificacao((prev) => ({ ...prev, [classificacaoId]: "" }));
    load();
  }

  function iniciarEdicaoSub(s: Subclassificacao) {
    setSubEditandoId(s.id);
    setSubNomeEdicao(s.nome);
    setSubIconeEdicao(s.icone);
    setSubErroEdicao(null);
  }

  async function salvarEdicaoSub(e: React.FormEvent) {
    e.preventDefault();
    if (!subEditandoId) return;
    setSubSalvandoEdicao(true);
    setSubErroEdicao(null);
    const res = await apiFetch(`/api/subclassificacoes/${subEditandoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: subNomeEdicao, icone: subIconeEdicao }),
    });
    setSubSalvandoEdicao(false);
    if (!res.ok) {
      setSubErroEdicao(res.error);
      return;
    }
    setSubEditandoId(null);
    load();
  }

  async function alternarAtivoSub(s: Subclassificacao) {
    const res = await apiFetch(`/api/subclassificacoes/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: s.ativo === "false" }),
    });
    if (res.ok) load();
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Classificações</h2>

      <InfoDisclaimer>
        Classificação e subclassificação alimentam o cadastro de Itens (ex.: classificação
        &quot;Passagem&quot;, subclassificação &quot;Ônibus&quot;). Cada subclassificação pertence
        a uma classificação. Desativar tira das opções do formulário sem apagar o histórico de
        itens que já usam aquela linha.
      </InfoDisclaimer>

      <form
        onSubmit={criarClassificacao}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="w-20">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Ícone
          </label>
          <input
            value={iconeNova}
            onChange={(e) => setIconeNova(e.target.value)}
            placeholder="🍽️"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-sm dark:border-slate-700"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Nova classificação
          </label>
          <input
            required
            value={nomeNova}
            onChange={(e) => setNomeNova(e.target.value)}
            placeholder="Ex.: Passagem, Hospedagem, Atrativo"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
          />
        </div>
        <button
          type="submit"
          disabled={criando || !online}
          title={online ? undefined : "Criar precisa de internet"}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {criando ? "Criando..." : "Criar classificação"}
        </button>
      </form>
      {erroNova && <p className="text-sm text-red-600 dark:text-red-400">{erroNova}</p>}

      <div className="flex flex-col gap-3">
        {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>}
        {!loading && erroLista && (
          <p className="text-sm text-red-600 dark:text-red-400">{erroLista}</p>
        )}
        {!loading && !erroLista && classificacoes.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nenhuma classificação cadastrada ainda.
          </p>
        )}
        {classificacoes.map((c) => {
          const inativa = c.ativo === "false";
          const editando = editandoId === c.id;
          const subs = subsPorClassificacao[c.id] ?? [];
          return (
            <div
              key={c.id}
              className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-col gap-2 px-4 py-3">
                {editando ? (
                  <form onSubmit={salvarEdicao} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={iconeEdicao}
                      onChange={(e) => setIconeEdicao(e.target.value)}
                      placeholder="🍽️"
                      className="w-16 shrink-0 rounded-lg border border-slate-300 px-2 py-2 text-center text-sm dark:border-slate-700"
                    />
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
                        onClick={() => setEditandoId(null)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`truncate text-sm font-semibold ${
                        inativa
                          ? "text-slate-400 line-through dark:text-slate-500"
                          : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {c.icone || "🏷️"} {c.nome}
                    </span>
                    <div className="flex shrink-0 gap-3">
                      <button
                        type="button"
                        onClick={() => iniciarEdicao(c)}
                        disabled={!online}
                        className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => alternarAtivo(c)}
                        disabled={!online}
                        className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        {inativa ? "Ativar" : "Desativar"}
                      </button>
                    </div>
                  </div>
                )}
                {editando && erroEdicao && (
                  <p className="text-xs text-red-600 dark:text-red-400">{erroEdicao}</p>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100 dark:border-slate-800 px-4 py-3">
                {subs.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Nenhuma subclassificação ainda.
                  </p>
                )}
                {subs.map((s) => {
                  const subInativa = s.ativo === "false";
                  const subEditando = subEditandoId === s.id;
                  return (
                    <div key={s.id} className="flex flex-col gap-1">
                      {subEditando ? (
                        <form
                          onSubmit={salvarEdicaoSub}
                          className="flex items-center gap-2 pl-4"
                        >
                          <input
                            value={subIconeEdicao}
                            onChange={(e) => setSubIconeEdicao(e.target.value)}
                            placeholder="🚌"
                            className="w-12 shrink-0 rounded-lg border border-slate-300 px-1 py-1 text-center text-xs dark:border-slate-700"
                          />
                          <input
                            required
                            autoFocus
                            value={subNomeEdicao}
                            onChange={(e) => setSubNomeEdicao(e.target.value)}
                            className="w-full flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
                          />
                          <button
                            type="submit"
                            disabled={subSalvandoEdicao}
                            className="shrink-0 text-xs font-medium text-slate-900 hover:underline disabled:opacity-50 dark:text-slate-100"
                          >
                            {subSalvandoEdicao ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSubEditandoId(null)}
                            className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                          >
                            Cancelar
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between gap-2 pl-4">
                          <span
                            className={`truncate text-xs ${
                              subInativa
                                ? "text-slate-400 line-through dark:text-slate-500"
                                : "text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            ↳ {s.icone ? `${s.icone} ` : ""}{s.nome}
                          </span>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => iniciarEdicaoSub(s)}
                              disabled={!online}
                              className="text-[11px] font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-100"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => alternarAtivoSub(s)}
                              disabled={!online}
                              className="text-[11px] font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-100"
                            >
                              {subInativa ? "Ativar" : "Desativar"}
                            </button>
                          </div>
                        </div>
                      )}
                      {subEditando && subErroEdicao && (
                        <p className="pl-4 text-[11px] text-red-600 dark:text-red-400">{subErroEdicao}</p>
                      )}
                    </div>
                  );
                })}

                <form
                  onSubmit={(e) => criarSubclassificacao(e, c.id)}
                  className="flex items-center gap-2 pl-4 pt-1"
                >
                  <input
                    value={subIconeNovaPorClassificacao[c.id] ?? ""}
                    onChange={(e) =>
                      setSubIconeNovaPorClassificacao((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                    placeholder="🚌"
                    className="w-12 shrink-0 rounded-lg border border-slate-300 px-1 py-1 text-center text-xs dark:border-slate-700"
                  />
                  <input
                    value={subNovaPorClassificacao[c.id] ?? ""}
                    onChange={(e) =>
                      setSubNovaPorClassificacao((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                    placeholder="Nova subclassificação..."
                    className="w-full flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
                  />
                  <button
                    type="submit"
                    disabled={subCriandoEm === c.id || !online}
                    className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {subCriandoEm === c.id ? "Criando..." : "+ Adicionar"}
                  </button>
                </form>
                {subErroPorClassificacao[c.id] && (
                  <p className="pl-4 text-[11px] text-red-600 dark:text-red-400">
                    {subErroPorClassificacao[c.id]}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
