import { NextRequest, NextResponse } from "next/server";
import { detectarTipoVoucher } from "@/lib/fileValidation";
import { errorResponse, requireSession, sessionCanAccessTrip, tripLockError } from "@/lib/api-helpers";
import { uploadAnexo } from "@/lib/sheets/anexos";
import { createAnexoSolto, listAnexosSoltosByTrip } from "@/lib/sheets/anexosSoltos";
import { getTrip } from "@/lib/sheets/trips";

// Mesmo teto das outras rotas de upload (margem abaixo do limite de corpo das funções
// serverless da Vercel, ~4.5MB).
const MAX_FILE_BYTES = 4 * 1024 * 1024;

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

  try {
    return NextResponse.json(await listAnexosSoltosByTrip(id));
  } catch (err) {
    console.error("GET anexos-soltos falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao carregar os anexos: ${err.message}` : "Falha ao carregar os anexos",
      502
    );
  }
}

/** Sempre multipart (arquivo obrigatório) - diferente de Itens, aqui não existe "salvar sem
 * arquivo": o anexo solto É o arquivo, data/descrição são só metadado dele. */
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

  const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");
  if (!isMultipart) return errorResponse("Envie o arquivo como multipart/form-data");

  const form = await req.formData();
  const file = form.get("file");
  const data = String(form.get("data") ?? "").trim();
  const descricao = String(form.get("descricao") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) return errorResponse("Escolha um arquivo");
  if (!data) return errorResponse("Escolha a data");
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(`Arquivo muito grande (máx. ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB)`);
  }
  const tipoDetectado = await detectarTipoVoucher(file);
  if (!tipoDetectado) {
    return errorResponse("Arquivo precisa ser PDF, JPG, JPEG, PNG ou BMP");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const anexo = await uploadAnexo({
      tripId: trip.id,
      tripName: trip.nome,
      categoria: "outros",
      filename: file.name,
      mimeType: tipoDetectado,
      base64Data: buffer.toString("base64"),
    });

    const criado = await createAnexoSolto({
      tripId: id,
      data,
      descricao,
      fileId: anexo.fileId,
      nome: anexo.name,
      url: anexo.url,
      criadoPor: user.id,
    });

    return NextResponse.json(criado, { status: 201 });
  } catch (err) {
    console.error("upload de anexo solto falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao enviar o anexo: ${err.message}` : "Falha ao enviar o anexo",
      502
    );
  }
}
