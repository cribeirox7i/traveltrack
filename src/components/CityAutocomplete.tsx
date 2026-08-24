"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface CitySelection {
  nome: string;
  lat: string;
  lon: string;
  /** País da sugestão escolhida, como a Open-Meteo devolveu (em português, por causa de
   * `language=pt` na busca) - "" quando a sugestão não trouxer país. */
  pais: string;
}

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

interface CityAutocompleteProps {
  value: string;
  onTextChange: (texto: string) => void;
  onSelect: (city: CitySelection) => void;
  onFocus?: () => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Tem coordenada salva (veio de uma sugestão escolhida na API)? Controla a bolinha de status:
   * verde = cidade real da API, amarela = texto livre digitado sem selecionar sugestão. */
  hasCoordinates?: boolean;
}

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

function labelFor(r: GeoResult): string {
  const partes = [r.admin1, r.country].filter(Boolean);
  return partes.length ? `${r.name} - ${partes.join(", ")}` : r.name;
}

/**
 * Autocomplete de cidade, buscando direto no navegador na API de geocoding da
 * Open-Meteo (gratuita, sem chave, CORS aberto) - mesma API já usada pra temperatura.
 * Componente "burro": não sabe de TripDay/Trip, só devolve texto livre (onTextChange)
 * ou uma cidade escolhida com coordenadas (onSelect). Quem usa decide o que fazer com
 * cada um - normalmente limpar lat/lon ao digitar livre e gravar os três ao selecionar.
 */
export function CityAutocomplete({
  value,
  onTextChange,
  onSelect,
  onFocus,
  disabled,
  className,
  placeholder,
  hasCoordinates,
}: CityAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // O dropdown é renderizado num portal (document.body), `position: fixed` - sem isso, dentro de
  // um container com scroll (ex.: a grade de dias do Itinerário, `overflow-x-auto`), a lista de
  // sugestões ficava cortada pela borda do container em vez de flutuar por cima de tudo. Precisa
  // recalcular a posição a cada abertura e a cada scroll/resize enquanto estiver aberto, já que
  // `fixed` não acompanha o input sozinho.
  useEffect(() => {
    if (!open) return;
    function updatePos() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) setMenuPos({ top: rect.bottom, left: rect.left, width: rect.width });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  function scheduleSearch(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (query.trim().length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=pt&format=json`,
          { signal: controller.signal }
        );
        const data = res.ok ? await res.json() : null;
        setSuggestions(data?.results ?? []);
        setOpen(true);
        setHighlighted(0);
      } catch {
        // busca cancelada (digitou de novo) ou falhou - sem sinal, por exemplo. Sem problema,
        // o campo continua funcionando como texto livre.
      }
    }, DEBOUNCE_MS);
  }

  function handleChange(text: string) {
    onTextChange(text);
    scheduleSearch(text);
  }

  function handlePick(result: GeoResult) {
    onSelect({
      nome: result.name,
      lat: String(result.latitude),
      lon: String(result.longitude),
      pais: result.country ?? "",
    });
    setOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handlePick(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length) setOpen(true);
          onFocus?.();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {value.trim() && (
        <span
          title={
            hasCoordinates
              ? "Cidade confirmada na busca (com coordenadas)"
              : "Texto livre - não selecionado da busca, sem coordenadas"
          }
          className={`pointer-events-none absolute right-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${
            hasCoordinates ? "bg-green-500" : "bg-amber-400"
          }`}
        />
      )}
      {open &&
        suggestions.length > 0 &&
        menuPos &&
        createPortal(
          <ul
            style={{ position: "fixed", top: menuPos.top, left: menuPos.left, width: "max-content", minWidth: menuPos.width }}
            className="z-50 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs shadow-lg"
          >
            {suggestions.map((s, i) => (
              <li key={`${s.name}-${s.latitude}-${s.longitude}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handlePick(s)}
                  className={`block w-full whitespace-nowrap px-3 py-1.5 text-left ${
                    i === highlighted ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50"
                  }`}
                >
                  {labelFor(s)}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
