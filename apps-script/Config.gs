/**
 * ===========================================================
 *  Viagens App - Config.gs
 *  Valores específicos desta implantação (planilha, segredo,
 *  pasta do Drive). Criado UMA VEZ com os valores reais e
 *  deixado intocado dali em diante - as atualizações de código
 *  mexem só em Codigo.gs, nunca neste arquivo.
 * ===========================================================
 */

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

// ID da pasta raiz no Google Drive onde ficam os anexos (comprovantes) de
// todas as viagens, uma subpasta por viagem. Trecho entre /folders/ e o fim
// na URL da pasta (ex.: .../folders/AAAA1234BBBB -> 'AAAA1234BBBB').
const DRIVE_ROOT_FOLDER_ID = '';

// ----- ESCOPO DO DRIVE -----
// O appsscript.json usa `drive` (acesso total ao Drive do usuário que publicou
// o Web App) em vez de `drive.file` (só arquivos criados pelo próprio script).
//
// Por que não foi trocado para drive.file:
//   `DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID)` exige escopo completo quando
//   a pasta foi criada manualmente (não pelo script). `drive.file` só cobre
//   arquivos/pastas que o próprio script criou naquela sessão - uma pasta
//   preexistente ficaria fora do escopo, quebrando os uploads.
//
// Mitigação adotada: o Web App executa como o dono da planilha (executeAs:
//   USER_DEPLOYING) - o escopo amplo é do admin, não dos usuários finais.
//   A URL /exec exige o SHARED_SECRET, limitando quem pode invocar o script.
//
// Como trocar para drive.file no futuro (se quiser reduzir o escopo):
//   1. Crie a pasta raiz programaticamente (DriveApp.createFolder) e anote o ID.
//   2. Mova para ela as subpastas existentes de viagens (também via DriveApp).
//   3. Troque o escopo em appsscript.json e redelete uma nova versão do Web App.
//   4. Atualize DRIVE_ROOT_FOLDER_ID com o novo ID.
