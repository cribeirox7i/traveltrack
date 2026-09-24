import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { urlHttpSchema } from "@/lib/urlSegura";
import { detectarTipoVoucher } from "@/lib/fileValidation";
import { errorResponse, requireSession, sessionCanAccessTrip, tripLockError } from "@/lib/api-helpers";
import { ItemEditableInput, createItem, listItensByTrip } from "@/lib/sheets/itens";
import { uploadDriveFile } from "@/lib/sheets/driveFiles";
import { createAnexo } from "@/lib/sheets/anexos";
import { getTrip } from "@/lib/sheets/trips";

// Mesmo teto das outras rotas de upload (margem abaixo do limite de corpo das funções
// serverless da Vercel, ~4.5MB).
const MAX_FILE_BYTES = 4 * 1024 * 1024;

const optionalStr = z.string().optional().default("");
const boolStr = z.enum(["true", "false"]).optional().default("false");

/** Reforma do cadastro (2026-09-21): sem mais `categoria` fixa - `classificacao_id`/
 * `subclassificacao_id` são FK pras abas curadas pelo admin, e `financeiro_ativo`/`roteiro_ativo`
 * decidem quais campos valem (pelo menos um precisa ser `"true"` - ver `superRefine`). */
const createSchema = z
  .object({
    id: z.string().min(1).optional(),
    classificacao_id: z.string().min(1, "Escolha a classificação"),
    subclassificacao_id: optionalStr,
    financeiro_ativo: boolStr,
    roteiro_ativo: boolStr,
    localizador: optionalStr,
    nome_companhia: optionalStr,
    numero: optionalStr,
    data: z.string().date("Data é obrigatória"),
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
    url: urlHttpSchema.or(z.literal("")).optional().default(""),
    descricao: z.string().min(1, "Descrição é obrigatória"),
    valor: optionalStr,
    moeda: z
      .string()
      .trim()
      .toUpperCase()
      .refine(
        (v) => v === "" || v === "BRL" || /^[A-Z]{3}$/.test(v),
        "Moeda precisa ser um código de 3 letras (ex.: USD)"
      )
      .optional()
      .default(""),
    status: z.enum(["pago", "a_pagar"]).or(z.literal("")).optional().default(""),
    natureza: z.enum(["debito", "credito"]).or(z.literal("")).optional().default(""),
    data_pagamento: optionalStr,
    pagador_id: optionalStr,
    meio_pagamento_id: optionalStr,
  })
  .superRefine((data, ctx) => {
    if (data.financeiro_ativo === "false" && data.roteiro_ativo === "false") {
      ctx.addIssue({
        code: "custom",
        path: ["financeiro_ativo"],
        message: "Marque Financeiro, Roteiro, ou os dois",
      });
      return;
    }
    if (data.financeiro_ativo === "false" || !data.valor) return;
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

/** Limpa os campos do acordeão que ficou desmarcado - evita salvar valor/pagador de um Financeiro
 * desabilitado, ou início/fim de um Roteiro desabilitado (o usuário pode ter preenchido e
 * desmarcado depois). */
function limparAcordeoesInativos(data: ItemEditableInput): ItemEditableInput {
  const limpo = { ...data };
  if (data.financeiro_ativo === "false") {
    Object.assign(limpo, {
      valor: "",
      moeda: "",
      status: "",
      natureza: "",
      data_pagamento: "",
      pagador_id: "",
      meio_pagamento_id: "",
    });
  }
  if (data.roteiro_ativo === "false") {
    Object.assign(limpo, {
      localizador: "",
      nome_companhia: "",
      numero: "",
      origem: "",
      destino: "",
      nome_local: "",
      endereco: "",
      data_inicio: "",
      hora_inicio: "",
      data_fim: "",
      hora_fim: "",
      url: "",
    });
  }
  return limpo;
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
  const bloqueio = tripLockError(trip);
  if (bloqueio) return bloqueio;

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
    try {
      anexo = await uploadDriveFile({
        tripId: trip.id,
        tripName: trip.nome,
        // Classificação é dado livre do admin agora - não dá mais pra mapear pra uma pasta fixa
        // do Drive por categoria (CATEGORIA_ITEM_DRIVE). Tudo cai em "outros".
        categoria: "outros",
        filename: file.name,
        mimeType: tipoDetectado,
        base64Data: buffer.toString("base64"),
      });
    } catch (err) {
      console.error("uploadDriveFile (createItem) falhou:", err);
      return errorResponse(
        err instanceof Error ? `Falha ao enviar o anexo: ${err.message}` : "Falha ao enviar o anexo",
        502
      );
    }
  }

  const criado = await createItem({
    ...limparAcordeoesInativos(parsed.data),
    trip_id: id,
    criado_por: user.id,
  });

  // Anexo é uma linha à parte (aba `Anexos`, unificada) desde a reforma de 2026-09-24 - todo
  // anexo de Item é igual aos demais, sem "principal" guardado na própria linha de Itens.
  if (anexo) {
    await createAnexo({
      tripId: id,
      itemId: criado.id,
      fileId: anexo.fileId,
      nome: anexo.name,
      url: anexo.url,
      criadoPor: user.id,
    });
  }

  return NextResponse.json(criado, { status: 201 });
}
