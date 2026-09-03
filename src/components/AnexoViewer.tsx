"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAnexoFile } from "@/lib/offline/db";

/**
 * Visualizador de anexo (PDF ou imagem) que abre DENTRO do app, em vez de `<a target="_blank">`.
 *
 * Motivo: no PWA instalado no Android, abrir o anexo numa aba nova cai numa Custom Tab que
 * divide a task do app - o "X" dela e o botão voltar do celular fechavam o app inteiro em vez
 * de voltar pro app. Aqui é um overlay `fixed` no próprio documento: o X é nosso, e ao abrir a
 * gente empurra uma entrada no `history` pra o voltar do Android fechar só o visualizador.
 *
 * Os bytes vêm do IndexedDB quando a viagem está baixada offline (`getAnexoFile`), senão da
 * rota `/api/trips/{tripId}/anexos/{fileId}` (que baixa via Apps Script e devolve inline) -
 * nunca do link cru do Drive, que pede login Google.
 */
export function AnexoViewer({
  tripId,
  fileId,
  nome,
  onClose,
}: {
  tripId: string;
  fileId: string;
  nome?: string;
  onClose: () => void;
}) {
  const [estado, setEstado] = useState<
    | { fase: "carregando" }
    | { fase: "erro"; msg: string }
    | { fase: "pronto"; url: string; tipo: "imagem" | "pdf" | "outro" }
  >({ fase: "carregando" });

  // `onClose` numa ref pra o efeito de history/popstate não reassinar a cada render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const fechar = useCallback(() => {
    // Desfaz a entrada sintética que empurramos ao abrir - o listener de popstate chama onClose.
    if (typeof window !== "undefined" && window.history.state?.anexoViewer) {
      window.history.back();
    } else {
      onCloseRef.current();
    }
  }, []);

  // Botão voltar do Android / Esc: empurra um estado ao montar e fecha no popstate.
  useEffect(() => {
    const jaTinha = window.history.state?.anexoViewer;
    if (!jaTinha) {
      window.history.pushState({ ...window.history.state, anexoViewer: true }, "");
    }
    const onPop = () => onCloseRef.current();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);

    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowAntes;
      // Fechou por outro caminho (parent desmontou sem passar pelo voltar) - limpa a entrada.
      if (window.history.state?.anexoViewer) window.history.back();
    };
  }, [fechar]);

  // Carrega os bytes e decide o tipo.
  useEffect(() => {
    let cancelado = false;
    let urlCriada: string | null = null;

    (async () => {
      try {
        let blob: Blob | null = null;
        let mime = "";

        const local = await getAnexoFile(fileId);
        if (local) {
          blob = local.blob;
          mime = local.mimeType || local.blob.type || "";
        } else {
          const res = await fetch(`/api/trips/${tripId}/anexos/${fileId}`, {
            credentials: "same-origin",
          });
          if (!res.ok) {
            let msg = `Erro ${res.status}`;
            try {
              const j = await res.json();
              if (j?.error) msg = j.error;
            } catch {
              // resposta não-JSON (bytes ou vazio) - fica na mensagem genérica
            }
            throw new Error(msg);
          }
          blob = await res.blob();
          mime = blob.type || "";
        }

        if (cancelado || !blob) return;

        const ext = (nome ?? "").toLowerCase().split(".").pop() ?? "";
        const ehPdf = mime.includes("pdf") || ext === "pdf";
        const ehImagem =
          mime.startsWith("image/") || ["jpg", "jpeg", "png", "bmp", "gif", "webp"].includes(ext);

        urlCriada = URL.createObjectURL(blob);
        setEstado({
          fase: "pronto",
          url: urlCriada,
          tipo: ehPdf ? "pdf" : ehImagem ? "imagem" : "outro",
        });
      } catch (err) {
        if (!cancelado) {
          setEstado({
            fase: "erro",
            msg: err instanceof Error ? err.message : "Não foi possível abrir o anexo",
          });
        }
      }
    })();

    return () => {
      cancelado = true;
      if (urlCriada) URL.revokeObjectURL(urlCriada);
    };
  }, [tripId, fileId, nome]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95">
      <div className="flex items-center gap-3 px-2 py-2 text-white">
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{nome || "Anexo"}</span>
      </div>

      <div className="flex-1 overflow-auto overscroll-contain bg-neutral-900">
        {estado.fase === "carregando" && (
          <p className="p-6 text-center text-sm text-white/70">Carregando anexo...</p>
        )}

        {estado.fase === "erro" && (
          <p className="p-6 text-center text-sm text-white/80">{estado.msg}</p>
        )}

        {estado.fase === "pronto" && estado.tipo === "imagem" && (
          // eslint-disable-next-line @next/next/no-img-element -- blob local do anexo, sem otimização de next/image
          <img src={estado.url} alt={nome || "Anexo"} className="mx-auto block h-auto max-w-full" />
        )}

        {estado.fase === "pronto" && estado.tipo === "pdf" && <PdfCanvas url={estado.url} />}

        {estado.fase === "pronto" && estado.tipo === "outro" && (
          <div className="flex flex-col items-center gap-3 p-6 text-center text-sm text-white/80">
            <p>Este tipo de arquivo não abre aqui.</p>
            <a
              href={estado.url}
              download={nome || "anexo"}
              className="rounded-lg bg-white/15 px-4 py-2 font-medium text-white hover:bg-white/25"
            >
              Baixar arquivo
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Renderiza todas as páginas do PDF em `<canvas>` empilhados. pdf.js é carregado por `import()`
 * dinâmico (só entra no bundle de quem abre um PDF) e o worker vem do próprio bundle - mesmo
 * padrão de `lib/ocr.ts`.
 */
function PdfCanvas({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- os tipos do pdf.js não somam bem aqui e só usamos numPages/getPage/destroy
    let doc: any = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const buffer = await (await fetch(url)).arrayBuffer();
        if (cancelado) return;

        doc = await pdfjs.getDocument({ data: buffer }).promise;
        if (cancelado || !doc) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        const larguraAlvo = Math.min(container.clientWidth || 360, 1000);

        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelado) return;
          const base = page.getViewport({ scale: 1 });
          const escala = (larguraAlvo / base.width) * Math.min(window.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale: escala });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-2 block h-auto w-full max-w-full bg-white";
          canvas.style.maxWidth = `${larguraAlvo}px`;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          container.appendChild(canvas);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        }
        if (!cancelado) setCarregando(false);
      } catch (err) {
        if (!cancelado) {
          setErro(err instanceof Error ? err.message : "Não foi possível renderizar o PDF");
          setCarregando(false);
        }
      }
    })();

    return () => {
      cancelado = true;
      try {
        doc?.destroy();
      } catch {
        // ignore
      }
    };
  }, [url]);

  return (
    <div className="p-2">
      {carregando && !erro && (
        <p className="p-6 text-center text-sm text-white/70">Renderizando PDF...</p>
      )}
      {erro && (
        <div className="flex flex-col items-center gap-3 p-6 text-center text-sm text-white/80">
          <p>{erro}</p>
          <a
            href={url}
            download
            className="rounded-lg bg-white/15 px-4 py-2 font-medium text-white hover:bg-white/25"
          >
            Baixar PDF
          </a>
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}
