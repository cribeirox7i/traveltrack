"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useOfflineCollection, useOfflineTrip, useCountries } from "@/lib/offline/useOfflineData";
import { findCountry } from "@/lib/countryMatch";
import { distinctCities } from "@/lib/tripCities";
import { hrefSeguro } from "@/lib/urlSegura";

interface TripMeta {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  qtd_pessoas: string;
  capa_url: string;
  custo_modo?: "por_pessoa" | "total" | "";
  criado_por: string;
}

interface TripDay {
  id: string;
  origem: string;
  destino: string;
  pernoite: string;
  origem_pais: string;
  destino_pais: string;
  pernoite_pais: string;
  temp_min: string;
  temp_max: string;
}

/** "Faltam N dias" antes do início, "Dia X de Y" durante a viagem, "Concluída" depois do fim -
 * comparação por data pura (meia-noite local), sem hora, já que datas de viagem não têm hora. */
function prazoLabel(dataInicio: string, dataFim: string): string {
  const MS_DIA = 86_400_000;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicio = new Date(`${dataInicio.slice(0, 10)}T00:00:00`);
  const fim = new Date(`${dataFim.slice(0, 10)}T00:00:00`);

  if (hoje < inicio) {
    const dias = Math.round((inicio.getTime() - hoje.getTime()) / MS_DIA);
    return `Faltam ${dias} dia${dias === 1 ? "" : "s"}`;
  }
  if (hoje <= fim) {
    const diaAtual = Math.round((hoje.getTime() - inicio.getTime()) / MS_DIA) + 1;
    const totalDias = Math.round((fim.getTime() - inicio.getTime()) / MS_DIA) + 1;
    return `Dia ${diaAtual} de ${totalDias}`;
  }
  return "Concluída";
}

/** Bandeira como imagem (Twemoji, sem chave) em vez do emoji cru - no Windows/Chrome desktop o
 * emoji de bandeira cai pra um fallback de duas letras (regional indicators), sem cor nenhuma;
 * como imagem fica igual em qualquer SO/navegador, celular ou desktop. */
