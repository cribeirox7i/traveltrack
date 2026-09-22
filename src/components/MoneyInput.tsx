"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Campo de valor monetário no padrão ABNT (milhar com ponto, decimal com vírgula, sempre 2 casas)
 * - digita-se como numa maquininha: cada dígito novo entra nos centavos, empurrando o resto pra
 * esquerda (ex.: "1", "2", "3" digitados em sequência viram "0,01" → "0,12" → "1,23"). `value`/
 * `onChange` continuam no formato que o resto do app já usa (número puro com ponto decimal, ex.
 * "1234.56", ou `""` pra "sem valor") - só a EXIBIÇÃO é ABNT, a máscara não vaza pro resto do app.
 *
 * `""`/zero são tratados como "sem valor lançado" (convenção já usada em todo formulário
 * financeiro do app - ex. atrativo gratuito) mesmo a tela sempre mostrando "0,00": o campo nunca
 * fica em branco (é a máscara), mas `onChange` só emite string não-vazia quando o valor é > 0.
 */
export function MoneyInput({
  value,
  onChange,
  className,
  placeholder,
  disabled,
  id,
  required,
  onFocus,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  /** Chamado além do comportamento interno de foco (que move o cursor pro fim) - a tela de
   * Orçamento usa pra saber qual célula está selecionada (replicar coluna). */
  onFocus?: () => void;
  "aria-label"?: string;
}) {
  const [digitos, setDigitos] = useState(() => paraDigitos(value));
  const ultimoEmitido = useRef(value);

  // Sincroniza quando o valor muda por fora (abrir formulário em edição, "Analisar anexo"
  // pré-preenchendo, duplicar item...) - não a cada tecla própria, senão o cursor pularia.
  useEffect(() => {
    if (value === ultimoEmitido.current) return;
    ultimoEmitido.current = value;
    setDigitos(paraDigitos(value));
  }, [value]);

  function emitir(novosDigitos: string) {
    const semZerosEsq = novosDigitos.replace(/^0+(?=\d)/, "").slice(-15);
    setDigitos(semZerosEsq);
    const centavos = Number(semZerosEsq || "0");
    const emitido = centavos === 0 ? "" : (centavos / 100).toFixed(2);
    ultimoEmitido.current = emitido;
    onChange(emitido);
  }

  function moverCursorPraFim(el: HTMLInputElement) {
    const len = el.value.length;
    requestAnimationFrame(() => el.setSelectionRange(len, len));
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatarABNT(digitos)}
      onChange={(e) => emitir(e.target.value.replace(/\D/g, ""))}
      onKeyDown={(e) => {
        // Backspace/Delete removem o ÚLTIMO dígito (os centavos), não importa onde o cursor
        // esteja - consistente com "sempre editando da direita pra esquerda".
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          emitir(digitos.slice(0, -1));
        }
      }}
      onFocus={(e) => {
        moverCursorPraFim(e.currentTarget);
        onFocus?.();
      }}
      onClick={(e) => moverCursorPraFim(e.currentTarget)}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      className={className}
    />
  );
}

function formatarABNT(digitos: string): string {
  const padded = digitos.padStart(3, "0");
  const centavos = padded.slice(-2);
  const inteiro = (padded.slice(0, -2) || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${inteiro},${centavos}`;
}

function paraDigitos(value: string): string {
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return "0";
  return String(Math.round(n * 100));
}
