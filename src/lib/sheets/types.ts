export type SheetTab =
  | "Users"
  | "Parametros"
  | "Trips"
  | "TripDays"
  | "UserTrip"
  | "Despesas"
  | "Receitas"
  | "MeiosPagamento";

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
  ],
  Receitas: ["id", "trip_id", "user_id", "valor", "data", "descricao"],
  MeiosPagamento: ["id", "nome", "ativo"],
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
  | "hospedagem";

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
}
