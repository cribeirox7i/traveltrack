export type SheetTab =
  | "Users"
  | "Parametros"
  | "Trips"
  | "TripDays"
  | "UserTrip"
  | "Despesas"
  | "Receitas"
  | "MeiosPagamento"
  | "Agenda"
  | "Countries";

export const SHEET_HEADERS: Record<SheetTab, string[]> = {
  Users: ["id", "nome", "email", "senha_hash", "role", "ativo"],
  Parametros: ["id", "chave", "valor", "descricao"],
  Trips: [
    "id",
    "nome",
    "data_inicio",
    "data_fim",
    "qtd_pessoas",
    "criado_por",
    "criado_em",
    "cidade_origem",
    "cidade_origem_lat",
    "cidade_origem_lon",
  ],
  TripDays: [
    "id",
    "trip_id",
    "data",
    "origem",
    "destino",
    "pernoite",
    "traslado_pp",
    "passagem_pp",
    "alimentacao_pp",
    "passeio_pp",
    "hospedagem_pp",
    "temp_min",
    "temp_max",
    "origem_lat",
    "origem_lon",
    "destino_lat",
    "destino_lon",
    "pernoite_lat",
    "pernoite_lon",
    "origem_pais",
    "destino_pais",
    "pernoite_pais",
  ],
  UserTrip: ["id", "user_id", "trip_id"],
  Despesas: [
    "id",
    "trip_id",
    "categoria",
    "valor",
    "data",
    "lancado_por",
    "descricao",
    "pagador_id",
    "meio_pagamento_id",
    "status",
    "natureza",
  ],
  Receitas: ["id", "trip_id", "user_id", "valor", "data", "descricao", "credor_id", "status"],
  MeiosPagamento: ["id", "nome", "ativo"],
  Agenda: [
    "id",
    "trip_id",
    "data",
    "horario",
    "titulo",
    "descricao",
    "url",
    "anexo_file_id",
    "anexo_nome",
    "anexo_url",
    "criado_por",
    "criado_em",
  ],
  // Tabela de referência por país - nasceu como "Eletric" (tomada/voltagem/frequência,
  // preenchida manualmente pelo usuário) e ganhou o resto (moeda, capital, DDI, lado de
  // direção, fuso, cotação) auto-preenchido pelo app na primeira vez que cada país é
  // necessário (ver upsertCountry em lib/sheets/countries.ts) - por isso tem `id` e é
  // gravável, diferente das outras tabelas de referência só-leitura deste arquivo.
  Countries: [
    "id",
    "country",
    "plug_type",
    "volts",
    "hertz",
    "currency_code",
    "currency_name",
    "currency_symbol",
    "capital",
    "ddi",
    "driving_side",
    "timezone",
    "flag_emoji",
    "rate_brl",
    "rate_date",
  ],
};

export type Role = "admin" | "user";

export interface UserRow {
  [key: string]: string;
  id: string;
  nome: string;
  email: string;
  senha_hash: string;
  role: Role;
  ativo: "true" | "false";
}

export interface ParametroRow {
  [key: string]: string;
  id: string;
  chave: string;
  valor: string;
  descricao: string;
}

export interface TripRow {
  [key: string]: string;
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string;
  qtd_pessoas: string;
  criado_por: string;
  criado_em: string;
  cidade_origem: string;
  cidade_origem_lat: string;
  cidade_origem_lon: string;
}

export interface TripDayRow {
  [key: string]: string;
  id: string;
  trip_id: string;
  data: string;
  origem: string;
  destino: string;
  pernoite: string;
  traslado_pp: string;
  passagem_pp: string;
  alimentacao_pp: string;
  passeio_pp: string;
  hospedagem_pp: string;
  temp_min: string;
  temp_max: string;
  origem_lat: string;
  origem_lon: string;
  destino_lat: string;
  destino_lon: string;
  pernoite_lat: string;
  pernoite_lon: string;
  /** País da cidade escolhida na busca (Open-Meteo devolve isso na sugestão) - vazio se o campo
   * foi digitado livre, sem selecionar sugestão. Usado pra cruzar com a aba Countries e mostrar
   * tomada/voltagem/moeda/fuso/etc. no acordeão do Roteiro. */
  origem_pais: string;
  destino_pais: string;
  pernoite_pais: string;
}

