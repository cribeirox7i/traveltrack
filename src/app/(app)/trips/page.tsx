"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface TripItem {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  qtd_pessoas: string;
}

export default function TripsPage() {
  const { data: session } = useSession();
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trips")
      .then((res) => res.json())
      .then(setTrips)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Viagens</h1>
        <Link
          href="/trips/novo"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Nova viagem
        </Link>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando...</p>}

      {!loading && trips.length === 0 && (
        <p className="text-sm text-slate-500">
          {session?.user.role === "admin"
            ? "Nenhuma viagem cadastrada ainda."
            : "Você ainda não tem acesso a nenhuma viagem."}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trips.map((t) => (
          <Link
            key={t.id}
            href={`/trips/${t.id}/orcamento`}
            className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <p className="font-semibold text-slate-900">{t.nome}</p>
            <p className="mt-1 text-xs text-slate-500">
              {t.data_inicio} — {t.data_fim}
            </p>
            <p className="mt-2 text-xs text-slate-500">{t.qtd_pessoas} pessoa(s)</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
