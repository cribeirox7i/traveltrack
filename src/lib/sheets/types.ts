export type SheetTab =
  | "Ambientes"
  | "Users"
  | "Parametros"
  | "Trips"
  | "TripDays"
  | "UserTrip"
  | "Despesas"
  | "Receitas"
  | "MeiosPagamento"
  | "Agenda"
  | "Countries"
  | "Itens"
  | "ItemAnexos";

export const SHEET_HEADERS: Record<SheetTab, string[]> = {
  // Tenant do sistema: cada ambiente tem seus próprios usuários e viagens, e quem está num
  // ambiente não vê dado de outro. Só o admin global cria/edita ambientes.
  Ambientes: ["id", "nome", "ativo", "criado_em"],
  Users: ["id", "nome", "email", "senha_hash", "role", "ativo", "ambiente_id"],
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
    "capa_url",
    "custo_modo",
    "ambiente_id",
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
    "chuva_mm",
    "vento_kmh",
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
  // `user_id` = dono do meio de pagamento (cada usuário tem a própria lista; o gestor cadastra
  // pros usuários comuns do ambiente dele). Linha antiga sem `user_id` é órfã - ainda resolve o
  // nome por id nos Itens que a referenciam, mas não aparece na lista de ninguém.
  MeiosPagamento: ["id", "nome", "ativo", "user_id"],
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
    "language",
    "rate_brl",
    "rate_date",
  ],
  // Tabela genérica que substitui Despesas/Receitas/Agenda/Anexos (ver plano "Itens de Viagem +
  // OCR de vouchers"): um item de viagem, de uma das 8 categorias, com todos os campos possíveis
  // numa linha só - cada categoria só preenche o subconjunto que faz sentido pra ela, o resto
  // fica vazio (mesmo padrão de TripDays/Despesas). Fase 1: convive com as abas antigas, não as
  // substitui ainda - `migrate-itens.js` copia o que já existe pra cá.
  Itens: [
    "id",
    "trip_id",
    "categoria",
    "tipo",
    "localizador",
    "nome_companhia",
    "numero",
    "data",
    "horario",
    "origem",
    "destino",
    "nome_local",
    "endereco",
    "data_inicio",
    "hora_inicio",
    "data_fim",
    "hora_fim",
    "tipo_documento",
    "passageiro_id",
    "url",
    "anexo_file_id",
    "anexo_nome",
    "anexo_url",
    "descricao",
    "valor",
    "status",
    "natureza",
    "data_pagamento",
    "pagador_id",
    "meio_pagamento_id",
    "criado_por",
    "criado_em",
  ],
  // Anexos ADICIONAIS de um Item (além do `anexo_file_id` que já mora na própria linha de Itens -
  // esse continua sendo o único "principal", o único que passa pela análise do Gemini). Uma linha
  // por arquivo extra; `trip_id` duplicado pelo mesmo motivo de Itens/TripDays (rota de
  // download/exclusão confirma a pasta no Drive sem precisar buscar o item pai primeiro).
  ItemAnexos: ["id", "item_id", "trip_id", "file_id", "nome", "url", "criado_por", "criado_em"],
};

/**
 * `admin` é global (cria ambientes, mexe em Parametros, navega em qualquer ambiente via seletor);
 * `gestor` administra UM ambiente (cria usuários `user` dele, gerencia acessos e meios de
 * pagamento), sem ver Config nem outros ambientes; `user` só usa as viagens a que tem acesso.
 */
export type Role = "admin" | "gestor" | "user";

export interface UserRow {
  [key: string]: string;
  id: string;
  nome: string;
  email: string;
  senha_hash: string;
  role: Role;
  ativo: "true" | "false";
  /** Ambiente a que o usuário pertence - um só, faz parte da identidade dele. Vazio significa
   * "sem ambiente": só o admin global (que não é preso a um ambiente) fica assim legitimamente. */
  ambiente_id: string;
}

