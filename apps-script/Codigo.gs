/**
 * ===========================================================
 *  Viagens App - Codigo.gs
 *  Camada de acesso à planilha, publicada como Web App.
 *  Mesmo padrão usado no AromaLab: sem service account do Google
 *  Cloud, o script roda com a identidade de quem publicou o
 *  Web App (autorização feita uma vez no editor).
 * ===========================================================
 */

// ---------- CONFIGURAÇÃO ----------
// SPREADSHEET_ID, SHARED_SECRET e DRIVE_ROOT_FOLDER_ID ficam em Config.gs -
// arquivo separado para você não perder os valores reais toda vez que colar
// uma versão nova deste Codigo.gs (veja README, seção 1).

// Estrutura esperada das abas (criadas/conferidas por ensureStructure)
const ESTRUTURA = {
  // Tenant do sistema: cada ambiente tem seus usuários e viagens, isolados dos outros ambientes.
  Ambientes: ['id', 'nome', 'ativo', 'criado_em'],
  Users: ['id', 'nome', 'email', 'senha_hash', 'role', 'ativo', 'ambiente_id'],
  Parametros: ['id', 'chave', 'valor', 'descricao'],
  Trips: ['id', 'nome', 'data_inicio', 'data_fim', 'qtd_pessoas', 'criado_por', 'criado_em', 'cidade_origem', 'cidade_origem_lat', 'cidade_origem_lon', 'capa_url', 'custo_modo', 'ambiente_id'],
  TripDays: ['id', 'trip_id', 'data', 'origem', 'destino', 'pernoite', 'traslado_pp', 'passagem_pp', 'alimentacao_pp', 'passeio_pp', 'hospedagem_pp', 'temp_min', 'temp_max', 'chuva_mm', 'vento_kmh', 'origem_lat', 'origem_lon', 'destino_lat', 'destino_lon', 'pernoite_lat', 'pernoite_lon', 'origem_pais', 'destino_pais', 'pernoite_pais'],
  UserTrip: ['id', 'user_id', 'trip_id'],
  Despesas: ['id', 'trip_id', 'categoria', 'valor', 'data', 'lancado_por', 'descricao', 'pagador_id', 'meio_pagamento_id', 'status', 'natureza'],
  Receitas: ['id', 'trip_id', 'user_id', 'valor', 'data', 'descricao', 'credor_id', 'status'],
  // `user_id` = dono (cada usuário tem a própria lista; o gestor cadastra pros usuários dele).
  MeiosPagamento: ['id', 'nome', 'ativo', 'user_id'],
  Agenda: ['id', 'trip_id', 'data', 'horario', 'titulo', 'descricao', 'url', 'anexo_file_id', 'anexo_nome', 'anexo_url', 'criado_por', 'criado_em'],
  // Nasceu como "Eletric" (tomada/voltagem/frequência, preenchida à mão pelo usuário) - renomeie
  // a aba pra "Countries" na planilha (bota direito na aba > Renomear) e o app passa a
  // completá-la sozinho com o resto (moeda, capital, DDI, lado de direção, fuso, cotação) na
  // primeira vez que cada país for necessário.
  Countries: ['id', 'country', 'plug_type', 'volts', 'hertz', 'currency_code', 'currency_name', 'currency_symbol', 'capital', 'ddi', 'driving_side', 'timezone', 'flag_emoji', 'language', 'rate_brl', 'rate_date'],
  // Tabela genérica que substitui Despesas/Receitas/Agenda/Anexos (ver plano "Itens de Viagem +
  // OCR de vouchers") - precisa bater exatamente com Itens em src/lib/sheets/types.ts.
  Itens: ['id', 'trip_id', 'categoria', 'tipo', 'localizador', 'nome_companhia', 'numero', 'data', 'horario', 'origem', 'destino', 'nome_local', 'endereco', 'data_inicio', 'hora_inicio', 'data_fim', 'hora_fim', 'tipo_documento', 'passageiro_id', 'url', 'anexo_file_id', 'anexo_nome', 'anexo_url', 'descricao', 'valor', 'status', 'natureza', 'data_pagamento', 'pagador_id', 'meio_pagamento_id', 'criado_por', 'criado_em']
};

