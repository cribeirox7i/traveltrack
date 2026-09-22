#!/usr/bin/env node
// Migra o cadastro de Itens pra reforma de 2026-09-21 (Data/Classificação/Subclassificação/
// Descrição/Anexo no topo + acordeões Financeiro/Roteiro com checkbox):
//   1. garante a estrutura nova (ensureStructure - abas Classificacoes/Subclassificacoes/Anexos +
//      colunas novas de Itens).
//   2. semeia Classificacoes/Subclassificacoes a partir do enum fixo antigo (Traslado, Passagem,
//      Hospedagem, Alimentação, Atrativo, Repasse - NÃO cria Documento/Outro, que saíram do
//      cadastro) - só pra todo Item antigo ter uma classificação real pra apontar; o admin edita/
//      renomeia/adiciona depois pela tela /admin/classificacoes.
//   3. pra cada Item ainda sem `classificacao_id`: resolve classificacao_id (Documento/Outro viram
//      Atrativo, por decisão do usuário) e subclassificacao_id a partir do `categoria`/`tipo`
//      antigos; calcula `financeiro_ativo` (true se já tinha `valor`) e `roteiro_ativo` (true se
//      já tinha `data_inicio`/`hora_inicio`) - pelo menos um dos dois fica true em todo item
//      migrado (documento/outro sem nenhum dos dois ganham roteiro_ativo=true, só pra não sumir
//      de lugar nenhum).
//
// É IDEMPOTENTE: só mexe em classificação que falta e em Item ainda sem `classificacao_id`. Rode
// quantas vezes quiser.
//
// Uso: npm run migrate-itens-classificacao
//
// PRÉ-REQUISITO: Codigo.gs publicado com as colunas/abas novas (rode o ritual antes).

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

// Mesmo enum/rótulos de src/lib/sheets/types.ts (CATEGORIAS_ITEM) - documento/outro ficam de fora
// de propósito (saíram do cadastro, viraram a aba solta Anexos).
// `icone`/`iconeSubs` restauram os emojis que a tela usava antes da classificação virar dado
// livre (CATEGORIA_ICONE/TIPO_TRANSPORTE_ICONE, removidos do código - ver scripts/
// seed-icones-classificacao.js, que faz o mesmo preenchimento pra quem já rodou esta migração
// antes da coluna `icone` existir).
const CLASSIFICACOES_SEED = [
  { categoria: "traslado", nome: "Traslado", icone: "🚐", subs: ["Ônibus", "Van", "Carro", "Outros"], iconeSubs: { "Ônibus": "🚌", Van: "🚐", Carro: "🚗" } },
  { categoria: "passagem", nome: "Passagem", icone: "✈️", subs: ["Ônibus", "Van", "Carro", "Avião", "Embarcação", "Trem"], iconeSubs: { "Ônibus": "🚌", Van: "🚐", Carro: "🚗", "Avião": "✈️", "Embarcação": "🚢", Trem: "🚆" } },
  { categoria: "hospedagem", nome: "Hospedagem", icone: "🏨", subs: [] },
  { categoria: "alimentacao", nome: "Alimentação", icone: "🍽️", subs: [] },
  { categoria: "atrativo", nome: "Atrativo", icone: "🗼", subs: ["Excursão", "Ingresso", "Bar", "Ponto Turístico"] },
  { categoria: "repasse", nome: "Repasse", icone: "💸", subs: [] },
];

