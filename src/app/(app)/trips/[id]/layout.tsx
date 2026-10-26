"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { TripTabs } from "@/components/TripTabs";
import { TRIP_TAB_SLUGS } from "@/lib/tripTabs";
import { TripDisclaimerProvider } from "@/lib/TripDisclaimerContext";
import { useOfflineTrip } from "@/lib/offline/useOfflineData";
import { isOnline } from "@/lib/offline/sync";
import { TRIP_STATUS_BADGE, TRIP_STATUS_LABEL, statusViagem } from "@/lib/tripStatus";

interface TripMeta {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  qtd_pessoas: string;
  status?: string;
  criado_por: string;
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function TripLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { status, data: session } = useSession();
  const { trip, loading } = useOfflineTrip<TripMeta>(id);
  const canEdit =
    session?.user.role === "admin" || (!!trip && trip.criado_por === session?.user.id);

  // O NextAuth revalida a sessão sozinho ao voltar o foco da tela, e engole qualquer erro de
  // rede devolvendo sessão nula - offline isso vira "unauthenticated" por falso alarme, não
  // por sessão expirada de verdade. Só confiar nisso pra redirecionar quando há conexão.
  useEffect(() => {
    if (status === "unauthenticated" && isOnline()) router.replace("/login");
  }, [status, router]);

  // Garante que o código de TODAS as abas da viagem (não só a que foi clicada) já
  // esteja em cache assim que a viagem é aberta online - é o que faz Itens/Anexos/
  // etc. abrirem offline depois, mesmo sem ter passado por elas antes manualmente.
  useEffect(() => {
    if (!isOnline()) return;
    router.prefetch(`/trips/${id}`);
    for (const slug of TRIP_TAB_SLUGS) {
      router.prefetch(`/trips/${id}/${slug}`);
    }
  }, [id, router]);

  // Sem dado local nenhum e sem conexão: não dá pra saber se a viagem existe/o usuário tem acesso
  // (a lista de viagens já vem filtrada por acesso do servidor - se não está no cache, ou é uma
  // viagem inexistente/sem acesso, ou o app ainda não sincronizou nenhuma vez online).
  useEffect(() => {
    if (!loading && !trip) router.replace("/trips");
  }, [loading, trip, router]);

  if (status === "loading" || loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>;
  }

  if (!trip) return null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <Link
            href={`/trips/${id}`}
            className="text-xl font-semibold text-slate-900 dark:text-slate-100 hover:underline"
          >
            {trip.nome}
          </Link>
          {canEdit && (
            <Link
              href={`/trips/${id}/editar`}
              aria-label="Editar viagem"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </Link>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {formatDateBR(trip.data_inicio)} - {formatDateBR(trip.data_fim)} · {trip.qtd_pessoas} pessoa(s)
          </span>
          <span className={`rounded px-1.5 py-0.5 font-medium ${TRIP_STATUS_BADGE[statusViagem(trip)]}`}>
            {TRIP_STATUS_LABEL[statusViagem(trip)]}
          </span>
        </p>
      </div>
      <TripDisclaimerProvider>
        <TripTabs tripId={id} />
        {children}
      </TripDisclaimerProvider>
    </div>
  );
}
