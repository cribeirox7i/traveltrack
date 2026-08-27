#!/usr/bin/env node
// Migra a base pré-multitenant pro conceito de Ambiente:
//   1. cria o ambiente inicial (default "Principal") se ainda não existir;
//   2. põe esse ambiente_id em todo User que estiver sem ambiente, EXCETO os admins
//      (admin é global de propósito - ver Role em src/lib/sheets/types.ts);
//   3. põe esse ambiente_id em toda Trip que estiver sem ambiente;
//   4. atribui os MeiosPagamento órfãos (sem user_id) ao usuário informado.
//
// É IDEMPOTENTE: rodar de novo não duplica nada nem sobrescreve valor já preenchido - ele só
// preenche o que está vazio. Rode quantas vezes quiser.
//
// Uso: npm run migrate-ambientes -- "email-do-dono-dos-meios@exemplo.com" ["Nome do Ambiente"]
//
// PRÉ-REQUISITO: o Codigo.gs publicado precisa já ter as colunas novas (aba Ambientes,
// Users.ambiente_id, Trips.ambiente_id, MeiosPagamento.user_id). Rode "Verificar/criar abas na
// planilha" em Admin > Config antes - senão os valores são gravados e somem em silêncio, porque
// não existe coluna onde cair.

const { randomUUID } = require("crypto");

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
  const [emailDono, nomeAmbiente = "Principal"] = process.argv.slice(2);

  if (!emailDono) {
    console.error(
      'Uso: npm run migrate-ambientes -- "email-do-dono-dos-meios@exemplo.com" ["Nome do Ambiente"]'
    );
    process.exit(1);
  }

  const { APPS_SCRIPT_URL, APPS_SCRIPT_SHARED_SECRET } = process.env;
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SHARED_SECRET) {
    console.error("Defina APPS_SCRIPT_URL e APPS_SCRIPT_SHARED_SECRET em .env.local.");
    process.exit(1);
  }

  // Garante as colunas/abas novas antes de tentar gravar nelas (aditivo, não mexe em dado).
  await callAppsScript("ensureStructure", {});
  console.log("Estrutura verificada.");

  // ---------- 1. ambiente inicial ----------
  const ambientes = await callAppsScript("read", { tab: "Ambientes" });
  let ambiente = ambientes.find(
    (a) => (a.nome || "").trim().toLowerCase() === nomeAmbiente.trim().toLowerCase()
  );

  if (ambiente) {
    console.log(`Ambiente "${ambiente.nome}" já existia (${ambiente.id}).`);
  } else {
    ambiente = {
      id: randomUUID(),
      nome: nomeAmbiente.trim(),
      ativo: "true",
      criado_em: new Date().toISOString(),
    };
    await callAppsScript("append", { tab: "Ambientes", rows: [ambiente] });
    console.log(`Ambiente "${ambiente.nome}" criado (${ambiente.id}).`);
  }

  // ---------- 2. usuários ----------
  const users = await callAppsScript("read", { tab: "Users" });
  const dono = users.find(
    (u) => (u.email || "").toLowerCase() === emailDono.toLowerCase()
  );
  if (!dono) {
    console.error(`Nenhum usuário com o email "${emailDono}" - confira e rode de novo.`);
    process.exit(1);
  }

  // Admin fica sem ambiente de propósito: ele navega em qualquer um pelo seletor.
  const usersSemAmbiente = users.filter((u) => !u.ambiente_id && u.role !== "admin");
  if (usersSemAmbiente.length) {
    await callAppsScript("updateManyById", {
      tab: "Users",
      updates: usersSemAmbiente.map((u) => ({
        id: u.id,
        patch: { ambiente_id: ambiente.id },
      })),
    });
  }
  const admins = users.filter((u) => u.role === "admin").length;
  console.log(
    `Usuários: ${usersSemAmbiente.length} movidos pro ambiente, ${admins} admin(s) deixados globais.`
  );

  // ---------- 3. viagens ----------
  const trips = await callAppsScript("read", { tab: "Trips" });
  const tripsSemAmbiente = trips.filter((t) => !t.ambiente_id);
  if (tripsSemAmbiente.length) {
    await callAppsScript("updateManyById", {
      tab: "Trips",
      updates: tripsSemAmbiente.map((t) => ({
        id: t.id,
        patch: { ambiente_id: ambiente.id },
      })),
    });
  }
  console.log(`Viagens: ${tripsSemAmbiente.length} movidas pro ambiente.`);

  // ---------- 4. meios de pagamento órfãos ----------
  const meios = await callAppsScript("read", { tab: "MeiosPagamento" });
  const meiosOrfaos = meios.filter((m) => !m.user_id);
  if (meiosOrfaos.length) {
    await callAppsScript("updateManyById", {
      tab: "MeiosPagamento",
      updates: meiosOrfaos.map((m) => ({ id: m.id, patch: { user_id: dono.id } })),
    });
  }
  console.log(
    `Meios de pagamento: ${meiosOrfaos.length} atribuídos a ${dono.nome} (${dono.email}).`
  );

  console.log("\nMigração concluída.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
