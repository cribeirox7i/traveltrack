/** Seletor de hora próprio (dois `<select>` HH/MM) em vez de `<input type="time">` nativo - o
 * relógio nativo do Android/Samsung (WebView) estoura a tela em alguns aparelhos quando o app
 * roda com zoom por pinça desligado (viewport travado de propósito, ver `app/layout.tsx`), com o
 * botão de confirmar cortado fora da tela. Um `<select>` usa o dropdown de lista simples do
 * sistema, que não tem esse problema. */
const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const selectClass =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-2 text-sm text-center";

export function TimeField({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [hora, minuto] = value ? value.split(":") : ["", ""];

  function update(novaHora: string, novoMinuto: string) {
    onChange(novaHora || novoMinuto ? `${novaHora || "00"}:${novoMinuto || "00"}` : "");
  }

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <select
        value={hora ?? ""}
        onChange={(e) => update(e.target.value, minuto ?? "")}
        disabled={disabled}
        className={selectClass}
      >
        <option value="">--</option>
        {HORAS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-slate-400 dark:text-slate-500">:</span>
      <select
        value={minuto ?? ""}
        onChange={(e) => update(hora ?? "", e.target.value)}
        disabled={disabled}
        className={selectClass}
      >
        <option value="">--</option>
        {MINUTOS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
