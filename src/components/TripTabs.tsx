"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TRIP_TAB_GROUPS, groupOfSlug } from "@/lib/tripTabs";

export function TripTabs({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const currentSlug = pathname.split("/").pop() ?? "";
  const activeGroup = groupOfSlug(currentSlug) ?? TRIP_TAB_GROUPS[0];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {TRIP_TAB_GROUPS.map((group) => {
          const active = group.key === activeGroup.key;
          // O grupo em si não é uma rota - leva pra primeira aba dele, que é a página que já
          // existia como entrada natural daquele assunto (Orçamento pro Financeiro, Agenda pro
          // Roteiro, o próprio Anexos pro grupo de um item só).
          const href = `/trips/${tripId}/${group.tabs[0].slug}`;
          return (
            <Link
              key={group.key}
              href={href}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold uppercase tracking-wide ${
                active
                  ? "border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100"
                  : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-700"
              }`}
            >
              {group.label}
            </Link>
          );
        })}
      </div>

      {activeGroup.tabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto">
          {activeGroup.tabs.map((tab) => {
            const href = `/trips/${tripId}/${tab.slug}`;
            const active = pathname === href;
            return (
              <Link
                key={tab.slug}
                href={href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
