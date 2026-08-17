"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const links = [
  { href: "/trips", label: "Viagens", icon: "🧳" },
  { href: "/admin/usuarios", label: "Usuários", icon: "👤", adminOnly: true },
  { href: "/admin/acessos", label: "Acessos", icon: "🔑", adminOnly: true },
  { href: "/admin/parametros", label: "Config", icon: "⚙️", adminOnly: true },
];

export function NavBar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (status === "loading" || pathname === "/login" || !session) return null;

  const role = session.user.role;
  const visibleLinks = links.filter((l) => !l.adminOnly || role === "admin");

  return (
    <>
      <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:border-slate-200 md:bg-white md:p-4 md:gap-2">
        <div className="mb-4 px-2">
          <p className="font-semibold text-slate-800">Viagens</p>
          <p className="text-xs text-slate-500 truncate">{session.user.name}</p>
        </div>
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              pathname.startsWith(link.href)
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {link.icon} {link.label}
          </Link>
        ))}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-auto rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Sair
        </button>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-10 flex border-t border-slate-200 bg-white md:hidden">
        {visibleLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              pathname.startsWith(link.href) ? "text-slate-900 font-semibold" : "text-slate-500"
            }`}
          >
            <span className="text-lg">{link.icon}</span>
            {link.label}
          </Link>
        ))}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-slate-500"
        >
          <span className="text-lg">🚪</span>
          Sair
        </button>
      </nav>
    </>
  );
}
