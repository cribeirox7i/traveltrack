function toDateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
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
