import type { TripStatus } from "../tripStatus";

export type SheetTab =
  | "Ambientes"
  | "Users"
  | "Parametros"
  | "Trips"
  | "TripDays"
  | "UserTrip"
  | "MeiosPagamento"
  | "Countries"
  | "Itens"
  | "Cambio"
  | "Classificacoes"
  | "Subclassificacoes"
  | "Anexos";

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
    "status",
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
  // `user_id` = dono do meio de pagamento (cada usuário tem a própria lista; o gestor cadastra
  // pros usuários comuns do ambiente dele). Linha antiga sem `user_id` é órfã - ainda resolve o
  // nome por id nos Itens que a referenciam, mas não aparece na lista de ninguém.
  MeiosPagamento: ["id", "nome", "ativo", "user_id"],
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
  // Tabela genérica que já substituiu Despesas/Receitas (removidas) e a Agenda (aba legada,
  // ainda existe na planilha mas sem leitor - ver migrate-agenda-para-itens.js): um item de
  // viagem com todos os campos possíveis numa linha só, e os dois interruptores Financeiro/
  // Roteiro decidindo qual subconjunto faz sentido mostrar (mesmo padrão de TripDays/Despesas).
  Itens: [
    "id",
    "trip_id",
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
    "url",
    "descricao",
    "valor",
    "status",
    "natureza",
    "data_pagamento",
    "pagador_id",
    "meio_pagamento_id",
    "criado_por",
    "criado_em",
    // Moeda em que `valor` está expresso (código ISO, ex.: "USD"). Vazio = BRL (reais - o
    // comportamento histórico). Só relevante nas categorias financeiras. Item em moeda
    // estrangeira é convertido pra R$ no Relatório pelo custo médio ponderado do Câmbio da
    // viagem (ver `computeRelatorio`), com queda pra cotação do dia (Countries.rate_brl) quando
    // não há câmbio daquela moeda.
    "moeda",
    // Reforma do cadastro (2026-09-21): classificação livre curada pelo admin (Classificacoes/
    // Subclassificacoes) e os dois interruptores Financeiro/Roteiro do formulário novo.
    "classificacao_id",
    "subclassificacao_id",
    "financeiro_ativo",
    "roteiro_ativo",
  ],
  // Operações de câmbio de uma viagem (comprar moeda estrangeira com reais) - ver menu Financeiro
  // > Câmbio. `taxa_efetiva` é R$ por 1 unidade da moeda, já com IOF/tarifas (uma taxa só, o
  // "custo efetivo da transação"). Não repete `ambiente_id` - chega pelo `trip_id`, igual às
  // outras abas filhas. Numa 2ª fase, o custo médio ponderado destes eventos converte itens em
  // moeda estrangeira para R$ no Relatório.
  Cambio: [
    "id",
    "trip_id",
    "data",
    "moeda",
    "qtd_moeda",
    "qtd_reais",
    "taxa_efetiva",
    "descricao",
    "criado_por",
    "criado_em",
  ],
  // Taxonomia do cadastro de Itens (reforma do formulário, ver ClassificacaoRow/
  // SubclassificacaoRow) - curada pelo admin em /admin/classificacoes. Nascem vazias, o admin
  // preenche depois.
  // `icone` é um emoji livre (ex. "🍽️") pro ícone do item na lista/Agenda voltar a ser
  // contextual mesmo com a classificação sendo dado livre do admin - vazio cai no ícone genérico
  // por acordeão (💰/🗺️/🧳, ver `IconeItem`).
  Classificacoes: ["id", "nome", "ativo", "criado_em", "icone"],
  // `classificacao_id` é a FK pra `Classificacoes.id` - uma subclassificação pertence a exatamente
  // uma classificação (ex. "Ônibus" só faz sentido dentro de "Traslado"). `icone` aqui SOBRESCREVE
  // o da classificação-mãe quando preenchido (ex. "Ônibus" = 🚌 em vez do 🚐 genérico de Traslado).
  Subclassificacoes: ["id", "classificacao_id", "nome", "ativo", "criado_em", "icone"],
  // Anexos da viagem, unificado (reforma 2026-09-24) - toda linha é um arquivo, esteja ele solto
  // (sem vínculo, `item_id` vazio - o antigo conceito de "aba Anexos") ou pendurado num Item
  // (`item_id` preenchido - antes dividido entre o "principal" na própria linha de Itens e os
  // extras na aba `ItemAnexos`; agora todos os anexos de um Item são iguais entre si, sem
  // destaque pro primeiro). `data`/`descricao` só fazem sentido pro solto, ficam vazios no de
  // Item. `trip_id` duplicado mesmo tendo `item_id` (quando presente) pelo motivo de sempre:
  // rota de download/exclusão confirma dono da pasta no Drive sem precisar buscar o item pai.
  Anexos: ["id", "trip_id", "item_id", "data", "descricao", "file_id", "nome", "url", "criado_por", "criado_em"],
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
  /** Só muda via `changeTripStartDate` - desloca a grade de TripDays (e os Itens de Roteiro)
   * inteira junto, pra `data_inicio` continuar sendo de fato a data do primeiro dia da grade. */
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
   * UserTrip) NÃO repetem essa coluna de propósito: elas chegam pelo
   * `trip_id`, e duplicar o ambiente criaria duas fontes de verdade que podem divergir. */
  ambiente_id: string;
  /** Status da viagem: `""` = automático (viagem com data_fim já passada conta como "concluida",
   * senão "planejada"); valor explícito (`planejada`/`concluida`/`cancelada`) vence o automático.
   * Viagem concluída ou cancelada fica bloqueada para edição - só este campo continua editável.
   * Ver `lib/tripStatus.ts` (`statusViagem`/`viagemBloqueada`). Linha antiga sem essa coluna é
   * tratada como automático. */
  status: TripStatus | "";
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
 * Débito (dinheiro saindo, ex.: uma diária de hotel) ou crédito (dinheiro entrando, ex.: um
 * aporte de alguém do grupo) - campo de um Item na aba `Itens` (categoria "financeiro").
 */
