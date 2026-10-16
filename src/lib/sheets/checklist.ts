import { v4 as uuid } from "uuid";
import { appendRows, deleteRow, findRowById, readSheet, updateRow } from "./repository";
import { ChecklistRow } from "./types";

/** Campos que o cliente pode enviar num POST/PATCH de checklist - campos de servidor (`id`,
 * `trip_id`, `user_id`, `criado_em`) são descartados pelo Zod da rota. */
export const CHECKLIST_EDITABLE_FIELDS = [
  "descritivo",
  "data_alvo",
  "status",
] as const;

export async function listChecklistByTripAndUser(
  tripId: string,
  userId: string
): Promise<ChecklistRow[]> {
  const all = await readSheet<ChecklistRow>("Checklist");
  return all
    .filter((c) => c.trip_id === tripId && c.user_id === userId)
    .sort((a, b) => {
      // Pendentes primeiro, depois por data_alvo (vazio vai pro final), depois por criado_em.
      if (a.status !== b.status) return a.status === "true" ? 1 : -1;
      const da = a.data_alvo || "9999-99-99";
      const db = b.data_alvo || "9999-99-99";
      if (da !== db) return da.localeCompare(db);
      return a.criado_em.localeCompare(b.criado_em);
    });
}

export async function getChecklistItem(id: string): Promise<ChecklistRow | null> {
  return findRowById<ChecklistRow>("Checklist", id);
}

export async function createChecklistItem(input: {
  id?: string;
  tripId: string;
  userId: string;
  descritivo: string;
  data_alvo: string;
  criadoEm?: string;
}): Promise<ChecklistRow> {
  const row: ChecklistRow = {
    id: input.id || uuid(),
    trip_id: input.tripId,
    user_id: input.userId,
    descritivo: input.descritivo,
    data_alvo: input.data_alvo,
    status: "false",
    criado_em: input.criadoEm || new Date().toISOString(),
  };
  await appendRows("Checklist", [row]);
  return row;
}

export async function updateChecklistItem(
  id: string,
  patch: Partial<Record<(typeof CHECKLIST_EDITABLE_FIELDS)[number], string>>
): Promise<void> {
  await updateRow("Checklist", id, patch);
}

export async function deleteChecklistItem(id: string): Promise<void> {
  await deleteRow("Checklist", id);
}