async function main() {
  const { APPS_SCRIPT_URL, APPS_SCRIPT_SHARED_SECRET } = process.env;
  if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SHARED_SECRET) {
    console.error("Defina APPS_SCRIPT_URL e APPS_SCRIPT_SHARED_SECRET em .env.local.");
    process.exit(1);
  }

  await callAppsScript("ensureStructure", {});
  console.log("Estrutura verificada.");

  // ---------- 1. semear Classificacoes/Subclassificacoes ----------
  let classificacoes = await callAppsScript("read", { tab: "Classificacoes" });
  const idPorCategoria = {};
  let criadasClass = 0;
  for (const seed of CLASSIFICACOES_SEED) {
    let row = classificacoes.find(
      (c) => (c.nome || "").trim().toLowerCase() === seed.nome.toLowerCase()
    );
    if (!row) {
      row = {
        id: crypto.randomUUID(),
        nome: seed.nome,
        ativo: "true",
        criado_em: new Date().toISOString(),
        icone: seed.icone || "",
      };
      await callAppsScript("append", { tab: "Classificacoes", rows: [row] });
      classificacoes.push(row);
      criadasClass++;
    }
    idPorCategoria[seed.categoria] = row.id;
  }
  console.log(`Classificações: ${criadasClass} criadas, ${CLASSIFICACOES_SEED.length - criadasClass} já existiam.`);

  let subclassificacoes = await callAppsScript("read", { tab: "Subclassificacoes" });
  const idPorCategoriaETipo = {};
  let criadasSub = 0;
  for (const seed of CLASSIFICACOES_SEED) {
    const classificacaoId = idPorCategoria[seed.categoria];
    for (const nomeSub of seed.subs) {
      let row = subclassificacoes.find(
        (s) =>
          s.classificacao_id === classificacaoId &&
          (s.nome || "").trim().toLowerCase() === nomeSub.toLowerCase()
      );
      if (!row) {
        row = {
          id: crypto.randomUUID(),
          classificacao_id: classificacaoId,
          nome: nomeSub,
          ativo: "true",
          criado_em: new Date().toISOString(),
          icone: (seed.iconeSubs && seed.iconeSubs[nomeSub]) || "",
        };
        await callAppsScript("append", { tab: "Subclassificacoes", rows: [row] });
        subclassificacoes.push(row);
        criadasSub++;
      }
      idPorCategoriaETipo[`${seed.categoria}::${nomeSub.toLowerCase()}`] = row.id;
    }
  }
  console.log(`Subclassificações: ${criadasSub} criadas.`);

  // ---------- 2. migrar Itens ----------
  const itens = await callAppsScript("read", { tab: "Itens" });
  const pendentes = itens.filter((i) => !i.classificacao_id);
  const updates = [];
  for (const item of pendentes) {
    // documento/outro (saíram do cadastro) viram Atrativo, por decisão do usuário.
    const categoriaEfetiva =
      item.categoria === "documento" || item.categoria === "outro" ? "atrativo" : item.categoria;
    const classificacaoId = idPorCategoria[categoriaEfetiva];
    if (!classificacaoId) {
      console.warn(`Item ${item.id}: categoria "${item.categoria}" sem mapeamento - pulado.`);
      continue;
    }
    const subclassificacaoId =
      idPorCategoriaETipo[`${categoriaEfetiva}::${(item.tipo || "").toLowerCase()}`] || "";

    const financeiroAtivo = item.valor ? "true" : "false";
    const roteiroAtivo = item.data_inicio || item.hora_inicio ? "true" : "false";
    // Nenhum dos dois preenchido (documento/outro sem data de início/fim) - entra em Roteiro por
    // padrão, só pra não ficar invisível em lugar nenhum (regra "pelo menos um" é só pra item NOVO).
    const roteiroFinal = financeiroAtivo === "false" && roteiroAtivo === "false" ? "true" : roteiroAtivo;

    updates.push({
      id: item.id,
      patch: {
        classificacao_id: classificacaoId,
        subclassificacao_id: subclassificacaoId,
        financeiro_ativo: financeiroAtivo,
        roteiro_ativo: roteiroFinal,
      },
    });
  }

  if (updates.length) {
    // Em lotes de 50 pra não estourar o corpo da requisição.
    for (let i = 0; i < updates.length; i += 50) {
      await callAppsScript("updateManyById", { tab: "Itens", updates: updates.slice(i, i + 50) });
    }
  }
  console.log(`Itens: ${updates.length} migrados, ${itens.length - pendentes.length} já estavam ok.`);

  console.log("\nMigração concluída.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