export type Natureza = "debito" | "credito";

export interface MeioPagamentoRow {
  [key: string]: string;
  id: string;
  nome: string;
  ativo: "true" | "false";
  /** Dono. Vazio = linha legada de quando a lista era global do sistema - continua resolvendo o
   * nome nos Itens antigos que apontam pra ela, mas não entra na lista de nenhum usuário. */
  user_id: string;
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

export interface ItemRow {
  [key: string]: string;
  id: string;
  trip_id: string;
  /** FK pra `Classificacoes.id`, curada pelo admin em /admin/classificacoes. */
  classificacao_id: string;
  /** FK pra `Subclassificacoes.id`. Opcional (nem toda classificação precisa de
   * subclassificação). */
  subclassificacao_id: string;
  /** Os dois interruptores do formulário reformulado: um item pode ser só financeiro, só roteiro,
   * ou os dois - pelo menos um precisa ser `"true"` pra salvar (ver zod da rota). Roteiro > Agenda
   * só lista item com `roteiro_ativo === "true"`. Linha antiga (migrada) tem os dois calculados a
   * partir do que já tinha preenchido - ver script de migração. */
  financeiro_ativo: "true" | "false";
  roteiro_ativo: "true" | "false";
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
  url: string;
  descricao: string;
  /** Vazio se o item não tem valor lançado (comum em Documento/Outro, e possível em qualquer
   * categoria financeira sem custo, ex. atrativo gratuito). */
  valor: string;
  /** Situação de pagamento - só relevante com `financeiro_ativo === "true"`. Vazio nas demais e
   * em linhas antigas sem essa coluna. */
  status: "pago" | "a_pagar" | "";
  /** Débito ou crédito - campo explícito do acordeão Financeiro (default "debito"), não mais
   * calculado a partir da categoria (essa era fixa por categoria; classificação agora é dado
   * livre do admin, não dá mais pra inferir). Vazio numa linha sem `financeiro_ativo`. */
  natureza: Natureza | "";
  data_pagamento: string;
  pagador_id: string;
  meio_pagamento_id: string;
  criado_por: string;
  criado_em: string;
  /** Código ISO da moeda de `valor` (ex.: "USD", "EUR"). Vazio/"BRL" = reais. Ver comentário em
   * `SHEET_HEADERS.Itens`. */
  moeda: string;
}

/**
 * Um anexo da viagem (aba `Anexos`, unificada 2026-09-24) - todo arquivo anexado, esteja ele
 * solto (`item_id` vazio - documento qualquer sem precisar criar um Item) ou pendurado num Item
 * (`item_id` preenchido - qualquer anexo daquele Item, sem distinção de "principal"; todos podem
 * ser analisados via Gemini). `data`/`descricao` só fazem sentido pro solto, ficam vazios no de
 * Item. Sobe pro Drive pela mesma `uploadDriveFile` (categoria fixa "outros" - a organização por
 * pasta do Drive não importa mais aqui).
 */
export interface AnexoRow {
  [key: string]: string;
  id: string;
  trip_id: string;
  item_id: string;
  data: string;
  descricao: string;
  file_id: string;
  nome: string;
  url: string;
  criado_por: string;
  criado_em: string;
}

/**
 * Uma operação de câmbio da viagem: você comprou `qtd_moeda` de `moeda` pagando `qtd_reais`, a uma
 * `taxa_efetiva` (R$ por unidade, já com IOF/tarifas - é o "custo efetivo" e o "custo unitário" ao
 * mesmo tempo, uma taxa só). O app não deriva nada: os três números são digitados. A tela mostra
 * `qtd_reais / qtd_moeda` só como conferência.
 */
export interface CambioRow {
  [key: string]: string;
  id: string;
  trip_id: string;
  /** Data da operação (yyyy-MM-dd). */
  data: string;
  /** Código ISO da moeda comprada, em maiúsculas (ex.: "USD", "EUR", "ARS"). */
  moeda: string;
  qtd_moeda: string;
  qtd_reais: string;
  taxa_efetiva: string;
  descricao: string;
  criado_por: string;
  criado_em: string;
}

/**
 * Uma classificação do cadastro de Itens (ex.: "Passagem", "Hospedagem") - lista curada pelo
 * admin (tela /admin/classificacoes), igual em espírito a `Ambientes`. Sem exclusão de propósito
 * (mesmo motivo de Ambientes: um Item já apontando pra uma classificação apagada ficaria órfão) -
 * só `ativo: false` tira das opções de cadastro sem apagar o que já existe.
 */
export interface ClassificacaoRow {
  [key: string]: string;
  id: string;
  nome: string;
  ativo: "true" | "false";
  criado_em: string;
  /** Emoji livre pro ícone do item na lista/Agenda (ex. "🍽️") - vazio cai no ícone genérico por
   * acordeão (💰/🗺️/🧳). */
  icone: string;
}

/**
 * Uma subclassificação (ex.: "Ônibus" dentro de "Traslado") - sempre presa a UMA classificação via
 * `classificacao_id` (FK pra `ClassificacaoRow.id`). Mesma regra de `ativo` sem exclusão.
 */
export interface SubclassificacaoRow {
  [key: string]: string;
  id: string;
  classificacao_id: string;
  nome: string;
  ativo: "true" | "false";
  criado_em: string;
  /** Sobrescreve o ícone da classificação-mãe quando preenchido (ex. "Ônibus" = 🚌). */
  icone: string;
}
