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

export function BusIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M3.5 11h17M7.5 4.5v6.5M13 4.5v6.5" />
      <circle cx="7.5" cy="19" r="1.5" />
      <circle cx="16.5" cy="19" r="1.5" />
    </svg>
  );
}

export function VanIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M3 16V9.5a1 1 0 0 1 1-1h8a1 1 0 0 1 .8.4l3 3.6H20a1 1 0 0 1 1 1V16" />
      <path d="M3 16h18M12.5 8.5V12" />
      <circle cx="7.5" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </svg>
  );
}

export function CarIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M4 16.5l1.3-4.5A2 2 0 0 1 7.2 10.5h9.6a2 2 0 0 1 1.9 1.5l1.3 4.5" />
      <path d="M3 16.5h18M6 13.5h12" />
      <circle cx="7.5" cy="18.5" r="1.4" />
      <circle cx="16.5" cy="18.5" r="1.4" />
    </svg>
  );
}

export function PlaneIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M12 2.5l1.6 6.2h5.6a1 1 0 0 1 .6 1.8l-4.6 3.6.8 5-3.5-2-1 2.4h-.9l-1-2.4-3.5 2 .8-5-4.6-3.6a1 1 0 0 1 .6-1.8h5.6L12 2.5Z" />
    </svg>
  );
}

export function ShipIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <path d="M4 15l1.6 4.1a2 2 0 0 0 1.9 1.3h8.9a2 2 0 0 0 1.9-1.3L20 15" />
      <path d="M6.5 15V9.5a1 1 0 0 1 1-1H10V4.5h2V8.5h3.5a1 1 0 0 1 1 1V15" />
      <path d="M3 15h18" />
    </svg>
  );
}

export function TrainIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className} aria-hidden="true">
      <rect x="5.5" y="3.5" width="13" height="13" rx="4" />
      <path d="M5.5 10h13M9 3.5v6.5M15 3.5v6.5" />
      <circle cx="9" cy="13" r="1" />
      <circle cx="15" cy="13" r="1" />
      <path d="M7.5 19.5l-1.8 2.2M16.5 19.5l1.8 2.2" />
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