// ---------- PONTO DE ENTRADA DO WEB APP ----------
/**
 * Chamado servidor-a-servidor pelo Next.js, nunca direto pelo navegador do
 * usuário final - por isso pode ser um único POST simples, sem se preocupar
 * com CORS. Corpo esperado: {"secret": "...", "action": "...", "payload": {...}}.
 */
function doPost(e) {
  var resultado;
  try {
    var body = JSON.parse(e.postData.contents);
    if (!segredosIguais(body.secret, SHARED_SECRET)) {
      resultado = erro('Segredo inválido');
    } else {
      resultado = api(body.action, body.payload || {});
    }
  } catch (err) {
    Logger.log('doPost error: ' + (err && err.stack ? err.stack : err));
    resultado = erro('Erro ao processar a requisição');
  }
  return ContentService.createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Compara dois segredos em tempo constante (via digest SHA-256 de tamanho fixo, comparado
 * byte a byte sem short-circuit) para não vazar, por diferença de tempo de resposta, quanto do
 * SHARED_SECRET o chamador acertou - `!==` direto abortaria na primeira diferença de caractere.
 */
function segredosIguais(a, b) {
  var da = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(a == null ? '' : a));
  var db = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(b == null ? '' : b));
  var diff = 0;
  for (var i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

function api(action, payload) {
  try {
    switch (action) {
      case 'ensureStructure': return ok(ensureStructure());
      case 'read':            return ok(lerTabela(abaValida(payload.tab)));
      case 'append':           return ok(inserirLinhas(abaValida(payload.tab), payload.rows || []));
      case 'updateById':       return ok(atualizarPorId(abaValida(payload.tab), payload.id, payload.patch || {}));
      case 'updateManyById':   return ok(atualizarVariosPorId(abaValida(payload.tab), payload.updates || []));
      case 'updateByField':    return ok(atualizarPorCampo(abaValida(payload.tab), payload.campo, payload.valor, payload.patch || {}));
      case 'deleteById':       return ok(excluirPorId(abaValida(payload.tab), payload.id));
      case 'deleteByField':    return ok(excluirPorCampo(abaValida(payload.tab), payload.campo, payload.valor));
      // 'resetTab' foi removido do dispatcher (checklist de segurança): é destrutivo (apaga a
      // aba inteira), não é usado por nenhuma rota do app e, com o segredo compartilhado sendo
      // a única credencial aceita aqui, ficava alcançável por qualquer chamador que o conheça.
      // A função `resetarAba` continua existindo no arquivo só para uso manual pelo editor.
      case 'driveUploadFile':  return ok(driveUploadFile(payload));
      case 'driveListFiles':   return ok(driveListFiles(payload));
      case 'driveDeleteFile':  return ok(driveDeleteFile(payload));
      case 'driveDownloadFile': return ok(driveDownloadFile(payload));
      case 'driveDeleteTripFolder': return ok(driveDeleteTripFolder(payload));
      default:                 return erro('Ação desconhecida: ' + action);
    }
  } catch (err) {
    Logger.log('api(' + action + ') error: ' + (err && err.stack ? err.stack : err));
    return erro('Erro ao executar a ação');
  }
}

function ok(data) { return { ok: true, data: data }; }
function erro(msg) { return { ok: false, error: msg }; }

/**
 * Só deixa passar nomes de aba que o app realmente usa (as chaves de ESTRUTURA). Sem isso,
 * `payload.tab` chegava direto ao getSheet, que cria a aba se não existir - então uma chamada
 * podia ler, escrever ou esvaziar qualquer aba da planilha, inclusive uma alheia ao app.
 */
function abaValida(nome) {
  if (!ESTRUTURA[nome]) throw new Error('Aba não permitida: ' + nome);
  return nome;
}

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
 * Como atualizarPorId, mas localiza a linha por um valor de coluna qualquer em vez de "id" -
 * pra tabelas como Countries, cuja chave natural é o nome do país, não um id. Atualiza só a
 * PRIMEIRA linha encontrada com esse valor; espera-se que o campo seja único na prática (país
 * não devia se repetir na aba). Usado por upsertCountry (lib/sheets/countries.ts) pra completar
 * uma linha existente sem sobrescrever o que já tinha valor (é o `patch` que decide o quê,
 * montado do lado do Next.js - aqui só aplica).
 */
function atualizarPorCampo(nome, campo, valor, patch) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet(nome);
    const values = sh.getDataRange().getValues();
    const headers = (values[0] || []).map(String);
    const col = headers.indexOf(campo);
    if (col === -1) throw new Error('Aba "' + nome + '" não tem coluna "' + campo + '"');

    let rowIndex = -1;
    for (let r = 1; r < values.length; r++) {
      if (String(values[r][col]) === String(valor)) { rowIndex = r; break; }
    }
    if (rowIndex === -1) throw new Error('Linha com ' + campo + '="' + valor + '" não encontrada na aba ' + nome);

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
 * Remove, numa única passada, todas as linhas cujo valor na coluna `campo` seja igual a
 * `valor` (ex.: todas as TripDays de uma viagem excluída) - muito mais rápido que excluirPorId
 * repetido linha a linha, e evita que os índices de linha mudem no meio do processo.
 */
function excluirPorCampo(nome, campo, valor) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getSheet(nome);
    const values = sh.getDataRange().getValues();
    const headers = (values[0] || []).map(String);
    const col = headers.indexOf(campo);
    if (col === -1) throw new Error('Aba "' + nome + '" não tem coluna "' + campo + '"');

    const mantidas = values.slice(1).filter(function (linha) { return String(linha[col]) !== String(valor); });
    const removidas = (values.length - 1) - mantidas.length;
    if (removidas === 0) return { removidas: 0 };

    sh.getRange(2, 1, Math.max(values.length - 1, 1), headers.length).clearContent();
    if (mantidas.length) {
      const sanitizadas = mantidas.map(function (linha) { return linha.map(sanitizarValor); });
      sh.getRange(2, 1, sanitizadas.length, headers.length).setNumberFormat('@').setValues(sanitizadas);
    }
    return { removidas: removidas };
  } finally {
    lock.releaseLock();
  }
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
  const colunasAdicionadas = {};
  Object.keys(ESTRUTURA).forEach(function (nome) {
    const ss = abrirPlanilha();
    const existiaAntes = !!ss.getSheetByName(nome);
    const sh = getSheet(nome);
    if (!existiaAntes) criadas.push(nome);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, ESTRUTURA[nome].length).setValues([ESTRUTURA[nome]]);
    } else {
      const novas = adicionarColunasFaltantes(sh, ESTRUTURA[nome]);
      if (novas.length) colunasAdicionadas[nome] = novas;
    }
    sh.setFrozenRows(1);
  });
  return { abasCriadas: criadas, colunasAdicionadas: colunasAdicionadas };
}

