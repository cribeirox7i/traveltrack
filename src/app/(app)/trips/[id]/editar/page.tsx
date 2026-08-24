"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useOfflineTrip } from "@/lib/offline/useOfflineData";
import { pullTripDetail, pullTrips } from "@/lib/offline/sync";
import { CityAutocomplete } from "@/components/CityAutocomplete";
import { diffDays } from "@/lib/dateRange";

interface TripMeta {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  qtd_pessoas: string;
  cidade_origem: string;
  cidade_origem_lat: string;
  cidade_origem_lon: string;
  capa_url: string;
  custo_modo?: "por_pessoa" | "total" | "";
  criado_por: string;
}

/** Mesma estrutura de campos de "Nova viagem" - só troca "Quantidade de dias" (aqui só leitura,
 * derivada dos dias já criados) por um formulário que edita a viagem existente via PATCH em vez
 * de criar uma nova. A duração em si só muda incluindo/excluindo dias na aba Itinerário. */
export default function EditarViagemPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const { trip, loading } = useOfflineTrip<TripMeta>(tripId);
  const canEdit =
    session?.user.role === "admin" || (!!trip && trip.criado_por === session?.user.id);

  const [form, setForm] = useState({
    nome: "",
    data_inicio: "",
    qtd_pessoas: 1,
    cidade_origem: "",
    cidade_origem_lat: "",
    cidade_origem_lon: "",
    capa_url: "",
    custo_modo: "por_pessoa" as "por_pessoa" | "total",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!trip) return;
    setForm({
      nome: trip.nome,
      data_inicio: trip.data_inicio.slice(0, 10),
      qtd_pessoas: Number(trip.qtd_pessoas) || 1,
      cidade_origem: trip.cidade_origem ?? "",
      cidade_origem_lat: trip.cidade_origem_lat ?? "",
      cidade_origem_lon: trip.cidade_origem_lon ?? "",
      capa_url: trip.capa_url ?? "",
      custo_modo: trip.custo_modo === "total" ? "total" : "por_pessoa",
    });
  }, [trip]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/trips/${tripId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, qtd_pessoas: String(form.qtd_pessoas) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erro ao salvar");
      setSaving(false);
      return;
    }
    await pullTripDetail(tripId);
    await pullTrips();
    setSaving(false);
    router.push(`/trips/${tripId}`);
  }

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>;
  if (!trip) return null;
  if (!canEdit) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Só o administrador ou quem criou esta viagem pode editá-la.
      </p>
    );
  }

  const qtdDias = diffDays(trip.data_fim, trip.data_inicio) + 1;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Editar viagem</h1>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Nome</label>
          <input
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Início</label>
            <input
              type="date"
              required
              value={form.data_inicio}
              onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Prazo (dias)
            </label>
            <input
              type="number"
              disabled
              value={qtdDias}
              title="Muda incluindo/excluindo dias na aba Itinerário"
              className="w-full cursor-not-allowed rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-400 dark:text-slate-500"
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-400 dark:text-slate-500">
          A duração só muda incluindo/excluindo dias na aba Itinerário - a data de início desloca a
          viagem inteira no calendário, sem mudar a duração.
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Qtd. de pessoas</label>
          <input
            type="number"
            min={1}
            required
            value={form.qtd_pessoas}
            onChange={(e) => setForm({ ...form, qtd_pessoas: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Cidade de origem <span className="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
          </label>
          <CityAutocomplete
            value={form.cidade_origem}
            hasCoordinates={Boolean(form.cidade_origem_lat && form.cidade_origem_lon)}
            placeholder="De onde o grupo parte"
            onTextChange={(text) =>
              setForm({ ...form, cidade_origem: text, cidade_origem_lat: "", cidade_origem_lon: "" })
            }
            onSelect={(city) =>
              setForm({
                ...form,
                cidade_origem: city.nome,
                cidade_origem_lat: city.lat,
                cidade_origem_lon: city.lon,
              })
            }
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 py-2 pl-3 pr-5 text-sm"
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Usada como ponto de partida do roteiro na aba Mapa.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            URL da capa <span className="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
          </label>
          <input
            type="url"
            placeholder="https://..."
            value={form.capa_url}
            onChange={(e) => setForm({ ...form, capa_url: e.target.value })}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Imagem de capa da viagem, mostrada no card da lista e no Dashboard.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Custos do Orçamento
          </label>
          <select
            value={form.custo_modo}
            onChange={(e) =>
              setForm({ ...form, custo_modo: e.target.value as "por_pessoa" | "total" })
            }
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          >
            <option value="por_pessoa">Por pessoa</option>
            <option value="total">Total da viagem</option>
          </select>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Se for &ldquo;Total da viagem&rdquo;, os valores lançados no Orçamento são o custo
            total do grupo naquele item - a tela divide pelo número de pessoas pra mostrar o
            valor por pessoa.
          </p>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/trips/${tripId}`)}
            disabled={saving}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
