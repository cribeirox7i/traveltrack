"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

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

export default function OrcamentoPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const [days, setDays] = useState<TripDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isReplicating, setIsReplicating] = useState(false);
  const [focusedCell, setFocusedCell] = useState<FocusedCell | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/trips/${tripId}/days`);
    if (res.ok) setDays(await res.json());
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  function updateLocal(dayId: string, field: keyof TripDay, value: string) {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, [field]: value } : d)));
  }

  async function persistText(dayId: string, field: keyof TripDay, value: string) {
    const key = `${dayId}:${field}`;
    setSavingKey(key);
    await fetch(`/api/trips/${tripId}/days/${dayId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setSavingKey((current) => (current === key ? null : current));
  }

  async function persistCost(dayId: string, field: keyof TripDay, rawValue: string) {
    const num = parseDecimal(rawValue);
    updateLocal(dayId, field, String(num));
    const key = `${dayId}:${field}`;
    setEditingKey((current) => (current === key ? null : current));
    setSavingKey(key);
    await fetch(`/api/trips/${tripId}/days/${dayId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: num }),
    });
    setSavingKey((current) => (current === key ? null : current));
  }

  async function replicateColumn(scope: "all" | "down") {
    if (!focusedCell) return;
    const { dayId, field } = focusedCell;
    const sourceDay = days.find((d) => d.id === dayId);
    if (!sourceDay) return;
    const isCost = COST_FIELDS.some((f) => f.key === field);
    const value = isCost ? String(parseDecimal(sourceDay[field])) : sourceDay[field];

    setIsReplicating(true);
    setDays((prev) => {
      if (scope === "down") {
        const idx = prev.findIndex((d) => d.id === dayId);
        return prev.map((d, i) => (i >= idx ? { ...d, [field]: value } : d));
      }
      return prev.map((d) => ({ ...d, [field]: value }));
    });
    await fetch(`/api/trips/${tripId}/days`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceDayId: dayId, field, value, scope }),
    });
    setIsReplicating(false);
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
        Valores por pessoa, por dia. Editar e sair do campo salva automaticamente.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => replicateColumn("all")}
          disabled={!focusedCell || isReplicating}
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
          disabled={!focusedCell || isReplicating}
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

      {isReplicating && (
        <p className="text-sm font-medium text-amber-600">
          Replicando a coluna &quot;{focusedCell ? FIELD_LABELS[focusedCell.field] : ""}&quot;, aguarde
          antes de sair da página...
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full whitespace-nowrap text-xs">
          <thead className="bg-slate-50 text-left uppercase text-slate-500">
            <tr>
              <th className="px-2 py-1.5">Data</th>
              {TEXT_FIELDS.map((f) => (
                <th key={f.key} className="px-2 py-1.5">
                  {f.label}
                </th>
              ))}
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
                <td className="px-2 py-1 text-slate-600">{day.data}</td>
                {TEXT_FIELDS.map((f) => (
                  <td key={f.key} className="px-1 py-1">
                    <input
                      type="text"
                      value={day[f.key] ?? ""}
                      onChange={(e) => updateLocal(day.id, f.key, e.target.value)}
                      onFocus={() => setFocusedCell({ dayId: day.id, field: f.key })}
                      onBlur={(e) => persistText(day.id, f.key, e.target.value)}
                      disabled={savingKey === `${day.id}:${f.key}` || isReplicating}
                      className="w-24 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs"
                    />
                  </td>
                ))}
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
                        onBlur={(e) => persistCost(day.id, f.key, e.target.value)}
                        disabled={savingKey === `${day.id}:${f.key}` || isReplicating}
                        className="w-20 rounded-md border border-slate-300 px-1.5 py-0.5 text-right text-xs"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 font-medium">
              <td className="px-2 py-1.5">Total por pessoa</td>
              {TEXT_FIELDS.map((f) => (
                <td key={f.key} className="px-2 py-1.5" />
              ))}
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
        <span className="font-semibold">R$ {formatDecimal(String(totalGeralPorPessoa))}</span>
      </p>
    </div>
  );
}
