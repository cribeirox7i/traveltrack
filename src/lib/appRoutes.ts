/**
 * Rotas FIXAS do app - as que não dependem de um id na URL. Ficam listadas aqui, e não espalhadas
 * pela navegação, porque a camada offline (`warmAppRoutes` em lib/offline/sync.ts) precisa pedir
 * cada uma ao servidor pra que o Service Worker guarde o documento no cache `app-pages`
 * (src/app/sw.ts). Sem esse aquecimento, uma tela só abre sem sinal se o usuário tiver navegado
 * até ela com internet antes - foi essa dependência de acaso que fazia Ambientes/Acessos/
 * Usuários caírem na tela "Sem conexão" mesmo com a viagem baixada.
 *
 * As rotas de viagem (`/trips/{id}/...`) NÃO entram aqui: são dinâmicas e aquecidas viagem a
 * viagem, só pras que o usuário marcou como offline - ver `warmTripPages`.
 *
 * Aquecer uma rota que o usuário não pode ver (as de `/admin` pra quem não é admin) é inofensivo:
 * a tela é um componente cliente que só descobre isso ao chamar a API, então o documento em si
 * responde 200 pra qualquer sessão válida e o bloqueio continua sendo do lado do servidor, na
 * rota de API.
 */
export const APP_ROUTES = [
  "/trips",
  "/trips/novo",
  "/parametros",
  "/admin/ambientes",
  "/admin/acessos",
  "/admin/usuarios",
  "/admin/parametros",
] as const;

/**
 * GETs de referência que as telas fora de uma viagem consomem direto de `/api`, sem passar pelo
 * IndexedDB. Aquecê-los deixa a última resposta no cache `apis` do Service Worker, que é o que
 * faz essas telas mostrarem a última lista salva sem sinal em vez de "Carregando..." pra sempre.
 *
 * Só leitura, e só o que é global (não tem recorte por viagem): o que é por viagem
 * (`/api/trips/{id}/...`) já é baixado pra dentro do IndexedDB por `downloadTripFull`, que é uma
 * garantia mais forte do que o cache de resposta HTTP.
 *
 * Uma rota que responde 403 pro papel do usuário (as de admin pra quem não é admin) simplesmente
 * não entra em cache - `cacheWillUpdate` no sw.ts só guarda 200.
 */
export const APP_API_ROUTES = [
  "/api/users",
  "/api/ambientes",
  "/api/ambientes/atual",
  "/api/parametros",
  "/api/parametros/publicos",
] as const;