function flagImgSrc(flagEmoji: string): string | null {
  if (!flagEmoji) return null;
  const codepoints = Array.from(flagEmoji).map((c) => c.codePointAt(0)!.toString(16));
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${codepoints.join("-")}.png`;
}

function formatRate(rateBrl: string): string | null {
  const num = Number(rateBrl);
  if (!rateBrl || Number.isNaN(num)) return null;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** Hora agora na cidade, calculada a partir do relógio do próprio aparelho + o fuso salvo (nunca
 * uma chamada de API só pra saber a hora). */
function nowInTimezone(timezone: string, now: Date): string | null {
  if (!timezone) return null;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(now);
  } catch {
    return null;
  }
}

/** Temperatura por cidade de pernoite (a única que recebe busca de clima, ver
 * `fetchAndSaveWeather`), agregando min/max de todas as datas em que a viagem passou por lá -
 * independente da data, como pedido: uma linha por cidade, não por dia. */
function temperaturasPorCidade(days: TripDay[]): { cidade: string; min: number; max: number }[] {
  const mapa = new Map<string, { min: number; max: number }>();
  for (const day of days) {
    const cidade = day.pernoite?.trim();
    if (!cidade) continue;
    const min = Number(day.temp_min);
    const max = Number(day.temp_max);
    if (Number.isNaN(min) || Number.isNaN(max)) continue;
    const atual = mapa.get(cidade);
    mapa.set(cidade, atual ? { min: Math.min(atual.min, min), max: Math.max(atual.max, max) } : { min, max });
  }
  return Array.from(mapa.entries()).map(([cidade, v]) => ({ cidade, ...v }));
}

const ACCORDIONS = ["temperatura", "fuso"] as const;
type AccordionKey = (typeof ACCORDIONS)[number];

const ACCORDION_LABELS: Record<AccordionKey, { icon: string; label: string }> = {
  temperatura: { icon: "🌡️", label: "Temperatura" },
  fuso: { icon: "🕐", label: "Fuso horário" },
};

export default function TripDashboardPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const { trip } = useOfflineTrip<TripMeta>(tripId);
  // Admin edita qualquer viagem; usuário comum só a própria (criada por ele).
  const canEdit =
    session?.user.role === "admin" || (!!trip && trip.criado_por === session?.user.id);
  const { items: days, loading } = useOfflineCollection<TripDay>("tripDays", tripId);
  const countries = useCountries();

  const [openAccordion, setOpenAccordion] = useState<AccordionKey | null>(null);
  const [openPais, setOpenPais] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const cidades = distinctCities(days);
  const paises = Array.from(new Set(cidades.map((c) => c.pais).filter(Boolean)));
  const temperaturas = temperaturasPorCidade(days);
  const temperaturasValidas = temperaturas.length > 0;
  const tempMinGeral = temperaturasValidas ? Math.min(...temperaturas.map((t) => t.min)) : null;
  const tempMaxGeral = temperaturasValidas ? Math.max(...temperaturas.map((t) => t.max)) : null;

  const stats: { label: string; value: string }[] = trip
    ? [
        { label: "Prazo", value: prazoLabel(trip.data_inicio, trip.data_fim) },
        { label: "Viajantes", value: `${trip.qtd_pessoas} pessoa(s)` },
        { label: "Cidades", value: String(cidades.length) },
        { label: "Países", value: String(paises.length) },
        { label: "Temp. mínima", value: tempMinGeral !== null ? `${tempMinGeral.toFixed(1)}°` : "-" },
        { label: "Temp. máxima", value: tempMaxGeral !== null ? `${tempMaxGeral.toFixed(1)}°` : "-" },
      ]
    : [];

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {hrefSeguro(trip?.capa_url) && (
        // eslint-disable-next-line @next/next/no-img-element -- URL externa qualquer, escolhida pelo usuário, sem domínio fixo pra next/image
        <img
          src={hrefSeguro(trip?.capa_url)}
          alt=""
          className="h-40 w-full rounded-2xl object-cover sm:h-56"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}

      {canEdit && (
        <div>
          <Link
            href={`/trips/${tripId}/editar`}
            className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
          >
            Editar viagem
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
          >
            <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {s.label}
            </p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {paises.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Países</h2>
          <div className="flex flex-col gap-2">
            {paises.map((pais) => {
              const isOpen = openPais === pais;
              const info = findCountry(countries, pais);
              const rate = info ? formatRate(info.rate_brl) : null;
              const temPlug = info?.plug_type || info?.volts || info?.hertz;
              const semDados =
                !info?.currency_code && !info?.language && !info?.ddi && !info?.driving_side && !temPlug;
              return (
                <div
                  key={pais}
                  className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                >
                  <button
                    type="button"
                    onClick={() => setOpenPais(isOpen ? null : pais)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {info?.flag_emoji ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Twemoji externo, sem domínio fixo pra next/image, ícone pequeno
                        <img src={flagImgSrc(info.flag_emoji) ?? undefined} alt="" className="h-4 w-5 shrink-0 object-cover" />
                      ) : (
                        <span>🌍</span>
                      )}
                      <span className="truncate">{pais}</span>
                    </span>
                    <span className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
                      <div className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
                        {info?.currency_code && (
                          <p>
                            💰 {info.currency_code}
                            {info.currency_name && ` (${info.currency_name})`}
                          </p>
                        )}
                        {rate && <p className="pl-[18px]">→ R$ {rate}</p>}
                        {info?.language && <p>🗣️ {info.language}</p>}
                        {info?.ddi && <p>📞 {info.ddi}</p>}
                        {info?.driving_side && (
                          <p>🚗 {info.driving_side === "left" ? "Esquerda" : "Direita"}</p>
                        )}
                        {temPlug && (
                          <p>
                            ⚡ {info?.plug_type || "?"} · {info?.volts || "?"} · {info?.hertz || "?"}
                          </p>
                        )}
                        {semDados && (
                          <p className="text-slate-400 dark:text-slate-500">
                            sem dados ainda (toque em Atualizar na barra superior)
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Cidades</h2>
        <div className="flex flex-col gap-2">
          {ACCORDIONS.map((key) => {
          const isOpen = openAccordion === key;
          const { icon, label } = ACCORDION_LABELS[key];
          return (
            <div
              key={key}
              className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => setOpenAccordion(isOpen ? null : key)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  <span>{icon}</span> {label}
                </span>
                <span className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
                  {key === "temperatura" && (
                    <ul className="flex flex-col gap-1.5 text-sm">
                      {temperaturas.length === 0 && (
                        <li className="text-slate-400 dark:text-slate-500">
                          Sem temperaturas buscadas ainda (toque em Atualizar na barra superior).
                        </li>
                      )}
                      {temperaturas.map((t) => (
                        <li key={t.cidade} className="flex items-center justify-between gap-3">
                          <span className="text-slate-700 dark:text-slate-300">{t.cidade}</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {t.min.toFixed(1)}° / {t.max.toFixed(1)}°
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {key === "fuso" && (
                    <ul className="flex flex-col gap-1.5 text-sm">
                      {cidades.length === 0 && (
                        <li className="text-slate-400 dark:text-slate-500">
                          Nenhuma cidade no roteiro ainda.
                        </li>
                      )}
                      {cidades.map(({ cidade, pais }) => {
                        const info = findCountry(countries, pais);
                        const hora = info ? nowInTimezone(info.timezone, now) : null;
                        return (
                          <li key={cidade} className="flex flex-col gap-0.5">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{cidade}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {hora ? `${hora} (${info?.timezone})` : "sem dado ainda"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
