#!/usr/bin/env node
// Canoniza Itens sobre a Agenda (2026-09-25): migra as linhas da aba Agenda (legada, só um
// caminho ainda escreve nela - SugestaoAgendaModal) pra Itens (roteiro_ativo=true).
//
//   1. garante uma Classificação "Compromisso" (não existia - as 6 da reforma de 21/9 são todas
//      de despesa/receita, nenhuma serve pra "jantar", "reunião", etc. da Agenda).
//   2. pra cada linha de Agenda: cria um Item com o MESMO id (mesmo gerador uuid v4 nas duas
//      abas, sem risco de colisão) - titulo vira nome_local (é o campo que a tela usa como
//      resumo/título na lista, ver resumoItem em agenda/page.tsx), descricao/data/horario/url
//      copiados direto, classificacao_id = Compromisso, roteiro_ativo=true.
//   3. se a linha tiver anexo_file_id: cria a linha correspondente na aba Anexos unificada, com
//      item_id apontando pro novo Item (mesmo formato de migrate-anexos-unificado.js).
//
// NÃO apaga a aba Agenda nem os dados nela - só copia pra frente. Idempotente: pula toda linha de
// Agenda cujo id já exista em Itens.
//
// Uso: npm run migrate-agenda-para-itens
//
// PRÉ-REQUISITO: Codigo.gs publicado com a estrutura atual (rode ensureStructure antes/depois, é
// aditivo).

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

  // ---------- 1. garantir Classificação "Compromisso" ----------
  const classificacoes = await callAppsScript("read", { tab: "Classificacoes" });
  let compromisso = classificacoes.find(
    (c) => (c.nome || "").trim().toLowerCase() === "compromisso"
  );
  if (!compromisso) {
    compromisso = {
      id: crypto.randomUUID(),
      nome: "Compromisso",
      ativo: "true",
      criado_em: new Date().toISOString(),
      icone: "📅",
    };
    await callAppsScript("append", { tab: "Classificacoes", rows: [compromisso] });
    console.log("Classificação \"Compromisso\" criada.");
  } else {
    console.log("Classificação \"Compromisso\" já existia.");
  }

  // ---------- 2. migrar linhas de Agenda pra Itens ----------
  const agenda = await callAppsScript("read", { tab: "Agenda" });
  const itensExistentes = await callAppsScript("read", { tab: "Itens" });
  const idsJaMigrados = new Set(itensExistentes.map((i) => i.id));

  const pendentes = agenda.filter((a) => !idsJaMigrados.has(a.id));
  const novosItens = pendentes.map((a) => ({
    id: a.id,
    trip_id: a.trip_id,
    localizador: "",
    nome_companhia: "",
    numero: "",
    data: a.data || "",
    horario: a.horario || "",
    origem: "",
    destino: "",
    nome_local: a.titulo || "",
    endereco: "",
    data_inicio: "",
    hora_inicio: "",
    data_fim: "",
    hora_fim: "",
    url: a.url || "",
    descricao: a.descricao || "",
    valor: "",
    status: "",
    natureza: "",
    data_pagamento: "",
    pagador_id: "",
    meio_pagamento_id: "",
    criado_por: a.criado_por || "",
    criado_em: a.criado_em || new Date().toISOString(),
    moeda: "",
    classificacao_id: compromisso.id,
    subclassificacao_id: "",
    financeiro_ativo: "false",
    roteiro_ativo: "true",
  }));

  if (novosItens.length) {
    for (let i = 0; i < novosItens.length; i += 50) {
      await callAppsScript("append", { tab: "Itens", rows: novosItens.slice(i, i + 50) });
    }
  }
  console.log(
    `Itens criados a partir da Agenda: ${novosItens.length} (${agenda.length - pendentes.length} já estavam migrados).`
  );

  // ---------- 3. migrar anexo de cada linha pra aba Anexos unificada ----------
  const anexosExistentes = await callAppsScript("read", { tab: "Anexos" });
  const fileIdsJaMigrados = new Set(anexosExistentes.map((a) => a.file_id));

  const novosAnexos = [];
  for (const a of pendentes) {
    if (!a.anexo_file_id || fileIdsJaMigrados.has(a.anexo_file_id)) continue;
    novosAnexos.push({
      id: crypto.randomUUID(),
      trip_id: a.trip_id,
      item_id: a.id,
      data: "",
      descricao: "",
      file_id: a.anexo_file_id,
      nome: a.anexo_nome || "",
      url: a.anexo_url || "",
      criado_por: a.criado_por || "",
      criado_em: a.criado_em || new Date().toISOString(),
    });
  }

  if (novosAnexos.length) {
    for (let i = 0; i < novosAnexos.length; i += 50) {
      await callAppsScript("append", { tab: "Anexos", rows: novosAnexos.slice(i, i + 50) });
    }
  }
  console.log(`Anexos migrados: ${novosAnexos.length}.`);

  console.log(
    "\nMigração concluída - a aba Agenda continua intacta, só sobra apagar depois de confirmar."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
