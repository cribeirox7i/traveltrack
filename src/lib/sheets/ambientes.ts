import { v4 as uuid } from "uuid";
import { appendRows, readSheet, updateRow } from "./repository";
import { AmbienteRow } from "./types";

/**
 * Ambientes são os tenants do sistema: cada um tem seus próprios usuários e viagens, e ninguém
 * enxerga dado de outro ambiente. Só o admin global gerencia esta tabela - gestor e usuário comum
 * nem sabem que ela existe (ficam presos ao `ambiente_id` da própria linha em Users).
 */
export async function listAmbientes(): Promise<AmbienteRow[]> {
  return readSheet<AmbienteRow>("Ambientes");
}

export async function getAmbiente(id: string): Promise<AmbienteRow | null> {
  if (!id) return null;
  const todos = await listAmbientes();
  return todos.find((a) => a.id === id) ?? null;
}

export async function createAmbiente(nome: string): Promise<AmbienteRow> {
  const todos = await listAmbientes();
  const jaExiste = todos.some((a) => a.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  if (jaExiste) throw new Error("Já existe um ambiente com este nome");

  const row: AmbienteRow = {
    id: uuid(),
    nome: nome.trim(),
    ativo: "true",
    criado_em: new Date().toISOString(),
  };
  await appendRows("Ambientes", [row]);
  return row;
}

export async function updateAmbiente(
  id: string,
  patch: { nome?: string; ativo?: boolean }
): Promise<void> {
  const stringPatch: Record<string, string> = {};

  if (patch.nome !== undefined) {
    const todos = await listAmbientes();
    const conflito = todos.find(
      (a) => a.id !== id && a.nome.trim().toLowerCase() === patch.nome!.trim().toLowerCase()
    );
    if (conflito) throw new Error("Já existe um ambiente com este nome");
    stringPatch.nome = patch.nome.trim();
  }

  if (patch.ativo !== undefined) stringPatch.ativo = patch.ativo ? "true" : "false";

  await updateRow("Ambientes", id, stringPatch);
}
