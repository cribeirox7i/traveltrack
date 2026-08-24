"use client";

import { useEffect, useState } from "react";
import { DownloadIcon } from "./icons";

/** Evento não-padrão do Chrome/Android (ainda não faz parte do lib.dom.d.ts do TypeScript). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "installPromptDismissedAt";
const DISMISS_DIAS = 14;
const INSTALLED_KEY = "installPromptInstalled";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari/iOS não tem `display-mode: standalone` confiável - usa a propriedade própria dele.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function foiDispensadoRecentemente(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dias = (Date.now() - Number(raw)) / 86_400_000;
  return dias < DISMISS_DIAS;
}

/**
 * Banner estilo notificação (não um modal bloqueante) oferecendo instalar o app, só em
 * navegador mobile e só se ainda não estiver instalado - comportamento diferente por
 * plataforma, já que só o Chrome/Android expõe uma API de verdade pra isso:
 * - Android/Chrome: escuta `beforeinstallprompt`, guarda o evento e dispara `prompt()` real
 *   no clique de "Instalar".
 * - iOS/Safari: não existe esse evento - mostra instrução manual (Compartilhar > Adicionar à
 *   Tela de Início), não tem botão de ação nenhum pra disparar.
 * "Agora não" silencia por 14 dias (localStorage) - não é pra aparecer toda vez que abrir o site.
 */
export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios" | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(INSTALLED_KEY) === "true") return;
    if (isStandalone() || !isMobile() || foiDispensadoRecentemente()) return;

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPlatform("android");
      setVisible(true);
    }
    function onAppInstalled() {
      localStorage.setItem(INSTALLED_KEY, "true");
      setVisible(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    // iOS não dispara `beforeinstallprompt` - sem evento nenhum pra esperar, só mostra direto
    // (com um respiro de alguns segundos, pra não competir com o carregamento da tela).
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      timer = setTimeout(() => {
        setPlatform("ios");
        setVisible(true);
      }, 2500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") localStorage.setItem(INSTALLED_KEY, "true");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex items-start gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-lg sm:inset-x-auto sm:right-4 sm:w-80">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900">
        <DownloadIcon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Instalar o TravelTrack
        </p>
        {platform === "android" ? (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Adicione à tela inicial pra abrir como um app, com acesso offline.
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Toque em <strong>Compartilhar</strong> (⬆️) e depois em{" "}
            <strong>Adicionar à Tela de Início</strong>.
          </p>
        )}
        <div className="mt-2 flex items-center gap-3">
          {platform === "android" && (
            <button
              type="button"
              onClick={handleInstall}
              className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white"
            >
              Instalar
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
