import { cookies } from "next/headers";
import { NavBar } from "@/components/NavBar";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { TopBar } from "@/components/TopBar";

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
        <main className="flex-1 pb-20 md:pb-6 p-4 md:p-8 max-w-[1078px] mx-auto w-full">
          {children}
        </main>
        </div>
      </div>
    </div>
  );
}
