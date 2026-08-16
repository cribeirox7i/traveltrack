import { callAppsScript } from "./client";

/**
 * Garante que todas as abas esperadas existam na planilha, criando as que
 * faltarem e escrevendo a linha de cabeçalho — e, em abas já existentes,
 * acrescenta ao final do cabeçalho as colunas novas que ainda faltarem (ex.:
 * quando o app ganha um campo novo). Não apaga nem sobrescreve abas/linhas já
 * existentes. A lógica real roda dentro do Apps Script (ensureStructure em
 * apps-script/Codigo.gs).
 */
export interface EnsureStructureResult {
  abasCriadas: string[];
  colunasAdicionadas: Record<string, string[]>;
}

export async function ensureSheetsStructure(): Promise<EnsureStructureResult> {
  return callAppsScript<EnsureStructureResult>("ensureStructure");
}
