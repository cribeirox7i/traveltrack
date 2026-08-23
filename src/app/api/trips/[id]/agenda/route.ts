import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { createAgenda, listAgendaByTrip } from "@/lib/sheets/agenda";
import { uploadAnexo } from "@/lib/sheets/anexos";
import { getTrip, listTripDays, userCanAccessTrip } from "@/lib/sheets/trips";

// Mesmo teto da rota de anexos: margem abaixo do limite de corpo (~4.5MB) das funções
// serverless da Vercel.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

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

  return NextResponse.json(await listAgendaByTrip(id));
}

const createSchema = z.object({
  id: z.string().min(1).optional(),
  data: z.string().date(),
  horario: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Horário deve estar no formato HH:MM"),
  descricao: z.string().min(1, "Descrição é obrigatória"),
  url: z.string().url("URL inválida").or(z.literal("")).optional(),
});

/**
 * Aceita `multipart/form-data` (quando vem anexo) ou JSON puro. O anexo é enviado ao Drive
 * antes de gravar a linha, para que o compromisso já nasça com o arquivo vinculado — se o
 * upload falhar, nada é gravado, em vez de deixar uma agenda apontando para um anexo que não
 * existe.
 */
export async function POST(
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
      id: form.get("id") ? String(form.get("id")) : undefined,
      data: String(form.get("data") ?? ""),
      horario: String(form.get("horario") ?? ""),
      descricao: String(form.get("descricao") ?? ""),
      url: String(form.get("url") ?? ""),
    };
  } else {
    raw = await req.json();
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  // A data precisa ser uma das diárias da viagem — é o que amarra o compromisso a um acordeão
  // existente na tela. Sem essa checagem, uma data fora do período criaria uma linha órfã,
  // invisível na Agenda.
  const days = await listTripDays(id);
  if (!days.some((d) => d.data === parsed.data.data)) {
    return errorResponse("A data precisa ser uma das datas da viagem");
  }

  if (file && file.size > MAX_FILE_BYTES) {
    return errorResponse(
      `Arquivo muito grande (máx. ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB)`
    );
  }

  let anexo: { fileId: string; name: string; url: string } | null = null;
  if (file) {
    const buffer = Buffer.from(await file.arrayBuffer());
    anexo = await uploadAnexo({
      tripId: trip.id,
      tripName: trip.nome,
      categoria: "agenda",
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      base64Data: buffer.toString("base64"),
    });
  }

  const criado = await createAgenda({
    ...parsed.data,
    trip_id: id,
    criado_por: user.id,
    anexo_file_id: anexo?.fileId,
    anexo_nome: anexo?.name,
    anexo_url: anexo?.url,
  });

  return NextResponse.json(criado, { status: 201 });
}
