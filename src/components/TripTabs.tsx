"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const TRIP_TAB_SLUGS = ["orcamento", "despesas", "receitas", "anexos", "relatorio"] as const;

const TABS = [
  { slug: "orcamento", label: "Orçamento" },
  { slug: "despesas", label: "Despesas" },
  { slug: "receitas", label: "Receitas" },
  { slug: "anexos", label: "Anexos" },
  { slug: "relatorio", label: "Relatório" },
];

export function TripTabs({ tripId }: { tripId: string }) {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map((tab) => {
        const href = `/trips/${tripId}/${tab.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.slug}
            href={href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              active
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
