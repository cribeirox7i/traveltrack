"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { DownloadOfflineButton } from "./DownloadOfflineButton";
import { RefreshButton } from "./RefreshButton";
import { ThemeToggle } from "./ThemeToggle";
import { CogIcon, LogoutIcon } from "./icons";

/** Barra de ícones fixa no topo (mesmo padrão visual do header do ArenaApp) reunindo as ações
 * utilitárias que antes ficavam espalhadas em lugares diferentes: "Baixar offline" só existia em
 * `/trips`, "Atualizar" e "Sair" viviam dentro da sidebar/barra inferior do NavBar, e "Config"
 * era só mais um item de menu perdido no meio de Usuários/Acessos. A navegação principal
 * (Viagens/Usuários/Acessos) continua no NavBar - esta barra é só para as ações globais. */
export function TopBar({ initialDark }: { initialDark: boolean }) {
  const { data: session, status } = useSession();

  if (status === "loading" || !session) return null;

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white print:hidden dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Viagens</span>
        <div className="flex shrink-0 items-center gap-1">
          <DownloadOfflineButton />
          <RefreshButton />
          {session.user.role === "admin" && (
            <Link
              href="/admin/parametros"
              aria-label="Configurações"
              title="Configurações"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <CogIcon className="h-5 w-5" />
            </Link>
          )}
          <ThemeToggle initialDark={initialDark} />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Sair"
            title="Sair"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LogoutIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
