"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { InfoDisclaimer } from "@/components/InfoDisclaimer";
import { FILTER_SELECT_CLASS } from "@/lib/uiClasses";

interface MeioPagamento {
  id: string;
  nome: string;
  ativo: string;
  user_id: string;
  proprio: boolean;
}

interface UsuarioOption {
  id: string;
  nome: string;
  role: string;
}

/**
 * Parâmetros do próprio usuário - hoje só os meios de pagamento, que passaram a ser POR USUÁRIO
 * (antes era uma lista global do sistema, dentro de Config).
 *
 * Usuário comum cadastra os dele. Gestor e admin escolhem de quem é a lista num dropdown, pra
 * cadastrar pelos usuários do ambiente - é a rota que valida o escopo, não esta tela.
 *
 * Não confundir com Admin > Config (`/admin/parametros`), que é a tabela chave/valor do SISTEMA e
 * continua exclusiva do admin.
 */
export default function ParametrosPage() {
  const { data: session } = useSession();
  const role = session?.user.role;
  const meuId = session?.user.id ?? "";
  const podeEscolherUsuario = role === "admin" || role === "gestor";

  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [donoId, setDonoId] = useState("");
  const [meios, setMeios] = useState<MeioPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);

  // Sem dropdown (usuário comum), o dono é sempre ele mesmo.
  const donoEfetivo = podeEscolherUsuario ? donoId || meuId : meuId;

  const carregarMeios = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/meios-pagamento");
    if (res.ok) setMeios(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    carregarMeios();
  }, [carregarMeios]);

  useEffect(() => {
    if (!podeEscolherUsuario) return;
    fetch("/api/users")
      .then((res) => (res.ok ? res.json() : []))
      .then((lista: UsuarioOption[]) => setUsuarios(lista))
      .catch(() => {});
  }, [podeEscolherUsuario]);

  const meiosDoDono = meios.filter((m) => m.user_id === donoEfetivo);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErro(null);
    const res = await fetch("/api/meios-pagamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, user_id: donoEfetivo }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ?? "Erro ao cadastrar meio de pagamento");
      return;
    }
    setNome("");
    carregarMeios();
  }

  function iniciarEdicao(m: MeioPagamento) {
    setEditandoId(m.id);
    setNomeEdicao(m.nome);
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
    const res = await fetch(`/api/meios-pagamento/${editandoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nomeEdicao }),
    });
    setSalvandoEdicao(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErroEdicao(data.error ?? "Erro ao renomear meio de pagamento");
      return;
    }
    cancelarEdicao();
    carregarMeios();
  }

  async function alternarAtivo(m: MeioPagamento) {
    await fetch(`/api/meios-pagamento/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: m.ativo === "false" }),
    });
    carregarMeios();
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Parâmetros</h1>

      <InfoDisclaimer>
        Os meios de pagamento são seus: só você os escolhe ao lançar um item, e cada pessoa da
        viagem tem a própria lista. Desativar um meio tira ele da lista de escolha sem apagar o
        histórico dos itens que já o usaram.
        {podeEscolherUsuario &&
          " Como administrador do ambiente, você pode escolher de quem é a lista abaixo e cadastrar pelos seus usuários."}
      </InfoDisclaimer>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Meios de pagamento
        </h2>

        <form onSubmit={criar} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          {podeEscolherUsuario && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Usuário
              </label>
              <select
                value={donoEfetivo}
                onChange={(e) => setDonoId(e.target.value)}
                className={FILTER_SELECT_CLASS}
              >
                <option value={meuId}>Eu ({session?.user.name})</option>
                {usuarios
                  .filter((u) => u.id !== meuId)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Nome
            </label>
            <input
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Pix, Cartão de crédito"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Criando..." : "Adicionar"}
          </button>
        </form>

        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

        <ul className="flex flex-col gap-1">
          {loading && <li className="text-sm text-slate-500 dark:text-slate-400">Carregando...</li>}
          {!loading && meiosDoDono.length === 0 && (
            <li className="text-sm text-slate-500 dark:text-slate-400">
              Nenhum meio de pagamento cadastrado ainda.
            </li>
          )}
          {meiosDoDono.map((m) => {
            const editando = editandoId === m.id;
            return (
              <li
                key={m.id}
                className="flex flex-col gap-1 border-t border-slate-100 py-2 text-sm first:border-t-0 dark:border-slate-800"
              >
                {editando ? (
                  <form
                    onSubmit={salvarEdicao}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center"
                  >
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
                      className={
                        m.ativo === "false"
                          ? "text-slate-400 line-through dark:text-slate-500"
                          : "text-slate-800 dark:text-slate-200"
                      }
                    >
                      {m.nome}
                    </span>
                    <div className="flex shrink-0 gap-3">
                      <button
                        type="button"
                        onClick={() => iniciarEdicao(m)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => alternarAtivo(m)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        {m.ativo === "false" ? "Ativar" : "Desativar"}
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
    </div>
  );
}
