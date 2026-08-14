import { callAppsScript } from "./client";

/**
 * Garante que todas as abas esperadas existam na planilha, criando as que
 * faltarem e escrevendo a linha de cabeçalho. Não apaga nem sobrescreve
 * abas/linhas já existentes. A lógica real roda dentro do Apps Script
 * (ensureStructure em apps-script/Codigo.gs).
 */
export async function ensureSheetsStructure(): Promise<string[]> {
  const result = await callAppsScript<{ abasCriadas: string[] }>("ensureStructure");
  return result.abasCriadas;
}
