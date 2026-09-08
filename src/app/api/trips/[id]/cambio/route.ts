import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession, sessionCanAccessTrip, tripLockError } from "@/lib/api-helpers";
import { createCambio, listCambioByTrip } from "@/lib/sheets/cambio";
import { getTrip } from "@/lib/sheets/trips";
import { listUserRolesByIds } from "@/lib/sheets/users";

const numeroPositivo = z
  .string()
  .trim()
  .min(1, "Preencha os valores")
  .refine((v) => {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && n > 0;
  }, "Valor precisa ser um número maior que zero");

const cambioSchema = z.object({
  id: z.string().min(1).optional(),
  data: z.string().date(),
  moeda: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Moeda precisa ser um código de 3 letras (ex.: USD)"),
  qtd_moeda: numeroPositivo,
  qtd_reais: numeroPositivo,
  taxa_efetiva: numeroPositivo,
  descricao: z.string().trim().max(200).optional().default(""),
});

/**
 * GET devolve os eventos de câmbio da viagem já com `criado_por_role` (papel de quem criou) -
 * a tela precisa disso pra aplicar a mesma hierarquia de edição do backend ao mostrar/esconder
 * os botões. O servidor continua sendo a garantia (ver `canManageByHierarchy`).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  let cambios;
  try {
    cambios = await listCambioByTrip(id);
    const papelPorId = await listUserRolesByIds(cambios.map((c) => c.criado_por));
    return NextResponse.json(
      cambios.map((c) => ({ ...c, criado_por_role: papelPorId[c.criado_por] ?? "" }))
    );
  } catch (err) {
    console.error("GET cambio falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao carregar o câmbio: ${err.message}` : "Falha ao carregar o câmbio",
      502
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { user } = auth.session;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const trip = await getTrip(id);
  if (!trip) return errorResponse("Viagem não encontrada", 404);
  const bloqueio = tripLockError(trip);
  if (bloqueio) return bloqueio;

  const parsed = cambioSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  try {
    const criado = await createCambio({
      id: parsed.data.id,
      tripId: id,
      data: parsed.data.data,
      moeda: parsed.data.moeda,
      qtd_moeda: parsed.data.qtd_moeda,
      qtd_reais: parsed.data.qtd_reais,
      taxa_efetiva: parsed.data.taxa_efetiva,
      descricao: parsed.data.descricao,
      criadoPor: user.id,
    });
    return NextResponse.json({ ...criado, criado_por_role: user.role }, { status: 201 });
  } catch (err) {
    console.error("POST cambio falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao salvar o câmbio: ${err.message}` : "Falha ao salvar o câmbio",
      502
    );
  }
}
