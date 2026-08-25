import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { urlHttpSchema } from "@/lib/urlSegura";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { deleteAgenda, getAgenda, updateAgenda } from "@/lib/sheets/agenda";
import { deleteAnexo, uploadAnexo } from "@/lib/sheets/anexos";
import { getTrip, listTripDays, userCanAccessTrip } from "@/lib/sheets/trips";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

const patchSchema = z.object({
  data: z.string().date(),
  horario: z.string().regex(/^\d{2}:\d{2}$/, "Horário deve estar no formato HH:MM"),
  titulo: z.string().min(1, "Título é obrigatório"),
  descricao: z.string().optional().default(""),
  url: urlHttpSchema.or(z.literal("")).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; agendaId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, agendaId } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const agenda = await getAgenda(agendaId);
  if (!agenda || agenda.trip_id !== id) {
    return errorResponse("Compromisso não encontrado", 404);
  }

  const trip = await getTrip(id);
  if (!trip) return errorResponse("Viagem não encontrada", 404);

  const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");
  let raw: Record<string, unknown>;
  let file: File | null = null;

  if (isMultipart) {
    const form = await req.formData();
    const maybeFile = form.get("file");
    if (maybeFile instanceof File && maybeFile.size > 0) file = maybeFile;
    raw = {
      data: String(form.get("data") ?? ""),
      horario: String(form.get("horario") ?? ""),
      titulo: String(form.get("titulo") ?? ""),
      descricao: String(form.get("descricao") ?? ""),
      url: String(form.get("url") ?? ""),
    };
  } else {
    raw = await req.json();
  }

  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  const days = await listTripDays(id);
  if (!days.some((d) => d.data === parsed.data.data)) {
    return errorResponse("A data precisa ser uma das datas da viagem");
  }

  if (file && file.size > MAX_FILE_BYTES) {
    return errorResponse(
      `Arquivo muito grande (máx. ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB)`
    );
  }

  const patch: Record<string, string> = { ...parsed.data, url: parsed.data.url ?? "" };
  let avisoAnexo: string | undefined;

  if (file) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const anexo = await uploadAnexo({
      tripId: trip.id,
      tripName: trip.nome,
      categoria: "agenda",
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      base64Data: buffer.toString("base64"),
    });
    patch.anexo_file_id = anexo.fileId;
    patch.anexo_nome = anexo.name;
    patch.anexo_url = anexo.url;

    // O anexo antigo (se existia) vira lixo no Drive assim que ele para de ser referenciado
    // por esta linha - removê-lo é desejável, mas não pode derrubar a edição em si (mesma
    // lição de `deleteTrip`/DELETE deste arquivo: uma limpeza acessória é best-effort).
    if (agenda.anexo_file_id) {
      try {
        await deleteAnexo(agenda.anexo_file_id, trip.id, trip.nome);
      } catch (err) {
        avisoAnexo = err instanceof Error ? err.message : String(err);
      }
    }
  }

  await updateAgenda(agendaId, patch);
  return NextResponse.json({ ok: true, ...(avisoAnexo ? { avisoAnexo } : {}) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; agendaId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, agendaId } = await params;
  const { user } = auth.session;
  if (!(await userCanAccessTrip(user.id, user.role, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const agenda = await getAgenda(agendaId);
  if (!agenda || agenda.trip_id !== id) {
    return errorResponse("Compromisso não encontrado", 404);
  }

  const trip = await getTrip(id);
  if (!trip) return errorResponse("Viagem não encontrada", 404);

  await deleteAgenda(agendaId);

  // O anexo vai junto, mas sem poder derrubar a exclusão do compromisso - mesma lição da
  // exclusão de viagem: uma limpeza acessória no Drive não decide se a operação principal
  // deu certo (ver deleteTrip em lib/sheets/trips.ts).
  if (!agenda.anexo_file_id) return NextResponse.json({ ok: true, anexoRemovido: true });

  try {
    await deleteAnexo(agenda.anexo_file_id, trip.id, trip.nome);
    return NextResponse.json({ ok: true, anexoRemovido: true });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      anexoRemovido: false,
      avisoAnexo: err instanceof Error ? err.message : String(err),
    });
  }
}