export interface AmbienteRow {
  [key: string]: string;
  id: string;
  nome: string;
  ativo: "true" | "false";
  criado_em: string;
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
  /** Só muda via `changeTripStartDate` - desloca a grade de TripDays (e a Agenda) inteira junto,
   * pra `data_inicio` continuar sendo de fato a data do primeiro dia da grade. */
  data_inicio: string;
  /** Derivado, nunca digitado direto: sempre a data do ÚLTIMO dia da grade de TripDays daquela
   * viagem (`sequentialDates(data_inicio, qtd_dias)` no momento da criação; recalculado por
   * `changeTripStartDate`/`insertTripDay`/`deleteTripDay` a cada mudança na grade). A duração da
   * viagem só muda incluindo/excluindo dias na aba Itinerário - não existe mais um campo de
   * "data de término" editável direto em lugar nenhum. */
  data_fim: string;
  qtd_pessoas: string;
  criado_por: string;
  criado_em: string;
  cidade_origem: string;
  cidade_origem_lat: string;
  cidade_origem_lon: string;
  /** URL de uma imagem estática escolhida pelo usuário como capa da viagem (card da lista +
   * Dashboard) - vazio se não definida, aí nenhuma capa aparece (sem fallback automático). */
  capa_url: string;
  /** Se os valores por categoria/dia no Orçamento são o custo POR PESSOA (default, comportamento
   * histórico - campos `_pp` em TripDayRow) ou o custo TOTAL da viagem naquele item/dia, caso em
   * que a tela de Orçamento/Relatório precisa dividir pelo `qtd_pessoas` pra mostrar o valor por
   * pessoa. Linhas antigas sem essa coluna são tratadas como "por_pessoa". */
  custo_modo: "por_pessoa" | "total" | "";
  /** Ambiente dono da viagem - herdado do usuário que a criou. As abas filhas (TripDays, Itens,
   * UserTrip, Despesas, Receitas, Agenda) NÃO repetem essa coluna de propósito: elas chegam pelo
   * `trip_id`, e duplicar o ambiente criaria duas fontes de verdade que podem divergir. */
  ambiente_id: string;
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
  /** Chuva (mm) e vento máximo (km/h) do dia - previsão real (Open-Meteo, até 16 dias à frente)
   * ou média histórica dos últimos anos, mesma fonte/regra de temp_min/temp_max (ver
   * `lib/weather.ts`). Vazio se `pernoite` não tiver cidade preenchida ainda. */
  chuva_mm: string;
  vento_kmh: string;
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
  /** Dono. Vazio = linha legada de quando a lista era global do sistema - continua resolvendo o
   * nome nos Itens antigos que apontam pra ela, mas não entra na lista de nenhum usuário. */
  user_id: string;
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
  /** Nome do idioma principal do país (mledoze, em inglês - ex.: "Spanish", "Japanese") - mesmo
   * padrão de `currency_name`, que também vem em inglês da mesma fonte. */
  language: string;
  /** Cotação de 1 unidade da moeda do país em Real, na data de `rate_date` (yyyy-MM-dd). */
  rate_brl: string;
  rate_date: string;
}

/**
 * Categoria de um Item de viagem. Natureza financeira é FIXA por categoria (não é um campo que o
 * usuário escolhe, ao contrário do antigo `Natureza` de Despesas): 1-5 são sempre débito, Repasse
 * é sempre crédito, Documento/Outro não têm campo financeiro nenhum - ver `categoriaNatureza`.
 */
export type CategoriaItem =
  | "traslado"
  | "passagem"
  | "hospedagem"
  | "alimentacao"
  | "atrativo"
  | "repasse"
  | "documento"
  | "outro";

export const CATEGORIAS_ITEM: { value: CategoriaItem; label: string }[] = [
  { value: "traslado", label: "Traslado" },
  { value: "passagem", label: "Passagem" },
  { value: "hospedagem", label: "Hospedagem" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "atrativo", label: "Atrativo" },
  { value: "repasse", label: "Repasse" },
  { value: "documento", label: "Documentos" },
  { value: "outro", label: "Outros" },
];

