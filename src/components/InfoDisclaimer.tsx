"use client";

import { useState } from "react";

/** Texto de ajuda no topo da tela (explica o que a tela faz, de onde vêm os dados, etc.) - no
 * desktop fica sempre visível, como sempre foi. No mobile, onde esse parágrafo inteiro competia
 * por espaço com o conteúdo de verdade logo abaixo da dobra, vira um botão "?" que revela o
 * mesmo texto ao tocar. */
export function InfoDisclaimer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="text-sm text-slate-500 dark:text-slate-400">
      <p className="hidden sm:block">{children}</p>
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Ocultar informações" : "Mais informações"}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400"
        >
          ?
        </button>
        {open && <p className="mt-2">{children}</p>}
      </div>
    </div>
  );
}
