"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTripOffline } from "@/lib/offline/sync";
import { CityAutocomplete } from "@/components/CityAutocomplete";

export default function NovaViagemPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    nome: "",
    data_inicio: "",
    data_fim: "",
    qtd_pessoas: 1,
    cidade_origem: "",
    cidade_origem_lat: "",
    cidade_origem_lon: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.data_fim < form.data_inicio) {
      setError("Data de término deve ser após a data de início");
      return;
    }

    setSaving(true);
    const tripId = await createTripOffline(form);
    setSaving(false);
    router.push(`/trips/${tripId}/orcamento`);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">Nova viagem</h1>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nome</label>
          <input
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Início</label>
            <input
              type="date"
              required
              value={form.data_inicio}
              onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Término</label>
            <input
              type="date"
              required
              value={form.data_fim}
              onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Qtd. de pessoas</label>
          <input
            type="number"
            min={1}
            required
            value={form.qtd_pessoas}
            onChange={(e) => setForm({ ...form, qtd_pessoas: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Cidade de origem <span className="font-normal text-slate-400">(opcional)</span>
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-400">Usada como ponto de partida do roteiro na aba Mapa.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Criando..." : "Criar viagem"}
        </button>
      </form>
    </div>
  );
}
