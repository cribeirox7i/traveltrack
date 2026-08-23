"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useOfflineTrips, useOnlineStatus } from "@/lib/offline/useOfflineData";
import {
  deleteTripOffline,
  downloadOfflineTripsNow,
  listOfflineTripIds,
  setTripOffline,
  syncEvents,
} from "@/lib/offline/sync";

interface TripItem {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  qtd_pessoas: string;
}

export default function TripsPage() {
  const { data: session } = useSession();
  const { trips, loading } = useOfflineTrips<TripItem>();
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const online = useOnlineStatus();
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadedAt, setDownloadedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setOfflineIds(new Set(await listOfflineTripIds()));
  }, []);

  useEffect(() => {
    refresh();
    syncEvents.addEventListener("change", refresh);
    return () => syncEvents.removeEventListener("change", refresh);
  }, [refresh]);

  async function handleToggleOffline(tripId: string, checked: boolean) {
    if (!checked) {
      const ok = confirm(
        "Isso vai apagar os dados e anexos baixados desta viagem deste aparelho. Continuar?"
      );
      if (!ok) return;
    }
    setBusyIds((prev) => new Set(prev).add(tripId));
    try {
      await setTripOffline(tripId, checked);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(tripId);
        return next;
      });
    }
  }

  async function handleDelete(tripId: string, nome: string) {
    const ok = confirm(
      `Excluir a viagem "${nome}"? Isso apaga também todas as diárias, despesas, receitas e anexos dela. Não pode ser desfeito.`
    );
    if (!ok) return;
    setDeleteError(null);
    setDeletingIds((prev) => new Set(prev).add(tripId));
    const result = await deleteTripOffline(tripId);
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(tripId);
      return next;
    });
    if (!result.ok) setDeleteError(result.error);
  }

  async function handleDownloadAll() {
    setDownloadingAll(true);
    await downloadOfflineTripsNow();
    setDownloadingAll(false);
    setDownloadedAt(new Date());
  }

  const hasOfflineTrips = offlineIds.size > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Viagens</h1>
        <Link
          href="/trips/novo"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Nova viagem
        </Link>
      </div>

      {hasOfflineTrips && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={!online || downloadingAll}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloadingAll ? "Baixando..." : "Baixar offline"}
          </button>
          <span className="text-xs text-slate-500">
            {!online
              ? "Sem conexão — conecte-se para atualizar os dados offline"
              : downloadedAt
                ? `Atualizado às ${downloadedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : "Baixa de novo os dados das viagens marcadas \"Dados offline\" abaixo"}
          </span>
        </div>
      )}

      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

      {loading && <p className="text-sm text-slate-500">Carregando...</p>}

      {!loading && trips.length === 0 && (
        <p className="text-sm text-slate-500">
          {session?.user.role === "admin"
            ? "Nenhuma viagem cadastrada ainda."
            : "Você ainda não tem acesso a nenhuma viagem."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trips.map((t) => {
          const offline = offlineIds.has(t.id);
          const busy = busyIds.has(t.id);
          const deleting = deletingIds.has(t.id);
          return (
            <div
              key={t.id}
              className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-400"
            >
              <div className="flex items-start justify-between gap-2">
                <Link href={`/trips/${t.id}/orcamento`} className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{t.nome}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t.data_inicio} — {t.data_fim}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">{t.qtd_pessoas} pessoa(s)</p>
                </Link>
                {session?.user.role === "admin" && (
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id, t.nome)}
                    disabled={deleting}
                    title="Excluir viagem"
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deleting ? (
                      <span className="text-xs">...</span>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              <label className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                <span>
                  Dados offline
                  {busy && <span className="ml-1 text-slate-400">({offline ? "apagando" : "baixando"}...)</span>}
                </span>
                <input
                  type="checkbox"
                  checked={offline}
                  disabled={busy}
                  onChange={(e) => handleToggleOffline(t.id, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
