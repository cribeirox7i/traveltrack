import { readSheet } from "./repository";
import { EletricRow } from "./types";

/** Tabela de referência (voltagem/tomada por país), mantida manualmente pelo usuário direto na
 * planilha - lê a aba inteira, sem filtro por viagem (não é dado por viagem). */
export async function listEletric(): Promise<EletricRow[]> {
  return readSheet<EletricRow>("Eletric");
}
