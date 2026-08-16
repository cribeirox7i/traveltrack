/**
 * ===========================================================
 *  Viagens App — Codigo.gs
 *  Camada de acesso à planilha, publicada como Web App.
 *  Mesmo padrão usado no AromaLab: sem service account do Google
 *  Cloud, o script roda com a identidade de quem publicou o
 *  Web App (autorização feita uma vez no editor).
 * ===========================================================
 */

// ---------- CONFIGURAÇÃO ----------
// Se o script estiver vinculado (bound) à planilha, deixe SPREADSHEET_ID vazio
// e ele usará SpreadsheetApp.getActiveSpreadsheet(). Se for um script avulso,
// preencha com o ID da planilha (trecho entre /d/ e /edit na URL).
const SPREADSHEET_ID = '';

// Segredo compartilhado: gere uma string aleatória longa e cole aqui E também
// na variável de ambiente APPS_SCRIPT_SHARED_SECRET do Next.js/Vercel. Sem
// isso, qualquer pessoa que descobrir a URL /exec conseguiria ler/escrever
// na planilha (o Web App é publicado como "Qualquer pessoa", pois o Google
// não permite autenticação de servidor-a-servidor de outra forma aqui).
const SHARED_SECRET = 'TROQUE-ESTE-VALOR-POR-UM-SEGREDO-ALEATORIO';

// Estrutura esperada das abas (criadas/conferidas por ensureStructure)
const ESTRUTURA = {
  Users: ['id', 'nome', 'email', 'senha_hash', 'role', 'ativo'],
  Parametros: ['id', 'chave', 'valor', 'descricao'],
  Trips: ['id', 'nome', 'data_inicio', 'data_fim', 'qtd_pessoas', 'criado_por', 'criado_em'],
  TripDays: ['id', 'trip_id', 'data', 'origem', 'destino', 'pernoite', 'traslado_pp', 'passagem_pp', 'alimentacao_pp', 'passeio_pp', 'hospedagem_pp'],
  UserTrip: ['id', 'user_id', 'trip_id'],
  Despesas: ['id', 'trip_id', 'categoria', 'valor', 'data', 'lancado_por', 'descricao'],
  Receitas: ['id', 'trip_id', 'user_id', 'valor', 'data', 'descricao']
};

// ---------- PONTO DE ENTRADA DO WEB APP ----------
/**
 * Chamado servidor-a-servidor pelo Next.js, nunca direto pelo navegador do
 * usuário final — por isso pode ser um único POST simples, sem se preocupar
 * com CORS. Corpo esperado: {"secret": "...", "action": "...", "payload": {...}}.
 */
function doPost(e) {
  var resultado;
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SHARED_SECRET) {
      resultado = erro('Segredo inválido');
    } else {
      resultado = api(body.action, body.payload || {});
    }
  } catch (err) {
    resultado = erro(err && err.message ? err.message : String(err));
  }
  return ContentService.createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}

function api(action, payload) {
  try {
    switch (action) {
      case 'ensureStructure': return ok(ensureStructure());
      case 'read':            return ok(lerTabela(payload.tab));
      case 'append':           return ok(inserirLinhas(payload.tab, payload.rows || []));
      case 'updateById':       return ok(atualizarPorId(payload.tab, payload.id, payload.patch || {}));
      case 'updateManyById':   return ok(atualizarVariosPorId(payload.tab, payload.updates || []));
      case 'deleteById':       return ok(excluirPorId(payload.tab, payload.id));
      case 'resetTab':         return ok(resetarAba(payload.tab));
      default:                 return erro('Ação desconhecida: ' + action);
    }
  } catch (err) {
    return erro(err && err.message ? err.message : String(err));
  }
}

function ok(data) { return { ok: true, data: data }; }
function erro(msg) { return { ok: false, error: msg }; }

