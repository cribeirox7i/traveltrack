"use client";

import { useState } from "react";
import type { CambioEventoLike } from "@/lib/cambioCalc";
import { converterValorParaBRL, custoMedioPorMoeda } from "@/lib/cambioCalc";
import { AnexoViewer } from "@/components/AnexoViewer";

/** Um anexo do item (todos iguais entre si, sem destaque pro primeiro - reforma 2026-09-24) -
 * mesmos campos de `AnexoInfo` em lib/offline/sync.ts, redeclarado aqui pra este arquivo não
 * depender do módulo de sincronização. */
export interface ItemAnexoInfo {
  id: string;
  file_id: string;
  nome: string;
}

/** Mesmos campos da aba Itens (reforma de 2026-09-21) - usado tanto pela tela Itens (cadastro/
 * edição) quanto por Roteiro > Agenda (só leitura), que mostra o mesmo pop-up de detalhe ao
 * clicar num item. `classificacao_id`/`subclassificacao_id` são FK - os nomes vêm resolvidos por
 * quem chama (`nomePorClassificacao`/`nomePorSubclassificacao`), o componente não busca sozinho. */
export interface Item {
  id: string;
  classificacao_id: string;
  subclassificacao_id: string;
  financeiro_ativo: string;
  roteiro_ativo: string;
  localizador: string;
  nome_companhia: string;
  numero: string;
  data: string;
  horario: string;
  origem: string;
  destino: string;
  nome_local: string;
  endereco: string;
  data_inicio: string;
  hora_inicio: string;
  data_fim: string;
  hora_fim: string;
  url: string;
  descricao: string;
  valor: string;
  status: string;
  natureza: string;
  data_pagamento: string;
  pagador_id: string;
  meio_pagamento_id: string;
  moeda: string;
  /** Marcador só local (IndexedDB), nunca vem do servidor - nome do arquivo escolhido num Item
   * criado/editado offline, antes de a linha em `Anexos` existir de verdade (ver
   * `createItemOffline`/`updateItemOffline` em lib/offline/sync.ts). Some sozinho ao sincronizar. */
  _anexoPendenteNome?: string;
}

