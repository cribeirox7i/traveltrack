#!/usr/bin/env node
// Migra a unificação de anexos (2026-09-24): move o anexo "principal" que morava na própria
// linha de Itens (anexo_file_id/anexo_nome/anexo_url) e os extras da aba ItemAnexos pra dentro
// da aba Anexos, unificada (ganhou a coluna item_id: vazio = solto, preenchido = pertence a um
// Item). Não apaga nada nas abas antigas - só copia pra frente. Idempotente: uma linha de Itens
// só migra se AINDA não existir um Anexo com aquele file_id (evita duplicar se rodar 2x).
//
// PRÉ-REQUISITO: Codigo.gs publicado com Anexos.item_id (rode ensureStructure antes/depois, é
// aditivo).
//
// Uso: npm run migrate-anexos-unificado

async function callAppsScript(action, payload) {
  const res = await fetch(process.env.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: process.env.APPS_SCRIPT_SHARED_SECRET,
      action,
      payload,
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Erro desconhecido no Apps Script");
  return json.data;
}

async function main() {
  const { APPS_SCRIPT_URL, APPS_SCRIPT_SHARED_SECRET } = process.env;
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SHARED_SECRET) {
    console.error("Defina APPS_SCRIPT_URL e APPS_SCRIPT_SHARED_SECRET em .env.local.");
    process.exit(1);
  }

  await callAppsScript("ensureStructure", {});
  console.log("Estrutura verificada.");

  const itens = await callAppsScript("read", { tab: "Itens" });
  const itemAnexos = await callAppsScript("read", { tab: "ItemAnexos" });
  const anexosExistentes = await callAppsScript("read", { tab: "Anexos" });
  const fileIdsJaMigrados = new Set(anexosExistentes.map((a) => a.file_id));

  const novasLinhas = [];

  for (const item of itens) {
    if (!item.anexo_file_id || fileIdsJaMigrados.has(item.anexo_file_id)) continue;
    novasLinhas.push({
      id: crypto.randomUUID(),
      trip_id: item.trip_id,
      item_id: item.id,
      data: "",
      descricao: "",
      file_id: item.anexo_file_id,
      nome: item.anexo_nome || "",
      url: item.anexo_url || "",
      criado_por: item.criado_por || "",
      criado_em: item.criado_em || new Date().toISOString(),
    });
  }

  for (const extra of itemAnexos) {
    if (!extra.file_id || fileIdsJaMigrados.has(extra.file_id)) continue;
    novasLinhas.push({
      id: extra.id,
      trip_id: extra.trip_id,
      item_id: extra.item_id,
      data: "",
      descricao: "",
      file_id: extra.file_id,
      nome: extra.nome || "",
      url: extra.url || "",
      criado_por: extra.criado_por || "",
      criado_em: extra.criado_em || new Date().toISOString(),
    });
  }

  if (novasLinhas.length) {
    // Em lotes de 50, mesmo padrão de migrate-itens-classificacao.js.
    for (let i = 0; i < novasLinhas.length; i += 50) {
      await callAppsScript("append", { tab: "Anexos", rows: novasLinhas.slice(i, i + 50) });
    }
  }

  console.log(`Anexos migrados: ${novasLinhas.length} (de ${itens.filter((i) => i.anexo_file_id).length} principais + ${itemAnexos.length} extras).`);
  console.log("\nMigração concluída - as colunas anexo_file_id/anexo_nome/anexo_url de Itens e a aba ItemAnexos continuam intactas, só sobra apagar depois de confirmar.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
