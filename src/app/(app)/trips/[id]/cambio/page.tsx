"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  useCountries,
  useOfflineCollection,
  useOfflineTrip,
  useOnlineStatus,
} from "@/lib/offline/useOfflineData";
import {
  createCambioOffline,
  deleteCambioOffline,
  updateCambioOffline,
} from "@/lib/offline/sync";
import { resumoCambioPorMoeda } from "@/lib/cambioCalc";
import { viagemBloqueada } from "@/lib/tripStatus";
import { InfoDisclaimer } from "@/components/InfoDisclaimer";
import { FILTER_SELECT_CLASS } from "@/lib/uiClasses";

interface CambioEvento {
  id: string;
  trip_id: string;
  data: string;
  moeda: string;
  qtd_moeda: string;
  qtd_reais: string;
  taxa_efetiva: string;
  descricao: string;
  criado_por: string;
  criado_por_role?: string;
  criado_em: string;
}

interface FormState {
  data: string;
  moeda: string;
  qtd_moeda: string;
  qtd_reais: string;
  taxa_efetiva: string;
  descricao: string;
}

const emptyForm: FormState = {
  data: "",
  moeda: "",
  qtd_moeda: "",
  qtd_reais: "",
  taxa_efetiva: "",
  descricao: "",
};

function num(v: string): number {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normalizar(v: string): string {
  return v.trim().replace(",", ".");
}

function formatMoney(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMoeda(value: number, moeda: string): string {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moeda}`;
}

function formatTaxa(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function CambioPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const { items: cambios, loading } = useOfflineCollection<CambioEvento>("cambio", tripId);
  const { items: days } = useOfflineCollection<Record<string, string> & { id: string }>(
    "tripDays",
    tripId
  );
  const { trip } = useOfflineTrip<{ id: string; status?: string; data_fim: string }>(tripId);
  const countries = useCountries();
  const online = useOnlineStatus();

  const bloqueada = !!trip && viagemBloqueada(trip);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<CambioEvento | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [filtroMoeda, setFiltroMoeda] = useState("");
  const [filtroData, setFiltroData] = useState("");

  // Moedas sugeridas: as dos países do roteiro desta viagem primeiro, depois todas as outras
  // conhecidas na aba Countries. `<datalist>` deixa escolher da lista OU digitar um código novo.
  const moedasSugeridas = useMemo(() => {
    const paisesDaViagem = new Set<string>();
    for (const d of days) {
      for (const p of [d.origem_pais, d.destino_pais, d.pernoite_pais]) {
        if (p?.trim()) paisesDaViagem.add(p.trim().toLowerCase());
      }
    }
    const daViagem: string[] = [];
    const resto: string[] = [];
    const vistos = new Set<string>();
    for (const c of countries) {
      const code = (c.currency_code || "").trim().toUpperCase();
      if (!code || vistos.has(code)) continue;
      vistos.add(code);
      const label = c.currency_name ? `${code} - ${c.currency_name}` : code;
      if (paisesDaViagem.has((c.country || "").trim().toLowerCase())) daViagem.push(label);
      else resto.push(label);
    }
    return [...daViagem.sort(), ...resto.sort()];
  }, [countries, days]);

  const nomePorMoeda = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of countries) {
      const code = (c.currency_code || "").trim().toUpperCase();
      if (code && !map[code] && c.currency_name) map[code] = c.currency_name;
    }
    return map;
  }, [countries]);

  const ordenados = useMemo(
    () =>
      [...cambios].sort(
        (a, b) => (a.data + a.criado_em).localeCompare(b.data + b.criado_em)
      ),
    [cambios]
  );

  const resumos = useMemo(() => resumoCambioPorMoeda(cambios), [cambios]);

  const filtrados = ordenados
    .filter((c) => !filtroMoeda || c.moeda === filtroMoeda)
    .filter((c) => !filtroData || c.data === filtroData);
  const temFiltro = Boolean(filtroMoeda || filtroData);

  // Saldo acumulado de R$ por moeda, na ordem cronológica - igual à coluna SALDO da planilha.
  const saldoPorEvento = useMemo(() => {
    const acc: Record<string, number> = {};
    const out: Record<string, number> = {};
    for (const c of ordenados) {
      acc[c.moeda] = (acc[c.moeda] ?? 0) + num(c.qtd_reais);
      out[c.id] = acc[c.moeda];
    }
    return out;
  }, [ordenados]);

  function podeGerenciar(evento: CambioEvento): boolean {
    const role = session?.user.role;
    if (role === "admin") return true;
    if (evento.criado_por && evento.criado_por === session?.user.id) return true;
    if (role === "gestor") return evento.criado_por_role === "user";
    return false;
  }

  function openNew() {
    setEditingId(null);
    setForm({ ...emptyForm, data: new Date().toISOString().slice(0, 10) });
    setError(null);
    setFormOpen(true);
  }

  function openEdit(evento: CambioEvento) {
    setEditingId(evento.id);
    setForm({
      data: evento.data,
      moeda: evento.moeda,
      qtd_moeda: evento.qtd_moeda,
      qtd_reais: evento.qtd_reais,
      taxa_efetiva: evento.taxa_efetiva,
      descricao: evento.descricao,
    });
    setError(null);
    setFormOpen(true);
    setViewing(null);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;

    const moeda = form.moeda.trim().toUpperCase().slice(0, 3);
    if (!/^[A-Z]{3}$/.test(moeda)) {
      setError("Moeda precisa ser um código de 3 letras (ex.: USD)");
      return;
    }
    if (!form.data) {
      setError("Escolha a data da operação");
      return;
    }
    for (const [campo, rotulo] of [
      ["qtd_moeda", "quantidade de moeda"],
      ["qtd_reais", "quantidade de reais"],
      ["taxa_efetiva", "taxa efetiva"],
    ] as const) {
      if (num(form[campo]) <= 0) {
        setError(`Informe a ${rotulo} (número maior que zero)`);
        return;
      }
    }

    const fields = {
      data: form.data,
      moeda,
      qtd_moeda: normalizar(form.qtd_moeda),
      qtd_reais: normalizar(form.qtd_reais),
      taxa_efetiva: normalizar(form.taxa_efetiva),
      descricao: form.descricao.trim(),
    };

    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateCambioOffline(tripId, editingId, fields);
      } else {
        await createCambioOffline(tripId, fields, {
          id: session?.user.id ?? "",
          role: session?.user.role ?? "",
        });
      }
      closeForm();
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(evento: CambioEvento) {
    if (removingId) return;
    if (!confirm("Excluir este evento de câmbio?")) return;
    setRemovingId(evento.id);
    try {
      await deleteCambioOffline(tripId, evento.id);
      setViewing(null);
    } finally {
      setRemovingId(null);
    }
  }

  // Dica ao vivo no formulário: R$ por unidade a partir do que foi digitado (o app não força
  // que a taxa efetiva bata com isso, mas ajuda a conferir).
  const dicaUnitario =
    num(form.qtd_moeda) > 0 && num(form.qtd_reais) > 0
      ? num(form.qtd_reais) / num(form.qtd_moeda)
      : null;

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <InfoDisclaimer>
          Registro das trocas de moeda desta viagem: quanto de moeda estrangeira você comprou,
          quantos reais pagou e a taxa efetiva (com IOF e tarifas). O resumo por moeda mostra o
          custo médio e o total investido.
        </InfoDisclaimer>
        {!formOpen && !bloqueada && (
          <button
            type="button"
            onClick={openNew}
            className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Novo câmbio
          </button>
        )}
      </div>

      {bloqueada && (
        <p className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Viagem concluída ou cancelada - câmbio em somente leitura. Reabra mudando o status na
          tela Editar viagem.
        </p>
      )}

      {resumos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {resumos.map((r) => (
            <div
              key={r.moeda}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
            >
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {r.moeda}
                  {nomePorMoeda[r.moeda] && (
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      {nomePorMoeda[r.moeda]}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400">
                  {r.eventos} {r.eventos === 1 ? "operação" : "operações"}
                </p>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500 dark:text-slate-400">Comprado</dt>
                <dd className="text-right text-slate-800 dark:text-slate-200">
                  {formatMoeda(r.totalMoeda, r.moeda)}
                </dd>
                <dt className="text-slate-500 dark:text-slate-400">Investido</dt>
                <dd className="text-right text-slate-800 dark:text-slate-200">
                  {formatMoney(r.totalReais)}
                </dd>
                <dt className="text-slate-500 dark:text-slate-400">Custo médio</dt>
                <dd className="text-right text-slate-800 dark:text-slate-200">
                  {formatMoney(r.custoMedio)} / {r.moeda}
                </dd>
                <dt className="text-slate-500 dark:text-slate-400">Taxa efetiva média</dt>
                <dd className="text-right text-slate-800 dark:text-slate-200">
                  {formatTaxa(r.taxaEfetivaMedia)}
                </dd>
              </dl>
            </div>
          ))}
        </div>
      )}

      {cambios.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Moeda
            </label>
            <select
              value={filtroMoeda}
              onChange={(e) => setFiltroMoeda(e.target.value)}
              className={FILTER_SELECT_CLASS}
            >
              <option value="">Todas</option>
              {resumos.map((r) => (
                <option key={r.moeda} value={r.moeda}>
                  {r.moeda}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Data
            </label>
            <input
              type="date"
              value={filtroData}
              onChange={(e) => setFiltroData(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs"
            />
          </div>
          {temFiltro && (
            <button
              type="button"
              onClick={() => {
                setFiltroMoeda("");
                setFiltroData("");
              }}
              className="mb-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Lista em <div> flex, não <table> - tabela não reflui e estoura largura no mobile. */}
      {filtrados.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 px-3 py-6 text-center text-sm text-slate-400">
          {cambios.length === 0
            ? "Nenhum câmbio registrado ainda."
            : "Nenhum câmbio com esses filtros."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtrados.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <button
                type="button"
                onClick={() => setViewing(c)}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left"
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {formatMoeda(num(c.qtd_moeda), c.moeda)}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {formatMoney(num(c.qtd_reais))}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span>
                    {formatDateBR(c.data)} · taxa {formatTaxa(num(c.taxa_efetiva))}
                  </span>
                  <span>saldo {formatMoney(saldoPorEvento[c.id] ?? 0)}</span>
                </div>
                {c.descricao && (
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {c.descricao}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewing && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setViewing(null)}
        >
          <div
            className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Câmbio {viewing.moeda}
              </h2>
              <button
                type="button"
                onClick={() => setViewing(null)}
                aria-label="Fechar"
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-slate-500 dark:text-slate-400">Data</dt>
              <dd className="text-right">{formatDateBR(viewing.data)}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Moeda comprada</dt>
              <dd className="text-right">{formatMoeda(num(viewing.qtd_moeda), viewing.moeda)}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Reais pagos</dt>
              <dd className="text-right">{formatMoney(num(viewing.qtd_reais))}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Taxa efetiva</dt>
              <dd className="text-right">
                {formatTaxa(num(viewing.taxa_efetiva))} / {viewing.moeda}
              </dd>
              <dt className="text-slate-500 dark:text-slate-400">R$ / moeda (pagos)</dt>
              <dd className="text-right">
                {num(viewing.qtd_moeda) > 0
                  ? formatTaxa(num(viewing.qtd_reais) / num(viewing.qtd_moeda))
                  : "-"}
              </dd>
            </dl>
            {viewing.descricao && (
              <p className="rounded-lg bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
                {viewing.descricao}
              </p>
            )}
            {!bloqueada && podeGerenciar(viewing) && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(viewing)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(viewing)}
                  disabled={removingId === viewing.id}
                  className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
                >
                  {removingId === viewing.id ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {formOpen && (
        // Modal fixo: clicar fora NÃO fecha (padrão do app) - só ✕ e Cancelar.
        <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {editingId ? "Editar câmbio" : "Novo câmbio"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Fechar"
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-1 flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                Moeda
                <input
                  list="moedas-cambio"
                  value={form.moeda}
                  onChange={(e) => setForm((f) => ({ ...f, moeda: e.target.value.toUpperCase() }))}
                  placeholder="USD"
                  maxLength={3}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm font-normal uppercase"
                />
              </label>
              <datalist id="moedas-cambio">
                {moedasSugeridas.map((m) => (
                  <option key={m} value={m.slice(0, 3)}>
                    {m}
                  </option>
                ))}
              </datalist>
              <label className="col-span-1 flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                Data
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm font-normal"
                />
              </label>
              <label className="col-span-1 flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                Qtd de moeda
                <input
                  inputMode="decimal"
                  value={form.qtd_moeda}
                  onChange={(e) => setForm((f) => ({ ...f, qtd_moeda: e.target.value }))}
                  placeholder="300"
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm font-normal"
                />
              </label>
              <label className="col-span-1 flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                Qtd de reais
                <input
                  inputMode="decimal"
                  value={form.qtd_reais}
                  onChange={(e) => setForm((f) => ({ ...f, qtd_reais: e.target.value }))}
                  placeholder="1617,95"
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm font-normal"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                Taxa efetiva (R$ por unidade, com IOF e tarifas)
                <input
                  inputMode="decimal"
                  value={form.taxa_efetiva}
                  onChange={(e) => setForm((f) => ({ ...f, taxa_efetiva: e.target.value }))}
                  placeholder="5,3930"
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm font-normal"
                />
                {dicaUnitario !== null && (
                  <span className="font-normal text-slate-400">
                    Pelos valores acima: {formatTaxa(dicaUnitario)} R$/{form.moeda || "moeda"}
                  </span>
                )}
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                Descrição (opcional)
                <input
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  placeholder="Casa de câmbio, saque no ATM..."
                  maxLength={200}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm font-normal"
                />
              </label>
            </div>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            {!online && (
              <p className="text-xs text-slate-400">
                Sem conexão - o câmbio fica salvo neste aparelho e sobe quando a internet voltar.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