/**
 * Acrescenta ao final do cabeçalho as colunas de `colunasEsperadas` que ainda não existem na
 * aba - não mexe em colunas/linhas já existentes, só estende a estrutura pra campos novos (ex.:
 * quando o app ganha um campo novo depois que a planilha já tinha dados). Linhas já existentes
 * ficam com a célula vazia nas colunas novas.
 */
function adicionarColunasFaltantes(sh, colunasEsperadas) {
  const headerAtual = sh.getRange(1, 1, 1, sh.getLastColumn() || 1).getValues()[0].map(String);
  const faltando = colunasEsperadas.filter(function (c) { return headerAtual.indexOf(c) === -1; });
  if (faltando.length) {
    sh.getRange(1, headerAtual.length + 1, 1, faltando.length).setValues([faltando]);
  }
  return faltando;
}

// ---------- ANEXOS (GOOGLE DRIVE) ----------
// Mesmo padrão do resto do arquivo: sem service account, usa DriveApp com a
// identidade de quem publicou o Web App (mesma autorização já usada para a
// planilha). Estrutura no Drive: {DRIVE_ROOT_FOLDER_ID}/{nome da viagem} -
// {tripId}/{categoria}/arquivo. As subpastas de categoria só são criadas na
// hora do primeiro upload daquela categoria, para não deixar pasta vazia.

