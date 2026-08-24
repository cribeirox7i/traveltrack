"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getLocalAnexoUrl, useOfflineCollection } from "@/lib/offline/useOfflineData";
import {
  createAgendaOffline,
  deleteAgendaOffline,
  saveDaysOffline,
  updateAgendaOffline,
} from "@/lib/offline/sync";

interface TripDay {
  id: string;
  data: string;
  origem: string;
  destino: string;
  pernoite: string;
  temp_min: string;
  temp_max: string;
}

interface AgendaItem {
  id: string;
  data: string;
  horario: string;
  titulo: string;
  descricao: string;
  url: string;
  anexo_file_id: string;
  anexo_nome: string;
  anexo_url: string;
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

const emptyForm = { data: "", horario: "", titulo: "", descricao: "", url: "" };

export default function AgendaPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { items: days, loading: loadingDays } = useOfflineCollection<TripDay>("tripDays", tripId);
  const { items: agenda, loading: loadingAgenda } = useOfflineCollection<AgendaItem>(
    "agenda",
    tripId
  );

  const [loadingWeather, setLoadingWeather] = useState(false);

  const [openDay, setOpenDay] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // null = criando um compromisso novo; string = editando o compromisso com este id.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mesmo padrão da tela de Anexos: resolve, pra cada anexo de compromisso já baixado neste
  // aparelho, um object URL que abre offline - os que ainda não foram baixados caem pro link ao
  // vivo do Drive (anexo_url) na renderização.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    (async () => {
      const entries = await Promise.all(
        agenda
          .filter((a) => a.anexo_file_id)
          .map(async (a) => {
            const url = await getLocalAnexoUrl(a.anexo_file_id);
            if (url) created.push(url);
            return [a.anexo_file_id, url] as const;
          })
      );
      if (cancelled) {
        created.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setLocalUrls(Object.fromEntries(entries.filter(([, url]) => url) as [string, string][]));
    })();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [agenda]);

  const sortedDays = [...days].sort((a, b) => a.data.localeCompare(b.data));
  const agendaPorDia = new Map<string, AgendaItem[]>();
  for (const item of agenda) {
    const lista = agendaPorDia.get(item.data) ?? [];
    lista.push(item);
    agendaPorDia.set(item.data, lista);
  }
  for (const lista of agendaPorDia.values()) {
    lista.sort((a, b) => a.horario.localeCompare(b.horario));
  }

  function openNewForm(data?: string) {
    setEditingId(null);
    setForm({ ...emptyForm, data: data ?? sortedDays[0]?.data ?? "" });
    setFile(null);
    setError(null);
    setFormOpen(true);
  }

  function openEditForm(item: AgendaItem) {
    setEditingId(item.id);
    setForm({
      data: item.data,
      horario: item.horario,
      titulo: item.titulo,
      descricao: item.descricao,
      url: item.url,
    });
    setFile(null);
    setError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.data || !form.horario || !form.titulo) {
      setError("Data, horário e título são obrigatórios");
      return;
    }
    setSaving(true);
    if (editingId) {
      await updateAgendaOffline(tripId, editingId, { ...form, file });
    } else {
      await createAgendaOffline(tripId, { ...form, file });
    }
    setSaving(false);
    setOpenDay(form.data);
    closeForm();
  }

  async function handleDelete(agendaId: string) {
    if (!confirm("Excluir este compromisso da agenda?")) return;
    await deleteAgendaOffline(tripId, agendaId);
  }

  /** Busca a temperatura e já grava (não depende de nenhum botão "Salvar" - a busca por si só
   * persiste o resultado, senão ele se perderia ao recarregar a página). */
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
      updates.push({ id: day.id, temp_min: result.min.toFixed(1), temp_max: result.max.toFixed(1) });
    }

    if (updates.length) await saveDaysOffline(tripId, updates);
    setLoadingWeather(false);
  }

  const loading = loadingDays || loadingAgenda;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Temperatura e compromissos do roteiro, por data. Origem/destino/pernoite ficam na aba
          Itinerário. Toque numa data pra abrir.
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchWeather}
            disabled={loadingWeather}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingWeather ? "Buscando e salvando..." : "Buscar temperaturas"}
          </button>
          {!formOpen && (
            <button
              type="button"
              onClick={() => openNewForm()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              + Nova agenda
            </button>
          )}
        </div>
      </div>

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end"
        >
          {editingId && (
            <p className="w-full text-xs font-medium uppercase text-slate-400">
              Editando compromisso
            </p>
          )}
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">Data</label>
            <select
              required
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {sortedDays.map((d) => (
                <option key={d.id} value={d.data}>
                  {formatDateBR(d.data)} ({weekdayLabel(d.data)})
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[120px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">Horário</label>
            <input
              type="time"
              required
              value={form.horario}
              onChange={(e) => setForm({ ...form, horario: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">Título</label>
            <input
              required
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Descrição <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              URL <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              type="url"
              placeholder="https://..."
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Anexo{" "}
              <span className="font-normal text-slate-400">
                {editingId ? "(opcional - envie um novo pra substituir o atual)" : "(opcional)"}
              </span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-900 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-slate-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
          {error && <p className="w-full text-sm text-red-600">{error}</p>}
        </form>
      )}

      {loading && <p className="text-sm text-slate-500">Carregando...</p>}
      {!loading && sortedDays.length === 0 && (
        <p className="text-sm text-slate-500">Esta viagem ainda não tem diárias.</p>
      )}

      <div className="flex flex-col gap-2">
        {sortedDays.map((day) => {
          const isOpen = openDay === day.data;
          const itens = agendaPorDia.get(day.data) ?? [];
          return (
            <div key={day.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setOpenDay(isOpen ? null : day.data)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[14px] font-semibold text-slate-900">
                    {formatDateBR(day.data)}
                  </span>
                  <span className="text-xs uppercase text-slate-500">
                    {weekdayLabel(day.data)}
                  </span>
                  {itens.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {itens.length} {itens.length === 1 ? "item" : "itens"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>
                    {day.temp_min && day.temp_max ? `${day.temp_min}° / ${day.temp_max}°` : "-"}
                  </span>
                  <span className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 px-4 py-3">
                  <p className="mb-3 text-xs text-slate-500">
                    {day.origem || "-"} → {day.destino || "-"} · Pernoite: {day.pernoite || "-"}
                  </p>

                  {itens.length === 0 && (
                    <p className="text-sm text-slate-400">Nenhum compromisso nesta data ainda.</p>
                  )}

                  <ul className="flex flex-col gap-2">
                    {itens.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold uppercase tracking-wide text-slate-800">
                            {item.horario} · {item.titulo}
                          </p>
                          {item.descricao && (
                            <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-500">
                              {item.descricao}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-3 text-xs">
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                Link
                              </a>
                            )}
                            {item.anexo_file_id && (
                              <a
                                href={localUrls[item.anexo_file_id] ?? item.anexo_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-slate-500 hover:text-blue-600 hover:underline"
                              >
                                📎 {item.anexo_nome || "anexo"}
                              </a>
                            )}
                            {item.anexo_nome && !item.anexo_file_id && (
                              <span className="text-slate-400" title="Envia quando voltar o sinal">
                                📎 {item.anexo_nome} (pendente de sincronização)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
                          <button
                            type="button"
                            onClick={() => openEditForm(item)}
                            className="text-slate-500 hover:text-slate-800"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            Excluir
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => openNewForm(day.data)}
                    className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    + Novo compromisso nesta data
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
