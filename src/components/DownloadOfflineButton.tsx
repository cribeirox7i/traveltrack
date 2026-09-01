"use client";

import { useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "@/lib/offline/useOfflineData";
import { downloadOfflineTripsNow } from "@/lib/offline/sync";
import { DownloadIcon } from "./icons";

/** Ícone global (antes só existia como botão de texto em `/trips`) que baixa/atualiza os dados
 * de todas as viagens marcadas "Dados offline" - útil chamar de qualquer tela antes de perder o
 * sinal, não só da lista de viagens. Sem viagem nenhuma marcada, `downloadOfflineTripsNow` é um
 * no-op silencioso (percorre uma lista vazia), por isso não precisa de estado condicional aqui. */
export function DownloadOfflineButton() {
  const online = useOnlineStatus();
  const [busy, setBusy] = useState(false);
  // O botão era silencioso: o ícone pulsava enquanto baixava e voltava ao normal no fim, sem
  // nada distinguir "terminou" de "nem começou". Como o download é justamente o que a pessoa faz
  // antes de perder o sinal, não ter confirmação virava desconfiança na hora em que uma tela não
  // abria offline. `resultado` mostra o desfecho por alguns segundos.
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function anunciar(ok: boolean, texto: string) {
    setResultado({ ok, texto });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setResultado(null), 4000);
  }

  async function handleClick() {
    setBusy(true);
    setResultado(null);
    try {
      const { viagens } = await downloadOfflineTripsNow();
      anunciar(
        true,
        viagens === 0
          ? "Telas do app prontas para uso offline. Nenhuma viagem marcada \"Dados offline\"."
          : `Pronto: ${viagens} viagem${viagens === 1 ? "" : "ns"} e as telas do app prontas para uso offline.`
      );
    } catch {
      // Melhor esforço: o download é feito de dezenas de requisições independentes, e uma falha
      // aqui significa que parte do conteúdo não desceu - o usuário precisa saber pra tentar de
      // novo antes de ficar sem sinal, em vez de descobrir só quando a tela não abrir.
      anunciar(false, "O download não terminou. Tente de novo com um sinal melhor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={!online || busy}
        aria-label="Baixar dados offline"
        title={online ? "Baixar dados das viagens marcadas \"Dados offline\"" : "Sem conexão"}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <DownloadIcon className={`h-5 w-5 ${busy ? "animate-pulse" : ""}`} />
      </button>
      {resultado && (
        <p
          role="status"
          className={`absolute right-0 top-9 z-30 w-60 rounded-lg px-3 py-2 text-xs shadow-lg ${
            resultado.ok
              ? "bg-slate-900 text-white dark:bg-slate-700"
              : "bg-red-600 text-white dark:bg-red-700"
          }`}
        >
          {resultado.texto}
        </p>
      )}
    </div>
  );
}
