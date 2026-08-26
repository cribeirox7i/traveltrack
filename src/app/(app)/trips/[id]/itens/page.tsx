"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  useCollaborators,
  useMeiosPagamento,
  useOfflineCollection,
} from "@/lib/offline/useOfflineData";
import { createItemOffline, deleteItemOffline, updateItemOffline } from "@/lib/offline/sync";
import { CATEGORIAS_ITEM, CategoriaItem } from "@/lib/sheets/types";
import type { SegundoTrecho } from "@/lib/gemini";
import { TimeField } from "@/components/TimeField";
import {
  CATEGORIA_ICONE,
  CATEGORIA_LABEL,
  IconeItem,
  ItemDetalhesPopup,
  LABELS_INICIO_FIM,
  formatDataBR,
  type Item,
} from "@/components/ItemDetalhesPopup";

const FINANCEIRAS = new Set<CategoriaItem>([
  "traslado",
  "passagem",
  "hospedagem",
  "alimentacao",
  "atrativo",
  "repasse",
]);

const TIPOS_TRASLADO = ["Ônibus", "Van", "Carro", "Outros"];
const TIPOS_PASSAGEM = ["Ônibus", "Van", "Carro", "Avião", "Embarcação", "Trem"];
const TIPOS_ATRATIVO = ["Excursão", "Ingresso", "Bar", "Ponto Turístico"];
const STATUS_PAGAMENTO = [
  { value: "a_pagar", label: "A pagar" },
  { value: "pago", label: "Pago" },
];
const TIPOS_DOCUMENTO = [
  "Taxa",
  "Pedágio",
  "RG",
  "CPF",
  "Passaporte",
  "Visto",
  "CNH",
  "PID",
  "Seguro",
  "Cartão de Vacina",
];

const ACCEPT_VOUCHER = ".pdf,.jpg,.jpeg,.png,.bmp,application/pdf,image/jpeg,image/png,image/bmp";

const emptyForm = {
  categoria: "traslado" as CategoriaItem,
  tipo: "",
  localizador: "",
  nome_companhia: "",
  numero: "",
  data: "",
  horario: "",
  origem: "",
  destino: "",
  nome_local: "",
  endereco: "",
  data_inicio: "",
  hora_inicio: "",
  data_fim: "",
  hora_fim: "",
  tipo_documento: "",
  passageiro_id: "",
  url: "",
  descricao: "",
  valor: "",
  status: "" as "" | "pago" | "a_pagar",
  data_pagamento: "",
  pagador_id: "",
  meio_pagamento_id: "",
};

type FormState = typeof emptyForm;

/** A "data do item" (usada pra ordenar a lista) é derivada do `data_inicio`/`hora_inicio` nas
 * categorias que têm essa noção (ver `LABELS_INICIO_FIM`) - evita pedir a mesma data duas vezes.
 * Nas categorias sem início/fim (Repasse/Documento/Outro), o usuário digita direto em
 * `data`/`horario`. */
function derivarDataHorario(form: FormState): { data: string; horario: string } {
  if (LABELS_INICIO_FIM[form.categoria]) {
    return { data: form.data_inicio, horario: form.hora_inicio };
  }
  return { data: form.data, horario: form.horario };
}

function resumoItem(item: Item, nomePorMeio: Record<string, string>): string {
  switch (item.categoria) {
    case "traslado":
    case "passagem":
      return [item.nome_companhia, item.numero, item.origem && item.destino ? `${item.origem} → ${item.destino}` : ""]
        .filter(Boolean)
        .join(" · ");
    case "hospedagem":
    case "alimentacao":
      return [item.nome_local, item.endereco].filter(Boolean).join(" · ");
    case "atrativo":
      return [item.tipo, item.nome_companhia].filter(Boolean).join(" · ");
    case "documento":
      return item.tipo_documento || "-";
    default:
      return nomePorMeio[item.meio_pagamento_id] ?? "";
  }
}

