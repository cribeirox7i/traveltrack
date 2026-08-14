#!/usr/bin/env node
// Script único para criar o primeiro usuário (normalmente admin) direto na planilha,
// já que o app não tem outra forma de criar o primeiro usuário sem já estar logado.
//
// Uso: node --env-file=.env.local scripts/create-admin.js "Nome" "email@exemplo.com" "senha123" admin

const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");

async function callAppsScript(url, secret, action, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, action, payload }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Erro desconhecido no Apps Script");
  return json.data;
}

async function main() {
  const [nome, email, senha, role = "admin"] = process.argv.slice(2);

  if (!nome || !email || !senha) {
    console.error(
      'Uso: node --env-file=.env.local scripts/create-admin.js "Nome" "email@exemplo.com" "senha123" [admin|user]'
    );
    process.exit(1);
  }

  const { APPS_SCRIPT_URL, APPS_SCRIPT_SHARED_SECRET } = process.env;
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SHARED_SECRET) {
    console.error("Defina APPS_SCRIPT_URL e APPS_SCRIPT_SHARED_SECRET em .env.local.");
    process.exit(1);
  }

  const senha_hash = await bcrypt.hash(senha, 10);
  const row = { id: randomUUID(), nome, email, senha_hash, role, ativo: "true" };

  await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SHARED_SECRET, "ensureStructure", {});
  await callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SHARED_SECRET, "append", {
    tab: "Users",
    rows: [row],
  });

  console.log(`Usuário "${nome}" (${email}) criado como "${role}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
