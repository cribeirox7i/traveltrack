import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { urlHttpSchema } from "@/lib/urlSegura";
import { detectarTipoVoucher } from "@/lib/fileValidation";
import { errorResponse, requireSession, sessionCanAccessTrip } from "@/lib/api-helpers";
import { CATEGORIAS_ITEM_FINANCEIRAS } from "@/lib/sheets/types";
import { CATEGORIA_ITEM_DRIVE, ItemEditableInput, createItem, listItensByTrip } from "@/lib/sheets/itens";
import { uploadAnexo } from "@/lib/sheets/anexos";
import { getTrip } from "@/lib/sheets/trips";

// Mesmo teto das outras rotas de upload (margem abaixo do limite de corpo das funções
// serverless da Vercel, ~4.5MB).
const MAX_FILE_BYTES = 4 * 1024 * 1024;

const optionalStr = z.string().optional().default("");

const createSchema = z
  .object({
    id: z.string().min(1).optional(),
    categoria: z.enum([
      "traslado",
      "passagem",
      "hospedagem",
      "alimentacao",
      "atrativo",
      "repasse",
      "documento",
      "outro",
    ]),
    tipo: optionalStr,
    localizador: optionalStr,
    nome_companhia: optionalStr,
    numero: optionalStr,
    data: z.string().date("Data do item é obrigatória"),
    horario: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Horário deve estar no formato HH:MM")
      .or(z.literal(""))
      .optional()
      .default(""),
    origem: optionalStr,
    destino: optionalStr,
    nome_local: optionalStr,
    endereco: optionalStr,
    data_inicio: optionalStr,
    hora_inicio: optionalStr,
    data_fim: optionalStr,
    hora_fim: optionalStr,
    tipo_documento: optionalStr,
    passageiro_id: optionalStr,
    url: urlHttpSchema.or(z.literal("")).optional().default(""),
    descricao: z.string().min(1, "Descrição é obrigatória"),
    valor: optionalStr,
    status: z.enum(["pago", "a_pagar"]).or(z.literal("")).optional().default(""),
    data_pagamento: optionalStr,
    pagador_id: optionalStr,
    meio_pagamento_id: optionalStr,
  })
  .superRefine((data, ctx) => {
    if (!data.valor) return;
    if (Number.isNaN(Number(data.valor)) || Number(data.valor) <= 0) {
      ctx.addIssue({ code: "custom", path: ["valor"], message: "Valor precisa ser um número positivo" });
      return;
    }
    if (!data.pagador_id) {
      ctx.addIssue({ code: "custom", path: ["pagador_id"], message: "Informe quem pagou" });
    }
    if (!data.meio_pagamento_id) {
      ctx.addIssue({ code: "custom", path: ["meio_pagamento_id"], message: "Informe o meio de pagamento" });
    }
  });

/** Documento/Outro não têm campo financeiro (ver `categoriaNatureza`) - zera valor/pagador/meio
 * mesmo que o cliente tenha mandado algo, em vez de rejeitar (evita um formulário que trocou de
 * categoria no meio do preenchimento falhar por um campo que já não é mais exibido). */
function limparCamposNaoFinanceiros(data: ItemEditableInput): ItemEditableInput {
  if (CATEGORIAS_ITEM_FINANCEIRAS.has(data.categoria)) return data;
  return { ...data, valor: "", status: "", pagador_id: "", meio_pagamento_id: "", data_pagamento: "" };
}

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

  return NextResponse.json(await listItensByTrip(id));
}

/** Aceita `multipart/form-data` (quando vem anexo) ou JSON puro - mesmo padrão da rota de
 * Agenda: o anexo sobe ao Drive antes de gravar a linha, para o Item já nascer com o arquivo
 * vinculado. */
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

  const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");

  let raw: Record<string, unknown>;
  let file: File | null = null;

  if (isMultipart) {
    const form = await req.formData();
    const maybeFile = form.get("file");
    if (maybeFile instanceof File && maybeFile.size > 0) file = maybeFile;
    raw = Object.fromEntries(form.entries()) as Record<string, unknown>;
    delete raw.file;
  } else {
    raw = await req.json();
  }

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return errorResponse(parsed.error.issues[0].message);

  let anexo: { fileId: string; name: string; url: string } | null = null;
  if (file) {
    if (file.size > MAX_FILE_BYTES) {
      return errorResponse(
        `Arquivo muito grande (máx. ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB)`
      );
    }
    const tipoDetectado = await detectarTipoVoucher(file);
    if (!tipoDetectado) {
      return errorResponse("Arquivo precisa ser PDF, JPG, JPEG, PNG ou BMP");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    anexo = await uploadAnexo({
      tripId: trip.id,
      tripName: trip.nome,
      categoria: CATEGORIA_ITEM_DRIVE[parsed.data.categoria],
      filename: file.name,
      mimeType: tipoDetectado,
      base64Data: buffer.toString("base64"),
    });
  }

  const criado = await createItem({
    ...limparCamposNaoFinanceiros(parsed.data),
    trip_id: id,
    criado_por: user.id,
    ...(anexo
      ? { anexo_file_id: anexo.fileId, anexo_nome: anexo.name, anexo_url: anexo.url }
      : {}),
  });

  return NextResponse.json(criado, { status: 201 });
}
