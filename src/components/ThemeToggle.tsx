"use client";

import { useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

/** Mesmo padrão do ArenaApp: cookie (não localStorage) porque o servidor lê ele em
 * `layout.tsx`/`(app)/layout.tsx` pra já mandar o HTML com a classe `dark` certa - sem isso
 * haveria um flash de tema claro antes do JS rodar no cliente. */
export function ThemeToggle({ initialDark }: { initialDark: boolean }) {
  const [isDark, setIsDark] = useState(initialDark);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    document.cookie = `theme=${next ? "dark" : "light"}; path=/; max-age=31536000`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      title={isDark ? "Tema claro" : "Tema escuro"}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
}
