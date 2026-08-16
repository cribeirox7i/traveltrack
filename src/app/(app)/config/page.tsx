"use client";

import { useCallback, useEffect, useState } from "react";
import { useOfflineTrips } from "@/lib/offline/useOfflineData";
import { listOfflineTripIds, setTripOffline, syncEvents } from "@/lib/offline/sync";
import { listAll } from "@/lib/offline/db";

interface TripItem {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ConfiguracoesPage() {
  const { trips, loading } = useOfflineTrips<TripItem>();
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [sizeByTrip, setSizeByTrip] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const ids = await listOfflineTripIds();
    setOfflineIds(new Set(ids));

    const anexos = await listAll("anexos");
    const sizes: Record<string, number> = {};
    for (const a of anexos) {
      if (!a.trip_id) continue;
      sizes[a.trip_id] = (sizes[a.trip_id] ?? 0) + (Number(a.size) || 0);
    }
    setSizeByTrip(sizes);
  }, []);

  useEffect(() => {
    refresh();
    syncEvents.addEventListener("change", refresh);
    return () => syncEvents.removeEventListener("change", refresh);
  }, [refresh]);

  async function handleToggle(tripId: string, checked: boolean) {
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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Configurações</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          <strong>Dados offline</strong>: escolha quais viagens ficam salvas por completo neste
          aparelho — incluindo os arquivos dos anexos, não só o link do Drive. Uma vez marcada, a
          viagem se atualiza sozinha a cada edição, sua ou de outra pessoa. É por aparelho: celular
          e computador guardam cópias independentes.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando...</p>}
      {!loading && trips.length === 0 && (
        <p className="text-sm text-slate-500">Nenhuma viagem disponível.</p>
      )}

      <div className="flex flex-col gap-2">
        {trips.map((t) => {
          const offline = offlineIds.has(t.id);
          const busy = busyIds.has(t.id);
          const size = sizeByTrip[t.id] ?? 0;
          return (
            <label
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-slate-900">{t.nome}</p>
                <p className="text-xs text-slate-500">
                  {t.data_inicio} — {t.data_fim}
                  {offline && size > 0 && ` · ${formatSize(size)} baixados`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {busy && (
                  <span className="text-xs text-slate-400">
                    {offline ? "Apagando..." : "Baixando..."}
                  </span>
                )}
                <input
                  type="checkbox"
                  checked={offline}
                  disabled={busy}
                  onChange={(e) => handleToggle(t.id, e.target.checked)}
                  className="h-5 w-5 rounded border-slate-300"
                />
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
