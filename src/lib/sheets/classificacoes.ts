import { v4 as uuid } from "uuid";
import { appendRows, readSheet, updateRow } from "./repository";
import { ClassificacaoRow, SubclassificacaoRow } from "./types";

/**
 * Taxonomia do cadastro de Itens (classificação/subclassificação, ver comentário em
 * `ClassificacaoRow`/`SubclassificacaoRow`). Mesmo padrão de `ambientes.ts`: sem DELETE de
 * propósito, só `ativo`, pra nunca deixar um Item apontando pra uma linha que sumiu.
 */

export async function listClassificacoes(): Promise<ClassificacaoRow[]> {
  const todas = await readSheet<ClassificacaoRow>("Classificacoes");
  return todas.sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function getClassificacao(id: string): Promise<ClassificacaoRow | null> {
  if (!id) return null;
  const todas = await listClassificacoes();
  return todas.find((c) => c.id === id) ?? null;
}

export async function createClassificacao(nome: string, icone?: string): Promise<ClassificacaoRow> {
  const todas = await listClassificacoes();
  const jaExiste = todas.some((c) => c.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  if (jaExiste) throw new Error("Já existe uma classificação com este nome");

  const row: ClassificacaoRow = {
    id: uuid(),
    nome: nome.trim(),
    ativo: "true",
    criado_em: new Date().toISOString(),
    icone: (icone ?? "").trim(),
  };
  await appendRows("Classificacoes", [row]);
  return row;
}

export async function updateClassificacao(
  id: string,
  patch: { nome?: string; ativo?: boolean; icone?: string }
): Promise<void> {
  const stringPatch: Record<string, string> = {};

  if (patch.nome !== undefined) {
    const todas = await listClassificacoes();
    const conflito = todas.find(
      (c) => c.id !== id && c.nome.trim().toLowerCase() === patch.nome!.trim().toLowerCase()
    );
    if (conflito) throw new Error("Já existe uma classificação com este nome");
    stringPatch.nome = patch.nome.trim();
  }

  if (patch.ativo !== undefined) stringPatch.ativo = patch.ativo ? "true" : "false";
  if (patch.icone !== undefined) stringPatch.icone = patch.icone.trim();

  await updateRow("Classificacoes", id, stringPatch);
}

export async function listSubclassificacoes(
  classificacaoId?: string
): Promise<SubclassificacaoRow[]> {
  const todas = await readSheet<SubclassificacaoRow>("Subclassificacoes");
  return todas
    .filter((s) => !classificacaoId || s.classificacao_id === classificacaoId)
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function getSubclassificacao(id: string): Promise<SubclassificacaoRow | null> {
  if (!id) return null;
  const todas = await listSubclassificacoes();
  return todas.find((s) => s.id === id) ?? null;
}

export async function createSubclassificacao(
  classificacaoId: string,
  nome: string,
  icone?: string
): Promise<SubclassificacaoRow> {
  const irmas = await listSubclassificacoes(classificacaoId);
  const jaExiste = irmas.some((s) => s.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  if (jaExiste) throw new Error("Esta classificação já tem uma subclassificação com este nome");

  const row: SubclassificacaoRow = {
    id: uuid(),
    classificacao_id: classificacaoId,
    nome: nome.trim(),
    ativo: "true",
    criado_em: new Date().toISOString(),
    icone: (icone ?? "").trim(),
  };
  await appendRows("Subclassificacoes", [row]);
  return row;
}

export async function updateSubclassificacao(
  id: string,
  patch: { nome?: string; ativo?: boolean; icone?: string }
): Promise<void> {
  const stringPatch: Record<string, string> = {};

  if (patch.nome !== undefined) {
    const existente = await getSubclassificacao(id);
    if (existente) {
      const irmas = await listSubclassificacoes(existente.classificacao_id);
      const conflito = irmas.find(
        (s) => s.id !== id && s.nome.trim().toLowerCase() === patch.nome!.trim().toLowerCase()
      );
      if (conflito) throw new Error("Esta classificação já tem uma subclassificação com este nome");
    }
    stringPatch.nome = patch.nome.trim();
  }

  if (patch.ativo !== undefined) stringPatch.ativo = patch.ativo ? "true" : "false";
  if (patch.icone !== undefined) stringPatch.icone = patch.icone.trim();

  await updateRow("Subclassificacoes", id, stringPatch);
}
