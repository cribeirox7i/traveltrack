import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { listCountries, upsertCountry } from "@/lib/sheets/countries";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  return NextResponse.json(await listCountries());
}

const upsertSchema = z.object({
  country: z.string().min(1),
  fields: z.object({
    currency_code: z.string().optional(),
    currency_name: z.string().optional(),
    currency_symbol: z.string().optional(),
    capital: z.string().optional(),
    ddi: z.string().optional(),
    driving_side: z.enum(["left", "right", ""]).optional(),
    timezone: z.string().optional(),
    flag_emoji: z.string().optional(),
    rate_brl: z.string().optional(),
    rate_date: z.string().optional(),
  }),
});

/** Completa (ou cria) a linha do país na aba Countries - ver `upsertCountry` pra regra de quando
 * um campo é sobrescrito ou só preenchido se estava vazio. Qualquer usuário autenticado pode
 * chamar (não é admin-only): é dado de referência compartilhado, não configuração sensível. */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const parsed = upsertSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  await upsertCountry(parsed.data.country, parsed.data.fields);
  return NextResponse.json({ ok: true });
}
