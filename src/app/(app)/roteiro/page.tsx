"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { statusViagem } from "@/lib/tripStatus";

interface Trip {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  status?: string | null;
}

export default function RoteiroRedirect() {
  const router = useRouter();

  useEffect(() => {
    async function redirecionar() {
      try {
        const res = await fetch("/api/trips");
        if (!res.ok) throw new Error("falhou");
        const trips: Trip[] = await res.json();

        const emAndamento = trips.find((t) => statusViagem(t) === "em_andamento");
        if (emAndamento) {
          router.replace(`/trips/${emAndamento.id}/itinerario`);
          return;
        }

        const planejadas = trips
          .filter((t) => statusViagem(t) === "planejada")
          .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

        if (planejadas.length > 0) {
          router.replace(`/trips/${planejadas[0].id}/itinerario`);
          return;
        }
      } catch {
        // sem viagem ativa: vai pra lista
      }
      router.replace("/trips");
    }

    redirecionar();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-slate-500">Abrindo roteiro...</p>
    </div>
  );
}