export interface UserTripRow {
  [key: string]: string;
  id: string;
  user_id: string;
  trip_id: string;
}

export type Categoria =
  | "traslado"
  | "passagem"
  | "alimentacao"
  | "passeio"
  | "hospedagem"
  | "aporte";

/**
 * Situação de pagamento de uma despesa/receita. Linhas antigas (criadas antes da coluna
 * existir) vêm com a célula vazia - por isso todo lugar que lê o status trata "" como o estado
 * pendente (`a_pagar`/`a_receber`) em vez de assumir que a coluna sempre está preenchida.
 */
export type StatusDespesa = "pago" | "a_pagar";
export type StatusReceita = "recebido" | "a_receber";
/** O campo `status` de um lançamento na aba Despesas guarda um dos dois vocabulários acima,
 * dependendo de `natureza`: débito usa pago/a_pagar, crédito usa recebido/a_receber (mesmo
 * vocabulário já usado há tempos na aba Receitas - sem conflito com dado existente, já que toda
 * linha de Despesas anterior a esta coluna é implicitamente débito). */
export type StatusLancamento = StatusDespesa | StatusReceita;

/**
 * Débito (dinheiro saindo, ex.: uma diária de hotel) ou crédito (dinheiro entrando, ex.: um
 * aporte de alguém do grupo) - o que hoje distinguia as abas Despesas/Receitas vira um campo na
 * mesma linha, unificado em "Lançamentos". Linhas antigas (de antes desta coluna existir) vêm
 * com a célula vazia e são tratadas como "debito", já que só a aba Despesas existia até então.
 */
export type Natureza = "debito" | "credito";

export interface DespesaRow {
  [key: string]: string;
  id: string;
  trip_id: string;
  categoria: Categoria;
  valor: string;
  data: string;
  lancado_por: string;
  descricao: string;
  pagador_id: string;
  meio_pagamento_id: string;
  status: StatusLancamento | "";
  natureza: Natureza | "";
}

export interface MeioPagamentoRow {
  [key: string]: string;
  id: string;
  nome: string;
  ativo: "true" | "false";
}

export interface ReceitaRow {
  [key: string]: string;
  id: string;
  trip_id: string;
  user_id: string;
  valor: string;
  data: string;
  descricao: string;
  credor_id: string;
  status: StatusReceita | "";
}

/**
 * Tudo o que o app sabe sobre um país, numa linha só. `plug_type`/`volts`/`hertz` continuam
 * curados à mão pelo usuário (herança da antiga aba "Eletric"); o resto é preenchido sozinho -
 * `upsertCountry` (lib/sheets/countries.ts) só grava um campo vazio, nunca sobrescreve o que já
 * tem valor (nem os manuais, nem um valor auto-preenchido antes), exceto `rate_brl`/`rate_date`,
 * que são atualizados de propósito a cada refresh (é uma cotação do dia, não um dado estático).
 */
export interface CountryRow {
  [key: string]: string;
  id: string;
  country: string;
  plug_type: string;
  volts: string;
  hertz: string;
  currency_code: string;
  currency_name: string;
  currency_symbol: string;
  capital: string;
  /** Código de discagem internacional, ex.: "+33". */
  ddi: string;
  driving_side: "left" | "right" | "";
  /** Fuso IANA, ex.: "Europe/Paris" - usado só pra calcular a hora local a partir do horário do
   * próprio aparelho (`Intl.DateTimeFormat`), nunca por uma chamada de API. */
  timezone: string;
  flag_emoji: string;
  /** Cotação de 1 unidade da moeda do país em Real, na data de `rate_date` (yyyy-MM-dd). */
  rate_brl: string;
  rate_date: string;
}

/** Um compromisso do roteiro, ancorado numa das datas da grade de diárias da viagem. */
export interface AgendaRow {
  [key: string]: string;
  id: string;
  trip_id: string;
  data: string;
  horario: string;
  titulo: string;
  descricao: string;
  url: string;
  anexo_file_id: string;
  anexo_nome: string;
  anexo_url: string;
  criado_por: string;
  criado_em: string;
}
