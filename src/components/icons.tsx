/** Ícones outline minimalistas, mesmo padrão visual do ArenaApp (stroke 1.6, sem preenchimento) -
 * usados na barra de ícones do topo (ver TopBar.tsx). */
type IconProps = { className?: string };

const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function MoonIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  );
}

export function SunIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function CogIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.4 7.4 0 0 0 0-3l1.8-1.4-2-3.4-2.1.6a7.3 7.3 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.3a7.3 7.3 0 0 0-2.6 1.5l-2.1-.6-2 3.4L4.6 10.5a7.4 7.4 0 0 0 0 3l-1.8 1.4 2 3.4 2.1-.6c.75.66 1.63 1.17 2.6 1.5L10 21.5h4l.5-2.3a7.3 7.3 0 0 0 2.6-1.5l2.1.6 2-3.4-1.8-1.4Z" />
    </svg>
  );
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M9 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h3" />
      <path d="M14 8.5l4 3.5-4 3.5M18 12H9" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M12 3.5v11M8 11l4 4 4-4" />
      <path d="M4.5 16.5v2A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </svg>
  );
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5" />
      <path d="M4 20v-4.5h4.5" />
    </svg>
  );
}
