import { computeRelatorio, Relatorio } from "../relatorioCalc";
import { listDespesasByTrip, listReceitasByTrip } from "./financas";
import { getTrip, listTripDays } from "./trips";

export type { Relatorio, RelatorioCategoria, Categoria } from "../relatorioCalc";

export async function buildRelatorio(tripId: string): Promise<Relatorio | null> {
  const trip = await getTrip(tripId);
  if (!trip) return null;

  const qtdPessoas = Number(trip.qtd_pessoas) || 0;
  const days = await listTripDays(tripId);
  const despesas = await listDespesasByTrip(tripId);
  const receitas = await listReceitasByTrip(tripId);

  return computeRelatorio(tripId, qtdPessoas, days, despesas, receitas);
}
