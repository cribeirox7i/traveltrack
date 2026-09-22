"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  useClassificacoes,
  useCollaborators,
  useCountries,
  useMeiosPagamento,
  useOfflineCollection,
  useOfflineTrip,
  useOnlineStatus,
  useSubclassificacoes,
} from "@/lib/offline/useOfflineData";
import {
  addItemAnexoOnline,
  createItemOffline,
  deleteItemOffline,
  removeItemAnexoOnline,
  updateItemOffline,
  type ItemAnexoInfo,
} from "@/lib/offline/sync";
import { converterValorParaBRL, custoMedioPorMoeda } from "@/lib/cambioCalc";
import { viagemBloqueada } from "@/lib/tripStatus";
import type { SegundoTrecho } from "@/lib/gemini";
import { TimeField } from "@/components/TimeField";
import { MoneyInput } from "@/components/MoneyInput";
import { AnexoViewer } from "@/components/AnexoViewer";
import { InfoDisclaimer } from "@/components/InfoDisclaimer";
import { FILTER_SELECT_CLASS } from "@/lib/uiClasses";
import {
  IconeItem,
  ItemDetalhesPopup,
  formatDataBR,
  type Item,
} from "@/components/ItemDetalhesPopup";

const STATUS_PAGAMENTO = [
  { value: "a_pagar", label: "A pagar" },
  { value: "pago", label: "Pago" },
];

const ACCEPT_VOUCHER = ".pdf,.jpg,.jpeg,.png,.bmp,application/pdf,image/jpeg,image/png,image/bmp";