export function formatDataBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function formatMoney(valor: string | number): string {
  return `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMoedaEstrangeira(valor: string, moeda: string): string {
  return `${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moeda}`;
}

/** Ícone contextual: prioriza o emoji curado pelo admin em Subclassificação (sobrescreve),
 * depois o de Classificação (ex. 🍽️ em Alimentação), e só cai no genérico por acordeão
 * (💰/🗺️/🧳) quando nenhum dos dois foi preenchido - ver `icone` em ClassificacaoRow/
 * SubclassificacaoRow e a tela /admin/classificacoes. Os mapas são opcionais pra quem chama sem
 * ter carregado a taxonomia ainda não quebrar (cai direto no genérico). */
export function IconeItem({
  item,
  iconePorClassificacao,
  iconePorSubclassificacao,
  className,
}: {
  item: Pick<Item, "classificacao_id" | "subclassificacao_id" | "financeiro_ativo" | "roteiro_ativo">;
  iconePorClassificacao?: Record<string, string>;
  iconePorSubclassificacao?: Record<string, string>;
  className?: string;
}) {
  const generico =
    item.financeiro_ativo === "true" && item.roteiro_ativo === "true"
      ? "🧳"
      : item.financeiro_ativo === "true"
        ? "💰"
        : "🗺️";
  const emoji =
    (item.subclassificacao_id && iconePorSubclassificacao?.[item.subclassificacao_id]) ||
    (item.classificacao_id && iconePorClassificacao?.[item.classificacao_id]) ||
    generico;
  return (
    <span className={`shrink-0 text-[1.3rem] leading-none ${className ?? ""}`} aria-hidden="true">
      {emoji}
    </span>
  );
}

const STATUS_LABEL: Record<string, string> = { pago: "Pago", a_pagar: "A pagar" };
const NATUREZA_LABEL: Record<string, string> = { debito: "Débito", credito: "Crédito" };

/** Rótulo de cada campo do Roteiro, na ordem em que aparece no pop-up de detalhe - campos vazios
 * não aparecem. Início/Término são genéricos agora (a reforma tirou o rótulo por categoria, já
 * que classificação é dado livre - ver LABELS_INICIO_FIM removido). */
const CAMPOS_ROTEIRO: { campo: keyof Item; label: string }[] = [
  { campo: "localizador", label: "Localizador" },
  { campo: "nome_companhia", label: "Companhia" },
  { campo: "numero", label: "Número" },
  { campo: "origem", label: "Origem" },
  { campo: "destino", label: "Destino" },
  { campo: "nome_local", label: "Local" },
  { campo: "endereco", label: "Endereço" },
  { campo: "url", label: "URL" },
];

/** Bloco de detalhe do item - lista só os campos preenchidos, num grid compacto de
 * "rótulo: valor". Não reaproveita o JSX condicional-por-categoria do formulário de propósito:
 * aqui é só leitura, então generalizar por "tem valor ou não" é mais simples de manter em dia do
 * que replicar a lógica de qual campo pertence a qual categoria. */
function ItemDetalhes({
  item,
  nomePorPessoa,
  nomePorMeio,
  anexos,
  cambios,
  cotacoes,
  onAbrirAnexo,
}: {
  item: Item;
  nomePorPessoa: Record<string, string>;
  nomePorMeio: Record<string, string>;
  anexos: ItemAnexoInfo[];
  cambios: CambioEventoLike[];
  cotacoes: Record<string, number>;
  onAbrirAnexo: (fileId: string, nome: string) => void;
}) {
  const pares: { label: string; valor: string }[] = [];

  if (item.roteiro_ativo === "true") {
    if (item.data_inicio || item.hora_inicio) {
      pares.push({
        label: "Início",
        valor: [item.data_inicio && formatDataBR(item.data_inicio), item.hora_inicio].filter(Boolean).join(" "),
      });
    }
    if (item.data_fim || item.hora_fim) {
      pares.push({
        label: "Término",
        valor: [item.data_fim && formatDataBR(item.data_fim), item.hora_fim].filter(Boolean).join(" "),
      });
    }
    for (const { campo, label } of CAMPOS_ROTEIRO) {
      const valor = item[campo];
      if (valor) pares.push({ label, valor });
    }
  }

  if (item.financeiro_ativo === "true") {
    if (item.data_pagamento) pares.push({ label: "Data pagamento", valor: formatDataBR(item.data_pagamento) });
    if (item.valor) {
      const moedaEstrangeira = item.moeda && item.moeda !== "BRL" ? item.moeda : "";
      // Moeda sempre aparece explícita (nunca em branco) - "" no banco significa Real, mas a
      // tela mostra "R$ (Real)" por extenso em vez de simplesmente omitir a linha.
      pares.push({ label: "Moeda", valor: moedaEstrangeira || "R$ (Real)" });
      if (moedaEstrangeira) {
        pares.push({ label: "Valor", valor: formatMoedaEstrangeira(item.valor, moedaEstrangeira) });
        const conv = converterValorParaBRL(
          item.valor,
          moedaEstrangeira,
          custoMedioPorMoeda(cambios),
          cotacoes
        );
        if (conv.fonte === "cambio" || conv.fonte === "cotacao") {
          pares.push({
            label: conv.fonte === "cambio" ? "Valor em R$ (câmbio)" : "Valor em R$ (cotação)",
            valor: formatMoney(conv.valorBRL),
          });
        }
      } else {
        pares.push({ label: "Valor", valor: formatMoney(item.valor) });
      }
      if (item.natureza) pares.push({ label: "Natureza", valor: NATUREZA_LABEL[item.natureza] ?? item.natureza });
      if (item.status) pares.push({ label: "Status", valor: STATUS_LABEL[item.status] ?? item.status });
      if (item.pagador_id) {
        pares.push({
          label: item.natureza === "credito" ? "Quem contribuiu" : "Quem pagou",
          valor: nomePorPessoa[item.pagador_id] ?? item.pagador_id,
        });
      }
      if (item.meio_pagamento_id) {
        pares.push({ label: "Meio de pagamento", valor: nomePorMeio[item.meio_pagamento_id] ?? item.meio_pagamento_id });
      }
    }
  }

  if (!pares.length && !item.descricao && !anexos.length) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">Sem outros campos preenchidos.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {anexos.length > 0 && (
        <div className="flex flex-col items-start gap-1">
          {anexos.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAbrirAnexo(a.file_id, a.nome)}
              className="inline-flex w-fit items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              📎 {a.nome || "abrir anexo"}
            </button>
          ))}
        </div>
      )}
      {/* Descrição fica fora do grid de propósito: largura total e várias linhas, em vez de
          truncar numa célula de metade da largura como os demais campos - costuma ser o texto
          mais longo do item, truncado ficava ilegível. */}
      {item.descricao && (
        <div>
          <dt className="text-xs uppercase text-slate-400 dark:text-slate-500">Descrição</dt>
          <dd className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{item.descricao}</dd>
        </div>
      )}
      {pares.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
          {pares.map((p) => (
            <div key={p.label} className="min-w-0">
              <dt className="text-xs uppercase text-slate-400 dark:text-slate-500">{p.label}</dt>
              <dd className="truncate text-sm text-slate-700 dark:text-slate-300" title={p.valor}>
                {p.valor}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Pop-up read-only com todos os campos do item - compartilhado entre a tela Itens (clicar numa
 * linha da lista) e Roteiro > Agenda (clicar num item do acordeão do dia), pra sempre mostrar o
 * mesmo detalhe nos dois lugares. `onEditar` é quem decide o que "editar" significa em cada tela:
 * na tela Itens abre o formulário inline; na Agenda navega pra Itens com `?editar=`. */
export function ItemDetalhesPopup({
  item,
  tripId,
  nomePorPessoa,
  nomePorMeio,
  nomePorClassificacao,
  nomePorSubclassificacao,
  iconePorClassificacao,
  iconePorSubclassificacao,
  anexos = [],
  cambios = [],
  cotacoes = {},
  podeEditar = true,
  onClose,
  onEditar,
}: {
  item: Item | null;
  tripId: string;
  nomePorPessoa: Record<string, string>;
  nomePorMeio: Record<string, string>;
  nomePorClassificacao: Record<string, string>;
  nomePorSubclassificacao: Record<string, string>;
  /** Ícone curado por classificação/subclassificação (ver comentário em `IconeItem`) - ausentes
   * caem no ícone genérico por acordeão. */
  iconePorClassificacao?: Record<string, string>;
  iconePorSubclassificacao?: Record<string, string>;
  /** Anexos deste item, todos iguais entre si (já filtrados pelo chamador - lista inteira da
   * viagem vem de `useOfflineCollection<AnexoInfo>("anexosSheet", tripId)`). */
  anexos?: ItemAnexoInfo[];
  /** Eventos de câmbio da viagem + cotação do dia por moeda (`Countries.rate_brl`) - só pra
   * mostrar o valor em R$ de um item lançado em moeda estrangeira. Ausentes = não mostra a
   * conversão (o valor na moeda ainda aparece). */
  cambios?: CambioEventoLike[];
  cotacoes?: Record<string, number>;
  /** `false` numa viagem concluída/cancelada - esconde o botão "Editar" (a tela só lê). */
  podeEditar?: boolean;
  onClose: () => void;
  onEditar: (item: Item) => void;
}) {
  const [anexoAberto, setAnexoAberto] = useState<{ fileId: string; nome: string } | null>(null);
  if (!item) return null;
  const nomeClassificacao = nomePorClassificacao[item.classificacao_id] ?? "Sem classificação";
  const nomeSubclassificacao = nomePorSubclassificacao[item.subclassificacao_id];
  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-lg flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <IconeItem
              item={item}
              iconePorClassificacao={iconePorClassificacao}
              iconePorSubclassificacao={iconePorSubclassificacao}
            />
            {nomeClassificacao}
            {nomeSubclassificacao && (
              <span className="font-normal normal-case text-slate-400">· {nomeSubclassificacao}</span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">{formatDataBR(item.data)}</p>
        <ItemDetalhes
          item={item}
          nomePorPessoa={nomePorPessoa}
          nomePorMeio={nomePorMeio}
          anexos={anexos}
          cambios={cambios}
          cotacoes={cotacoes}
          onAbrirAnexo={(fileId, nome) => setAnexoAberto({ fileId, nome })}
        />
        <div className="flex gap-2 pt-1">
          {podeEditar && (
            <button
              type="button"
              onClick={() => onEditar(item)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Editar
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>
      </div>

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
