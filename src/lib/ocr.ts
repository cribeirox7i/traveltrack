"use client";

/**
 * Extrai o texto de um anexo (imagem ou PDF) inteiramente no navegador - sem servidor, sem chave,
 * sem mandar o documento pra lugar nenhum (o arquivo é do usuário, e a maioria desses vouchers tem
 * dado pessoal). Mesmo espírito keyless do resto do app.
 *
 * Dois caminhos, porque um PDF de e-ticket quase nunca precisa de OCR de verdade:
 * - **PDF**: primeiro tenta a camada de texto (pdf.js) - instantânea e exata, cobre praticamente
 *   todo voucher gerado por site de reserva. Só cai pro OCR se o PDF for um scan (sem texto).
 * - **Imagem**: Tesseract.js (WASM). O pacote de idioma (~15MB, por+eng) é baixado do CDN da
 *   própria lib na primeira vez e fica no cache do navegador - por isso a primeira extração é bem
 *   mais lenta que as seguintes, e é o motivo de a UI mostrar progresso.
 */

/** Páginas lidas de um PDF - um voucher/bilhete põe o que interessa nas primeiras; ler o resto só
 * adicionaria política de cancelamento e rodapé jurídico (ruído puro pro parser). */
const MAX_PAGINAS_PDF = 3;

/** Abaixo disso a camada de texto do PDF é considerada vazia (scan) e o OCR entra no lugar. */
const MIN_CHARS_TEXTO_PDF = 40;

export type ProgressoOcr = { etapa: string; progresso: number };

async function textoDePdf(file: File, onProgress?: (p: ProgressoOcr) => void): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // O worker é servido a partir do próprio bundle (webpack resolve e emite o arquivo) - sem isso
  // o pdf.js tenta buscar num CDN externo, o que quebraria offline e no CSP.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const total = Math.min(doc.numPages, MAX_PAGINAS_PDF);
  const partes: string[] = [];

  for (let i = 1; i <= total; i++) {
    onProgress?.({ etapa: `Lendo página ${i} de ${total}`, progresso: i / total });
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Cada item é um fragmento com posição própria; `hasEOL` é o que o pdf.js usa pra marcar fim
    // de linha visual - preservar isso importa, porque o parser trabalha linha a linha.
    const linha = content.items
      .map((item) => {
        if (!("str" in item)) return "";
        return item.str + (item.hasEOL ? "\n" : " ");
      })
      .join("");
    partes.push(linha);
  }

  return partes.join("\n");
}

/** Renderiza a 1ª página do PDF num canvas, pro OCR ter uma imagem pra ler (caso de PDF escaneado). */
async function primeiraPaginaComoImagem(file: File): Promise<Blob | null> {
  const pdfjs = await import("pdfjs-dist");
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  // Escala 2x: o OCR erra muito mais em imagem pequena, e a página renderizada em 1x costuma
  // ficar abaixo do que o Tesseract precisa pra letra de corpo de texto.
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function textoDeImagem(
  imagem: Blob | File,
  onProgress?: (p: ProgressoOcr) => void
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  onProgress?.({ etapa: "Preparando OCR", progresso: 0 });

  const worker = await createWorker("por+eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") {
        onProgress?.({ etapa: "Lendo o documento", progresso: m.progress });
      } else if (m.status.startsWith("loading") || m.status.startsWith("initializ")) {
        onProgress?.({ etapa: "Baixando o pacote de idioma (só na primeira vez)", progresso: m.progress });
      }
    },
  });

  try {
    const { data } = await worker.recognize(imagem);
    return data.text;
  } finally {
    // Sem isso o worker (e a memória do WASM) fica pendurado até a aba fechar.
    await worker.terminate();
  }
}

/**
 * Texto de um anexo, seja qual for o formato suportado. Devolve `""` (não lança) quando não dá pra
 * ler - quem chama trata como "não consegui sugerir nada", que é um resultado aceitável aqui: a
 * sugestão automática é um atalho, nunca o único jeito de criar o compromisso.
 */
export async function extrairTexto(
  file: File,
  onProgress?: (p: ProgressoOcr) => void
): Promise<string> {
  try {
    if (file.type === "application/pdf") {
      const texto = await textoDePdf(file, onProgress);
      if (texto.trim().length >= MIN_CHARS_TEXTO_PDF) return texto;

      // PDF sem camada de texto = escaneado. Renderiza e passa pro OCR.
      const imagem = await primeiraPaginaComoImagem(file);
      return imagem ? await textoDeImagem(imagem, onProgress) : "";
    }

    if (file.type.startsWith("image/")) return await textoDeImagem(file, onProgress);

    return "";
  } catch (err) {
    console.error("extrairTexto falhou:", err);
    return "";
  }
}

/** Formatos em que a leitura automática funciona - fora disso a tela nem oferece a sugestão. */
export function suportaLeituraAutomatica(file: File): boolean {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}
