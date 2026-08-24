export interface TripDayCities {
  origem: string;
  destino: string;
  pernoite: string;
  origem_pais: string;
  destino_pais: string;
  pernoite_pais: string;
}

/** Cidades distintas do roteiro (Origem/Destino/Pernoite de todos os dias), com o país que foi
 * capturado junto na hora da escolha no autocomplete (ver Itinerário) - repetições e campos
 * vazios descartados. Usado tanto pelo banner de fotos (TripHeroImage) quanto pelo Dashboard da
 * viagem (contagem de cidades/países, acordeões de fuso/eletricidade). */
export function distinctCities(days: TripDayCities[]): { cidade: string; pais: string }[] {
  const vistos = new Map<string, { cidade: string; pais: string }>();
  for (const day of days) {
    const candidatos: [string, string][] = [
      [day.origem, day.origem_pais],
      [day.destino, day.destino_pais],
      [day.pernoite, day.pernoite_pais],
    ];
    for (const [cidade, pais] of candidatos) {
      const nome = cidade?.trim();
      if (!nome) continue;
      const chave = nome.toLowerCase();
      if (!vistos.has(chave)) vistos.set(chave, { cidade: nome, pais: pais?.trim() ?? "" });
    }
  }
  return Array.from(vistos.values());
}
