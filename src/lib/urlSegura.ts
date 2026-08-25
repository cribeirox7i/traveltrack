import { z } from "zod";

/**
 * Esquemas aceitos em URL que o usuário digita (link de compromisso da agenda, capa da viagem).
 * `javascript:` e `data:` ficam de fora: o link da agenda é renderizado como `href` clicável, e
 * uma viagem é compartilhada entre participantes - um `javascript:...` salvo ali executaria no
 * navegador de quem clicasse. A CSP não cobre esse caso, porque o `'unsafe-inline'` que o runtime
 * do Next exige em `script-src` também libera URL `javascript:`.
 */
const ESQUEMAS_PERMITIDOS = ["http:", "https:"];

function esquemaPermitido(valor: string): boolean {
  try {
    return ESQUEMAS_PERMITIDOS.includes(new URL(valor).protocol);
  } catch {
    return false;
  }
}

/**
 * Como `z.string().url()`, mas só http/https - o `url()` do zod aceita qualquer esquema válido,
 * incluindo `javascript:` e `data:` (verificado no zod 4.x).
 */
export const urlHttpSchema = z
  .string()
  .refine(esquemaPermitido, "A URL precisa começar com http:// ou https://");

/**
 * Devolve a URL só se ela for segura de usar como `href`/`src`, senão `undefined`. Segunda linha
 * de defesa, para o valor que já está gravado: linhas salvas antes desta validação existir, e
 * linhas criadas offline (que entram no IndexedDB e são renderizadas antes de qualquer ida ao
 * servidor), não passaram por `urlHttpSchema`.
 */
export function hrefSeguro(valor: string | undefined | null): string | undefined {
  if (!valor) return undefined;
  return esquemaPermitido(valor) ? valor : undefined;
}
