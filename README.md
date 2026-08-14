# Viagens App

App para planejar viagens em grupo: orçamento diário por pessoa, despesas realizadas, aportes
("receitas") dos participantes e relatório de orçado x realizado x saldo. Multiusuário, com login
e controle de quais usuários enxergam quais viagens.

**Banco de dados**: o próprio Google Sheets (não há Postgres). Isso é intencional — veja
[Limitações](#limitações-do-sheets-como-banco) antes de usar em produção com muitos usuários
simultâneos.

## 1. Publicar o Apps Script (sem precisar de Google Cloud Console)

O acesso à planilha é feito via **Google Apps Script**, publicado como Web App — mesmo padrão já
usado em outros projetos aqui. Não precisa criar projeto no Google Cloud, habilitar API nem gerar
chave de service account.

1. Abra a planilha que será usada como banco de dados.
2. Vá em **Extensões → Apps Script**.
3. Apague o conteúdo padrão de `Código.gs` e cole o conteúdo de
   [`apps-script/Codigo.gs`](apps-script/Codigo.gs) deste repositório.
4. No editor, clique no ícone de engrenagem **Configurações do projeto** → marque "Mostrar arquivo
   de manifesto `appsscript.json`". Depois abra esse arquivo e substitua o conteúdo pelo de
   [`apps-script/appsscript.json`](apps-script/appsscript.json).
5. Em `Codigo.gs`, troque a constante `SHARED_SECRET` por uma string aleatória longa (ex.: gere com
   `openssl rand -base64 32` no seu terminal). Guarde esse valor — ele também vai para a variável de
   ambiente `APPS_SCRIPT_SHARED_SECRET` do Next.js. **Sem esse segredo, qualquer pessoa que
   descobrir a URL do Web App conseguiria ler/escrever na planilha**, já que o Web App é publicado
   como "Qualquer pessoa" (o Google não oferece outra forma de chamada servidor-a-servidor aqui).
6. Rode a função `testeAutorizacao` uma vez pelo editor (▶️ ao lado do seletor de função) — isso
   vai pedir para você autorizar o script a acessar a planilha com a sua conta Google. Aceite (pode
   aparecer um aviso "app não verificado" → clique em **Avançado → Acessar [nome do projeto]**,
   normal para scripts pessoais).
7. Clique em **Implantar → Nova implantação → tipo "App da Web"**.
   - Executar como: **Eu (sua conta)**
   - Quem pode acessar: **Qualquer pessoa**
   - Implantar, e copie a URL terminada em `/exec`.

Essa URL é o valor de `APPS_SCRIPT_URL`. Se no futuro você editar o `Codigo.gs`, use **Gerenciar
implantações → editar (ícone de lápis) → Nova versão** para que a URL publicada reflita as
mudanças (a URL em si não muda).

## 2. Variáveis de ambiente

Copie `.env.local.example` para `.env.local` (local) e configure as mesmas variáveis no painel do
Vercel (Project Settings → Environment Variables) para produção:

| Variável | Descrição |
| --- | --- |
| `APPS_SCRIPT_URL` | URL `/exec` da implantação do Apps Script (passo 7 acima) |
| `APPS_SCRIPT_SHARED_SECRET` | O mesmo valor colado em `SHARED_SECRET` no `Codigo.gs` |
| `NEXTAUTH_SECRET` | String aleatória longa (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | URL da aplicação (`http://localhost:3000` local, URL do Vercel em produção) |

Nunca commite `.env.local` — já está no `.gitignore`.

## 3. Criar o primeiro usuário (admin)

O app não tem cadastro público — só um admin cria usuários pela tela `Admin → Usuários`. Para criar
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
   ficar no repositório normalmente — o segredo real deve estar só na cópia publicada no Apps
   Script e na env var, não commitado em texto claro num arquivo de exemplo).
2. Importe o repositório no [Vercel](https://vercel.com/new).
3. Configure as variáveis de ambiente da seção 2 no projeto Vercel.
4. Deploy.

## Estrutura de dados na planilha

Cada aba usa a linha 1 como cabeçalho; a coluna `id` é sempre um UUID gerado pelo app. A criação das
abas é feita pelo `ensureStructure` do Apps Script (via tela Admin → Parâmetros ou pelo script de
criação do admin).

- **Users**: id, nome, email, senha_hash, role (`admin`/`user`), ativo
- **Parametros**: id, chave, valor, descricao
- **Trips**: id, nome, data_inicio, data_fim, qtd_pessoas, criado_por, criado_em
- **TripDays**: id, trip_id, data, traslado_pp, passagem_pp, alimentacao_pp, passeio_pp, hospedagem_pp
- **UserTrip**: id, user_id, trip_id
- **Despesas**: id, trip_id, categoria, valor, data, lancado_por, descricao
- **Receitas**: id, trip_id, user_id, valor, data, descricao

## Limitações do Sheets como banco

Foi uma escolha deliberada usar a planilha existente como banco de dados ao vivo, e o acesso via
Apps Script (em vez de service account do Google Cloud) traz limitações extras a considerar:

- **Autorização presa à conta pessoal**: quem publicar o Web App autoriza o script com a própria
  conta Google. Não há uma identidade técnica separada — trocar de conta ou revogar acesso quebra
  o app.
- **Sem transações**: duas escritas simultâneas podem gerar condições de corrida. O
  `Codigo.gs` usa `LockService` para serializar leituras+escritas de uma mesma ação, mas isso não
  elimina 100% o risco entre ações diferentes.
- **Cotas do Apps Script**: tempo de execução e chamadas por dia são mais limitados que uma API
  REST direta — improvável de ser um problema no volume de uso deste app, mas vale monitorar se
  crescer bastante.
- **Sem integridade referencial**: nada impede uma linha órfã (ex.: `UserTrip` apontando para uma
  viagem já removida manualmente na planilha).
- **Reautorização manual**: se o escopo de acesso do script mudar, é preciso reautorizar
  interativamente no editor — não é automatizável via CI/deploy.

Se o uso crescer (muitos usuários simultâneos, muitas viagens) ou a app precisar rodar em nome de
uma identidade técnica separada da conta pessoal, o caminho recomendado é migrar para um banco
relacional (Postgres via Neon/Vercel Postgres) ou para uma service account do Google Cloud,
mantendo a mesma estrutura de dados.

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind CSS · NextAuth.js v5 (Credentials, sessão JWT) ·
Google Apps Script (Web App) como camada de acesso à planilha · zod · bcryptjs.
