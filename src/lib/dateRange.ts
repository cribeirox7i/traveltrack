function toDateOnly(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

/** Lista de datas (yyyy-MM-dd) entre start e end, inclusive. Usado tanto ao criar uma viagem no
 * servidor quanto ao criar uma viagem offline no cliente (precisam gerar os mesmos dias). */
export function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = toDateOnly(start);
  const last = toDateOnly(end);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** `qtdDias` datas (yyyy-MM-dd) sequenciais a partir de `start`, inclusive - a grade de dias de
 * uma viagem é sempre isso: `qtdDias` datas seguidas, sem furo, começando em `data_inicio`. */
export function sequentialDates(start: string, qtdDias: number): string[] {
  const cursor = toDateOnly(start);
  const dates: string[] = [];
  for (let i = 0; i < qtdDias; i++) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** `date` + `delta` dias (delta pode ser negativo) - yyyy-MM-dd. */
export function addDays(date: string, delta: number): string {
  const cursor = toDateOnly(date);
  cursor.setDate(cursor.getDate() + delta);
  return cursor.toISOString().slice(0, 10);
}

/** Diferença em dias inteiros entre duas datas (a - b) - positivo se `a` é depois de `b`. */
export function diffDays(a: string, b: string): number {
  const MS_DIA = 86_400_000;
  return Math.round((toDateOnly(a).getTime() - toDateOnly(b).getTime()) / MS_DIA);
}
