import { CATEGORIAS_ITEM, CategoriaItem } from "@/lib/sheets/types";

/** Mesmos campos da aba Itens - usado tanto pela tela Itens (cadastro/edição) quanto por
 * Roteiro > Agenda (só leitura), que mostra o mesmo pop-up de detalhe ao clicar num item. */
export interface Item {
  id: string;
  categoria: CategoriaItem;
  tipo: string;
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
  tipo_documento: string;
  passageiro_id: string;
  url: string;
  anexo_file_id: string;
  anexo_nome: string;
  anexo_url: string;
  descricao: string;
  valor: string;
  status: string;
  natureza: string;
  data_pagamento: string;
  pagador_id: string;
  meio_pagamento_id: string;
}

export const CATEGORIA_LABEL: Record<CategoriaItem, string> = Object.fromEntries(
  CATEGORIAS_ITEM.map((c) => [c.value, c.label])
) as Record<CategoriaItem, string>;

export const CATEGORIA_ICONE: Record<CategoriaItem, string> = {
  traslado: "🚐",
  passagem: "✈️",
  hospedagem: "🏨",
  alimentacao: "🍽️",
  atrativo: "🗼",
  repasse: "💸",
  documento: "📄",
  outro: "📦",
};

/** Emoji por tipo de transporte - só se aplica a Traslado/Passagem, que são as únicas categorias
 * com esse campo `tipo` preenchido com um meio de transporte. Tipo sem mapeamento (ex. "Outros"
 * do Traslado, ou campo ainda vazio) cai no emoji de categoria. */
const TIPO_TRANSPORTE_ICONE: Partial<Record<string, string>> = {
  "Ônibus": "🚌",
  Van: "🚐",
  Carro: "🚗",
  "Avião": "✈️",
  "Embarcação": "🚢",
  Trem: "🚆",
};

export function IconeItem({ item, className }: { item: Pick<Item, "categoria" | "tipo">; className?: string }) {
  const emoji =
    ((item.categoria === "traslado" || item.categoria === "passagem") && TIPO_TRANSPORTE_ICONE[item.tipo]) ||
    CATEGORIA_ICONE[item.categoria];
  return (
    <span className={`shrink-0 text-[1.3rem] leading-none ${className ?? ""}`} aria-hidden="true">
      {emoji}
    </span>
  );
}

export function formatDataBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function formatMoney(valor: string): string {
  return `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * URL do anexo servida pelo próprio app (`/api/trips/[id]/anexos/[fileId]`, que baixa os bytes
 * via Apps Script e devolve direto, sem passar pelo Drive) - em vez do link cru do Drive
 * (`item.anexo_url`), que exige o navegador estar logado numa conta Google com acesso ao
 * arquivo (a pasta não é pública) e cai numa tela de login do Google em vez de abrir o anexo.
 */
function hrefAnexo(tripId: string, fileId: string): string {
  return `/api/trips/${tripId}/anexos/${fileId}`;
}

/** Rótulos de `data_inicio`/`data_fim` por categoria - mesmo par de colunas, nome diferente na
 * tela conforme o que a categoria representa. `undefined` = categoria não tem início/fim (usa
 * `data`/`horario` direto). */
export const LABELS_INICIO_FIM: Partial<Record<CategoriaItem, [string, string]>> = {
  traslado: ["Partida", "Chegada"],
  passagem: ["Partida", "Chegada"],
  hospedagem: ["Check-in", "Check-out"],
  alimentacao: ["Check-in", "Check-out"],
  atrativo: ["Início", "Término"],
};

const STATUS_LABEL: Record<string, string> = { pago: "Pago", a_pagar: "A pagar" };

/** Rótulo de cada campo do Item, na ordem em que aparece no pop-up de detalhe - campos vazios
 * não aparecem (ver `ItemDetalhes`). */
const CAMPOS_DETALHE: { campo: keyof Item; label: string }[] = [
  { campo: "tipo", label: "Tipo" },
  { campo: "localizador", label: "Localizador" },
  { campo: "nome_companhia", label: "Companhia" },
  { campo: "numero", label: "Número" },
  { campo: "origem", label: "Origem" },
  { campo: "destino", label: "Destino" },
  { campo: "nome_local", label: "Local" },
  { campo: "endereco", label: "Endereço" },
  { campo: "tipo_documento", label: "Tipo de documento" },
  { campo: "url", label: "URL" },
  { campo: "data_pagamento", label: "Data pagamento" },
];

/** Bloco de detalhe do item - lista só os campos preenchidos, num grid compacto de
 * "rótulo: valor". Não reaproveita o JSX condicional-por-categoria do formulário de propósito:
 * aqui é só leitura, então generalizar por "tem valor ou não" é mais simples de manter em dia do
 * que replicar a lógica de qual campo pertence a qual categoria. */
function ItemDetalhes({
  tripId,
  item,
  nomePorPessoa,
  nomePorMeio,
}: {
  tripId: string;
  item: Item;
  nomePorPessoa: Record<string, string>;
  nomePorMeio: Record<string, string>;
}) {
  const [labelInicio, labelFim] = LABELS_INICIO_FIM[item.categoria] ?? ["Início", "Término"];
  const pares: { label: string; valor: string }[] = [];

  if (item.data_inicio || item.hora_inicio) {
    pares.push({ label: labelInicio, valor: [item.data_inicio && formatDataBR(item.data_inicio), item.hora_inicio].filter(Boolean).join(" ") });
  }
  if (item.data_fim || item.hora_fim) {
    pares.push({ label: labelFim, valor: [item.data_fim && formatDataBR(item.data_fim), item.hora_fim].filter(Boolean).join(" ") });
  }
  for (const { campo, label } of CAMPOS_DETALHE) {
    const valor = item[campo];
    if (valor) pares.push({ label, valor: campo === "data_pagamento" ? formatDataBR(valor) : valor });
  }
  if (item.passageiro_id) {
    pares.push({ label: "Passageiro", valor: nomePorPessoa[item.passageiro_id] ?? item.passageiro_id });
  }
  if (item.valor) {
    pares.push({ label: "Valor", valor: formatMoney(item.valor) });
    if (item.status) pares.push({ label: "Status", valor: STATUS_LABEL[item.status] ?? item.status });
    if (item.pagador_id) {
      pares.push({
        label: item.categoria === "repasse" ? "Quem contribuiu" : "Quem pagou",
        valor: nomePorPessoa[item.pagador_id] ?? item.pagador_id,
      });
    }
    if (item.meio_pagamento_id) {
      pares.push({ label: "Meio de pagamento", valor: nomePorMeio[item.meio_pagamento_id] ?? item.meio_pagamento_id });
    }
  }

  if (!pares.length && !item.descricao && !item.anexo_file_id) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">Sem outros campos preenchidos.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {item.anexo_file_id && (
        <a
          href={hrefAnexo(tripId, item.anexo_file_id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          📎 {item.anexo_nome || "abrir anexo"}
        </a>
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
  onClose,
  onEditar,
}: {
  item: Item | null;
  tripId: string;
  nomePorPessoa: Record<string, string>;
  nomePorMeio: Record<string, string>;
  onClose: () => void;
  onEditar: (item: Item) => void;
}) {
  if (!item) return null;
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
            <IconeItem item={item} />
            {CATEGORIA_LABEL[item.categoria] ?? item.categoria}
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
        <ItemDetalhes tripId={tripId} item={item} nomePorPessoa={nomePorPessoa} nomePorMeio={nomePorMeio} />
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onEditar(item)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
