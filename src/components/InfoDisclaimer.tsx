"use client";

import { useState, useEffect } from "react";
import { useTripDisclaimer } from "@/lib/TripDisclaimerContext";

/** Texto de ajuda no topo da tela (explica o que a tela faz, de onde vêm os dados, etc.) - no
 * desktop fica sempre visível, como sempre foi. No mobile, dentro de uma viagem, o botão "?"
 * aparece na margem direita da linha de sub-abas (TripTabs); fora de viagem vira um botão "?"
 * local que revela o texto ao tocar. */
export function InfoDisclaimer({ children }: { children: React.ReactNode }) {
  const ctx = useTripDisclaimer();
  const [localOpen, setLocalOpen] = useState(false);

  // Registra o conteúdo no contexto da viagem para o TripTabs exibir o "?" na posição certa.
  // children é JSX estático na prática, roda só na montagem.
  useEffect(() => {
    if (!ctx) return;
    ctx.setContent(children);
    return () => { ctx.setContent(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desktop: texto sempre visível inline em qualquer contexto.
  const desktopText = (
    <p className="hidden sm:block text-sm text-slate-500 dark:text-slate-400">{children}</p>
  );

  if (!ctx) {
    // Fora do layout de viagem (parametros, ambientes, etc.): modo autônomo com "?" local.
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400">
        {desktopText}
        <div className="sm:hidden">
          <button
            type="button"
            onClick={() => setLocalOpen((o) => !o)}
            aria-expanded={localOpen}
            aria-label={localOpen ? "Ocultar informações" : "Mais informações"}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400"
          >
            ?
          </button>
          {localOpen && <p className="mt-2">{children}</p>}
        </div>
      </div>
    );
  }

  // Dentro do layout de viagem: o "?" fica no TripTabs; aqui só mostra o texto expandido.
  return (
    <>
      {desktopText}
      {ctx.open && (
        <p className="sm:hidden text-sm text-slate-500 dark:text-slate-400">{children}</p>
      )}
    </>
  );
}