export default function ItensPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { items, loading } = useOfflineCollection<Item>("itens", tripId);
  const collaborators = useCollaborators(tripId);
  const meiosPagamento = useMeiosPagamento().filter((m) => m.ativo === "true");
  const [formOpen, setFormOpen] = useState(false);
  // null = criando um item novo; string = editando o item com este id.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAnexoNome, setEditingAnexoNome] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [analisado, setAnalisado] = useState(false);
  const [segundoTrecho, setSegundoTrecho] = useState<SegundoTrecho | null>(null);
  const [viewingItem, setViewingItem] = useState<Item | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaItem | "">("");
  const [filtroData, setFiltroData] = useState("");
  const [filtroPessoa, setFiltroPessoa] = useState("");
  const [ordenarPor, setOrdenarPor] = useState<"data" | "tipo" | "descricao">("data");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Suporta abrir direto num item pra editar via `?editar=<id>` (usado pelo link "Editar" da
  // tela Roteiro > Agenda, que só lista itens, não tem formulário próprio).
  useEffect(() => {
    const id = searchParams.get("editar");
    if (!id || formOpen) return;
    const item = items.find((i) => i.id === id);
    if (item) openEditForm(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, items]);

  const nomePorPessoa = useMemo(
    () => Object.fromEntries(collaborators.map((c) => [c.id, c.nome])),
    [collaborators]
  );
  const nomePorMeio = useMemo(
    () => Object.fromEntries(meiosPagamento.map((m) => [m.id, m.nome])),
    [meiosPagamento]
  );

  const isFinanceira = FINANCEIRAS.has(form.categoria);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Troca de categoria no formulário. Quando a categoria de origem não tinha início/fim
   * (Repasse/Documento/Outro, só `data`/`horario`) e a de destino tem (`LABELS_INICIO_FIM`),
   * transporta o que já foi digitado em `data`/`horario` pra `data_inicio`/`hora_inicio` - evita
   * o usuário redigitar a mesma data ao só ajustar a categoria. Só preenche campo ainda vazio,
   * nunca sobrescreve início/fim já digitado. */
  function handleCategoriaChange(categoria: CategoriaItem) {
    setForm((prev) => {
      const indoParaInicioFim = !LABELS_INICIO_FIM[prev.categoria] && LABELS_INICIO_FIM[categoria];
      if (!indoParaInicioFim) return { ...prev, categoria };
      return {
        ...prev,
        categoria,
        data_inicio: prev.data_inicio || prev.data,
        hora_inicio: prev.hora_inicio || prev.horario,
      };
    });
  }

  function openNewForm() {
    setError(null);
    setFile(null);
    setAnalisado(false);
    setSegundoTrecho(null);
    setEditingId(null);
    setEditingAnexoNome(null);
    setForm({
      ...emptyForm,
      pagador_id: session?.user.id && collaborators.some((c) => c.id === session.user.id)
        ? session.user.id
        : "",
    });
    setFormOpen(true);
  }

  /** `item` já vem com todo campo que existe em `FormState` (mesmos nomes de coluna) - o único
   * ajuste é ignorar os campos que a tela não edita diretamente (natureza, anexo_*, que
   * `updateItemOffline` preserva sozinho a menos que um arquivo novo seja escolhido aqui). */
  function openEditForm(item: Item) {
    setError(null);
    setFile(null);
    setAnalisado(false);
    setSegundoTrecho(null);
    setEditingId(item.id);
    setEditingAnexoNome(item.anexo_nome || null);
    setForm({
      categoria: item.categoria,
      tipo: item.tipo,
      localizador: item.localizador,
      nome_companhia: item.nome_companhia,
      numero: item.numero,
      data: item.data,
      horario: item.horario,
      origem: item.origem,
      destino: item.destino,
      nome_local: item.nome_local,
      endereco: item.endereco,
      data_inicio: item.data_inicio,
      hora_inicio: item.hora_inicio,
      data_fim: item.data_fim,
      hora_fim: item.hora_fim,
      tipo_documento: item.tipo_documento,
      passageiro_id: item.passageiro_id,
      url: item.url,
      descricao: item.descricao,
      valor: item.valor,
      status: item.status === "pago" || item.status === "a_pagar" ? item.status : "",
      data_pagamento: item.data_pagamento,
      pagador_id: item.pagador_id,
      meio_pagamento_id: item.meio_pagamento_id,
    });
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setEditingAnexoNome(null);
    setFile(null);
    setAnalisado(false);
    setSegundoTrecho(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Chegou aqui via link "Editar" de Roteiro > Agenda (?editar=<id>) - volta pra lá em vez de
    // ficar na tela Itens, senão o usuário perde o lugar de onde veio.
    if (searchParams.get("editar")) router.push(`/trips/${tripId}/agenda`);
  }

  /** Chamado pelo botão "Analisar voucher" - sobe o arquivo pro Gemini via
   * `/api/trips/{id}/itens/analisar` e pré-preenche o formulário com o que ele identificar.
   * Best-effort: se falhar (rede, cota do free tier, documento ilegível), o formulário continua
   * vazio pra preenchimento manual - o upload em si só acontece de fato ao "Cadastrar", então
   * nada se perde aqui além de uma tentativa de leitura. */
  async function handleAnalisar() {
    if (!file) return;
    setError(null);
    setAnalisando(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/trips/${tripId}/itens/analisar`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível analisar o voucher");
        return;
      }
      const { segundo_trecho, ...campos } = data;
      setForm((prev) => ({ ...prev, ...campos }));
      setSegundoTrecho(segundo_trecho ?? null);
      setAnalisado(true);
    } catch {
      setError("Falha de conexão ao tentar analisar o voucher");
    } finally {
      setAnalisando(false);
    }
  }

  /** Troca os campos de trecho (origem/destino/início/fim/número) do formulário pelos do 2º
   * trecho identificado (normalmente a volta) - útil pra cadastrar um segundo Item a partir do
   * mesmo PDF, sem digitar de novo. Categoria/anexo/descrição continuam como estavam. */
  function usarSegundoTrecho() {
    if (!segundoTrecho) return;
    setForm((prev) => ({
      ...prev,
      numero: segundoTrecho.numero || prev.numero,
      origem: segundoTrecho.origem || prev.origem,
      destino: segundoTrecho.destino || prev.destino,
      data_inicio: segundoTrecho.data_inicio || prev.data_inicio,
      hora_inicio: segundoTrecho.hora_inicio || prev.hora_inicio,
      data_fim: segundoTrecho.data_fim || prev.data_fim,
      hora_fim: segundoTrecho.hora_fim || prev.hora_fim,
      descricao: segundoTrecho.descricao || prev.descricao,
    }));
    setSegundoTrecho(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const { data, horario } = derivarDataHorario(form);
    if (!data) {
      setError("Preencha a data do item");
      return;
    }
    if (!form.descricao.trim()) {
      setError("Descrição é obrigatória");
      return;
    }
    if (isFinanceira && form.valor && (!form.pagador_id || !form.meio_pagamento_id)) {
      setError("Informando o valor, é preciso indicar quem pagou e o meio de pagamento");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateItemOffline(tripId, editingId, { ...form, data, horario }, file);
        closeForm();
      } else {
        await createItemOffline(tripId, { ...form, data, horario }, file);
        // Documento com 2 trechos (ida e volta): em vez de fechar, já deixa o formulário pronto
        // pra cadastrar o segundo Item (mesmo anexo, campos trocados pelo trecho da volta) - sem
        // isso o usuário teria que reabrir e reanalisar o mesmo PDF de novo.
        if (segundoTrecho) {
          usarSegundoTrecho();
        } else {
          closeForm();
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: Item) {
    if (!confirm(`Excluir este item (${CATEGORIA_LABEL[item.categoria]})?`)) return;
    await deleteItemOffline(tripId, item.id);
  }

  const ordenados = [...items]
    .filter((i) => !filtroCategoria || i.categoria === filtroCategoria)
    .filter((i) => !filtroData || i.data === filtroData)
    .filter((i) => !filtroPessoa || i.pagador_id === filtroPessoa || i.passageiro_id === filtroPessoa)
    .sort((a, b) => {
      // Data+hora é sempre o desempate final, mesmo ordenando por tipo/descrição - dentro do
      // mesmo grupo, a ordem cronológica continua fazendo sentido.
      const porDataHora = (a.data + a.horario).localeCompare(b.data + b.horario);
      if (ordenarPor === "tipo") {
        return (
          (CATEGORIA_LABEL[a.categoria] ?? a.categoria).localeCompare(CATEGORIA_LABEL[b.categoria] ?? b.categoria) ||
          porDataHora
        );
      }
      if (ordenarPor === "descricao") {
        return (
          (resumoItem(a, nomePorMeio) || a.descricao).localeCompare(resumoItem(b, nomePorMeio) || b.descricao) ||
          porDataHora
        );
      }
      return porDataHora;
    });
  const temFiltroAtivo = Boolean(filtroCategoria || filtroData || filtroPessoa);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Traslados, passagens, hospedagem, alimentação, atrativos, repasses e documentos da
          viagem, num lugar só. Substitui as antigas telas de Lançamentos e Anexos.
        </p>
        {!formOpen && (
          <button
            type="button"
            onClick={openNewForm}
            className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Novo Item
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">Categoria</label>
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value as CategoriaItem | "")}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs"
          >
            <option value="">Todas</option>
            {CATEGORIAS_ITEM.map((c) => (
              <option key={c.value} value={c.value}>
                {CATEGORIA_ICONE[c.value]} {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">Data</label>
          <input
            type="date"
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">Pessoa</label>
          <select
            value={filtroPessoa}
            onChange={(e) => setFiltroPessoa(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs"
          >
            <option value="">Todas</option>
            {collaborators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">Ordenar por</label>
          <select
            value={ordenarPor}
            onChange={(e) => setOrdenarPor(e.target.value as "data" | "tipo" | "descricao")}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-xs"
          >
            <option value="data">Data</option>
            <option value="tipo">Tipo</option>
            <option value="descricao">Descrição</option>
          </select>
        </div>
        {temFiltroAtivo && (
          <button
            type="button"
            onClick={() => {
              setFiltroCategoria("");
              setFiltroData("");
              setFiltroPessoa("");
            }}
            className="mb-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {formOpen && (
        // Modal fixo de propósito: clicar fora NÃO fecha (padrão pra todo modal do app, evita
        // perder o preenchimento com um clique sem querer) - só o "✕" e o "Cancelar" fecham.
        <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-[50rem] flex-col gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {editingId ? "Editar Item" : "Novo Item"}
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

            {/* Primeira opção: anexo (ver spec) - escolher o arquivo habilita "Analisar", que
                tenta pré-preencher o resto do formulário lendo o voucher via Gemini. */}
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-3">
              <div className="flex-1 min-w-[220px]">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Anexo (PDF ou imagem)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT_VOUCHER}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setAnalisado(false);
                  }}
                  className="block w-full text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
                />
                {editingAnexoNome && !file && (
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    Já tem um anexo (📎 {editingAnexoNome}) - escolha outro arquivo só se quiser
                    substituí-lo.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleAnalisar}
                disabled={!file || analisando}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {analisando ? "Analisando..." : "🔎 Analisar voucher"}
              </button>
            </div>
            {analisado && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Preenchi o que consegui identificar no voucher - confira os campos abaixo antes de
                cadastrar.
              </p>
            )}
            {segundoTrecho && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <span>
                  ✈️ O documento parece ter um <strong>2º trecho</strong> (ida e volta):{" "}
                  {[segundoTrecho.origem, segundoTrecho.destino].filter(Boolean).join(" → ") || segundoTrecho.descricao || "sem detalhe"}
                  {segundoTrecho.data_inicio && ` · ${segundoTrecho.data_inicio} ${segundoTrecho.hora_inicio}`}
                </span>
                <button
                  type="button"
                  onClick={usarSegundoTrecho}
                  className="shrink-0 rounded-full bg-amber-200 dark:bg-amber-900 px-2 py-0.5 font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-300"
                >
                  Usar este trecho
                </button>
              </div>
            )}

            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Dados do item
            </h3>
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Categoria
              </label>
              <select
                value={form.categoria}
                onChange={(e) => handleCategoriaChange(e.target.value as CategoriaItem)}
                className="w-full max-w-xs rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
              >
                {CATEGORIAS_ITEM.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Campos específicos por categoria */}
          {(form.categoria === "traslado" || form.categoria === "passagem") && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo label="Tipo" compact>
                <select
                  value={form.tipo}
                  onChange={(e) => setField("tipo", e.target.value)}
                  className={inputClass}
                >
                  <option value="">Selecione...</option>
                  {(form.categoria === "traslado" ? TIPOS_TRASLADO : TIPOS_PASSAGEM).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Companhia" compact>
                <input value={form.nome_companhia} onChange={(e) => setField("nome_companhia", e.target.value)} className={inputClass} />
              </Campo>
              <Campo label="Localizador" compact>
                <input value={form.localizador} onChange={(e) => setField("localizador", e.target.value)} className={inputClass} />
              </Campo>
              <Campo label="Número" compact>
                <input value={form.numero} onChange={(e) => setField("numero", e.target.value)} className={inputClass} />
              </Campo>
              <Campo label="Origem" compact>
                <input value={form.origem} onChange={(e) => setField("origem", e.target.value)} className={inputClass} />
              </Campo>
              <Campo label="Destino" compact>
                <input value={form.destino} onChange={(e) => setField("destino", e.target.value)} className={inputClass} />
              </Campo>
              <CampoInicioFim form={form} setField={setField} />
            </div>
          )}

          {(form.categoria === "hospedagem" || form.categoria === "alimentacao") && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo label={form.categoria === "hospedagem" ? "Hospedagem" : "Estabelecimento"} compact>
                <input value={form.nome_local} onChange={(e) => setField("nome_local", e.target.value)} className={inputClass} />
              </Campo>
              <Campo label="Endereço" compact>
                <input value={form.endereco} onChange={(e) => setField("endereco", e.target.value)} className={inputClass} />
              </Campo>
              <CampoInicioFim form={form} setField={setField} />
            </div>
          )}

          {form.categoria === "atrativo" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo label="Tipo" compact>
                <select value={form.tipo} onChange={(e) => setField("tipo", e.target.value)} className={inputClass}>
                  <option value="">Selecione...</option>
                  {TIPOS_ATRATIVO.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Companhia" compact>
                <input value={form.nome_companhia} onChange={(e) => setField("nome_companhia", e.target.value)} className={inputClass} />
              </Campo>
              <Campo label="Localizador" compact>
                <input value={form.localizador} onChange={(e) => setField("localizador", e.target.value)} className={inputClass} />
              </Campo>
              <Campo label="Número" compact>
                <input value={form.numero} onChange={(e) => setField("numero", e.target.value)} className={inputClass} />
              </Campo>
              <CampoInicioFim form={form} setField={setField} />
            </div>
          )}

          {form.categoria === "documento" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo label="Tipo de documento" compact>
                <select value={form.tipo_documento} onChange={(e) => setField("tipo_documento", e.target.value)} className={inputClass}>
                  <option value="">Selecione...</option>
                  {TIPOS_DOCUMENTO.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Passageiro" compact>
                <select value={form.passageiro_id} onChange={(e) => setField("passageiro_id", e.target.value)} className={inputClass}>
                  <option value="">Selecione...</option>
                  {collaborators.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
          )}

          {(form.categoria === "repasse" || form.categoria === "documento" || form.categoria === "outro") && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo label="Data do item" compact>
                <div className="flex flex-col gap-1">
                  <input type="date" required value={form.data} onChange={(e) => setField("data", e.target.value)} className={inputClass} />
                  <TimeField value={form.horario} onChange={(v) => setField("horario", v)} />
                </div>
              </Campo>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Campo label="URL" grow>
              <input type="url" value={form.url} onChange={(e) => setField("url", e.target.value)} placeholder="https://..." className={inputClass} />
            </Campo>
            <Campo label="Descrição" grow>
              <input required value={form.descricao} onChange={(e) => setField("descricao", e.target.value)} className={inputClass} />
            </Campo>
          </div>

          {isFinanceira && (
            <div className="flex flex-col gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Dados financeiros
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Campo label="Valor" compact>
                <input type="number" min={0} step="0.01" value={form.valor} onChange={(e) => setField("valor", e.target.value)} className={`${inputClass} text-right`} />
              </Campo>
              <Campo label="Status" compact>
                <select value={form.status} onChange={(e) => setField("status", e.target.value as FormState["status"])} className={inputClass}>
                  <option value="">Selecione...</option>
                  {STATUS_PAGAMENTO.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Data pagamento" compact>
                <input type="date" value={form.data_pagamento} onChange={(e) => setField("data_pagamento", e.target.value)} className={inputClass} />
              </Campo>
              <Campo label={form.categoria === "repasse" ? "Quem contribuiu" : "Quem pagou"} compact>
                <select value={form.pagador_id} onChange={(e) => setField("pagador_id", e.target.value)} className={inputClass}>
                  <option value="">Selecione...</option>
                  {collaborators.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Meio de pagamento" compact>
                <select value={form.meio_pagamento_id} onChange={(e) => setField("meio_pagamento_id", e.target.value)} className={inputClass}>
                  <option value="">Selecione...</option>
                  {meiosPagamento.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
          </form>
        </div>
      )}

      {/* Lista sem `<table>` de propósito - uma tabela de verdade não reflui, então em telas
          estreitas ela força rolagem lateral pra caber Data/Tipo/Descrição/Ações lado a lado.
          Aqui cada item é uma linha flex que QUEBRA em 2 sub-linhas (data+tipo em cima, descrição
          embaixo, truncada) em vez de estourar a largura - nunca precisa de scroll horizontal,
          em nenhum tamanho de tela. */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {loading && (
          <p className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">Carregando...</p>
        )}
        {!loading && ordenados.length === 0 && (
          <p className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">Nenhum item ainda.</p>
        )}
        {ordenados.map((item) => (
          <div
            key={item.id}
            onClick={() => setViewingItem(item)}
            className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <IconeItem item={item} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                  {formatDataBR(item.data)} {item.horario}
                </span>
                <span className="text-slate-400 dark:text-slate-500">
                  {CATEGORIA_LABEL[item.categoria] ?? item.categoria}
                </span>
              </div>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {resumoItem(item, nomePorMeio) || item.descricao}
              </p>
            </div>
            <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => openEditForm(item)}
                className="text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:underline"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => handleDelete(item)}
                className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline"
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      <ItemDetalhesPopup
        item={viewingItem}
        tripId={tripId}
        nomePorPessoa={nomePorPessoa}
        nomePorMeio={nomePorMeio}
        onClose={() => setViewingItem(null)}
        onEditar={(item) => {
          setViewingItem(null);
          openEditForm(item);
        }}
      />
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-2 text-sm";

/** Par de campos início/fim (data+hora cada) - mesmas colunas `data_inicio`/`data_fim` em toda
 * categoria que os usa, só o RÓTULO muda (ver `LABELS_INICIO_FIM`). */
function CampoInicioFim({
  form,
  setField,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  const [labelInicio, labelFim] = LABELS_INICIO_FIM[form.categoria] ?? ["Início", "Término"];
  return (
    <>
      <Campo label={labelInicio} compact>
        <div className="flex flex-col gap-1">
          <input type="date" required value={form.data_inicio} onChange={(e) => setField("data_inicio", e.target.value)} className={inputClass} />
          <TimeField value={form.hora_inicio} onChange={(v) => setField("hora_inicio", v)} />
        </div>
      </Campo>
      <Campo label={labelFim} compact>
        <div className="flex flex-col gap-1">
          <input type="date" value={form.data_fim} onChange={(e) => setField("data_fim", e.target.value)} className={inputClass} />
          <TimeField value={form.hora_fim} onChange={(v) => setField("hora_fim", v)} />
        </div>
      </Campo>
    </>
  );
}

function Campo({
  label,
  grow,
  compact,
  children,
}: {
  label: string;
  grow?: boolean;
  /** Pra usar dentro de um grid de colunas fixas (ex.: a linha de Dados financeiros) - sem
   * min-width próprio, senão força a coluna a estourar a largura que o grid já reservou. */
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={compact ? "min-w-0" : grow ? "flex-1 min-w-[200px]" : "min-w-[160px]"}>
      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}
