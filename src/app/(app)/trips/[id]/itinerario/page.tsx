"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useOfflineCollection } from "@/lib/offline/useOfflineData";
import { saveDaysOffline } from "@/lib/offline/sync";
import { CityAutocomplete } from "@/components/CityAutocomplete";

interface TripDay {
  id: string;
  data: string;
  origem: string;
  destino: string;
  pernoite: string;
  origem_lat: string;
  origem_lon: string;
  destino_lat: string;
  destino_lon: string;
  pernoite_lat: string;
  pernoite_lon: string;
}

type FocusedCell = { dayId: string; field: (typeof ROUTE_FIELDS)[number]["key"] };

const ROUTE_FIELDS: { key: "origem" | "destino" | "pernoite"; label: string }[] = [
  { key: "origem", label: "Origem" },
  { key: "destino", label: "Destino" },
  { key: "pernoite", label: "Pernoite" },
];

const ROUTE_FIELD_KEYS = ROUTE_FIELDS.map((f) => f.key);

function latKey(field: (typeof ROUTE_FIELD_KEYS)[number]): keyof TripDay {
  return `${field}_lat` as keyof TripDay;
}

function lonKey(field: (typeof ROUTE_FIELD_KEYS)[number]): keyof TripDay {
  return `${field}_lon` as keyof TripDay;
}

const GEO_FIELDS = ROUTE_FIELD_KEYS.flatMap((k) => [latKey(k), lonKey(k)]);
const EDITABLE_FIELDS = [...ROUTE_FIELD_KEYS, ...GEO_FIELDS];

const WEEKDAY_LABELS = ["DO", "2A", "3A", "4A", "5A", "6A", "SA"];

function weekdayLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return WEEKDAY_LABELS[d.getDay()] ?? "";
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function ItinerarioPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { items, loading } = useOfflineCollection<TripDay>("tripDays", tripId);
  const [days, setDays] = useState<TripDay[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [focusedCell, setFocusedCell] = useState<FocusedCell | null>(null);

  // Snapshot do que já está sincronizado, pra "Salvar" enviar só os campos que mudaram de fato.
  const snapshotRef = useRef<Record<string, TripDay>>({});

  useEffect(() => {
    if (isDirty) return; // não pisa em edição em andamento com uma atualização em segundo plano
    const sorted = [...items].sort((a, b) => a.data.localeCompare(b.data));
    setDays(sorted);
    snapshotRef.current = Object.fromEntries(sorted.map((d) => [d.id, d]));
  }, [items, isDirty]);

  useEffect(() => {
    function warnBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  function updateLocal(dayId: string, field: keyof TripDay, value: string) {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, [field]: value } : d)));
    setIsDirty(true);
  }

  /** Ao escolher uma cidade da busca, aplica nome + coordenadas na célula clicada e em qualquer
   * outra célula de cidade (mesmo campo ou não, qualquer dia) que já tenha o mesmo texto digitado
   * - evita ter que reclicar a sugestão toda vez que a mesma cidade se repete no itinerário. */
  function applyCitySelection(
    dayId: string,
    field: (typeof ROUTE_FIELD_KEYS)[number],
    city: { nome: string; lat: string; lon: string }
  ) {
    const normalized = city.nome.trim().toLowerCase();
    setDays((prev) =>
      prev.map((d) => {
        let next: TripDay | null = null;
        for (const f of ROUTE_FIELD_KEYS) {
          const isTarget = d.id === dayId && f === field;
          const text = (d[f] ?? "").trim().toLowerCase();
          if (isTarget || (text && text === normalized)) {
            if (!next) next = { ...d };
            next[f] = city.nome;
            next[latKey(f)] = city.lat;
            next[lonKey(f)] = city.lon;
          }
        }
        return next ?? d;
      })
    );
    setIsDirty(true);
  }

  function replicateColumn(scope: "all" | "down") {
    if (!focusedCell) return;
    const { dayId, field } = focusedCell;
    const sourceDay = days.find((d) => d.id === dayId);
    if (!sourceDay) return;
    const value = sourceDay[field];
    const geoLat = sourceDay[latKey(field)];
    const geoLon = sourceDay[lonKey(field)];

    function apply(d: TripDay): TripDay {
      return { ...d, [field]: value, [latKey(field)]: geoLat, [lonKey(field)]: geoLon };
    }

    setDays((prev) => {
      if (scope === "down") {
        const idx = prev.findIndex((d) => d.id === dayId);
        return prev.map((d, i) => (i >= idx ? apply(d) : d));
      }
      return prev.map(apply);
    });
    setIsDirty(true);
  }

  async function saveAll() {
    setIsSaving(true);
    const changed = days
      .map((day) => {
        const before = snapshotRef.current[day.id];
        const patch: Record<string, string> = {};
        for (const field of EDITABLE_FIELDS) {
          if (!before || before[field] !== day[field]) patch[field] = day[field] as string;
        }
        return Object.keys(patch).length ? { id: day.id, ...patch } : null;
      })
      .filter((d): d is { id: string } & Record<string, string> => d !== null);

    if (changed.length) await saveDaysOffline(tripId, changed);
    snapshotRef.current = Object.fromEntries(days.map((d) => [d.id, d]));
    setIsDirty(false);
    setIsSaving(false);
  }

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Origem, destino e pernoite de cada dia da viagem. Este é o único lugar onde essas cidades
        podem ser editadas - nas outras abas elas aparecem só como texto.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => replicateColumn("all")}
            disabled={!focusedCell}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M10 10h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
            </svg>
            Replicar todas as linhas
          </button>
          <button
            type="button"
            onClick={() => replicateColumn("down")}
            disabled={!focusedCell}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0-5-5m5 5 5-5" />
            </svg>
            Replicar para baixo
          </button>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {focusedCell
              ? `Coluna selecionada: ${ROUTE_FIELDS.find((f) => f.key === focusedCell.field)?.label}`
              : "Clique em um campo para selecionar a coluna a replicar"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {isDirty ? "Alterações não salvas" : "Tudo salvo"}
          </span>
          <button
            type="button"
            onClick={saveAll}
            disabled={!isDirty || isSaving}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full whitespace-nowrap text-xs">
          <thead className="bg-slate-50 dark:bg-slate-950 text-left uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-2 py-1">Data</th>
              <th className="px-1 py-1">Dia</th>
              {ROUTE_FIELDS.map((f) => (
                <th key={f.key} className="px-1 py-1">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1 text-slate-600 dark:text-slate-400">{formatDateBR(day.data)}</td>
                <td className="px-1 py-1 text-slate-500 dark:text-slate-400">{weekdayLabel(day.data)}</td>
                {ROUTE_FIELDS.map((f) => (
                  <td key={f.key} className="px-1 py-1">
                    <CityAutocomplete
                      value={day[f.key] ?? ""}
                      hasCoordinates={Boolean(day[latKey(f.key)] && day[lonKey(f.key)])}
                      onTextChange={(text) => {
                        updateLocal(day.id, f.key, text);
                        updateLocal(day.id, latKey(f.key), "");
                        updateLocal(day.id, lonKey(f.key), "");
                      }}
                      onSelect={(city) => applyCitySelection(day.id, f.key, city)}
                      onFocus={() => setFocusedCell({ dayId: day.id, field: f.key })}
                      disabled={isSaving}
                      className="w-full min-w-32 rounded-md border border-slate-300 dark:border-slate-700 py-0.5 pl-1.5 pr-3.5 text-xs"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