/** Acha ou cria (com lock, para não duplicar em uploads simultâneos) uma subpasta pelo nome. */
function getOrCreateSubfolder(pai, nome) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const existentes = pai.getFoldersByName(nome);
    if (existentes.hasNext()) return existentes.next();
    return pai.createFolder(nome);
  } finally {
    lock.releaseLock();
  }
}

function getTripFolder(tripId, tripName) {
  if (!DRIVE_ROOT_FOLDER_ID) {
    throw new Error('DRIVE_ROOT_FOLDER_ID não configurado em Config.gs');
  }
  const raiz = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const nomePasta = tripName + ' - ' + tripId;
  return getOrCreateSubfolder(raiz, nomePasta);
}

/**
 * Igual a getTripFolder, mas NUNCA cria nada - devolve null se a viagem ainda não tem pasta.
 * Existe porque listar anexos é uma leitura: usar getTripFolder ali fazia um simples GET criar
 * pasta no Drive, o que (a) exige permissão de escrita só pra ler - e era exatamente a chamada
 * que estourava "You do not have permission to call DriveApp.Folder.createFolder" - e (b) enchia
 * o Drive de pasta vazia pra toda viagem que alguém abrisse na aba Anexos sem nunca anexar nada.
 */
function findTripFolder(tripId, tripName) {
  if (!DRIVE_ROOT_FOLDER_ID) {
    throw new Error('DRIVE_ROOT_FOLDER_ID não configurado em Config.gs');
  }
  const raiz = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const pastas = raiz.getFoldersByName(tripName + ' - ' + tripId);
  return pastas.hasNext() ? pastas.next() : null;
}

/** Recebe o arquivo em base64, salva na subpasta de categoria da viagem. */
function driveUploadFile(payload) {
  const tripFolder = getTripFolder(payload.tripId, payload.tripName);
  const categoriaFolder = getOrCreateSubfolder(tripFolder, payload.categoria || 'outros');

  const blob = Utilities.newBlob(
    Utilities.base64Decode(payload.base64Data),
    payload.mimeType || 'application/octet-stream',
    payload.filename || 'anexo'
  );
  const file = categoriaFolder.createFile(blob);

  return {
    fileId: file.getId(),
    name: file.getName(),
    url: file.getUrl(),
    size: file.getSize(),
    mimeType: file.getMimeType(),
    categoria: payload.categoria || 'outros',
    criadoEm: file.getDateCreated().toISOString()
  };
}

/** Varre as subpastas de categoria da viagem e devolve a lista achatada de arquivos. */
function driveListFiles(payload) {
  // Leitura pura: se a viagem nunca teve anexo, a pasta não existe e a resposta é uma lista
  // vazia - não cria nada (ver findTripFolder).
  const tripFolder = findTripFolder(payload.tripId, payload.tripName);
  if (!tripFolder) return [];
  const resultado = [];

  const subpastas = tripFolder.getFolders();
  while (subpastas.hasNext()) {
    const sub = subpastas.next();
    const categoria = sub.getName();
    const arquivos = sub.getFiles();
    while (arquivos.hasNext()) {
      const file = arquivos.next();
      resultado.push({
        fileId: file.getId(),
        name: file.getName(),
        url: file.getUrl(),
        size: file.getSize(),
        mimeType: file.getMimeType(),
        categoria: categoria,
        criadoEm: file.getDateCreated().toISOString()
      });
    }
  }
  return resultado;
}

