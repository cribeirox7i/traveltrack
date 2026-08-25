# Viagens App

App para planejar viagens em grupo: orçamento diário por pessoa, despesas realizadas, aportes
("receitas") dos participantes e relatório de orçado x realizado x saldo. Multiusuário, com login
e controle de quais usuários enxergam quais viagens.

**Banco de dados**: o próprio Google Sheets (não há Postgres). Isso é intencional - veja
[Limitações](#limitações-do-sheets-como-banco) antes de usar em produção com muitos usuários
simultâneos.

## 1. Publicar o Apps Script (sem precisar de Google Cloud Console)

O acesso à planilha é feito via **Google Apps Script**, publicado como Web App - mesmo padrão já
usado em outros projetos aqui. Não precisa criar projeto no Google Cloud, habilitar API nem gerar
chave de service account.

1. Abra a planilha que será usada como banco de dados.
2. Vá em **Extensões → Apps Script**.
3. Apague o conteúdo padrão de `Código.gs` e cole o conteúdo de
   [`apps-script/Codigo.gs`](apps-script/Codigo.gs) deste repositório.
4. Crie um **novo arquivo de script** no projeto (ícone `+` ao lado de "Arquivos" → Script),
   chame de `Config` e cole o conteúdo de [`apps-script/Config.gs`](apps-script/Config.gs). Esse
   arquivo separado existe justamente para guardar os valores reais desta implantação - daqui pra
   frente, quando você for aplicar uma atualização de código, só mexe em `Codigo.gs` e deixa
   `Config.gs` intocado, sem precisar copiar/colar o segredo e os IDs de novo.
5. No editor, clique no ícone de engrenagem **Configurações do projeto** → marque "Mostrar arquivo
   de manifesto `appsscript.json`". Depois abra esse arquivo e substitua o conteúdo pelo de
   [`apps-script/appsscript.json`](apps-script/appsscript.json).
6. Em `Config.gs`, troque a constante `SHARED_SECRET` por uma string aleatória longa (ex.: gere com
   `openssl rand -base64 32` no seu terminal). Guarde esse valor - ele também vai para a variável de
   ambiente `APPS_SCRIPT_SHARED_SECRET` do Next.js. **Sem esse segredo, qualquer pessoa que
   descobrir a URL do Web App conseguiria ler/escrever na planilha**, já que o Web App é publicado
   como "Qualquer pessoa" (o Google não oferece outra forma de chamada servidor-a-servidor aqui).
   Se for usar a funcionalidade de anexos, preencha também `DRIVE_ROOT_FOLDER_ID` com o ID da pasta
   do Drive (trecho depois de `/folders/` na URL da pasta).
7. Rode a função `testeAutorizacao` uma vez pelo editor (▶️ ao lado do seletor de função) - isso
   vai pedir para você autorizar o script a acessar a planilha (e o Drive, se for usar anexos) com
   a sua conta Google. Aceite (pode aparecer um aviso "app não verificado" → clique em
   **Avançado → Acessar [nome do projeto]**, normal para scripts pessoais).
8. Clique em **Implantar → Nova implantação → tipo "App da Web"**.
   - Executar como: **Eu (sua conta)**
   - Quem pode acessar: **Qualquer pessoa**
   - Implantar, e copie a URL terminada em `/exec`.

Essa URL é o valor de `APPS_SCRIPT_URL`. Se no futuro você editar o `Codigo.gs` (ex.: para pegar uma
atualização deste repositório), apague só o conteúdo de `Codigo.gs` e cole o novo - `Config.gs`
continua com seus valores reais - depois use **Gerenciar implantações → editar (ícone de lápis) →
Nova versão** para que a URL publicada reflita as mudanças (a URL em si não muda).

## 2. Variáveis de ambiente

Copie `.env.local.example` para `.env.local` (local) e configure as mesmas variáveis no painel do
Vercel (Project Settings → Environment Variables) para produção:

| Variável | Descrição |
| --- | --- |
| `APPS_SCRIPT_URL` | URL `/exec` da implantação do Apps Script (passo 7 acima) |
| `APPS_SCRIPT_SHARED_SECRET` | O mesmo valor colado em `SHARED_SECRET` no `Codigo.gs` |
| `NEXTAUTH_SECRET` | String aleatória longa (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | URL da aplicação (`http://localhost:3000` local, URL do Vercel em produção) |
| `GEMINI_API_KEY` | Chave do Google AI Studio (free tier), usada pra ler vouchers na tela Itens (ver seção 6) |

Nunca commite `.env.local` - já está no `.gitignore`.

## 3. Criar o primeiro usuário (admin)

O app não tem cadastro público - só um admin cria usuários pela tela `Admin → Usuários`. Para criar
o **primeiro** admin (antes de existir qualquer login), rode localmente, com `.env.local`
preenchido:

```bash
npm run create-admin -- "Seu Nome" "seu-email@empresa.com" "sua-senha" admin
```

Esse comando também garante que todas as abas da planilha existam (chama `ensureStructure` no Apps
Script antes de criar o usuário). Depois disso, faça login normalmente em `/login` e crie os
demais usuários pela tela admin.

## 4. Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## 5. Deploy no Vercel

1. Suba o projeto para um repositório git (não inclua `.env.local`; o `apps-script/Codigo.gs` pode
   ficar no repositório normalmente - o segredo real deve estar só na cópia publicada no Apps
   Script e na env var, não commitado em texto claro num arquivo de exemplo).
2. Importe o repositório no [Vercel](https://vercel.com/new).
3. Configure as variáveis de ambiente da seção 2 no projeto Vercel.
4. Deploy.

## 6. Análise automática de voucher (Gemini)

A tela **Itens** lê PDF/imagem de um voucher e pré-preenche o formulário via
[Google AI Studio](https://aistudio.google.com/) (free tier - uso pessoal, sem cobrança).

1. Acesse [aistudio.google.com](https://aistudio.google.com/), faça login com sua conta Google e
   clique em **Get API key → Create API key** (num projeto novo ou existente).
2. Copie a chave gerada e cole em `GEMINI_API_KEY` no `.env.local` (e na env var equivalente do
   Vercel, em produção).
3. **Nunca** cole a chave em código versionado nem a exponha ao navegador - o botão "Analisar" da
   tela Itens chama uma rota própria (`/api/trips/{id}/itens/analisar`) que faz a chamada ao
   Gemini no servidor; o cliente nunca vê a chave.

No plano gratuito, o Google pode usar o conteúdo enviado (imagem/PDF do voucher) para melhorar os
modelos - avalie isso antes de subir documento com dado sensível de terceiros. Se isso for um
problema, ative faturamento (pay-as-you-go) no mesmo projeto do Google AI Studio: o código não
muda, só o comportamento de retenção de dado do lado do Google.

## Estrutura de dados na planilha

Cada aba usa a linha 1 como cabeçalho; a coluna `id` é sempre um UUID gerado pelo app. A criação das
abas é feita pelo `ensureStructure` do Apps Script (via tela Admin → Parâmetros ou pelo script de
criação do admin). Esse mesmo botão também serve para atualizar uma planilha já em uso quando o
app ganha um campo novo (ex.: `temp_min`/`temp_max`) - `ensureStructure` acrescenta ao final do
cabeçalho as colunas que ainda faltarem em abas já existentes, sem apagar nada. Depois de
atualizar o `Codigo.gs` publicado, clique em **Admin → Parâmetros → "Verificar/criar abas na
planilha"** para aplicar colunas novas às planilhas já em uso.

- **Users**: id, nome, email, senha_hash, role (`admin`/`user`), ativo
- **Parametros**: id, chave, valor, descricao
- **Trips**: id, nome, data_inicio, data_fim, qtd_pessoas, criado_por, criado_em,
  cidade_origem, cidade_origem_lat, cidade_origem_lon (as 3 últimas definem o ponto de partida
  do roteiro na aba Mapa - opcional, definida na criação da viagem ou depois pela própria aba Mapa)
- **TripDays**: id, trip_id, data, origem, destino, pernoite, traslado_pp, passagem_pp,
  alimentacao_pp, passeio_pp, hospedagem_pp, temp_min, temp_max, origem_lat, origem_lon,
  destino_lat, destino_lon, pernoite_lat, pernoite_lon (temp_min/temp_max são preenchidos
  automaticamente pelo botão "Buscar temperaturas"; os `_lat`/`_lon` são preenchidos ao escolher
  uma cidade pelo autocomplete nos campos Origem/Destino/Pernoite - nenhum dos dois é digitado)
- **UserTrip**: id, user_id, trip_id
- **Despesas**: id, trip_id, categoria, valor, data, lancado_por, descricao, pagador_id,
  meio_pagamento_id
- **Receitas**: id, trip_id, user_id, valor, data, descricao
- **MeiosPagamento**: id, nome, ativo (gerido pela tela Admin → Config)

**Anexos (comprovantes)** não ficam na planilha - vivem direto no Google Drive, numa
subpasta por viagem (nome = "{nome da viagem} - {id}") dentro da pasta configurada em
`DRIVE_ROOT_FOLDER_ID` (`Config.gs`), com uma subpasta por categoria dentro de cada
viagem. O próprio Drive é a fonte da verdade da listagem - não há aba extra pra manter
sincronizada.

## Limitações do Sheets como banco

Foi uma escolha deliberada usar a planilha existente como banco de dados ao vivo, e o acesso via
Apps Script (em vez de service account do Google Cloud) traz limitações extras a considerar:

- **Autorização presa à conta pessoal**: quem publicar o Web App autoriza o script com a própria
  conta Google. Não há uma identidade técnica separada - trocar de conta ou revogar acesso quebra
  o app.
- **Sem transações**: duas escritas simultâneas podem gerar condições de corrida. O
  `Codigo.gs` usa `LockService` para serializar leituras+escritas de uma mesma ação, mas isso não
  elimina 100% o risco entre ações diferentes.
- **Cotas do Apps Script**: tempo de execução e chamadas por dia são mais limitados que uma API
  REST direta - improvável de ser um problema no volume de uso deste app, mas vale monitorar se
  crescer bastante.
- **Sem integridade referencial**: nada impede uma linha órfã (ex.: `UserTrip` apontando para uma
  viagem já removida manualmente na planilha).
- **Reautorização manual**: se o escopo de acesso do script mudar, é preciso reautorizar
  interativamente no editor - não é automatizável via CI/deploy.

### Erro `You do not have permission to call DriveApp...`

Aparece como `DriveApp.getFolderById` ou `DriveApp.Folder.createFolder`, em ações que mexem na
pasta de anexos (enviar anexo, listar anexos, excluir uma viagem), e quer dizer que o script foi
autorizado com um escopo de Drive estreito demais. Acontece quando o `appsscript.json` colado no
editor não declara `oauthScopes` - sem essa lista, o Apps Script infere os escopos sozinho e pode
escolher um mais restrito que o necessário. Para resolver:

1. No editor, **Configurações do projeto** → marque "Mostrar arquivo de manifesto
   `appsscript.json`", abra o arquivo e garanta que ele tem o bloco `oauthScopes` igual ao de
   [`apps-script/appsscript.json`](apps-script/appsscript.json).
2. Rode `testeAutorizacao` pelo editor de novo. Como os escopos mudaram, o Google vai pedir
   autorização outra vez - agora incluindo o acesso ao Drive.
3. **Implantar → Gerenciar implantações → editar → Nova versão**: a implantação publicada carrega
   os escopos da versão em que foi criada, então sem uma versão nova ela continua com os antigos.

> **Atenção ao "Autorização OK!"**: até uma versão recente, `testeAutorizacao` só *lia* a pasta
> raiz, então passava com o escopo de leitura e dava um falso positivo - o teste dizia OK e o
> upload de anexo continuava quebrando em `createFolder`. Hoje a função cria e descarta uma pasta
> temporária de propósito: se o escopo estiver errado, ela **falha** ali, que é o comportamento
> útil. Se o seu editor ainda tem a versão antiga, cole o `Codigo.gs` atual antes de confiar no
> resultado do teste.

Excluir uma viagem funciona mesmo com esse erro pendente: a remoção da pasta no Drive é feita por
último e não derruba a exclusão - o app só avisa que a pasta ficou para trás.

Se o uso crescer (muitos usuários simultâneos, muitas viagens) ou a app precisar rodar em nome de
uma identidade técnica separada da conta pessoal, o caminho recomendado é migrar para um banco
relacional (Postgres via Neon/Vercel Postgres) ou para uma service account do Google Cloud,
mantendo a mesma estrutura de dados.

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind CSS · NextAuth.js v5 (Credentials, sessão JWT) ·
Google Apps Script (Web App) como camada de acesso à planilha · zod · bcryptjs.