// Mapeia a `categoria` antiga (8 valores fixos) que a análise de voucher ainda devolve pra um
// nome de Classificação - documento/outro caem em "Atrativo" (mesma decisão da migração dos itens
// antigos, ver scripts/migrate-itens-classificacao.js). É só uma AJUDA pra pré-selecionar o
// dropdown - o usuário confere/troca antes de salvar.
const NOME_CLASSIFICACAO_POR_CATEGORIA_ANTIGA: Record<string, string> = {
  traslado: "Traslado",
  passagem: "Passagem",
  hospedagem: "Hospedagem",
  alimentacao: "Alimentação",
  atrativo: "Atrativo",
  repasse: "Atrativo".replace("Atrativo", "Repasse"),
  documento: "Atrativo",
  outro: "Atrativo",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = {
  data: "",
  classificacao_id: "",
  subclassificacao_id: "",
  descricao: "",
  financeiroAtivo: false,
  roteiroAtivo: false,
  moeda: "",
  valor: "",
  natureza: "debito" as "debito" | "credito",
  pago: true,
  data_pagamento: "",
  pagador_id: "",
  meio_pagamento_id: "",
  localizador: "",
  nome_companhia: "",
  numero: "",
  origem: "",
  destino: "",
  nome_local: "",
  endereco: "",
  data_inicio: "",
  hora_inicio: "",
  data_fim: "",
  hora_fim: "",
  url: "",
};

type FormState = typeof emptyForm;

function formatBRL(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Resumo de uma linha na lista - a reforma tirou o "formato por categoria" (era condicional a
 * `categoria`, que agora é dado livre); mostra o que tiver preenchido do Roteiro, senão o meio de
 * pagamento, senão a descrição. */
function resumoItem(item: Item, nomePorMeio: Record<string, string>): string {
  const roteiro = [
    item.nome_companhia,
    item.numero,
    item.origem && item.destino ? `${item.origem} → ${item.destino}` : "",
    item.nome_local,
    item.endereco,
  ]
    .filter(Boolean)
    .join(" · ");
  if (roteiro) return roteiro;
  if (item.meio_pagamento_id) return nomePorMeio[item.meio_pagamento_id] ?? "";
  return "";
}

export default function ItensPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { items, loading } = useOfflineCollection<Item>("itens", tripId);
  const { trip } = useOfflineTrip<{ id: string; status?: string; data_fim: string }>(tripId);
  // Viagem concluída/cancelada: tela vira somente-leitura (o backend também recusa - ver
  // `tripLockError`). Enquanto o trip ainda não carregou do IndexedDB, não bloqueia.
  const bloqueada = !!trip && viagemBloqueada(trip);
  // Anexos extras de TODOS os itens da viagem, filtrados por item no uso (ver `extrasDoItem`
  // abaixo) - mesmo padrão de `todosMeiosPagamento`, uma chamada só em vez de uma por item.
  const { items: todosExtras } = useOfflineCollection<ItemAnexoInfo>("itemAnexos", tripId);
  const collaborators = useCollaborators(tripId);
  const todosMeiosPagamento = useMeiosPagamento();
  const online = useOnlineStatus();
  const classificacoes = useClassificacoes();
  const subclassificacoes = useSubclassificacoes();
  // Câmbio da viagem + países do roteiro alimentam o select de Moeda e a conversão pra R$ ao
  // lado do valor (custo médio do câmbio, ou cotação do dia como queda).
  const { items: cambios } = useOfflineCollection<{
    id: string;
    moeda: string;
    qtd_moeda: string;
    qtd_reais: string;
    taxa_efetiva: string;
  }>("cambio", tripId);
  const { items: diasViagem } = useOfflineCollection<Record<string, string> & { id: string }>(
    "tripDays",
    tripId
  );
  const countries = useCountries();

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
  const [addingExtra, setAddingExtra] = useState(false);
  const [removingExtraId, setRemovingExtraId] = useState<string | null>(null);
  const [extraError, setExtraError] = useState<string | null>(null);
  const extraFileInputRef = useRef<HTMLInputElement>(null);
  const [avisosAnalise, setAvisosAnalise] = useState<string[]>([]);
  const [viewingItem, setViewingItem] = useState<Item | null>(null);
  const [anexoAberto, setAnexoAberto] = useState<{ fileId: string; nome: string } | null>(null);
  const [filtroClassificacao, setFiltroClassificacao] = useState("");
  const [filtroData, setFiltroData] = useState("");
  const [filtroPessoa, setFiltroPessoa] = useState("");
  const [ordenarPor, setOrdenarPor] = useState<"data" | "classificacao" | "descricao">("data");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Suporta abrir direto num item pra editar via `?editar=<id>` (usado pelo link "Editar" da
  // tela Roteiro > Agenda, que só lista itens, não tem formulário próprio).
  useEffect(() => {
    const id = searchParams.get("editar");
    if (!id || formOpen || bloqueada) return;
    const item = items.find((i) => i.id === id);
    if (item) openEditForm(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, items, bloqueada]);

  const nomePorPessoa = useMemo(
    () => Object.fromEntries(collaborators.map((c) => [c.id, c.nome])),
    [collaborators]
  );
  const nomePorMeio = useMemo(
    () => Object.fromEntries(todosMeiosPagamento.map((m) => [m.id, m.nome])),
    [todosMeiosPagamento]
  );
  const classificacoesAtivas = useMemo(
    () => classificacoes.filter((c) => c.ativo === "true").sort((a, b) => a.nome.localeCompare(b.nome)),
    [classificacoes]
  );
  const nomePorClassificacao = useMemo(
    () => Object.fromEntries(classificacoes.map((c) => [c.id, c.nome])),
    [classificacoes]
  );
  const nomePorSubclassificacao = useMemo(
    () => Object.fromEntries(subclassificacoes.map((s) => [s.id, s.nome])),
    [subclassificacoes]
  );
  const subclassificacoesDaClassificacao = useMemo(
    () =>
      subclassificacoes
        .filter((s) => s.classificacao_id === form.classificacao_id && s.ativo === "true")
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [subclassificacoes, form.classificacao_id]
  );
  // Contagem de extras por item, pro badge "📎 +N" na lista - não inclui o principal (esse já
  // aparece pelo 📎 simples, condicionado a `item.anexo_file_id`).
  const extrasPorItem = useMemo(() => {
    const contagem: Record<string, number> = {};
    for (const a of todosExtras) contagem[a.item_id] = (contagem[a.item_id] ?? 0) + 1;
    return contagem;
  }, [todosExtras]);
  // O `<select>` do formulário oferece os meios do PAGANTE selecionado (`form.pagador_id`), não
  // sempre os do usuário logado - item pago por outra pessoa mostra os meios dela. `nomePorMeio`
  // acima usa a lista inteira, senão um item pago por outra pessoa apareceria com o uuid no lugar
  // do nome.
  const meiosPagamento = useMemo(
    () =>
      todosMeiosPagamento.filter((m) => m.ativo === "true" && m.user_id === form.pagador_id),
    [todosMeiosPagamento, form.pagador_id]
  );

  const medioPorMoeda = useMemo(() => custoMedioPorMoeda(cambios), [cambios]);
  const cotacoesFallback = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of countries) {
      const code = (c.currency_code || "").trim().toUpperCase();
      const rate = Number(String(c.rate_brl).replace(",", "."));
      if (code && Number.isFinite(rate) && rate > 0 && !out[code]) out[code] = rate;
    }
    return out;
  }, [countries]);

  const moedasItem = useMemo(() => {
    const nomePorCode: Record<string, string> = {};
    for (const c of countries) {
      const code = (c.currency_code || "").trim().toUpperCase();
      if (code && !nomePorCode[code] && c.currency_name) nomePorCode[code] = c.currency_name;
    }
    const paisesDaViagem = new Set<string>();
    for (const d of diasViagem) {
      for (const p of [d.origem_pais, d.destino_pais, d.pernoite_pais]) {
        if (p?.trim()) paisesDaViagem.add(p.trim().toLowerCase());
      }
    }
    const codes = new Set<string>(Object.keys(medioPorMoeda));
    for (const c of countries) {
      const code = (c.currency_code || "").trim().toUpperCase();
      if (code && paisesDaViagem.has((c.country || "").trim().toLowerCase())) codes.add(code);
    }
    if (form.moeda) codes.add(form.moeda);
    codes.delete("BRL");
    return [...codes]
      .sort()
      .map((code) => ({ code, label: nomePorCode[code] ? `${code} - ${nomePorCode[code]}` : code }));
  }, [countries, diasViagem, medioPorMoeda, form.moeda]);

  const conversaoValor = useMemo(() => {
    if (!form.valor || !form.moeda || form.moeda === "BRL") return null;
    return converterValorParaBRL(form.valor, form.moeda, medioPorMoeda, cotacoesFallback);
  }, [form.valor, form.moeda, medioPorMoeda, cotacoesFallback]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAddExtra(fileExtra: File) {
    if (!editingId) return;
    setExtraError(null);
    setAddingExtra(true);
    const res = await addItemAnexoOnline(tripId, editingId, fileExtra);
    setAddingExtra(false);
    if (extraFileInputRef.current) extraFileInputRef.current.value = "";
    if (!res.ok) setExtraError(res.error);
  }

  async function handleRemoveExtra(anexo: ItemAnexoInfo) {
    if (!editingId) return;
    if (!confirm(`Remover o anexo extra "${anexo.nome}"?`)) return;
    setExtraError(null);
    setRemovingExtraId(anexo.id);
    const res = await removeItemAnexoOnline(tripId, editingId, anexo.id);
    setRemovingExtraId(null);
    if (!res.ok) setExtraError(res.error);
  }

  /** Trocar o pagante muda de quem são os meios de pagamento disponíveis - um meio já escolhido
   * que não é dessa pessoa fica pra trás, senão o formulário deixaria salvar uma combinação
   * inconsistente (meio de A com pagador B). */
  function setPagador(pagadorId: string) {
    setForm((prev) => ({ ...prev, pagador_id: pagadorId, meio_pagamento_id: "" }));
  }

  function openNewForm() {
    setError(null);
    setFile(null);
    setAnalisado(false);
    setSegundoTrecho(null);
    setAvisosAnalise([]);
    setExtraError(null);
    setEditingId(null);
    setEditingAnexoNome(null);
    setForm({
      ...emptyForm,
      data: todayISO(),
      pagador_id: session?.user.id && collaborators.some((c) => c.id === session.user.id)
        ? session.user.id
        : "",
    });
    setFormOpen(true);
  }

  function openEditForm(item: Item) {
    setError(null);
    setFile(null);
    setAnalisado(false);
    setSegundoTrecho(null);
    setAvisosAnalise([]);
    setExtraError(null);
    setEditingId(item.id);
    setEditingAnexoNome(item.anexo_nome || null);
    setForm({
      data: item.data,
      classificacao_id: item.classificacao_id,
      subclassificacao_id: item.subclassificacao_id,
      descricao: item.descricao,
      financeiroAtivo: item.financeiro_ativo === "true",
      roteiroAtivo: item.roteiro_ativo === "true",
      moeda: item.moeda === "BRL" ? "" : item.moeda,
      valor: item.valor,
      natureza: item.natureza === "credito" ? "credito" : "debito",
      pago: item.status !== "a_pagar",
      data_pagamento: item.data_pagamento,
      pagador_id: item.pagador_id,
      meio_pagamento_id: item.meio_pagamento_id,
      localizador: item.localizador,
      nome_companhia: item.nome_companhia,
      numero: item.numero,
      origem: item.origem,
      destino: item.destino,
      nome_local: item.nome_local,
      endereco: item.endereco,
      data_inicio: item.data_inicio,
      hora_inicio: item.hora_inicio,
      data_fim: item.data_fim,
      hora_fim: item.hora_fim,
      url: item.url,
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
    setAvisosAnalise([]);
    setExtraError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (extraFileInputRef.current) extraFileInputRef.current.value = "";
    // Chegou aqui via link "Editar" de Roteiro > Agenda (?editar=<id>) - volta pra lá em vez de
    // ficar na tela Itens, senão o usuário perde o lugar de onde veio.
    if (searchParams.get("editar")) router.push(`/trips/${tripId}/agenda`);
  }

  /** Chamado pelo botão "Analisar anexo" - sobe o arquivo pro Gemini e pré-preenche o formulário.
   * A `categoria`/`tipo` que a análise devolve (enum antigo) só ajudam a PRÉ-SELECIONAR a
   * Classificação/Subclassificação por nome (ver `NOME_CLASSIFICACAO_POR_CATEGORIA_ANTIGA`) - o
   * usuário confere antes de salvar. Liga automaticamente o acordeão que tiver dado preenchido
   * (valor -> Financeiro; início -> Roteiro), mas não salva sozinho: o checkbox continua sendo o
   * que decide o que é gravado. */
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
      const { segundo_trecho, avisos, categoria, tipo, ...campos } = data;

      const nomeAlvo = NOME_CLASSIFICACAO_POR_CATEGORIA_ANTIGA[categoria] ?? "";
      const classificacaoEncontrada = classificacoes.find(
        (c) => c.nome.toLowerCase() === nomeAlvo.toLowerCase()
      );
      const subclassificacaoEncontrada = classificacaoEncontrada
        ? subclassificacoes.find(
            (s) =>
              s.classificacao_id === classificacaoEncontrada.id &&
              s.nome.toLowerCase() === String(tipo ?? "").toLowerCase()
          )
        : undefined;

      setForm((prev) => ({
        ...prev,
        ...campos,
        classificacao_id: classificacaoEncontrada?.id ?? prev.classificacao_id,
        subclassificacao_id: subclassificacaoEncontrada?.id ?? prev.subclassificacao_id,
        financeiroAtivo: prev.financeiroAtivo || Boolean(campos.valor),
        roteiroAtivo: prev.roteiroAtivo || Boolean(campos.data_inicio),
      }));
      setSegundoTrecho(segundo_trecho ?? null);
      setAvisosAnalise(Array.isArray(avisos) ? avisos : []);
      setAnalisado(true);
    } catch {
      setError("Falha de conexão ao tentar analisar o voucher");
    } finally {
      setAnalisando(false);
    }
  }

  /** Troca os campos de trecho (origem/destino/início/fim/número) do formulário pelos do 2º
   * trecho identificado (normalmente a volta) - útil pra cadastrar um segundo Item a partir do
   * mesmo PDF, sem digitar de novo. */
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

    if (!form.data) {
      setError("Preencha a data do item");
      return;
    }
    if (!form.classificacao_id) {
      setError("Escolha a classificação");
      return;
    }
    if (!form.descricao.trim()) {
      setError("Descrição é obrigatória");
      return;
    }
    if (!form.financeiroAtivo && !form.roteiroAtivo) {
      setError("Marque Financeiro, Roteiro, ou os dois");
      return;
    }
    if (form.financeiroAtivo && form.valor && (!form.pagador_id || !form.meio_pagamento_id)) {
      setError("Informando o valor, é preciso indicar quem pagou e o meio de pagamento");
      return;
    }

    const fields: Record<string, string> = {
      data: form.data,
      // `horario` só serve pra ordenar a lista/Agenda - herda do início do Roteiro quando ativo.
      horario: form.roteiroAtivo ? form.hora_inicio : "",
      classificacao_id: form.classificacao_id,
      subclassificacao_id: form.subclassificacao_id,
      descricao: form.descricao,
      financeiro_ativo: form.financeiroAtivo ? "true" : "false",
      roteiro_ativo: form.roteiroAtivo ? "true" : "false",
      moeda: form.moeda,
      valor: form.valor,
      natureza: form.natureza,
      status: form.pago ? "pago" : "a_pagar",
      data_pagamento: form.data_pagamento,
      pagador_id: form.pagador_id,
      meio_pagamento_id: form.meio_pagamento_id,
      localizador: form.localizador,
      nome_companhia: form.nome_companhia,
      numero: form.numero,
      origem: form.origem,
      destino: form.destino,
      nome_local: form.nome_local,
      endereco: form.endereco,
      data_inicio: form.data_inicio,
      hora_inicio: form.hora_inicio,
      data_fim: form.data_fim,
      hora_fim: form.hora_fim,
      url: form.url,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateItemOffline(tripId, editingId, fields, file);
        closeForm();
      } else {
        await createItemOffline(tripId, fields, file);
        // Documento com 2 trechos (ida e volta): em vez de fechar, já deixa o formulário pronto
        // pra cadastrar o segundo Item (mesmo anexo, campos trocados pelo trecho da volta).
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
    if (!confirm("Excluir este item?")) return;
    await deleteItemOffline(tripId, item.id);
  }

  /** Duplica um item: mesmos campos, SEM o anexo (principal nem extras) - o usuário anexa de
   * novo se fizer sentido pra cópia. Já abre a edição da cópia na sequência, pra ajustar data/
   * descrição/valor sem precisar caçar o item novo na lista. */
  async function handleDuplicate(item: Item) {
    const fields: Record<string, string> = {
      data: item.data,
      horario: item.horario,
      classificacao_id: item.classificacao_id,
      subclassificacao_id: item.subclassificacao_id,
      descricao: item.descricao,
      financeiro_ativo: item.financeiro_ativo,
      roteiro_ativo: item.roteiro_ativo,
      moeda: item.moeda,
      valor: item.valor,
      natureza: item.natureza,
      status: item.status,
      data_pagamento: item.data_pagamento,
      pagador_id: item.pagador_id,
      meio_pagamento_id: item.meio_pagamento_id,
      localizador: item.localizador,
      nome_companhia: item.nome_companhia,
      numero: item.numero,
      origem: item.origem,
      destino: item.destino,
      nome_local: item.nome_local,
      endereco: item.endereco,
      data_inicio: item.data_inicio,
      hora_inicio: item.hora_inicio,
      data_fim: item.data_fim,
      hora_fim: item.hora_fim,
      url: item.url,
    };
    const novoId = await createItemOffline(tripId, fields);
    openEditForm({ ...item, id: novoId, anexo_file_id: "", anexo_nome: "", anexo_url: "" });
  }

  const ordenados = [...items]
    .filter((i) => !filtroClassificacao || i.classificacao_id === filtroClassificacao)
    .filter((i) => !filtroData || i.data === filtroData)
    .filter((i) => !filtroPessoa || i.pagador_id === filtroPessoa)
    .sort((a, b) => {
      const porDataHora = (a.data + a.horario).localeCompare(b.data + b.horario);
      if (ordenarPor === "classificacao") {
        return (
          (nomePorClassificacao[a.classificacao_id] ?? "").localeCompare(
            nomePorClassificacao[b.classificacao_id] ?? ""
          ) || porDataHora
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
  const temFiltroAtivo = Boolean(filtroClassificacao || filtroData || filtroPessoa);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <InfoDisclaimer>
          Roteiro e financeiro da viagem, num lugar só. Um item pode ser só financeiro, só
          roteiro, ou os dois - marque os acordeões que fizerem sentido.
        </InfoDisclaimer>
        {!formOpen && !bloqueada && (
          <button
            type="button"
            onClick={openNewForm}
            className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Novo Item
          </button>
        )}
      </div>

      {bloqueada && (
        <p className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Viagem concluída ou cancelada - itens em somente leitura. Reabra mudando o status na tela
          Editar viagem.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">Classificação</label>
          <select
            value={filtroClassificacao}
            onChange={(e) => setFiltroClassificacao(e.target.value)}
            className={FILTER_SELECT_CLASS}
          >
            <option value="">Todas</option>
            {classificacoesAtivas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
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
          <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">Pessoa (pagou)</label>
          <select
            value={filtroPessoa}
            onChange={(e) => setFiltroPessoa(e.target.value)}
            className={FILTER_SELECT_CLASS}
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
            onChange={(e) => setOrdenarPor(e.target.value as "data" | "classificacao" | "descricao")}
            className={FILTER_SELECT_CLASS}
          >
            <option value="data">Data</option>
            <option value="classificacao">Classificação</option>
            <option value="descricao">Descrição</option>
          </select>
        </div>
        {temFiltroAtivo && (
          <button
            type="button"
            onClick={() => {
              setFiltroClassificacao("");
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
        // Modal fixo de propósito: clicar fora NÃO fecha (padrão pra todo modal do app).
        <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-[42rem] flex-col gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xl"
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

            {/* Topo: Data / Classificação / Subclassificação / Descrição / Anexo / Analisar. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo label="Data" compact>
                <input
                  type="date"
                  required
                  value={form.data}
                  onChange={(e) => setField("data", e.target.value)}
                  className={inputClass}
                />
              </Campo>
              <Campo label="Classificação" compact>
                <select
                  required
                  value={form.classificacao_id}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, classificacao_id: e.target.value, subclassificacao_id: "" }))
                  }
                  className={inputClass}
                >
                  <option value="">Selecione...</option>
                  {classificacoesAtivas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Subclassificação" compact>
                <select
                  value={form.subclassificacao_id}
                  onChange={(e) => setField("subclassificacao_id", e.target.value)}
                  disabled={!form.classificacao_id}
                  className={inputClass}
                >
                  <option value="">Nenhuma</option>
                  {subclassificacoesDaClassificacao.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Anexo" compact>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT_VOUCHER}
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      setAnalisado(false);
                      setSegundoTrecho(null);
                      setAvisosAnalise([]);
                    }}
                    className="hidden"
                    id="input-anexo-item"
                  />
                  <label
                    htmlFor="input-anexo-item"
                    title={file ? file.name : "Anexar arquivo"}
                    className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 text-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    📎
                  </label>
                  <button
                    type="button"
                    onClick={handleAnalisar}
                    disabled={!file || analisando}
                    title="Analisar anexo"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 text-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    {analisando ? "…" : "🔎"}
                  </button>
                </div>
              </Campo>
            </div>
            {file && (
              <p className="text-xs text-slate-400 dark:text-slate-500">📎 {file.name}</p>
            )}
            {editingAnexoNome && !file && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Já tem um anexo (📎 {editingAnexoNome}) - escolha outro arquivo só se quiser
                substituí-lo.
              </p>
            )}
            {analisado && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Preenchi o que consegui identificar no anexo - confira os campos abaixo antes de
                cadastrar.
              </p>
            )}
            {avisosAnalise.map((aviso) => (
              <p
                key={aviso}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
              >
                ⚠️ {aviso}
              </p>
            ))}
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

            <Campo label="Descrição" grow>
              <input required value={form.descricao} onChange={(e) => setField("descricao", e.target.value)} className={inputClass} />
            </Campo>

            {editingId && editingAnexoNome && (
              <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-3">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Anexos extras
                </label>
                {todosExtras.filter((a) => a.item_id === editingId).length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {todosExtras
                      .filter((a) => a.item_id === editingId)
                      .map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                          <button
                            type="button"
                            onClick={() => setAnexoAberto({ fileId: a.file_id, nome: a.nome })}
                            className="truncate text-left text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            📎 {a.nome}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveExtra(a)}
                            disabled={removingExtraId === a.id || !online}
                            className="shrink-0 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 disabled:opacity-50"
                          >
                            {removingExtraId === a.id ? "Removendo..." : "Remover"}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
                <input
                  ref={extraFileInputRef}
                  type="file"
                  accept={ACCEPT_VOUCHER}
                  disabled={addingExtra || !online}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAddExtra(f);
                  }}
                  className="block w-full text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 dark:file:text-slate-300 hover:file:bg-slate-200 dark:hover:file:bg-slate-700 disabled:opacity-50"
                />
                {addingExtra && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">Enviando anexo...</p>
                )}
                {extraError && <p className="text-xs text-red-600 dark:text-red-400">{extraError}</p>}
              </div>
            )}

            {/* Acordeão Financeiro */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800">
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.financeiroAtivo}
                  onChange={(e) => setField("financeiroAtivo", e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  💰 Financeiro
                </span>
              </label>
              {form.financeiroAtivo && (
                <div className="flex flex-col gap-3 border-t border-slate-100 dark:border-slate-800 p-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Campo label="Moeda" compact>
                      <select value={form.moeda} onChange={(e) => setField("moeda", e.target.value)} className={inputClass}>
                        <option value="">R$ (Real)</option>
                        {moedasItem.map((m) => (
                          <option key={m.code} value={m.code}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Campo label={form.moeda ? `Qtde moeda (${form.moeda})` : "Qtde moeda"} compact>
                      <MoneyInput value={form.valor} onChange={(v) => setField("valor", v)} className={`${inputClass} text-right`} />
                    </Campo>
                    <Campo label={form.natureza === "credito" ? "Quem contribuiu" : "Pago Por"} compact>
                      <select value={form.pagador_id} onChange={(e) => setPagador(e.target.value)} className={inputClass}>
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
                  {conversaoValor && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {conversaoValor.fonte === "cambio" && (
                        <>≈ {formatBRL(conversaoValor.valorBRL)} pelo custo médio do câmbio ({formatBRL(conversaoValor.taxa)}/{form.moeda}).</>
                      )}
                      {conversaoValor.fonte === "cotacao" && (
                        <>≈ {formatBRL(conversaoValor.valorBRL)} pela cotação do dia ({formatBRL(conversaoValor.taxa)}/{form.moeda}) - sem câmbio de {form.moeda} registrado ainda.</>
                      )}
                      {conversaoValor.fonte === "sem_taxa" && (
                        <>Sem câmbio nem cotação de {form.moeda} - registre um câmbio no Financeiro pra converter no Relatório.</>
                      )}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={form.pago}
                        onChange={(e) => setField("pago", e.target.checked)}
                        className="h-4 w-4"
                      />
                      {form.pago ? STATUS_PAGAMENTO[1].label : STATUS_PAGAMENTO[0].label}
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                      Natureza
                      <select
                        value={form.natureza}
                        onChange={(e) => setField("natureza", e.target.value as "debito" | "credito")}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs font-normal"
                      >
                        <option value="debito">Débito</option>
                        <option value="credito">Crédito</option>
                      </select>
                    </label>
                    <Campo label="Data pagamento" compact>
                      <input type="date" value={form.data_pagamento} onChange={(e) => setField("data_pagamento", e.target.value)} className={inputClass} />
                    </Campo>
                  </div>
                </div>
              )}
            </div>

            {/* Acordeão Roteiro */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800">
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.roteiroAtivo}
                  onChange={(e) => setField("roteiroAtivo", e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  🗺️ Roteiro
                </span>
              </label>
              {form.roteiroAtivo && (
                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 dark:border-slate-800 p-3 sm:grid-cols-4">
                  <Campo label="Localizador" compact>
                    <input value={form.localizador} onChange={(e) => setField("localizador", e.target.value)} className={inputClass} />
                  </Campo>
                  <Campo label="Companhia" compact>
                    <input value={form.nome_companhia} onChange={(e) => setField("nome_companhia", e.target.value)} className={inputClass} />
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
                  <Campo label="Local" compact>
                    <input value={form.nome_local} onChange={(e) => setField("nome_local", e.target.value)} className={inputClass} />
                  </Campo>
                  <Campo label="Endereço" compact>
                    <input value={form.endereco} onChange={(e) => setField("endereco", e.target.value)} className={inputClass} />
                  </Campo>
                  <Campo label="URL" compact>
                    <input type="url" value={form.url} onChange={(e) => setField("url", e.target.value)} placeholder="https://..." className={inputClass} />
                  </Campo>
                  <Campo label="Início" compact>
                    <div className="flex flex-col gap-1">
                      <input type="date" value={form.data_inicio} onChange={(e) => setField("data_inicio", e.target.value)} className={inputClass} />
                      <TimeField value={form.hora_inicio} onChange={(v) => setField("hora_inicio", v)} />
                    </div>
                  </Campo>
                  <Campo label="Término" compact>
                    <div className="flex flex-col gap-1">
                      <input type="date" value={form.data_fim} onChange={(e) => setField("data_fim", e.target.value)} className={inputClass} />
                      <TimeField value={form.hora_fim} onChange={(v) => setField("hora_fim", v)} />
                    </div>
                  </Campo>
                </div>
              )}
            </div>

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

      {/* Lista sem `<table>` de propósito - ver armadilha de rolagem lateral no mobile. */}
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
                  {nomePorClassificacao[item.classificacao_id] ?? "Sem classificação"}
                </span>
                {item.anexo_file_id && (
                  <span
                    className="text-slate-400 dark:text-slate-500"
                    title={
                      extrasPorItem[item.id]
                        ? `${1 + extrasPorItem[item.id]} anexos`
                        : "1 anexo"
                    }
                  >
                    📎{extrasPorItem[item.id] ? ` +${extrasPorItem[item.id]}` : ""}
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {resumoItem(item, nomePorMeio) || item.descricao}
              </p>
            </div>
            {!bloqueada && (
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
                  onClick={() => handleDuplicate(item)}
                  className="text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:underline"
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline"
                >
                  Excluir
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <ItemDetalhesPopup
        item={viewingItem}
        tripId={tripId}
        nomePorPessoa={nomePorPessoa}
        nomePorMeio={nomePorMeio}
        nomePorClassificacao={nomePorClassificacao}
        nomePorSubclassificacao={nomePorSubclassificacao}
        extraAnexos={
          viewingItem ? todosExtras.filter((a) => a.item_id === viewingItem.id) : undefined
        }
        cambios={cambios}
        cotacoes={cotacoesFallback}
        podeEditar={!bloqueada}
        onClose={() => setViewingItem(null)}
        onEditar={(item) => {
          setViewingItem(null);
          openEditForm(item);
        }}
      />

      {anexoAberto && (
        <AnexoViewer
          tripId={tripId}
          fileId={anexoAberto.fileId}
          nome={anexoAberto.nome}
          onClose={() => setAnexoAberto(null)}
        />
      )}
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-2 text-sm";

function Campo({
  label,
  grow,
  compact,
  children,
}: {
  label: string;
  grow?: boolean;
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
