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
  traslado_pp: string;
  passagem_pp: string;
  alimentacao_pp: string;
  passeio_pp: string;
  hospedagem_pp: string;
  temp_min: string;
  temp_max: string;
  origem_lat: string;
  origem_lon: string;
  destino_lat: string;
  destino_lon: string;
  pernoite_lat: string;
  pernoite_lon: string;
}

type FocusedCell = { dayId: string; field: keyof TripDay };

const TEXT_FIELDS: { key: keyof TripDay; label: string }[] = [
  { key: "origem", label: "Origem" },
  { key: "destino", label: "Destino" },
  { key: "pernoite", label: "Pernoite" },
];

const COST_FIELDS: { key: keyof TripDay; label: string; fullLabel: string }[] = [
  { key: "traslado_pp", label: "TRAS.", fullLabel: "Traslado" },
  { key: "passagem_pp", label: "PASS.", fullLabel: "Passagem" },
  { key: "alimentacao_pp", label: "ALIM.", fullLabel: "Alimentação" },
  { key: "passeio_pp", label: "INGR.", fullLabel: "Ingressos" },
  { key: "hospedagem_pp", label: "HOSP.", fullLabel: "Hospedagem" },
];

const TEXT_FIELD_KEYS = TEXT_FIELDS.map((f) => f.key);

function latKey(field: (typeof TEXT_FIELD_KEYS)[number]): keyof TripDay {
  return `${field}_lat` as keyof TripDay;
}

function lonKey(field: (typeof TEXT_FIELD_KEYS)[number]): keyof TripDay {
  return `${field}_lon` as keyof TripDay;
}

const GEO_FIELDS = TEXT_FIELD_KEYS.flatMap((k) => [latKey(k), lonKey(k)]);

const EDITABLE_FIELDS = [...TEXT_FIELD_KEYS, ...COST_FIELDS.map((f) => f.key), ...GEO_FIELDS];

const FIELD_LABELS: Record<string, string> = Object.fromEntries([
  ...TEXT_FIELDS.map((f) => [f.key, f.label]),
  ...COST_FIELDS.map((f) => [f.key, f.fullLabel]),
]);

function parseDecimal(raw: string): number {
  const cleaned = raw.trim();
  const num = cleaned.includes(",")
    ? Number(cleaned.replace(/\./g, "").replace(",", "."))
    : Number(cleaned);
  return Math.max(0, num || 0);
}

