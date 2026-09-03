"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useOfflineTrips } from "@/lib/offline/useOfflineData";
import { deleteTripOffline, listOfflineTripIds, setTripOffline, syncEvents } from "@/lib/offline/sync";
import { hrefSeguro } from "@/lib/urlSegura";
import { FILTER_SELECT_CLASS } from "@/lib/uiClasses";
import {
  TRIP_STATUS_BADGE,
  TRIP_STATUS_LABEL,
  TRIP_STATUS_OPTIONS,
  statusViagem,
  type TripStatus,
} from "@/lib/tripStatus";

interface TripItem {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  qtd_pessoas: string;
  capa_url: string;
  criado_por: string;
  status?: string;
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function TripCard({
  trip,
  isAdmin,
  canEdit,
  offline,
  busy,
  deleting,
  onToggleOffline,
  onDelete,
}: {
  trip: TripItem;
  isAdmin: boolean;
  canEdit: boolean;
  offline: boolean;
  busy: boolean;
  deleting: boolean;
  onToggleOffline: (checked: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400">
      {hrefSeguro(trip.capa_url) && (
        <Link href={`/trips/${trip.id}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL externa qualquer, escolhida pelo usuário, sem domínio fixo pra next/image */}
          <img
            src={hrefSeguro(trip.capa_url)}
            alt=""
            className="h-28 w-full rounded-t-2xl object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </Link>
      )}
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/trips/${trip.id}`} className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 dark:text-slate-100">{trip.nome}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {formatDateBR(trip.data_inicio)} - {formatDateBR(trip.data_fim)}
              </span>
              <span className={`rounded px-1.5 py-0.5 font-medium ${TRIP_STATUS_BADGE[statusViagem(trip)]}`}>
                {TRIP_STATUS_LABEL[statusViagem(trip)]}
              </span>
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {trip.qtd_pessoas} pessoa(s)
            </p>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href={`/trips/${trip.id}/agenda`}
              title="Roteiro"
              className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <rect x="4" y="5" width="16" height="15" rx="2" />
                <path strokeLinecap="round" d="M4 9.5h16M8 3v3M16 3v3" />
                <path strokeLinecap="round" d="M8 13h3M8 16.5h6" />
              </svg>
            </Link>
            {canEdit && (
              <Link
                href={`/trips/${trip.id}/editar`}
                title="Editar viagem"
                className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 4.5a2.1 2.1 0 0 1 3 3L7 20 3 21l1-4Z" />
                </svg>
              </Link>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                title="Excluir viagem"
                className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
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
        </div>
        <label className="mt-1 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Dados offline
            {busy && <span className="ml-1 text-slate-400 dark:text-slate-500">({offline ? "apagando" : "baixando"}...)</span>}
          </span>
          <input
            type="checkbox"
            checked={offline}
            disabled={busy}
            onChange={(e) => onToggleOffline(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
          />
        </label>
      </div>
    </div>
  );
}

export default function TripsPage() {
  const { data: session } = useSession();
  const { trips, loading } = useOfflineTrips<TripItem>();
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<TripStatus | "">("");

  const visiveis = trips.filter((t) => !filtroStatus || statusViagem(t) === filtroStatus);

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
    setDeleteWarning(null);
    setDeletingIds((prev) => new Set(prev).add(tripId));
    const result = await deleteTripOffline(tripId);
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(tripId);
      return next;
    });
    if (!result.ok) {
      setDeleteError(result.error);
    } else if (result.avisoAnexos) {
      setDeleteWarning(
        `Viagem "${nome}" excluída, mas a pasta de anexos no Google Drive não pôde ser removida (${result.avisoAnexos}). Apague a pasta manualmente pelo Drive, se quiser.`
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Viagens</h1>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as TripStatus | "")}
            aria-label="Filtrar por status"
            className={FILTER_SELECT_CLASS}
          >
            <option value="">Todos os status</option>
            {TRIP_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Link
          href="/trips/novo"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Nova viagem
        </Link>
      </div>

      {deleteError && <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>}

      {deleteWarning && (
        <p className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-800 dark:text-amber-300">
          {deleteWarning}
        </p>
      )}

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>}

      {!loading && trips.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {session?.user.role === "admin"
            ? "Nenhuma viagem cadastrada ainda."
            : "Você ainda não tem acesso a nenhuma viagem."}
        </p>
      )}

      {!loading && trips.length > 0 && visiveis.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nenhuma viagem com esse status.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visiveis.map((t) => (
          <TripCard
            key={t.id}
            trip={t}
            isAdmin={session?.user.role === "admin"}
            canEdit={session?.user.role === "admin" || t.criado_por === session?.user.id}
            offline={offlineIds.has(t.id)}
            busy={busyIds.has(t.id)}
            deleting={deletingIds.has(t.id)}
            onToggleOffline={(checked) => handleToggleOffline(t.id, checked)}
            onDelete={() => handleDelete(t.id, t.nome)}
          />
        ))}
      </div>
    </div>
  );
}
