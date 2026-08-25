"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTripOffline } from "@/lib/offline/sync";
import { CityAutocomplete } from "@/components/CityAutocomplete";
import { hrefSeguro } from "@/lib/urlSegura";

export default function NovaViagemPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    nome: "",
    data_inicio: "",
    qtd_dias: 1,
    qtd_pessoas: 1,
    cidade_origem: "",
    cidade_origem_lat: "",
    cidade_origem_lon: "",
    capa_url: "",
    custo_modo: "por_pessoa" as "por_pessoa" | "total",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Mesma regra do schema do servidor - criada offline, a viagem vai pro IndexedDB antes de
    // chegar ao servidor, e uma capa que ele vai recusar prenderia a mutação na fila.
    if (form.capa_url && !hrefSeguro(form.capa_url)) {
      setError("A URL da capa precisa começar com http:// ou https://");
      return;
    }
    setSaving(true);
    const tripId = await createTripOffline(form);
    setSaving(false);
    router.push(`/trips/${tripId}`);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Nova viagem</h1>

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
              Quantidade de dias
            </label>
            <input
              type="number"
              min={1}
              required
              value={form.qtd_dias}
              onChange={(e) => setForm({ ...form, qtd_dias: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <p className="-mt-2 text-xs text-slate-400 dark:text-slate-500">
          Depois de criada, a duração só muda incluindo/excluindo dias na aba Itinerário - a data
          de início continua editável (desloca a viagem inteira no calendário).
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
