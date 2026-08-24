"use client";

import { useRef, useState } from "react";
import { uploadAnexoAndRefresh } from "@/lib/offline/sync";
import { DocumentoExtraido, parseDocumento } from "@/lib/documentoParser";
import { ProgressoOcr, extrairTexto, suportaLeituraAutomatica } from "@/lib/ocr";
import { SugestaoAgendaModal } from "./SugestaoAgendaModal";

export const CATEGORIAS_UPLOAD = [
  { value: "traslado", label: "Traslado" },
  { value: "passagem", label: "Passagem" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "passeio", label: "Passeio" },
  { value: "hospedagem", label: "Hospedagem" },
  { value: "documentos", label: "Documentos" },
  { value: "outros", label: "Outros" },
];

/** Categorias em que faz sentido tentar ler o documento pra sugerir um compromisso - passagem tem
 * trecho/embarque e hospedagem tem check-in, os dois viram evento de agenda naturalmente. Um
 * comprovante de alimentação ou um passaporte não têm compromisso nenhum pra extrair. */
const CATEGORIAS_COM_LEITURA = new Set(["passagem", "hospedagem"]);

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.7;

/** Reduz imagens grandes (foto de celular) antes do upload, pra caber no limite de corpo da API.
 * PDFs e outros tipos passam direto. */
export async function compressIfImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 2 * 1024 * 1024) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", IMAGE_QUALITY)
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

/**
 * Bloco de upload de anexo, compartilhado entre a aba Anexos e a de Lançamentos.
 *
 * Quando a categoria é Passagem ou Hospedagem, depois de enviar o arquivo ele é lido no próprio
 * navegador (ver `lib/ocr.ts`) e o que for identificado vira um rascunho de compromisso pra
 * confirmar. A leitura roda DEPOIS do upload e é totalmente best-effort: se falhar, o anexo já
 * está salvo do mesmo jeito - nunca custa o upload.
 */
export function AnexoUpload({
  tripId,
  datasDaViagem,
  categoriaInicial = "outros",
}: {
  tripId: string;
  /** Datas válidas da viagem, pro rascunho de compromisso - vazio desliga a leitura automática. */
  datasDaViagem: string[];
  categoriaInicial?: string;
}) {
  const [categoria, setCategoria] = useState(categoriaInicial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<ProgressoOcr | null>(null);
  const [sugestao, setSugestao] = useState<{ extraido: DocumentoExtraido; nome: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const vaiLer = CATEGORIAS_COM_LEITURA.has(categoria) && datasDaViagem.length > 0;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);

    try {
      const toSend = await compressIfImage(file);
      const form = new FormData();
      form.set("file", toSend);
      form.set("categoria", categoria);
      const result = await uploadAnexoAndRefresh(tripId, form);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (!vaiLer || !suportaLeituraAutomatica(toSend)) return;

      // A leitura usa o arquivo COMPRIMIDO (o mesmo que foi enviado) - é o que o usuário vai ver
      // no anexo depois, então é nele que a sugestão precisa bater. Compressão a 1600px mantém
      // texto de bilhete legível pro OCR.
      const texto = await extrairTexto(toSend, setProgresso);
      setProgresso(null);
      if (texto.trim()) {
        // O tipo vem da categoria escolhida no upload - não precisa ser adivinhado pelo texto, e
        // muda bastante o que faz sentido extrair (passagem não tem "nome", ver `montarVoo`). O
        // nome do arquivo original entra junto: costuma trazer o trecho já limpo ("GRU - CMX").
        const extraido = parseDocumento(texto, {
          tipo: categoria as "passagem" | "hospedagem",
          nomeArquivo: file.name,
        });
        setSugestao({ extraido, nome: file.name });
      }
    } finally {
      setUploading(false);
      setProgresso(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:flex-row sm:items-end">
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Categoria
          </label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            disabled={uploading}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          >
            {CATEGORIAS_UPLOAD.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Arquivo
          </label>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            accept="image/*,application/pdf"
            className="block w-full text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
          {vaiLer && !uploading && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              📄 Vou tentar ler data, horário e nome do documento pra sugerir um compromisso no
              Roteiro.
            </p>
          )}
        </div>
        {uploading && (
          <div className="min-w-[180px] text-xs text-slate-500 dark:text-slate-400">
            {progresso ? (
              <>
                <p>{progresso.etapa}...</p>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${Math.round(progresso.progresso * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <p>Enviando...</p>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {sugestao && (
        <SugestaoAgendaModal
          tripId={tripId}
          extraido={sugestao.extraido}
          datasDaViagem={datasDaViagem}
          nomeArquivo={sugestao.nome}
          onClose={() => setSugestao(null)}
        />
      )}
    </>
  );
}
