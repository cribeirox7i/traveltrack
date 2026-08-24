"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { TripTabs } from "@/components/TripTabs";
import { TRIP_TAB_SLUGS } from "@/lib/tripTabs";
import { useOfflineTrip } from "@/lib/offline/useOfflineData";
import { isOnline } from "@/lib/offline/sync";

interface TripMeta {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  qtd_pessoas: string;
}

export default function TripLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { status } = useSession();
  const { trip, loading } = useOfflineTrip<TripMeta>(id);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // Garante que o código de TODAS as abas da viagem (não só a que foi clicada) já
  // esteja em cache assim que a viagem é aberta online - é o que faz Despesas/Anexos/
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
        <Link
          href={`/trips/${id}`}
          className="text-xl font-semibold text-slate-900 dark:text-slate-100 hover:underline"
        >
          {trip.nome}
        </Link>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {trip.data_inicio} - {trip.data_fim} · {trip.qtd_pessoas} pessoa(s)
        </p>
      </div>
      <TripTabs tripId={id} />
      {children}
    </div>
  );
}
