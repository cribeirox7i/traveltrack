"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getLocalAnexoUrl, useOfflineCollection } from "@/lib/offline/useOfflineData";
import { deleteItemOffline } from "@/lib/offline/sync";
import { hrefSeguro } from "@/lib/urlSegura";
import { CATEGORIAS_ITEM, CategoriaItem } from "@/lib/sheets/types";

interface TripDay {
  id: string;
  data: string;
  origem: string;
  destino: string;
  pernoite: string;
  temp_min: string;
  temp_max: string;
  chuva_mm: string;
  vento_kmh: string;
}

/** Mesmos campos de `Item` em itens/page.tsx - repetido aqui porque é uma projeção de leitura
 * (esta tela não cria/edita Item, só lista por data/horário e navega pra Itens pra isso). */
interface Item {
  id: string;
  categoria: CategoriaItem;
  tipo: string;
  nome_companhia: string;
  origem: string;
  destino: string;
  nome_local: string;
  data: string;
  horario: string;
  descricao: string;
  url: string;
  anexo_file_id: string;
  anexo_nome: string;
  anexo_url: string;
}

const CATEGORIA_LABEL: Record<CategoriaItem, string> = Object.fromEntries(
  CATEGORIAS_ITEM.map((c) => [c.value, c.label])
) as Record<CategoriaItem, string>;

const WEEKDAY_LABELS = ["DO", "2A", "3A", "4A", "5A", "6A", "SA"];

function weekdayLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return WEEKDAY_LABELS[d.getDay()] ?? "";
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

const FORECAST_MAX_DIAS = 16;

/** Mesma regra de `lib/weather.ts`: até 16 dias à frente de hoje é previsão real, senão é média
 * histórica - a tela não guarda qual fonte foi usada (não é uma coluna na planilha), dá pra
 * recalcular na hora a partir da própria data do dia. */
