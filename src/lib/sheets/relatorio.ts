import { computeRelatorio, Relatorio } from "../relatorioCalc";
import { listItensByTrip } from "./itens";
import { getTrip, listTripDays } from "./trips";

export type { Relatorio, RelatorioCategoria, Categoria } from "../relatorioCalc";

export async function buildRelatorio(tripId: string): Promise<Relatorio | null> {
  const trip = await getTrip(tripId);
  if (!trip) return null;

  const qtdPessoas = Number(trip.qtd_pessoas) || 0;
  const days = await listTripDays(tripId);
  const itens = await listItensByTrip(tripId);

  return computeRelatorio(tripId, qtdPessoas, days, itens, trip.custo_modo);
}
