"use client";

import { useCallback, useEffect, useState } from "react";
import { getAnexoFile, getOne, listAll, listByTrip, listOutbox } from "./db";
import { isOnline, pullAnexosList, pullTripDetail, pullTrips, syncEvents } from "./sync";

function useSyncChangeListener(callback: () => void) {
  useEffect(() => {
    syncEvents.addEventListener("change", callback);
    return () => syncEvents.removeEventListener("change", callback);
  }, [callback]);
}

/** Lista de viagens: lê do IndexedDB na hora (funciona offline) e atualiza em segundo plano quando online. */
export function useOfflineTrips<T extends { id: string }>() {
  const [trips, setTrips] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const local = await listAll("trips");
    setTrips(local as unknown as T[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    if (isOnline()) pullTrips().catch(() => {});
  }, [refresh]);

  useSyncChangeListener(refresh);

  return { trips, loading };
}

/** Dados de uma única viagem (nome, datas) para o cabeçalho — usado pelo shell client-side da rota da viagem. */
export function useOfflineTrip<T extends { id: string }>(tripId: string | undefined) {
  const [trip, setTrip] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tripId) return;
    const local = await getOne("trips", tripId);
    setTrip((local as unknown as T) ?? null);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useSyncChangeListener(refresh);

  return { trip, loading };
}

/** Dias / despesas / receitas de uma viagem. Puxa do servidor em segundo plano quando online. */
export function useOfflineCollection<T extends { id: string }>(
  tab: "tripDays" | "despesas" | "receitas",
  tripId: string | undefined
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tripId) return;
    const local = await listByTrip(tab, tripId);
    setItems(local as unknown as T[]);
    setLoading(false);
  }, [tab, tripId]);

  useEffect(() => {
    refresh();
    if (tripId && isOnline()) pullTripDetail(tripId).catch(() => {});
  }, [refresh, tripId]);

  useSyncChangeListener(refresh);

  return { items, loading, refresh };
}

/** Lista de anexos (metadados) de uma viagem — funciona offline se a viagem estiver marcada
 * "Dados offline" (os arquivos já baixados ficam em anexoFiles, ver getLocalAnexoUrl). */
export function useOfflineAnexos<T extends { fileId: string }>(tripId: string | undefined) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tripId) return;
    const local = await listByTrip("anexos", tripId);
    setItems(local as unknown as T[]);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    refresh();
    if (tripId && isOnline()) pullAnexosList(tripId).catch(() => {});
  }, [refresh, tripId]);

  useSyncChangeListener(refresh);

  return { items, loading, refresh };
}

/** Object URL (blob local) de um anexo já baixado, ou null se ainda não foi baixado neste
 * aparelho — nesse caso a tela deve cair para o link ao vivo do Drive. */
export async function getLocalAnexoUrl(fileId: string): Promise<string | null> {
  const file = await getAnexoFile(fileId);
  if (!file) return null;
  return URL.createObjectURL(file.blob);
}

/** Indicador de conectividade (navigator.onLine + eventos online/offline) pra UI (banner, etc.). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(isOnline());
    const update = () => setOnline(isOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

export interface OutboxSummary {
  pending: number;
  errored: number;
  firstError: string | null;
}

/** Estado da fila de sincronização: quantas mutações estão pendentes e se alguma já falhou de
 * verdade contra o servidor (erro de validação/acesso — não só falta de sinal). */
export function useOutboxSummary(): OutboxSummary {
  const [summary, setSummary] = useState<OutboxSummary>({
    pending: 0,
    errored: 0,
    firstError: null,
  });

  const refresh = useCallback(async () => {
    const entries = await listOutbox();
    const withError = entries.filter((e) => e.attempts > 0);
    setSummary({
      pending: entries.length,
      errored: withError.length,
      firstError: withError[0]?.lastError ?? null,
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useSyncChangeListener(refresh);

  return summary;
}