function isForecastReal(dataISO: string): boolean {
  const MS_DIA = 86_400_000;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${dataISO.slice(0, 10)}T00:00:00`);
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / MS_DIA);
  return dias >= 0 && dias <= FORECAST_MAX_DIAS;
}

/** Linha de resumo do item na lista - mesma lógica de `resumoItem` em itens/page.tsx, sem
 * depender do nome do meio de pagamento (não é relevante aqui). */
function resumoItem(item: Item): string {
  switch (item.categoria) {
    case "traslado":
    case "passagem":
      return [item.nome_companhia, item.origem && item.destino ? `${item.origem} → ${item.destino}` : ""]
        .filter(Boolean)
        .join(" · ");
    case "hospedagem":
    case "alimentacao":
      return item.nome_local;
    case "atrativo":
      return [item.tipo, item.nome_companhia].filter(Boolean).join(" · ");
    default:
      return "";
  }
}

export default function AgendaPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { items: days, loading: loadingDays } = useOfflineCollection<TripDay>("tripDays", tripId);
  const { items: itens, loading: loadingItens } = useOfflineCollection<Item>("itens", tripId);

  const [openDay, setOpenDay] = useState<string | null>(null);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});

  // Mesmo padrão da tela de Itens: resolve, pra cada anexo já baixado neste aparelho, um object
  // URL que abre offline - os que ainda não foram baixados caem pro link ao vivo do Drive
  // (anexo_url) na renderização.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    (async () => {
      const entries = await Promise.all(
        itens
          .filter((i) => i.anexo_file_id)
          .map(async (i) => {
            const url = await getLocalAnexoUrl(i.anexo_file_id);
            if (url) created.push(url);
            return [i.anexo_file_id, url] as const;
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
  }, [itens]);

  const sortedDays = [...days].sort((a, b) => a.data.localeCompare(b.data));
  const itensPorDia = new Map<string, Item[]>();
  for (const item of itens) {
    const lista = itensPorDia.get(item.data) ?? [];
    lista.push(item);
    itensPorDia.set(item.data, lista);
  }
  for (const lista of itensPorDia.values()) {
    lista.sort((a, b) => a.horario.localeCompare(b.horario));
  }

  async function handleDelete(itemId: string) {
    if (!confirm("Excluir este item?")) return;
    await deleteItemOffline(tripId, itemId);
  }

  const loading = loadingDays || loadingItens;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Temperatura e itens do roteiro, por data. Traslados, passagens, hospedagem e atrativos
          aparecem aqui automaticamente pela data de início/check-in/partida - cadastre-os na aba
          Itens. Origem/destino/pernoite ficam na aba Itinerário; dados de país (moeda, fuso,
          tomada...) ficam no Dashboard da viagem. &ldquo;Atualizar&rdquo; na barra superior busca
          a temperatura. Toque numa data pra abrir.
        </p>
        <Link
          href={`/trips/${tripId}/itens`}
          className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Novo Item
        </Link>
      </div>

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>}
      {!loading && sortedDays.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Esta viagem ainda não tem diárias - vá em Itinerário pra criar a grade de dias.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {sortedDays.map((day) => {
          const isOpen = openDay === day.data;
          const itensDoDia = itensPorDia.get(day.data) ?? [];
          return (
            <div key={day.id} className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setOpenDay(isOpen ? null : day.data)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                    {formatDateBR(day.data)}
                  </span>
                  <span className="text-xs uppercase text-slate-500 dark:text-slate-400">
                    {weekdayLabel(day.data)}
                  </span>
                  {itensDoDia.length > 0 && (
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {itensDoDia.length} {itensDoDia.length === 1 ? "item" : "itens"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    {day.temp_min && day.temp_max ? `${day.temp_min}° / ${day.temp_max}°` : "-"}
                  </span>
                  {day.temp_min && day.temp_max && (
                    <span
                      title={
                        isForecastReal(day.data)
                          ? "Previsão meteorológica atualizada"
                          : "Estimativa por média histórica"
                      }
                    >
                      {isForecastReal(day.data) ? "🔮" : "📊"}
                    </span>
                  )}
                  <span className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
                  {day.temp_min && day.temp_max && (
                    <div className="mb-3 flex flex-col gap-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex flex-wrap items-center gap-3">
                        <span>🌡️ {day.temp_min}° / {day.temp_max}°</span>
                        {day.chuva_mm && <span>🌧️ {day.chuva_mm}mm</span>}
                        {day.vento_kmh && <span>💨 {day.vento_kmh}km/h</span>}
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        {isForecastReal(day.data)
                          ? "🔮 Previsão meteorológica atualizada"
                          : "📊 Estimativa por média histórica"}
                      </p>
                    </div>
                  )}

                  {itensDoDia.length === 0 && (
                    <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum item nesta data ainda.</p>
                  )}

                  <ul className="flex flex-col gap-2">
                    {itensDoDia.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold uppercase tracking-wide text-slate-800 dark:text-slate-200">
                            {item.horario} · {CATEGORIA_LABEL[item.categoria] ?? item.categoria}
                          </p>
                          {(resumoItem(item) || item.descricao) && (
                            <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
                              {resumoItem(item) || item.descricao}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-3 text-xs">
                            {hrefSeguro(item.url) && (
                              <a
                                href={hrefSeguro(item.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Link
                              </a>
                            )}
                            {item.anexo_file_id && (
                              <a
                                href={localUrls[item.anexo_file_id] ?? item.anexo_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-slate-500 dark:text-slate-400 hover:text-blue-600 hover:underline"
                              >
                                📎 {item.anexo_nome || "anexo"}
                              </a>
                            )}
                            {item.anexo_nome && !item.anexo_file_id && (
                              <span className="text-slate-400 dark:text-slate-500" title="Envia quando voltar o sinal">
                                📎 {item.anexo_nome} (pendente de sincronização)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
                          <Link
                            href={`/trips/${tripId}/itens?editar=${item.id}`}
                            className="text-slate-500 dark:text-slate-400 hover:text-slate-800"
                          >
                            Editar
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            className="text-red-500 dark:text-red-400 hover:text-red-700"
                          >
                            Excluir
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/trips/${tripId}/itens`}
                    className="mt-3 inline-block text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800"
                  >
                    + Novo item nesta data
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
