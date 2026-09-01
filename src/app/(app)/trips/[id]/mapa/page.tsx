"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useOfflineCollection, useOfflineTrip, useOnlineStatus } from "@/lib/offline/useOfflineData";
import { pullTrips } from "@/lib/offline/sync";
import { apiFetch } from "@/lib/apiFetch";
import { CityAutocomplete } from "@/components/CityAutocomplete";
import type { RoutePoint } from "@/components/TripMap";

// Leaflet precisa de `window`, que não existe durante a renderização no servidor.
const TripMap = dynamic(() => import("@/components/TripMap"), {
  ssr: false,
  loading: () => <p className="text-sm text-slate-500 dark:text-slate-400">Carregando mapa...</p>,
});

interface TripMeta {
  id: string;
  cidade_origem: string;
  cidade_origem_lat: string;
  cidade_origem_lon: string;
  criado_por: string;
}

interface TripDay {
  id: string;
  data: string;
  pernoite: string;
  pernoite_lat: string;
  pernoite_lon: string;
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function MapaPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const { trip, loading: loadingTrip } = useOfflineTrip<TripMeta>(tripId);
  // Admin edita qualquer viagem; usuário comum só a própria (criada por ele).
  const canEdit =
    session?.user.role === "admin" || (!!trip && trip.criado_por === session?.user.id);
  const { items: days, loading: loadingDays } = useOfflineCollection<TripDay>("tripDays", tripId);
  const [origemForm, setOrigemForm] = useState({ nome: "", lat: "", lon: "" });
  const [savingOrigem, setSavingOrigem] = useState(false);
  const [erroOrigem, setErroOrigem] = useState<string | null>(null);
  // O mapa lê do IndexedDB e funciona offline, mas definir a origem é um PATCH no servidor,
  // sem equivalente local - sem sinal o botão fica desabilitado em vez de falhar.
  const online = useOnlineStatus();

  async function handleSaveOrigem() {
    if (!origemForm.lat || !origemForm.lon) return;
    setErroOrigem(null);
    setSavingOrigem(true);
    const res = await apiFetch(`/api/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cidade_origem: origemForm.nome,
        cidade_origem_lat: origemForm.lat,
        cidade_origem_lon: origemForm.lon,
      }),
    });
    if (!res.ok) {
      setErroOrigem(res.error);
      setSavingOrigem(false);
      return;
    }
    // O servidor já gravou; se o pull falhar, o cache local se atualiza na próxima sincronização.
    try {
      await pullTrips();
    } catch {
      // silencioso de propósito - não é erro da ação do usuário
    } finally {
      setSavingOrigem(false);
    }
  }

  if (loadingTrip || loadingDays) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>;
  if (!trip) return null;

  const points: RoutePoint[] = [];
  if (trip.cidade_origem_lat && trip.cidade_origem_lon) {
    points.push({
      key: "origem",
      label: trip.cidade_origem,
      sublabel: "Origem da viagem",
      lat: Number(trip.cidade_origem_lat),
      lon: Number(trip.cidade_origem_lon),
    });
  }
  const sortedDays = [...days].sort((a, b) => a.data.localeCompare(b.data));
  for (const day of sortedDays) {
    if (day.pernoite_lat && day.pernoite_lon) {
      points.push({
        key: day.id,
        label: day.pernoite,
        sublabel: formatDateBR(day.data),
        lat: Number(day.pernoite_lat),
        lon: Number(day.pernoite_lon),
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!trip.cidade_origem_lat && canEdit && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-amber-800 dark:text-amber-300">
              Defina a cidade de origem da viagem, pra o roteiro começar de onde o grupo parte
            </label>
            <CityAutocomplete
              value={origemForm.nome}
              placeholder="De onde o grupo parte"
              onTextChange={(text) => setOrigemForm({ nome: text, lat: "", lon: "" })}
              onSelect={(city) => setOrigemForm({ nome: city.nome, lat: city.lat, lon: city.lon })}
              className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
            {erroOrigem && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{erroOrigem}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSaveOrigem}
            disabled={savingOrigem || !origemForm.lat || !online}
            title={online ? undefined : "Definir a cidade de origem precisa de internet"}
            className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingOrigem ? "Salvando..." : "Salvar"}
          </button>
        </div>
      )}
      {!trip.cidade_origem_lat && !canEdit && (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          A cidade de origem ainda não foi definida - só o administrador ou quem criou a viagem
          pode fazer isso.
        </p>
      )}

      {points.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nenhuma cidade com coordenada ainda. Escolha uma sugestão do autocomplete no campo
          Pernoite (aba Orçamento) pra começar a desenhar o roteiro.
        </p>
      ) : (
        <div className="h-[70vh] overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
          <TripMap points={points} />
        </div>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Os pontos do roteiro funcionam offline como o resto do app; as imagens do mapa em si só
        ficam disponíveis offline se essa área já tiver sido vista com sinal antes.
      </p>
    </div>
  );
}
