import { v4 as uuid } from "uuid";
import { appendRows, readSheet, updateRow } from "./repository";
import { ParametroRow } from "./types";

export async function listParametros(): Promise<ParametroRow[]> {
  return readSheet<ParametroRow>("Parametros");
}

export async function upsertParametro(input: {
  chave: string;
  valor: string;
  descricao?: string;
}): Promise<ParametroRow> {
  const all = await listParametros();
  const existing = all.find((p) => p.chave === input.chave);

  if (existing) {
    await updateRow("Parametros", existing.id, {
      valor: input.valor,
      descricao: input.descricao ?? existing.descricao,
    });
    return { ...existing, valor: input.valor, descricao: input.descricao ?? existing.descricao };
  }

  const row: ParametroRow = {
    id: uuid(),
    chave: input.chave,
    valor: input.valor,
    descricao: input.descricao ?? "",
  };
  await appendRows("Parametros", [row]);
  return row;
}
