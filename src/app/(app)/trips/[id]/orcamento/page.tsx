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

const TEXT_FIELDS: { key: keyof TripDay; label: string }[] = [
  { key: "origem", label: "Origem" },
  { key: "destino", label: "Destino" },
  { key: "pernoite", label: "Pernoite" },
];

const COST_FIELDS: { key: keyof TripDay; label: string }[] = [
  { key: "traslado_pp", label: "Traslado" },
  { key: "passagem_pp", label: "Passagem" },
  { key: "alimentacao_pp", label: "Alimentação" },
  { key: "passeio_pp", label: "Passeio" },
  { key: "hospedagem_pp", label: "Hospedagem" },
];

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  [...TEXT_FIELDS, ...COST_FIELDS].map((f) => [f.key, f.label])
);

export default function OrcamentoPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const [days, setDays] = useState<TripDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isReplicating, setIsReplicating] = useState(false);
  const [focusedField, setFocusedField] = useState<keyof TripDay | null>(null);

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

  async function persist(dayId: string, field: keyof TripDay, value: string, isText: boolean) {
    const key = `${dayId}:${field}`;
    setSavingKey(key);
    await fetch(`/api/trips/${tripId}/days/${dayId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: isText ? value : Number(value) || 0 }),
    });
    setSavingKey((current) => (current === key ? null : current));
  }

  async function replicateColumn(sourceDay: TripDay) {
    if (!focusedField) return;
    const field = focusedField;
    const value = sourceDay[field];
    setIsReplicating(true);
    setDays((prev) => prev.map((d) => ({ ...d, [field]: value })));
    await fetch(`/api/trips/${tripId}/days`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceDayId: sourceDay.id, field }),
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
        Valores por pessoa, por dia. Editar e sair do campo salva automaticamente. Clique em um
        campo para selecioná-lo e depois no ícone de réplica da linha para copiar só aquela coluna
        para todos os dias.
      </p>

      {isReplicating && (
        <p className="text-sm font-medium text-amber-600">
          Replicando a coluna &quot;{focusedField ? FIELD_LABELS[focusedField] : ""}&quot; para todos os
          dias, aguarde antes de sair da página...
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
                <th key={f.key} className="px-2 py-1.5">
                  {f.label}
                </th>
              ))}
              <th className="px-2 py-1.5" />
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
                      onFocus={() => setFocusedField(f.key)}
                      onBlur={(e) => persist(day.id, f.key, e.target.value, true)}
                      disabled={savingKey === `${day.id}:${f.key}` || isReplicating}
                      className="w-24 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs"
                    />
                  </td>
                ))}
                {COST_FIELDS.map((f) => (
                  <td key={f.key} className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={day[f.key]}
                      onChange={(e) => updateLocal(day.id, f.key, e.target.value)}
                      onFocus={() => setFocusedField(f.key)}
                      onBlur={(e) => persist(day.id, f.key, e.target.value, false)}
                      disabled={savingKey === `${day.id}:${f.key}` || isReplicating}
                      className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5 text-xs"
                    />
                  </td>
                ))}
                <td className="px-1 py-1">
                  <button
                    type="button"
                    tabIndex={-1}
                    title={
                      focusedField
                        ? `Replicar "${FIELD_LABELS[focusedField]}" desta linha para todos os dias`
                        : "Clique antes em um campo para escolher a coluna a replicar"
                    }
                    onClick={() => replicateColumn(day)}
                    disabled={isReplicating || !focusedField}
                    className="shrink-0 rounded-md border border-slate-200 p-1 text-slate-400 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M10 10h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
                    </svg>
                  </button>
                </td>
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
                <td key={f.key} className="px-2 py-1.5">
                  {totals[f.key].toFixed(2)}
                </td>
              ))}
              <td className="px-2 py-1.5" />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-sm text-slate-600">
        Total geral por pessoa: <span className="font-semibold">R$ {totalGeralPorPessoa.toFixed(2)}</span>
      </p>
    </div>
  );
}
