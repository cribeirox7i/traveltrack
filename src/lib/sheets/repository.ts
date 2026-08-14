import { callAppsScript } from "./client";
import { SheetTab } from "./types";

type RowObject = Record<string, string>;

/** Lê todas as linhas de uma aba, já convertidas pelo cabeçalho pelo Apps Script. */
export async function readSheet<T extends RowObject>(tab: SheetTab): Promise<T[]> {
  return callAppsScript<T[]>("read", { tab });
}

/** Adiciona uma ou mais linhas ao final da aba, numa única chamada. */
export async function appendRows(tab: SheetTab, rows: RowObject[]): Promise<void> {
  if (rows.length === 0) return;
  await callAppsScript<null>("append", { tab, rows });
}

/** Localiza a linha pelo id e sobrescreve com o patch informado (mescla com valores atuais). */
export async function updateRow(
  tab: SheetTab,
  id: string,
  patch: RowObject
): Promise<void> {
  await callAppsScript<null>("updateById", { tab, id, patch });
}

/** Igual a updateRow, mas aplica vários patches em uma única chamada ao Apps Script. */
export async function updateRows(
  tab: SheetTab,
  updates: { id: string; patch: RowObject }[]
): Promise<void> {
  if (updates.length === 0) return;
  await callAppsScript<null>("updateManyById", { tab, updates });
}

export async function deleteRow(tab: SheetTab, id: string): Promise<void> {
  await callAppsScript<null>("deleteById", { tab, id });
}

export async function findRowById<T extends RowObject>(
  tab: SheetTab,
  id: string
): Promise<T | null> {
  const all = await readSheet<T>(tab);
  return all.find((row) => row.id === id) ?? null;
}