function formatDecimal(value: string): string {
  const num = Number(value) || 0;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const WEEKDAY_LABELS = ["DO", "2A", "3A", "4A", "5A", "6A", "SA"];

function weekdayLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return WEEKDAY_LABELS[d.getDay()] ?? "";
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function monthDay(iso: string): { month: number; day: number } {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return { month: d.getMonth() + 1, day: d.getDate() };
}

export default function OrcamentoPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { items, loading } = useOfflineCollection<TripDay>("tripDays", tripId);
  const [days, setDays] = useState<TripDay[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [focusedCell, setFocusedCell] = useState<FocusedCell | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);

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

  function normalizeCostOnBlur(dayId: string, field: keyof TripDay, rawValue: string) {
    const num = parseDecimal(rawValue);
    updateLocal(dayId, field, String(num));
    const key = `${dayId}:${field}`;
    setEditingKey((current) => (current === key ? null : current));
  }

  function replicateColumn(scope: "all" | "down") {
    if (!focusedCell) return;
    const { dayId, field } = focusedCell;
    const sourceDay = days.find((d) => d.id === dayId);
    if (!sourceDay) return;
    const isCost = COST_FIELDS.some((f) => f.key === field);
    const isCity = TEXT_FIELD_KEYS.includes(field as (typeof TEXT_FIELD_KEYS)[number]);
    const value = isCost ? String(parseDecimal(sourceDay[field])) : sourceDay[field];
    // Cidade replicada leva a coordenada junto — senão a linha copiada ficaria com o nome mas
    // sem ponto no mapa.
    const geoLat = isCity ? sourceDay[latKey(field as (typeof TEXT_FIELD_KEYS)[number])] : null;
    const geoLon = isCity ? sourceDay[lonKey(field as (typeof TEXT_FIELD_KEYS)[number])] : null;

    function apply(d: TripDay): TripDay {
      const next = { ...d, [field]: value };
      if (isCity) {
        next[latKey(field as (typeof TEXT_FIELD_KEYS)[number])] = geoLat ?? "";
        next[lonKey(field as (typeof TEXT_FIELD_KEYS)[number])] = geoLon ?? "";
      }
      return next;
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

  /** Busca a temperatura e já grava (não depende do botão "Salvar" — a busca por si só persiste
   * o resultado, senão ele se perderia ao recarregar a página). */
  async function fetchWeather() {
    setLoadingWeather(true);
    const cache: Record<string, { min: number; max: number } | null> = {};
    const updates: { id: string; temp_min: string; temp_max: string }[] = [];

    for (const day of days) {
      const city = day.pernoite?.trim();
      if (!city) continue;
      const { month, day: dayOfMonth } = monthDay(day.data);
      const cacheKey = `${city.toLowerCase()}|${month}-${dayOfMonth}`;
      if (!(cacheKey in cache)) {
        try {
          const res = await fetch(
            `/api/weather?city=${encodeURIComponent(city)}&month=${month}&day=${dayOfMonth}`
          );
          const data = res.ok ? await res.json() : { temp: null };
          cache[cacheKey] = data.temp;
        } catch {
          cache[cacheKey] = null;
        }
      }
      const result = cache[cacheKey];
      if (!result) continue;
      const temp_min = result.min.toFixed(1);
      const temp_max = result.max.toFixed(1);
      setDays((prev) => prev.map((d) => (d.id === day.id ? { ...d, temp_min, temp_max } : d)));
      updates.push({ id: day.id, temp_min, temp_max });
    }

    if (updates.length) await saveDaysOffline(tripId, updates);
    setLoadingWeather(false);
  }

  async function saveAll() {
    setIsSaving(true);

    // Só manda pra fila de sincronização os dias/campos que realmente mudaram desde o último
    // carregamento — reduz o risco de uma edição antiga (ex.: feita offline há horas) sobrescrever
    // um campo que outra pessoa alterou nesse meio-tempo em outro dispositivo.
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

    if (changed.length) {
      await saveDaysOffline(tripId, changed);
    }
    snapshotRef.current = Object.fromEntries(days.map((d) => [d.id, d]));
    setIsDirty(false);
    setIsSaving(false);
  }

  const totals = COST_FIELDS.reduce<Record<string, number>>((acc, f) => {
    acc[f.key] = days.reduce((sum, d) => sum + (Number(d[f.key]) || 0), 0);
    return acc;
  }, {});
  const totalGeralPorPessoa = Object.values(totals).reduce((a, b) => a + b, 0);

  if (loading) return <p className="text-sm text-slate-500">Carregando...</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        Valores por pessoa, por dia. As edições ficam só nesta tela até você clicar em{" "}
        <strong>Salvar</strong>.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => replicateColumn("all")}
            disabled={!focusedCell}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0-5-5m5 5 5-5" />
            </svg>
            Replicar para baixo
          </button>
          <span className="text-xs text-slate-400">
            {focusedCell
              ? `Coluna selecionada: ${FIELD_LABELS[focusedCell.field]}`
              : "Clique em um campo para selecionar a coluna a replicar"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchWeather}
            disabled={loadingWeather}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingWeather ? "Buscando e salvando..." : "Buscar temperaturas"}
          </button>
          <span className="text-xs text-slate-500">
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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full whitespace-nowrap text-xs">
          <thead className="bg-slate-50 text-left uppercase text-slate-500">
            <tr>
              <th className="px-2 py-1.5">Data</th>
              <th className="px-2 py-1.5">Dia</th>
              {TEXT_FIELDS.map((f) => (
                <th key={f.key} className="px-2 py-1.5">
                  {f.label}
                </th>
              ))}
              <th className="px-2 py-1.5 text-right">Temp. mín/máx</th>
              {COST_FIELDS.map((f) => (
                <th key={f.key} className="px-2 py-1.5 text-right">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.id} className="border-t border-slate-100">
                <td className="px-2 py-1 text-slate-600">{formatDateBR(day.data)}</td>
                <td className="px-2 py-1 text-slate-500">{weekdayLabel(day.data)}</td>
                {TEXT_FIELDS.map((f) => (
                  <td key={f.key} className="px-1 py-1">
                    <CityAutocomplete
                      value={day[f.key] ?? ""}
                      onTextChange={(text) => {
                        updateLocal(day.id, f.key, text);
                        updateLocal(day.id, latKey(f.key), "");
                        updateLocal(day.id, lonKey(f.key), "");
                      }}
                      onSelect={(city) => {
                        updateLocal(day.id, f.key, city.nome);
                        updateLocal(day.id, latKey(f.key), city.lat);
                        updateLocal(day.id, lonKey(f.key), city.lon);
                      }}
                      onFocus={() => setFocusedCell({ dayId: day.id, field: f.key })}
                      disabled={isSaving}
                      className="w-24 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs"
                    />
                  </td>
                ))}
                <td className="px-2 py-1 text-right text-slate-500">
                  {day.temp_min && day.temp_max ? `${day.temp_min}° / ${day.temp_max}°` : "—"}
                </td>
                {COST_FIELDS.map((f) => {
                  const isEditingHere = editingKey === `${day.id}:${f.key}`;
                  return (
                    <td key={f.key} className="px-1 py-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={isEditingHere ? day[f.key] : formatDecimal(day[f.key])}
                        onChange={(e) =>
                          updateLocal(day.id, f.key, e.target.value.replace(/[^0-9.,]/g, ""))
                        }
                        onFocus={() => {
                          setFocusedCell({ dayId: day.id, field: f.key });
                          setEditingKey(`${day.id}:${f.key}`);
                        }}
                        onBlur={(e) => normalizeCostOnBlur(day.id, f.key, e.target.value)}
                        disabled={isSaving}
                        className="w-20 rounded-md border border-slate-300 px-1.5 py-0.5 text-right text-xs"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-bold">
              <td className="px-2 py-1.5">Total por pessoa</td>
              <td className="px-2 py-1.5" />
              {TEXT_FIELDS.map((f) => (
                <td key={f.key} className="px-2 py-1.5" />
              ))}
              <td className="px-2 py-1.5" />
              {COST_FIELDS.map((f) => (
                <td key={f.key} className="px-2 py-1.5 text-right">
                  {formatDecimal(String(totals[f.key]))}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-sm text-slate-600">
        Total geral por pessoa:{" "}
        <span className="font-bold">R$ {formatDecimal(String(totalGeralPorPessoa))}</span>
      </p>
    </div>
  );
}
