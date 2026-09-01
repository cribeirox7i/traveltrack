"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/apiFetch";
import { wipeLocalData } from "@/lib/offline/db";
import { useOnlineStatus } from "@/lib/offline/useOfflineData";
import { GlobeIcon } from "./icons";

interface Ambiente {
  id: string;
  nome: string;
  ativo: string;
}

/**
 * Seletor de ambiente do admin global (só ele aparece - gestor e usuário comum são presos ao
 * ambiente da própria sessão, e a API ignora o cookie pra eles).
 *
 * Era um `<select>` solto no meio da barra do topo, e por ter largura própria (9rem) quebrava o
 * alinhamento da fileira de ícones redondos de 32px ao lado. Virou um ícone de globo do mesmo
 * tamanho dos outros, que abre um pop-up com os ambientes e um botão "Acessar" - a troca passou
 * a ser um ato deliberado em dois passos, o que também combina melhor com o peso dela: limpa
 * todos os dados locais e recarrega o app.
 *
 * Trocar de ambiente limpa os dados locais (IndexedDB + caches do SW) antes de recarregar: o
 * cache offline é por aparelho e não sabe de ambiente, então sem essa limpeza a lista de viagens
 * do ambiente anterior continuaria aparecendo até a próxima sincronização - exatamente o
 * vazamento visual que o multitenant deveria evitar.
 */
export function AmbienteSwitcher() {
  const { data: session } = useSession();
  const router = useRouter();
  const online = useOnlineStatus();
  const [ambientes, setAmbientes] = useState<Ambiente[]>([]);
  const [atual, setAtual] = useState("");
  const [trocando, setTrocando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [selecionado, setSelecionado] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const isAdmin = session?.user.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    let cancelado = false;
    (async () => {
      const [listaRes, atualRes] = await Promise.all([
        apiFetch<Ambiente[]>("/api/ambientes"),
        apiFetch<{ ambiente_id?: string }>("/api/ambientes/atual"),
      ]);
      if (cancelado) return;
      // A resposta de erro é um objeto `{error}`, não uma lista - sem esta checagem o `.filter`
      // abaixo quebraria a barra do topo inteira.
      const lista = listaRes.ok && Array.isArray(listaRes.data) ? listaRes.data : [];
      const ativos = lista.filter((a) => a.ativo !== "false");
      setAmbientes(ativos);

      const selecionadoAtual = (atualRes.ok ? atualRes.data.ambiente_id : "") ?? "";
      // Não existe mais "todos os ambientes": se o admin ainda não escolheu um (ou o cookie
      // aponta pra um ambiente inativo/apagado), assume o primeiro ativo pra ele sempre
      // navegar dentro de um tenant concreto.
      if (selecionadoAtual && ativos.some((a) => a.id === selecionadoAtual)) {
        setAtual(selecionadoAtual);
      } else if (ativos.length > 0) {
        setAtual(ativos[0].id);
        apiFetch("/api/ambientes/ativo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ambiente_id: ativos[0].id }),
        });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [isAdmin]);

  // Esc fecha o pop-up, menos no meio da troca - fechar ali deixaria o usuário sem retorno de uma
  // ação que já está apagando os dados locais.
  useEffect(() => {
    if (!aberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !trocando) setAberto(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, trocando]);

  if (!isAdmin) return null;

  const nomeAtual = ambientes.find((a) => a.id === atual)?.nome ?? "";

  function abrir() {
    setSelecionado(atual);
    setErro(null);
    setAberto(true);
  }

  async function acessar() {
    if (!selecionado || selecionado === atual) return;
    setTrocando(true);
    setErro(null);
    const res = await apiFetch("/api/ambientes/ativo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ambiente_id: selecionado }),
    });
    if (!res.ok) {
      setErro(res.error);
      setTrocando(false);
      return;
    }
    setAtual(selecionado);
    await wipeLocalData().catch(() => {});
    setAberto(false);
    setTrocando(false);
    // Volta pra lista de viagens e força o servidor a reavaliar: os hooks de offline remontam
    // e repuxam do zero, já com o cookie do ambiente novo.
    router.push("/trips");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label="Ambiente"
        aria-haspopup="dialog"
        title={nomeAtual ? `Ambiente: ${nomeAtual}` : "Ambiente"}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <GlobeIcon className="h-5 w-5" />
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Escolher ambiente"
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => {
            if (!trocando) setAberto(false);
          }}
        >
          <div
            // O clique de dentro não pode fechar o pop-up junto com o do fundo.
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Ambiente</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Trocar de ambiente apaga os dados salvos neste aparelho e recarrega o app com as
              viagens e usuários do ambiente escolhido.
            </p>

            {ambientes.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nenhum ambiente ativo para escolher.
              </p>
            ) : (
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {ambientes.map((a) => (
                  <li key={a.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                        selecionado === a.id
                          ? "border-slate-900 bg-slate-50 dark:border-slate-300 dark:bg-slate-800"
                          : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                      }`}
                    >
                      <input
                        type="radio"
                        name="ambiente"
                        value={a.id}
                        checked={selecionado === a.id}
                        onChange={() => setSelecionado(a.id)}
                        className="accent-slate-900 dark:accent-slate-300"
                      />
                      <span className="flex-1 truncate text-slate-800 dark:text-slate-200">
                        {a.nome}
                      </span>
                      {a.id === atual && (
                        <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                          atual
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAberto(false)}
                disabled={trocando}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={acessar}
                // Sem sinal a troca ficaria pela metade: o cookie até muda, mas `wipeLocalData`
                // apaga tudo e não há como repuxar os dados do ambiente novo - o app ficaria
                // vazio até a conexão voltar.
                disabled={trocando || !selecionado || selecionado === atual || !online}
                title={online ? undefined : "Trocar de ambiente precisa de internet"}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {trocando ? "Acessando..." : "Acessar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
