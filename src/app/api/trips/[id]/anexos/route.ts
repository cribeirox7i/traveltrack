import { NextRequest, NextResponse } from "next/server";
import { detectarTipoVoucher } from "@/lib/fileValidation";
import { errorResponse, requireSession, sessionCanAccessTrip, tripLockError } from "@/lib/api-helpers";
import { uploadDriveFile } from "@/lib/sheets/driveFiles";
import { createAnexo, listAnexosByTrip } from "@/lib/sheets/anexos";
import { listItensByTrip } from "@/lib/sheets/itens";
import { getTrip } from "@/lib/sheets/trips";

// Mesmo teto das outras rotas de upload (margem abaixo do limite de corpo das funções
// serverless da Vercel, ~4.5MB).
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Todos os anexos da viagem - soltos e de Item juntos (aba `Anexos` unificada, 2026-09-24).
 * Quem chama filtra por `item_id` no cliente quando precisa só de um dos dois grupos: a tela
 * solta de Anexos só mostra os com `item_id` vazio, a tela de Itens filtra pelos do item aberto. */
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
    return NextResponse.json(await listAnexosByTrip(id));
  } catch (err) {
    console.error("GET anexos falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao carregar os anexos: ${err.message}` : "Falha ao carregar os anexos",
      502
    );
  }
}

/** Sempre multipart (arquivo obrigatório). `item_id` opcional no form: presente = anexo de um
 * Item (a tela de Itens é quem chama assim); ausente = anexo solto, que exige `data` (a tela
 * solta de Anexos é quem chama assim - `descricao` é opcional nos dois casos). */
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
  const itemId = String(form.get("item_id") ?? "").trim();
  const data = String(form.get("data") ?? "").trim();
  const descricao = String(form.get("descricao") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) return errorResponse("Escolha um arquivo");
  if (!itemId && !data) return errorResponse("Escolha a data");
  if (itemId) {
    const itens = await listItensByTrip(id);
    if (!itens.some((i) => i.id === itemId)) return errorResponse("Item não encontrado", 404);
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(`Arquivo muito grande (máx. ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB)`);
  }
  const tipoDetectado = await detectarTipoVoucher(file);
  if (!tipoDetectado) {
    return errorResponse("Arquivo precisa ser PDF, JPG, JPEG, PNG ou BMP");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const anexo = await uploadDriveFile({
      tripId: trip.id,
      tripName: trip.nome,
      categoria: "outros",
      filename: file.name,
      mimeType: tipoDetectado,
      base64Data: buffer.toString("base64"),
    });

    const criado = await createAnexo({
      tripId: id,
      itemId: itemId || undefined,
      data,
      descricao,
      fileId: anexo.fileId,
      nome: anexo.name,
      url: anexo.url,
      criadoPor: user.id,
    });

    return NextResponse.json(criado, { status: 201 });
  } catch (err) {
    console.error("upload de anexo falhou:", err);
    return errorResponse(
      err instanceof Error ? `Falha ao enviar o anexo: ${err.message}` : "Falha ao enviar o anexo",
      502
    );
  }
}
