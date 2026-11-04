"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { isBiometricLockEnabled, verifyBiometric } from "@/lib/biometricLock";

/**
 * Trava a TELA (nao a sessao) quando o usuario ativou o bloqueio por biometria em /parametros.
 *
 * `useLayoutEffect` pra decidir se comeca trancado: roda antes do navegador pintar o frame,
 * entao o app nunca aparece "destrancado" por um instante antes da tela de bloqueio entrar.
 *
 * `children` continuam montados por baixo da tela de bloqueio (nunca desmontam) - trocar de
 * app rapidinho nao perde rascunho de formulario nem estado de navegacao.
 */
export default function BiometricLock({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(false);

  useLayoutEffect(() => {
    setLocked(isBiometricLockEnabled());
  }, []);

  useLayoutEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden" && isBiometricLockEnabled()) {
        setLocked(true);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Dispara o prompt biometrico assim que a tela de bloqueio aparece, sem exigir o toque em
  // "Desbloquear" primeiro. O botao continua ali pra repetir se o usuario cancelar/errar, ou pra
  // navegadores que exigem gesto do usuario no WebAuthn (aí o auto-disparo falha calado).
  useEffect(() => {
    if (locked) void tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  async function tryUnlock() {
    setChecking(true);
    const ok = await verifyBiometric();
    setChecking(false);
    if (ok) setLocked(false);
  }

  return (
    <>
      {children}
      {locked && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white px-8 dark:bg-slate-950">
          <div className="flex size-16 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-8"
            >
              <path d="M12 2C9.243 2 7 4.243 7 7v2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V7c0-2.757-2.243-5-5-5zm0 2c1.654 0 3 1.346 3 3v2H9V7c0-1.654 1.346-3 3-3zm0 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
            </svg>
          </div>
          <div className="text-center">
            <div className="text-[16px] font-bold text-slate-900 dark:text-slate-100">
              TravelTrack bloqueado
            </div>
            <div className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
              Confirme sua biometria pra continuar
            </div>
          </div>
          <button
            onClick={() => void tryUnlock()}
            disabled={checking}
            className="w-full max-w-[220px] rounded-xl bg-slate-900 py-3 text-[14px] font-bold text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
          >
            {checking ? "Confirmando..." : "Desbloquear"}
          </button>
        </div>
      )}
    </>
  );
}