// ---------- ACESSO À PLANILHA ----------
function abrirPlanilha() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(nome) {
  const ss = abrirPlanilha();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    if (ESTRUTURA[nome]) {
      sh.getRange(1, 1, 1, ESTRUTURA[nome].length).setValues([ESTRUTURA[nome]]);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

/** Lê uma aba inteira e devolve as linhas como objetos {header: valor}. */
function lerTabela(nome) {
  const sh = getSheet(nome);
  const values = sh.getDataRange().getValues();
  const headers = (values[0] || []).map(String);
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const linha = values[r];
    if (linha.join('') === '') continue;
    const obj = {};
    headers.forEach(function (h, i) { if (h) obj[h] = sanitizarValor(linha[i]); });
    rows.push(obj);
  }
  return rows;
}

/**
 * Converte Date -> string segura para serialização em JSON e para regravação na planilha.
 * Datas "puras" (meia-noite no fuso da planilha, caso de todos os campos "data" deste app)
 * viram "yyyy-MM-dd"; qualquer outro Date (não deveria ocorrer aqui, mas por segurança)
 * cai para ISO completo.
 */
function sanitizarValor(v) {
  if (v instanceof Date) {
    const fuso = Session.getScriptTimeZone();
    const meiaNoite = Utilities.formatDate(v, fuso, 'HH:mm:ss') === '00:00:00';
    return meiaNoite
      ? Utilities.formatDate(v, fuso, 'yyyy-MM-dd')
      : v.toISOString();
  }
  return v === null || v === undefined ? '' : String(v);
}

/**
 * Acrescenta uma ou mais linhas, respeitando a ordem dos cabeçalhos da aba.
 * Ignora silenciosamente linhas cujo "id" já exista na aba: o Web App do
 * Apps Script às vezes executa a ação com sucesso mas devolve uma resposta
 * corrompida (erro do lado do Google, não do script) - o cliente reage a
 * isso reenviando a mesma chamada, e essa checagem evita duplicar a linha
 * nesse reenvio.
 */
function inserirLinhas(nome, rows) {
  if (!rows.length) return null;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet(nome);
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn() || ESTRUTURA[nome].length).getValues()[0];
    const idCol = headers.indexOf('id');
    const qtdLinhasDados = sh.getLastRow() - 1;
    const idsExistentes = (idCol === -1 || qtdLinhasDados < 1)
      ? []
      : sh.getRange(2, idCol + 1, qtdLinhasDados).getValues().map(function (r) { return String(r[0]); });

    const novasLinhas = rows.filter(function (obj) {
      return idCol === -1 || idsExistentes.indexOf(String(obj.id)) === -1;
    });
    if (!novasLinhas.length) return null;

    const valores = novasLinhas.map(function (obj) {
      return headers.map(function (h) { return (h in obj) ? obj[h] : ''; });
    });
    // Formato texto ('@') evita que o Sheets auto-converta strings de data
    // (ex.: "2026-09-10") em células do tipo Date, o que faria a leitura
    // posterior devolver um timestamp completo em vez do texto original.
    sh.getRange(sh.getLastRow() + 1, 1, valores.length, headers.length)
      .setNumberFormat('@')
      .setValues(valores);
  } finally {
    lock.releaseLock();
  }
  return null;
}

/** Localiza a linha pelo id e sobrescreve com o patch informado (mescla com valores atuais). */
function atualizarPorId(nome, id, patch) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet(nome);
    const values = sh.getDataRange().getValues();
    const headers = (values[0] || []).map(String);
    const idCol = headers.indexOf('id');
    if (idCol === -1) throw new Error('Aba "' + nome + '" não tem coluna "id"');

    let rowIndex = -1;
    for (let r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) { rowIndex = r; break; }
    }
    if (rowIndex === -1) throw new Error('Linha com id "' + id + '" não encontrada na aba ' + nome);

    const atual = values[rowIndex];
    const nova = headers.map(function (h, i) {
      return (h in patch) ? patch[h] : sanitizarValor(atual[i]);
    });
    sh.getRange(rowIndex + 1, 1, 1, headers.length).setNumberFormat('@').setValues([nova]);
  } finally {
    lock.releaseLock();
  }
  return null;
}

