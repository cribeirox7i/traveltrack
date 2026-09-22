import { computeRelatorio, Relatorio } from "../relatorioCalc";
import { listCambioByTrip } from "./cambio";
import { listClassificacoes } from "./classificacoes";
import { listCountries } from "./countries";
import { listItensByTrip } from "./itens";
import { getTrip, listTripDays } from "./trips";

export type { Relatorio, RelatorioCategoria, Categoria } from "../relatorioCalc";

export async function buildRelatorio(tripId: string): Promise<Relatorio | null> {
  const trip = await getTrip(tripId);
  if (!trip) return null;

  const qtdPessoas = Number(trip.qtd_pessoas) || 0;
  const [days, itens, cambios, countries, classificacoes] = await Promise.all([
    listTripDays(tripId),
    listItensByTrip(tripId),
    listCambioByTrip(tripId),
    listCountries(),
    listClassificacoes(),
  ]);

  // Cotação do dia por moeda (Countries.rate_brl) - queda pra converter itens em moeda que não
  // tem câmbio registrado na viagem. Ver `computeRelatorio`.
  const cotacoes: Record<string, number> = {};
  for (const c of countries) {
    const code = (c.currency_code || "").trim().toUpperCase();
    const rate = Number(String(c.rate_brl).replace(",", "."));
    if (code && Number.isFinite(rate) && rate > 0 && !cotacoes[code]) cotacoes[code] = rate;
  }

  const nomePorClassificacao = Object.fromEntries(classificacoes.map((c) => [c.id, c.nome]));
  const itensComNome = itens.map((i) => ({
    ...i,
    classificacaoNome: nomePorClassificacao[i.classificacao_id] ?? "",
  }));

  return computeRelatorio(tripId, qtdPessoas, days, itensComNome, trip.custo_modo, cambios, cotacoes);
}
