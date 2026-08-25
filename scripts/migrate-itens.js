#!/usr/bin/env node
// Copia Despesas + Receitas + Agenda de UMA viagem para a nova aba Itens. Não apaga as abas
// antigas nem altera nada nelas - só lê e grava linhas novas em Itens. Rode quantas vezes quiser
// numa viagem só de teste antes de confiar no resultado: reexecutar duplica as linhas (não há
// checagem de "já migrado"), então confira e, se precisar recomeçar, apague manualmente as linhas
// erradas em Itens antes de rodar de novo.
//
// Uso: node --env-file=.env.local scripts/migrate-itens.js <tripId>

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

// categoria de Despesas -> categoria de Itens (Passeio virou Atrativo, Aporte virou Repasse).
const CATEGORIA_DESPESA = {
  traslado: "traslado",
  passagem: "passagem",
  alimentacao: "alimentacao",
  passeio: "atrativo",
  hospedagem: "hospedagem",
  aporte: "repasse",
};

function itemBase(trip_id) {
  return {
    tipo: "",
    localizador: "",
    nome_companhia: "",
    numero: "",
    data: "",
    horario: "",
    origem: "",
    destino: "",
    nome_local: "",
    endereco: "",
    data_inicio: "",
    hora_inicio: "",
    data_fim: "",
    hora_fim: "",
    tipo_documento: "",
    passageiro_id: "",
    url: "",
    anexo_file_id: "",
    anexo_nome: "",
    anexo_url: "",
    descricao: "",
    valor: "",
    natureza: "",
    data_pagamento: "",
    pagador_id: "",
    meio_pagamento_id: "",
    criado_por: "",
    criado_em: new Date().toISOString(),
    trip_id,
  };
}

async function main() {
  const [tripId] = process.argv.slice(2);
  if (!tripId) {
    console.error("Uso: node --env-file=.env.local scripts/migrate-itens.js <tripId>");
    process.exit(1);
  }

  const { APPS_SCRIPT_URL, APPS_SCRIPT_SHARED_SECRET } = process.env;
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SHARED_SECRET) {
    console.error("Defina APPS_SCRIPT_URL e APPS_SCRIPT_SHARED_SECRET em .env.local.");
    process.exit(1);
  }
  const call = (action, payload) =>
    callAppsScript(APPS_SCRIPT_URL, APPS_SCRIPT_SHARED_SECRET, action, payload);

  await call("ensureStructure", {});

  const trips = await call("read", { tab: "Trips" });
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) {
    console.error(`Viagem "${tripId}" não encontrada na aba Trips.`);
    process.exit(1);
  }
  console.log(`Migrando viagem "${trip.nome}" (${tripId})...`);

  const [despesas, receitas, agenda] = await Promise.all([
    call("read", { tab: "Despesas" }),
    call("read", { tab: "Receitas" }),
    call("read", { tab: "Agenda" }),
  ]);

  const novasLinhas = [];
  let avisosNatureza = 0;

  for (const d of despesas.filter((d) => d.trip_id === tripId)) {
    const categoria = CATEGORIA_DESPESA[d.categoria] ?? "outro";
    if (categoria !== "repasse" && d.natureza === "credito") {
      avisosNatureza++;
      console.warn(
        `  ! Despesa ${d.id} (categoria "${d.categoria}") tem natureza "credito" mas não é aporte - migrada como débito (Itens não tem natureza livre por linha, ver decisão do plano). Confira manualmente.`
      );
    }
    novasLinhas.push({
      ...itemBase(tripId),
      id: d.id,
      categoria,
      data: d.data,
      descricao: d.descricao,
      valor: d.valor,
      natureza: categoria === "repasse" ? "credito" : "debito",
      data_pagamento: d.data,
      pagador_id: d.pagador_id,
      meio_pagamento_id: d.meio_pagamento_id,
      criado_por: d.lancado_por || "",
    });
  }

  for (const r of receitas.filter((r) => r.trip_id === tripId)) {
    novasLinhas.push({
      ...itemBase(tripId),
      id: r.id,
      categoria: "repasse",
      data: r.data,
      descricao: r.descricao,
      valor: r.valor,
      natureza: "credito",
      data_pagamento: r.data,
      pagador_id: r.credor_id,
      // Receitas legada não tinha meio de pagamento - fica em branco, revise se precisar.
      meio_pagamento_id: "",
    });
  }

  for (const a of agenda.filter((a) => a.trip_id === tripId)) {
    novasLinhas.push({
      ...itemBase(tripId),
      id: randomUUID(),
      categoria: "outro",
      data: a.data,
      horario: a.horario,
      url: a.url,
      anexo_file_id: a.anexo_file_id,
      anexo_nome: a.anexo_nome,
      anexo_url: a.anexo_url,
      // Item não tem campo "título" separado - dobra no início da descrição.
      descricao: a.descricao ? `${a.titulo} - ${a.descricao}` : a.titulo,
      criado_por: a.criado_por || "",
      criado_em: a.criado_em || new Date().toISOString(),
    });
  }

  if (novasLinhas.length) {
    await call("append", { tab: "Itens", rows: novasLinhas });
  }
  console.log(
    `Migradas: ${despesas.filter((d) => d.trip_id === tripId).length} despesa(s), ${
      receitas.filter((r) => r.trip_id === tripId).length
    } receita(s) legada(s), ${agenda.filter((a) => a.trip_id === tripId).length} compromisso(s) de agenda.`
  );
  if (avisosNatureza) {
    console.log(`${avisosNatureza} aviso(s) de natureza divergente acima - revise manualmente.`);
  }

  // Anexos soltos na pasta da viagem que não vieram grudados em nenhuma linha de Agenda (ver
  // decisão 7 do plano) - listados aqui, não migrados automaticamente.
  const anexosDaViagem = await call("driveListFiles", { tripId, tripName: trip.nome });
  const idsLigados = new Set(agenda.filter((a) => a.anexo_file_id).map((a) => a.anexo_file_id));
  const orfaos = anexosDaViagem.filter((f) => !idsLigados.has(f.fileId));
  if (orfaos.length) {
    console.log(`\n${orfaos.length} anexo(s) órfão(s) na pasta da viagem (não migrados para Itens):`);
    for (const f of orfaos) {
      console.log(`  - [${f.categoria}] ${f.name} (${f.fileId}) - ${f.url}`);
    }
    console.log("Vincule manualmente a um Item novo, ou deixe como está na pasta do Drive.");
  } else {
    console.log("\nNenhum anexo órfão encontrado na pasta da viagem.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