/**
 * Igual a atualizarPorId, mas para vários ids em uma única chamada: lê a
 * aba uma vez, aplica todos os patches em memória e grava tudo com uma
 * única chamada a setValues, em vez de um round-trip por linha. Usado pelo
 * botão "Salvar" da tela de diárias, para não fazer 1 chamada por dia.
 *
 * Importante: todo valor regravado (inclusive os campos que NÃO fazem parte
 * de nenhum patch, só "carregados" de volta) passa por sanitizarValor. Sem
 * isso, uma célula que o Sheets já tenha convertido para o tipo Date (ex.:
 * a coluna "data") seria regravada como objeto Date de novo em vez de texto,
 * mesmo com setNumberFormat('@') - o formato de exibição muda, mas o valor
 * gravado continua sendo reinterpretado como data.
 */
function atualizarVariosPorId(nome, updates) {
  if (!updates.length) return null;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet(nome);
    const values = sh.getDataRange().getValues();
    const headers = (values[0] || []).map(String);
    const idCol = headers.indexOf('id');
    if (idCol === -1) throw new Error('Aba "' + nome + '" não tem coluna "id"');

    const patchPorId = {};
    updates.forEach(function (u) { patchPorId[String(u.id)] = u.patch || {}; });

    for (let r = 1; r < values.length; r++) {
      const patch = patchPorId[String(values[r][idCol])];
      if (!patch) continue;
      headers.forEach(function (h, c) { if (h in patch) values[r][c] = patch[h]; });
    }

    if (values.length > 1) {
      const linhasSanitizadas = values.slice(1).map(function (linha) {
        return linha.map(sanitizarValor);
      });
      sh.getRange(2, 1, values.length - 1, headers.length)
        .setNumberFormat('@')
        .setValues(linhasSanitizadas);
    }
  } finally {
    lock.releaseLock();
  }
  return null;
}

/**
 * Localiza a linha pelo id e remove a linha inteira da planilha. Se o id já
 * não existir (ex.: reenvio automático de uma chamada cuja resposta anterior
 * se perdeu, mas que já tinha executado), trata como sucesso silenciosamente
 * em vez de dar erro - excluir algo que já foi excluído dá no mesmo.
 */
function excluirPorId(nome, id) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet(nome);
    const values = sh.getDataRange().getValues();
    const headers = (values[0] || []).map(String);
    const idCol = headers.indexOf('id');
    if (idCol === -1) throw new Error('Aba "' + nome + '" não tem coluna "id"');

    let rowIndex = -1;
    for (let r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) { rowIndex = r; break; }
    }
    if (rowIndex === -1) return null;

    sh.deleteRow(rowIndex + 1);
  } finally {
    lock.releaseLock();
  }
  return null;
}

/**
 * DESTRUTIVO - apaga todo o conteúdo da aba (inclusive linhas de dados) e
 * recria só o cabeçalho esperado por ESTRUTURA. Não é usado por nenhuma
 * rota do app; existe só para correção manual pontual (ex.: uma aba que já
 * existia na planilha com colunas de outro propósito, sem dados reais).
 * Rode manualmente pelo editor ou por uma chamada avulsa - nunca automatize.
 */
function resetarAba(nome) {
  if (!ESTRUTURA[nome]) throw new Error('Aba desconhecida: ' + nome);
  const sh = getSheet(nome);
  sh.clear();
  sh.getRange(1, 1, 1, ESTRUTURA[nome].length).setValues([ESTRUTURA[nome]]);
  sh.setFrozenRows(1);
  return null;
}

/** Garante que todas as abas esperadas existam, com cabeçalho. Não apaga dados. */
function ensureStructure() {
  const criadas = [];
  Object.keys(ESTRUTURA).forEach(function (nome) {
    const ss = abrirPlanilha();
    const existiaAntes = !!ss.getSheetByName(nome);
    const sh = getSheet(nome);
    if (!existiaAntes) criadas.push(nome);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, ESTRUTURA[nome].length).setValues([ESTRUTURA[nome]]);
    }
    sh.setFrozenRows(1);
  });
  return { abasCriadas: criadas };
}

// ---------- TESTE DE AUTORIZAÇÃO (executar no editor para conceder os escopos) ----------
function testeAutorizacao() {
  Logger.log('Planilha: ' + abrirPlanilha().getName());
  Logger.log('Autorização OK!');
}
