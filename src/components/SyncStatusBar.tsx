"use client";

import { useState } from "react";
import { useOnlineStatus, useOutboxSummary } from "@/lib/offline/useOfflineData";
import { pushOutbox } from "@/lib/offline/sync";

export function SyncStatusBar() {
  const online = useOnlineStatus();
  const { pending, errored, firstError } = useOutboxSummary();
  const [syncing, setSyncing] = useState(false);

  if (online && pending === 0) return null;

  async function handleSyncNow() {
    setSyncing(true);
    await pushOutbox();
    setSyncing(false);
  }

  const tone = !online ? "offline" : errored > 0 ? "error" : "pending";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs font-medium sm:px-8 ${
        tone === "offline"
          ? "bg-slate-800 text-white"
          : tone === "error"
            ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300"
            : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      }`}
    >
      <span>
        {tone === "offline" &&
          "🔌 Offline - suas alterações ficam salvas neste aparelho e sincronizam quando o sinal voltar"}
        {tone === "error" &&
          `⚠️ ${errored} alteraç${errored === 1 ? "ão" : "ões"} não sincronizou${
            errored === 1 ? "" : "ram"
          } (${firstError})`}
        {tone === "pending" &&
          `🔄 ${pending} alteraç${pending === 1 ? "ão" : "ões"} esperando sincronizar`}
      </span>
      {online && pending > 0 && (
        <button
          type="button"
          onClick={handleSyncNow}
          disabled={syncing}
          className="rounded-md bg-slate-900 px-2.5 py-1 text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {syncing ? "Sincronizando..." : "Sincronizar agora"}
        </button>
      )}
    </div>
  );
}
