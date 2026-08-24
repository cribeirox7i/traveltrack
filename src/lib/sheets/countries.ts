import { v4 as uuid } from "uuid";
import { appendRows, readSheet, updateRowByField } from "./repository";
import { CountryRow } from "./types";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Tabela de referência por país inteira, sem filtro por viagem (não é dado por viagem). */
export async function listCountries(): Promise<CountryRow[]> {
  return readSheet<CountryRow>("Countries");
}

/**
 * Completa a linha de um país com os campos informados - só os que a linha ainda não tem
 * (célula vazia), nunca sobrescreve o que já existe, seja um valor curado à mão (plug_type/
 * volts/hertz, herança da antiga aba "Eletric") ou já preenchido automaticamente numa chamada
 * anterior (por outro aparelho, outra viagem). Cria a linha do zero se o país ainda não
 * aparecia na aba. `rate_brl`/`rate_date` são exceção: sempre sobrescritos quando informados,
 * porque são uma cotação do dia, não um dado estático - ver `updateExchangeRate`.
 */
export async function upsertCountry(
  country: string,
  fields: Partial<Omit<CountryRow, "id" | "country">>
): Promise<void> {
  const all = await listCountries();
  const alvo = normalize(country);
  const existing = all.find((r) => normalize(r.country) === alvo);

  if (!existing) {
    const row: CountryRow = {
      id: uuid(),
      country,
      plug_type: "",
      volts: "",
      hertz: "",
      currency_code: "",
      currency_name: "",
      currency_symbol: "",
      capital: "",
      ddi: "",
      driving_side: "",
      timezone: "",
      flag_emoji: "",
      language: "",
      rate_brl: "",
      rate_date: "",
      ...fields,
    };
    await appendRows("Countries", [row]);
    return;
  }

  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const alwaysOverwrite = key === "rate_brl" || key === "rate_date";
    if (alwaysOverwrite || !existing[key]) patch[key] = value;
  }
  if (Object.keys(patch).length === 0) return;
  await updateRowByField("Countries", "country", existing.country, patch);
}

/** Atalho pra gravar só a cotação do dia (rate_brl/rate_date), sem mexer no resto da linha do
 * país - separado de `upsertCountry` porque estes dois campos têm a regra de sobrescrita
 * diferente dos outros (sempre atualiza, nunca "só se estiver vazio"). */
export async function updateExchangeRate(
  country: string,
  rateBrl: number,
  date: string
): Promise<void> {
  await upsertCountry(country, { rate_brl: String(rateBrl), rate_date: date });
}
