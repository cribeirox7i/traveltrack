"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useOnlineStatus } from "@/lib/offline/useOfflineData";
import { refreshNow } from "@/lib/offline/sync";

/** Extrai o id da viagem da URL atual (`/trips/{id}/...`), se houver — assim o refresh também
 * repuxa os dados da viagem aberta, não só a lista em `/trips`. */
function currentTripId(pathname: string): string | undefined {
  const match = pathname.match(/^\/trips\/([^/]+)\//);
  return match?.[1];
}

export function RefreshButton({ variant }: { variant: "desktop" | "mobile" }) {
  const online = useOnlineStatus();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    await refreshNow(currentTripId(pathname));
    setBusy(false);
  }

  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!online || busy}
        className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-slate-500 disabled:opacity-40"
      >
        <span className={`text-lg ${busy ? "animate-spin" : ""}`}>🔄</span>
        Atualizar
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!online || busy}
      title={online ? "Buscar dados atualizados do servidor" : "Sem conexão"}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className={busy ? "animate-spin" : ""}>🔄</span>
      {busy ? "Atualizando..." : "Atualizar"}
    </button>
  );
}
