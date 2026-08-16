"use client";

import { useEffect } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { Session } from "next-auth";
import { initSync } from "@/lib/offline/sync";

/** Só liga a sincronização em segundo plano quando há sessão de verdade — evita bater em
 * /api/* (e ganhar 401 à toa) enquanto o usuário ainda está na tela de login. */
function SyncBoot() {
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") initSync();
  }, [status]);

  return null;
}

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider session={session}>
      <SyncBoot />
      {children}
    </SessionProvider>
  );
}
