"use client";

import { useState } from "react";
import { useOnlineStatus, useOutboxSummary } from "@/lib/offline/useOfflineData";
import { discardOutboxEntry, pushOutbox } from "@/lib/offline/sync";

export function SyncStatusBar() {
  const online = useOnlineStatus();
  const { pending, errored, firstError, stuck } = useOutboxSummary();
  const [syncing, setSyncing] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  if (online && pending === 0) return null;

  async function handleSyncNow() {
    setSyncing(true);
    await pushOutbox();
    setSyncing(false);
  }

  async function handleDiscardStuck() {
    if (
      !confirm(
        `Descartar ${stuck.length} alteraç${stuck.length === 1 ? "ão" : "ões"} que não consegue${
          stuck.length === 1 ? "" : "m"
        } sincronizar? O que foi digitado neste aparelho pra ${
          stuck.length === 1 ? "ela" : "elas"
        } não vai pro servidor - se ainda for válido, precisa lançar de novo.`
      )
    ) {
      return;
    }
    setDiscarding(true);
    for (const entry of stuck) await discardOutboxEntry(entry.localId);
    setDiscarding(false);
  }

  // "stuck" tem prioridade de exibição sobre "error" comum: já tentou o suficiente pra saber que
  // não é sinal ruim, é o que sobra depois de pushOutbox desistir sozinho (ver MAX_OUTBOX_ATTEMPTS).
  const tone = !online ? "offline" : stuck.length > 0 ? "stuck" : errored > 0 ? "error" : "pending";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs font-medium sm:px-8 ${
        tone === "offline"
          ? "bg-slate-800 text-white"
          : tone === "stuck"
            ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200"
            : tone === "error"
              ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300"
              : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      }`}
    >
      <span>
        {tone === "offline" &&
          "🔌 Offline - suas alterações ficam salvas neste aparelho e sincronizam quando o sinal voltar"}
        {tone === "stuck" &&
          `⛔ ${stuck.length} alteraç${stuck.length === 1 ? "ão" : "ões"} não consegue${
            stuck.length === 1 ? "" : "m"
          } sincronizar e parou${stuck.length === 1 ? "" : "ram"} de tentar sozinha${
            stuck.length === 1 ? "" : "s"
          } (${stuck[0]?.lastError})`}
        {tone === "error" &&
          `⚠️ ${errored} alteraç${errored === 1 ? "ão" : "ões"} não sincronizou${
            errored === 1 ? "" : "ram"
          } (${firstError})`}
        {tone === "pending" &&
          `🔄 ${pending} alteraç${pending === 1 ? "ão" : "ões"} esperando sincronizar`}
      </span>
      <div className="flex items-center gap-2">
        {online && tone === "stuck" && (
          <button
            type="button"
            onClick={handleDiscardStuck}
            disabled={discarding}
            className="rounded-md bg-red-900 px-2.5 py-1 text-white hover:bg-red-800 disabled:opacity-50 dark:bg-red-800 dark:hover:bg-red-700"
          >
            {discarding ? "Descartando..." : "Descartar"}
          </button>
        )}
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
    </div>
  );
}
