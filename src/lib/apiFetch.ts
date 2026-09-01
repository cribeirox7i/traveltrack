/**
 * Chamada a `/api/*` que NUNCA lança: devolve sempre um resultado, com o erro já traduzido.
 *
 * Existe porque o padrão espalhado pelas telas era `fetch(...).then(r => r.json()).then(setX)`,
 * ou um `await fetch` que só olhava `res.ok`. Sem sinal, o `fetch` rejeita antes de qualquer
 * uma dessas linhas rodar: `setLoading(false)` nunca acontecia e a tela ficava em "Carregando..."
 * para sempre (Ambientes, Config, Parâmetros), ou o botão ficava preso em "Salvando..."
 * (Editar viagem, Mapa, Itinerário). Nas telas de viagem isso não aparecia porque elas leem do
 * IndexedDB, que sempre resolve - o problema era só das telas que falam direto com a API.
 *
 * A distinção entre "sem conexão" e "o servidor recusou" importa na mensagem: a primeira o
 * usuário resolve esperando o sinal, a segunda não.
 */
export const ERRO_SEM_CONEXAO = "Sem conexão - esta ação precisa de internet";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function apiFetch<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // Rede indisponível, ou o Service Worker respondeu que não tem nada guardado pra esta URL.
    return { ok: false, error: ERRO_SEM_CONEXAO };
  }

  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    return { ok: false, error: body?.error ?? `Erro ${res.status}` };
  }
  // Toda rota do app responde JSON hoje, mas uma resposta bem-sucedida sem corpo (204, ou um
  // DELETE que passe a responder vazio) não é um erro - tratar como tal transformaria uma
  // exclusão que funcionou numa mensagem vermelha na tela. Quem espera uma lista checa
  // `Array.isArray` no resultado de qualquer forma.
  return { ok: true, data: (body ?? ({} as T)) as T };
}
