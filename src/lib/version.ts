/**
 * Selo de versão mostrado no rodapé do app.
 *
 * BUILD_SHA vem do Vercel (VERCEL_GIT_COMMIT_SHA), injetado em build time via next.config.ts.
 * BUILD_TIME é o momento do build, também injetado ali.
 * Em dev local ambos ficam como "local"/vazio.
 */

/** Commit publicado - preenchido pelo Vercel; "local" em dev. */
export const BUILD_SHA = (process.env.NEXT_PUBLIC_BUILD_SHA ?? "").slice(0, 7) || "local";

/** Momento do build em ISO. */
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

/** "0cdd48f · 14/10 09:32" - linha exibida no rodapé. */
export function buildLabel(): string {
  const partes = [BUILD_SHA];
  if (BUILD_TIME) {
    const d = new Date(BUILD_TIME);
    if (!Number.isNaN(d.getTime())) {
      const p = (n: number) => String(n).padStart(2, "0");
      partes.push(`${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`);
    }
  }
  return partes.join(" · ");
}