/**
 * Confirma que o arquivo pedido está de fato dentro da pasta da viagem informada, e devolve o
 * File. Sem essa checagem, `fileId` era aceito solto: quem tivesse acesso a *uma* viagem podia
 * baixar ou mandar pra lixeira qualquer arquivo do Drive da conta que publicou o Web App,
 * bastando descobrir o id. A hierarquia esperada é {raiz}/{nome} - {tripId}/{categoria}/arquivo,
 * então o pai do arquivo é a pasta de categoria e o avô é a pasta da viagem.
 */
function arquivoDaViagem(fileId, tripId, tripName) {
  if (!tripId || !tripName) throw new Error('tripId/tripName obrigatórios');
  const tripFolder = findTripFolder(tripId, tripName);
  if (!tripFolder) throw new Error('Anexo não encontrado nesta viagem');

  const file = DriveApp.getFileById(fileId);
  const pais = file.getParents();
  while (pais.hasNext()) {
    const categoria = pais.next();
    const avos = categoria.getParents();
    while (avos.hasNext()) {
      if (avos.next().getId() === tripFolder.getId()) return file;
    }
  }
  throw new Error('Anexo não encontrado nesta viagem');
}

/** Move para a lixeira do Drive (reversível) em vez de apagar de vez. */
function driveDeleteFile(payload) {
  arquivoDaViagem(payload.fileId, payload.tripId, payload.tripName).setTrashed(true);
  return null;
}

/** Move a pasta inteira de anexos da viagem (todas as categorias) para a lixeira do Drive de
 * uma vez, em vez de listar e apagar arquivo por arquivo - usado ao excluir uma viagem.
 * Sem DRIVE_ROOT_FOLDER_ID configurado ou sem a pasta (viagem nunca teve anexo), não há nada a
 * fazer. */
function driveDeleteTripFolder(payload) {
  if (!DRIVE_ROOT_FOLDER_ID) return null;
  const raiz = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const nomePasta = payload.tripName + ' - ' + payload.tripId;
  const pastas = raiz.getFoldersByName(nomePasta);
  if (pastas.hasNext()) pastas.next().setTrashed(true);
  return null;
}

/** Devolve os bytes (base64) de um anexo já enviado - usado pelo download para uso offline. */
function driveDownloadFile(payload) {
  const file = arquivoDaViagem(payload.fileId, payload.tripId, payload.tripName);
  const blob = file.getBlob();
  return {
    name: file.getName(),
    mimeType: file.getMimeType(),
    base64Data: Utilities.base64Encode(blob.getBytes())
  };
}

// ---------- TESTE DE AUTORIZAÇÃO (executar no editor para conceder os escopos) ----------
function testeAutorizacao() {
  Logger.log('Planilha: ' + abrirPlanilha().getName());
  if (DRIVE_ROOT_FOLDER_ID) {
    const raiz = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
    Logger.log('Pasta de anexos: ' + raiz.getName());

    // Exercita ESCRITA de verdade, não só leitura. Antes esta função parava no getFolderById
    // acima e logava "Autorização OK!" - o que dava um falso positivo perigoso: ler a pasta só
    // prova o escopo de leitura, enquanto enviar anexo precisa de createFolder. Deu exatamente
    // nisso em produção - o teste passava e o upload quebrava com "You do not have permission to
    // call DriveApp.Folder.createFolder". Agora, se o escopo estiver errado, é AQUI que estoura,
    // e rodar esta função é o que dispara a tela de consentimento pra concedê-lo.
    const temp = raiz.createFolder('__teste_permissao__');
    temp.setTrashed(true);
    Logger.log('Escrita no Drive: OK (createFolder testado e desfeito)');
  }
  Logger.log('Autorização OK!');
}
