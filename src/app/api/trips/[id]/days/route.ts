import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import {
  DAY_AUTO_FIELDS,
  DAY_PATCHABLE_FIELDS,
  listTripDays,
  saveTripDays,
  userCanAccessTrip,
} from "@/lib/sheets/trips";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  return NextResponse.json(await listTripDays(id));
}

const dayPatchSchema = z
  .object({ id: z.string().min(1) })
  .and(z.object(Object.fromEntries(DAY_PATCHABLE_FIELDS.map((f) => [f, z.string().optional()]))));

const saveSchema = z.object({
  days: z.array(dayPatchSchema),
});

/** Grava todos os dias de uma vez, numa única chamada ao Apps Script (botão "Salvar"). */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const parsed = saveSchema.safeParse(await req.json());
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  // Usuário comum só pode editar as abas Lançamentos/Anexos/Roteiro - Orçamento e Itinerário
  // (os únicos dois que gravam por aqui campos que não sejam clima) são admin-only. Os campos de
  // clima (DAY_AUTO_FIELDS) continuam liberados pra qualquer um, porque são gravados sozinhos
  // pelo botão "Atualizar" global, não uma edição de tela - não faz sentido travar isso.
  if (user.role !== "admin") {
    const autoFieldsSet = new Set<string>(DAY_AUTO_FIELDS);
    const temCampoRestrito = parsed.data.days.some((day) =>
      Object.keys(day).some((k) => k !== "id" && !autoFieldsSet.has(k))
    );
    if (temCampoRestrito) {
      return errorResponse("Só administradores podem editar Orçamento/Itinerário", 403);
    }
  }

  await saveTripDays(id, parsed.data.days);
  return NextResponse.json({ ok: true });
}
