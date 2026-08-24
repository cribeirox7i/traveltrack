"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useOnlineStatus } from "@/lib/offline/useOfflineData";
import { refreshNow } from "@/lib/offline/sync";
import { RefreshIcon } from "./icons";

/** Extrai o id da viagem da URL atual (`/trips/{id}/...`), se houver - assim o refresh também
 * repuxa os dados da viagem aberta, não só a lista em `/trips`. */
function currentTripId(pathname: string): string | undefined {
  const match = pathname.match(/^\/trips\/([^/]+)\//);
  return match?.[1];
}

export function RefreshButton() {
  const online = useOnlineStatus();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    await refreshNow(currentTripId(pathname));
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!online || busy}
      aria-label="Atualizar"
      title={online ? "Buscar dados atualizados do servidor" : "Sem conexão"}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <RefreshIcon className={`h-5 w-5 ${busy ? "animate-spin" : ""}`} />
    </button>
  );
}
