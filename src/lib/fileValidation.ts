/**
 * Validação de arquivo de voucher (Itens de viagem): só PDF ou imagem (JPG/JPEG/PNG/BMP), e
 * conferida pela assinatura real do arquivo (magic bytes), não pela extensão do nome nem pelo
 * `Content-Type` que o navegador manda - os dois vêm do cliente e são fáceis de forjar.
 */
const ASSINATURAS: { mimeType: string; bytes: number[] }[] = [
  { mimeType: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mimeType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mimeType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: "image/bmp", bytes: [0x42, 0x4d] },
];

function bateAssinatura(cabecalho: Uint8Array, bytes: number[]): boolean {
  return bytes.every((b, i) => cabecalho[i] === b);
}

/** Devolve o mimeType real (pela assinatura) se o arquivo for um dos tipos aceitos, senão `null`. */
export async function detectarTipoVoucher(file: File): Promise<string | null> {
  const cabecalho = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const assinatura = ASSINATURAS.find((a) => bateAssinatura(cabecalho, a.bytes));
  return assinatura?.mimeType ?? null;
}
