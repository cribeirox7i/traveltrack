import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { urlHttpSchema } from "@/lib/urlSegura";
import { detectarTipoVoucher } from "@/lib/fileValidation";
import { errorResponse, requireSession, sessionCanAccessTrip } from "@/lib/api-helpers";
import { CATEGORIAS_ITEM_FINANCEIRAS } from "@/lib/sheets/types";
import { CATEGORIA_ITEM_DRIVE, ItemEditableInput, deleteItem, listItensByTrip, updateItem } from "@/lib/sheets/itens";
import { deleteAnexo, uploadAnexo } from "@/lib/sheets/anexos";
import { deleteRowsByField } from "@/lib/sheets/repository";
import { listItemAnexosByTrip } from "@/lib/sheets/itemAnexos";
import { getTrip } from "@/lib/sheets/trips";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

const optionalStr = z.string().optional().default("");

const patchSchema = z
  .object({
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

function limparCamposNaoFinanceiros(data: ItemEditableInput): ItemEditableInput {
  if (CATEGORIAS_ITEM_FINANCEIRAS.has(data.categoria)) return data;
  return { ...data, valor: "", status: "", pagador_id: "", meio_pagamento_id: "", data_pagamento: "" };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, itemId } = await params;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  // Confere que o item é mesmo desta viagem antes de escrever - sem isso, acesso a uma viagem
  // qualquer bastaria para editar o item de outra.
  const itens = await listItensByTrip(id);
  const existente = itens.find((i) => i.id === itemId);
  if (!existente) return errorResponse("Item não encontrado", 404);

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

  const parsed = patchSchema.safeParse(raw);
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
    // Best-effort: o item já tem o anexo novo vinculado independente disso funcionar.
    if (existente.anexo_file_id) {
      await deleteAnexo(existente.anexo_file_id, trip.id, trip.nome).catch(() => {});
    }
  }

  await updateItem(itemId, {
    ...limparCamposNaoFinanceiros(parsed.data),
    ...(anexo
      ? { anexo_file_id: anexo.fileId, anexo_nome: anexo.name, anexo_url: anexo.url }
      : {}),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id, itemId } = await params;
  if (!(await sessionCanAccessTrip(auth.session, id))) {
    return errorResponse("Sem acesso a esta viagem", 403);
  }

  const itens = await listItensByTrip(id);
  const existente = itens.find((i) => i.id === itemId);
  if (!existente) return errorResponse("Item não encontrado", 404);

  const trip = await getTrip(id);
  const extras = (await listItemAnexosByTrip(id)).filter((a) => a.item_id === itemId);

  await deleteItem(itemId);
  await deleteRowsByField("ItemAnexos", "item_id", itemId);

  let avisoAnexo: string | undefined;
  if (existente.anexo_file_id && trip) {
    await deleteAnexo(existente.anexo_file_id, trip.id, trip.nome).catch((err) => {
      avisoAnexo = err instanceof Error ? err.message : "Não foi possível remover o anexo";
    });
  }
  // Anexos extras seguem o mesmo padrão best-effort do principal: um arquivo que não sumir do
  // Drive não deve travar a exclusão do item, que já aconteceu na planilha.
  for (const extra of extras) {
    if (!trip) break;
    await deleteAnexo(extra.file_id, trip.id, trip.nome).catch((err) => {
      avisoAnexo = avisoAnexo ?? (err instanceof Error ? err.message : "Não foi possível remover um anexo extra");
    });
  }

  return NextResponse.json({ ok: true, ...(avisoAnexo ? { avisoAnexo } : {}) });
}
