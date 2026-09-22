#!/usr/bin/env node
// Preenche o ícone das Classificacoes/Subclassificacoes semeadas pela migração da reforma do
// cadastro de Itens (scripts/migrate-itens-classificacao.js), restaurando os emojis que a tela
// de Itens usava antes de a classificação virar dado livre do admin (CATEGORIA_ICONE/
// TIPO_TRANSPORTE_ICONE, removidos do código nessa reforma).
//
// IDEMPOTENTE: só preenche linha com `icone` ainda vazio (nunca sobrescreve o que o admin já
// tiver ajustado pela tela /admin/classificacoes). Rode quantas vezes quiser.
//
// Uso: npm run seed-icones-classificacao
//
// PRÉ-REQUISITO: Codigo.gs publicado com a coluna `icone` em Classificacoes/Subclassificacoes
// (rode o ritual antes - a mesma "Nova versão" de sempre).

async function callAppsScript(action, payload) {
  const res = await fetch(process.env.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: process.env.APPS_SCRIPT_SHARED_SECRET, action, payload }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Erro desconhecido no Apps Script");
  return json.data;
}

const ICONE_CLASSIFICACAO = {
  traslado: "🚐",
  passagem: "✈️",
  hospedagem: "🏨",
  "alimentação": "🍽️",
  atrativo: "🗼",
  repasse: "💸",
};

// Mesmo TIPO_TRANSPORTE_ICONE de antes da reforma - só se aplicava a Traslado/Passagem.
const ICONE_SUBCLASSIFICACAO = {
  "ônibus": "🚌",
  van: "🚐",
  carro: "🚗",
  "avião": "✈️",
  "embarcação": "🚢",
  trem: "🚆",
};

async function main() {
  const { APPS_SCRIPT_URL, APPS_SCRIPT_SHARED_SECRET } = process.env;
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SHARED_SECRET) {
    console.error("Defina APPS_SCRIPT_URL e APPS_SCRIPT_SHARED_SECRET em .env.local.");
    process.exit(1);
  }

  await callAppsScript("ensureStructure", {});
  console.log("Estrutura verificada.");

  const classificacoes = await callAppsScript("read", { tab: "Classificacoes" });
  const updatesClass = [];
  for (const c of classificacoes) {
    if (c.icone) continue;
    const icone = ICONE_CLASSIFICACAO[(c.nome || "").trim().toLowerCase()];
    if (icone) updatesClass.push({ id: c.id, patch: { icone } });
  }
  if (updatesClass.length) {
    await callAppsScript("updateManyById", { tab: "Classificacoes", updates: updatesClass });
  }
  console.log(`Classificações: ${updatesClass.length} atualizadas com ícone.`);

  const subclassificacoes = await callAppsScript("read", { tab: "Subclassificacoes" });
  const updatesSub = [];
  for (const s of subclassificacoes) {
    if (s.icone) continue;
    const icone = ICONE_SUBCLASSIFICACAO[(s.nome || "").trim().toLowerCase()];
    if (icone) updatesSub.push({ id: s.id, patch: { icone } });
  }
  if (updatesSub.length) {
    await callAppsScript("updateManyById", { tab: "Subclassificacoes", updates: updatesSub });
  }
  console.log(`Subclassificações: ${updatesSub.length} atualizadas com ícone.`);

  console.log("\nSeed concluído.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
