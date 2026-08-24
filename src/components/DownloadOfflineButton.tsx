"use client";

import { useState } from "react";
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

  async function handleClick() {
    setBusy(true);
    await downloadOfflineTripsNow();
    setBusy(false);
  }

  return (
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
  );
}