/** Débito, crédito, ou `null` se a categoria não tem campo financeiro (Documento/Outro). */
export function categoriaNatureza(categoria: CategoriaItem): Natureza | null {
  if (categoria === "repasse") return "credito";
  if (categoria === "documento" || categoria === "outro") return null;
  return "debito";
}

/** Categorias com campo financeiro (valor/pagador/meio de pagamento) - as outras duas (Documento
 * e Outro) são só anexo+URL+descrição. */
export const CATEGORIAS_ITEM_FINANCEIRAS = new Set<CategoriaItem>([
  "traslado",
  "passagem",
  "hospedagem",
  "alimentacao",
  "atrativo",
  "repasse",
]);

export interface ItemRow {
  [key: string]: string;
  id: string;
  trip_id: string;
  categoria: CategoriaItem;
  /** Subtipo, varia por categoria: traslado/passagem = meio de transporte (ônibus, van, carro,
   * avião, embarcação, trem); atrativo = excursão/ingresso. Vazio nas demais categorias. */
  tipo: string;
  localizador: string;
  nome_companhia: string;
  numero: string;
  /** Data/horário canônicos do item, sempre obrigatórios (usados pra ordenar a visão Agenda) -
   * em Traslado/Passagem/Hospedagem/Alimentação/Atrativo é preenchido junto com `data_inicio`;
   * nas demais categorias (Repasse/Documento/Outro, que não têm início/fim) é digitado direto. */
  data: string;
  horario: string;
  origem: string;
  destino: string;
  /** Nome do estabelecimento (hospedagem/alimentação). */
  nome_local: string;
  endereco: string;
  /** Início/fim do item - o RÓTULO muda conforme a categoria (Partida/Chegada em Traslado e
   * Passagem, Check-in/Check-out em Hospedagem e Alimentação, Início/Término em Atrativo), mas é
   * o mesmo par de colunas nas 5 categorias que têm essa noção - evita duplicar campo por
   * categoria só pra trocar o nome. */
  data_inicio: string;
  hora_inicio: string;
  data_fim: string;
  hora_fim: string;
  /** Categoria "documento": Taxa, Pedágio, RG, CPF, Passaporte, Visto, CNH, PID, Seguro, Cartão
   * de Vacina - lista livre, não um enum fechado no schema (nomes podem crescer sem migração). */
  tipo_documento: string;
  /** Usuário (colaborador da viagem) a quem o documento pertence - só na categoria "documento". */
  passageiro_id: string;
  url: string;
  anexo_file_id: string;
  anexo_nome: string;
  anexo_url: string;
  descricao: string;
  /** Vazio se o item não tem valor lançado (comum em Documento/Outro, e possível em qualquer
   * categoria financeira sem custo, ex. atrativo gratuito). */
  valor: string;
  /** Situação de pagamento - só relevante nas categorias com `valor` (ver
   * `CATEGORIAS_ITEM_FINANCEIRAS`). Vazio nas demais e em linhas antigas sem essa coluna. */
  status: "pago" | "a_pagar" | "";
  /** Calculado a partir da categoria no momento da criação (ver `categoriaNatureza`), não um
   * campo livre - guardado na linha só pra não recalcular toda leitura do relatório. */
  natureza: Natureza | "";
  data_pagamento: string;
  pagador_id: string;
  meio_pagamento_id: string;
  criado_por: string;
  criado_em: string;
}

/** Anexo ADICIONAL de um Item - o principal continua vivendo em `anexo_file_id`/`anexo_nome`/
 * `anexo_url` da própria linha de Itens (é o único que a tela oferece "Analisar voucher"); esta
 * tabela existe só pros extras que o usuário anexa depois, sem opção de análise. */
export interface ItemAnexoRow {
  [key: string]: string;
  id: string;
  item_id: string;
  trip_id: string;
  file_id: string;
  nome: string;
  url: string;
  criado_por: string;
  criado_em: string;
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
