import { cookies } from "next/headers";
import { NavBar } from "@/components/NavBar";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { TopBar } from "@/components/TopBar";
import { buildLabel } from "@/lib/version";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialDark = cookieStore.get("theme")?.value === "dark";

  return (
    <div className="flex flex-1 flex-col">
      <TopBar initialDark={initialDark} />
      {/* TopBar virou `fixed` (não fica scrollando com a página, ver TopBar.tsx) - sem ocupar
          espaço no fluxo normal, então este `pt-14` compensa a altura dela (`h-14`), senão o
          conteúdo abaixo nasceria escondido debaixo da barra. */}
      <div className="pt-14 flex flex-1 flex-col">
        <SyncStatusBar />
        <div className="flex flex-1 flex-col md:flex-row">
        <NavBar />
        {/* max-w-[1078px]: os 980px de antes, 10% mais largo - mesma largura da TopBar em
            components/TopBar.tsx, pra alinhar as duas. */}
        <main className="flex-1 px-4 pt-4 pb-24 md:px-8 md:pt-8 md:pb-10 max-w-[1078px] mx-auto w-full">
          {children}
        </main>
        </div>
      </div>
      <footer className="fixed bottom-16 md:bottom-0 left-0 right-0 z-20 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 py-1 text-center text-[11px] text-slate-300 dark:text-slate-600">
        TravelTrack {buildLabel()}
      </footer>
    </div>
  );
}
