"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

// "Config" (era um item de menu aqui) e "Sair" viraram ícones na TopBar - esta barra agora é só
// navegação de página, não ações utilitárias.
const links = [
  { href: "/trips", label: "Viagens", icon: "🧳" },
  { href: "/admin/usuarios", label: "Usuários", icon: "👤", adminOnly: true },
  { href: "/admin/acessos", label: "Acessos", icon: "🔑", adminOnly: true },
];

export function NavBar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (status === "loading" || pathname === "/login" || !session) return null;

  const role = session.user.role;
  const visibleLinks = links.filter((l) => !l.adminOnly || role === "admin");

  return (
    <>
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-slate-200 md:bg-white md:p-4 md:gap-2 dark:md:border-slate-800 dark:md:bg-slate-900">
        <div className="mb-4 px-2">
          <p className="font-semibold text-slate-800 dark:text-slate-100">Viagens</p>
          <p className="text-xs text-slate-500 truncate dark:text-slate-400">
            {session.user.name}
          </p>
        </div>
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              pathname.startsWith(link.href)
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {link.icon} {link.label}
          </Link>
        ))}
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-10 flex border-t border-slate-200 bg-white md:hidden dark:border-slate-800 dark:bg-slate-900">
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              pathname.startsWith(link.href)
                ? "text-slate-900 font-semibold dark:text-slate-100"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <span className="text-lg">{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
