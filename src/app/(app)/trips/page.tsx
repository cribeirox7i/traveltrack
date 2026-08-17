"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useOfflineTrips } from "@/lib/offline/useOfflineData";
import { listOfflineTripIds, setTripOffline, syncEvents } from "@/lib/offline/sync";

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
          return (
            <div
              key={t.id}
              className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-400"
            >
              <Link href={`/trips/${t.id}/orcamento`}>
                <p className="font-semibold text-slate-900">{t.nome}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t.data_inicio} — {t.data_fim}
                </p>
                <p className="mt-2 text-xs text-slate-500">{t.qtd_pessoas} pessoa(s)</p>
              </Link>
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
