import { NextRequest, NextResponse } from "next/server";
import { detectarTipoVoucher } from "@/lib/fileValidation";
import { errorResponse, requireSession, sessionCanAccessTrip, tripLockError } from "@/lib/api-helpers";
import { CATEGORIA_ITEM_DRIVE, listItensByTrip } from "@/lib/sheets/itens";
import { uploadAnexo } from "@/lib/sheets/anexos";
import { createItemAnexo } from "@/lib/sheets/itemAnexos";
import { getTrip } from "@/lib/sheets/trips";

// Mesmo teto das outras rotas de upload (margem abaixo do limite de corpo das funções
// serverless da Vercel, ~4.5MB).
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Anexo ADICIONAL de um item que já tem o principal (`anexo_file_id`) - sem opção de análise
 * por voucher, só arquivo + nome. O item precisa já existir com o anexo principal preenchido:
 * sem isso a tela nem oferece o botão, e a rota confere de novo aqui (mesmo padrão de
 * "não confiar só na UI" do resto do app). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, itemId } = await params;
  const { user } = auth.session;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const itens = await listItensByTrip(id);
  const item = itens.find((i) => i.id === itemId);
  if (!item) return errorResponse("Item não encontrado", 404);
  if (!item.anexo_file_id) {
    return errorResponse("Este item ainda não tem o anexo principal - cadastre-o primeiro");
  }

  const trip = await getTrip(id);
  if (!trip) return errorResponse("Viagem não encontrada", 404);
  const bloqueio = tripLockError(trip);
  if (bloqueio) return bloqueio;

  const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");
  if (!isMultipart) return errorResponse("Envie o arquivo como multipart/form-data");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorResponse("Escolha um arquivo");
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(`Arquivo muito grande (máx. ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB)`);
  }
  const tipoDetectado = await detectarTipoVoucher(file);
  if (!tipoDetectado) {
    return errorResponse("Arquivo precisa ser PDF, JPG, JPEG, PNG ou BMP");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const anexo = await uploadAnexo({
    tripId: trip.id,
    tripName: trip.nome,
    categoria: CATEGORIA_ITEM_DRIVE[item.categoria],
    filename: file.name,
    mimeType: tipoDetectado,
    base64Data: buffer.toString("base64"),
  });

  const criado = await createItemAnexo({
    itemId,
    tripId: id,
    fileId: anexo.fileId,
    nome: anexo.name,
    url: anexo.url,
    criadoPor: user.id,
  });

  return NextResponse.json(criado, { status: 201 });
}
