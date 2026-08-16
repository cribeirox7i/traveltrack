import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireSession } from "@/lib/api-helpers";
import { CATEGORIAS_ANEXO, listAnexos, uploadAnexo } from "@/lib/sheets/anexos";
import { getTrip, userCanAccessTrip } from "@/lib/sheets/trips";

// Margem de segurança abaixo do limite de corpo de requisição das funções
// serverless da Vercel (~4.5MB) — arquivos maiores devem ser comprimidos no
// cliente antes do upload (feito para imagens na página de anexos).
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

  const trip = await getTrip(id);
  if (!trip) return errorResponse("Viagem não encontrada", 404);

  const anexos = await listAnexos(trip.id, trip.nome);
  return NextResponse.json(anexos);
}

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

  const form = await req.formData();
  const file = form.get("file");
  const categoria = String(form.get("categoria") ?? "");

  if (!(file instanceof File)) return errorResponse("Arquivo ausente");
  if (!CATEGORIAS_ANEXO.includes(categoria as (typeof CATEGORIAS_ANEXO)[number])) {
    return errorResponse("Categoria inválida");
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(
      `Arquivo muito grande (máx. ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB)`
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const anexo = await uploadAnexo({
    tripId: trip.id,
    tripName: trip.nome,
    categoria: categoria as (typeof CATEGORIAS_ANEXO)[number],
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    base64Data: buffer.toString("base64"),
  });

  return NextResponse.json(anexo, { status: 201 });
}
