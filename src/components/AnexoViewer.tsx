"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
    | { fase: "pronto"; url: string; blob: Blob; tipo: "imagem" | "pdf" | "outro" }
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
          blob,
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

  // Zoom do visualizador. A pinça nativa do navegador fica desligada no app inteiro (viewport
  // travado em `app/layout.tsx`), então o zoom aqui e reimplementado no proprio componente: por
  // botao, duplo toque OU pinça de dois dedos (pointer events), sempre esticando a largura do
  // conteudo e usando o scroll do container pra deslocar.
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 4;
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
  const [zoom, setZoom] = useState(1);
  const [pinchAtivo, setPinchAtivo] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Ponteiros de toque ativos (id -> posicao de tela) e o estado inicial da pinça em curso.
  const ponteirosRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distIni: number; zoomIni: number } | null>(null);
  // Ancora a aplicar ao scroll depois que a nova largura entrou no layout (ver useLayoutEffect).
  const ancoraRef = useRef<{ cx: number; cy: number; mx: number; my: number } | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = ancoraRef.current;
    if (!el || !a) return;
    el.scrollLeft = a.cx * zoom - a.mx;
    el.scrollTop = a.cy * zoom - a.my;
    ancoraRef.current = null;
  }, [zoom]);

  /** Muda o zoom mantendo o ponto `(clienteX, clienteY)` da tela sob o dedo/cursor. */
  const zoomAncorado = useCallback(
    (proximo: number, clienteX: number, clienteY: number) => {
      const el = scrollRef.current;
      setZoom((atual) => {
        const alvo = clampZoom(proximo);
        if (alvo === atual) {
          ancoraRef.current = null;
          return atual;
        }
        if (el) {
          const rect = el.getBoundingClientRect();
          const mx = clienteX - rect.left;
          const my = clienteY - rect.top;
          ancoraRef.current = {
            cx: (el.scrollLeft + mx) / atual,
            cy: (el.scrollTop + my) / atual,
            mx,
            my,
          };
        }
        return alvo;
      });
    },
    []
  );

  const zoomNoCentro = useCallback(
    (proximo: number) => {
      const el = scrollRef.current;
      if (!el) return setZoom(clampZoom(proximo));
      const rect = el.getBoundingClientRect();
      zoomAncorado(proximo, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    [zoomAncorado]
  );

  const maisZoom = () => zoomNoCentro(zoom + 0.5);
  const menosZoom = () => zoomNoCentro(zoom - 0.5);
  const alternarZoom = () => zoomNoCentro(zoom > ZOOM_MIN ? ZOOM_MIN : 2);

  const distanciaPonteiros = () => {
    const [a, b] = [...ponteirosRef.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const meioPonteiros = () => {
    const [a, b] = [...ponteirosRef.current.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === "mouse") return;
    ponteirosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ponteirosRef.current.size === 2) {
      pinchRef.current = { distIni: distanciaPonteiros(), zoomIni: zoom };
      setPinchAtivo(true);
    }
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!ponteirosRef.current.has(e.pointerId)) return;
    ponteirosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pinch = pinchRef.current;
    if (pinch && ponteirosRef.current.size === 2) {
      const dist = distanciaPonteiros();
      if (pinch.distIni > 0) {
        const meio = meioPonteiros();
        zoomAncorado((pinch.zoomIni * dist) / pinch.distIni, meio.x, meio.y);
      }
    }
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (!ponteirosRef.current.delete(e.pointerId)) return;
    if (ponteirosRef.current.size < 2) {
      pinchRef.current = null;
      setPinchAtivo(false);
    }
  };

  const podeZoom =
    estado.fase === "pronto" && (estado.tipo === "imagem" || estado.tipo === "pdf");

  const compartilhar = useCallback(async () => {
    if (estado.fase !== "pronto") return;
    const arquivo = new File([estado.blob], nome || "anexo", {
      type: estado.blob.type || "application/octet-stream",
    });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], title: nome || "Anexo" });
        return;
      } catch (err) {
        // Usuario cancelou a folha de compartilhamento - nao cai pro download.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    // Sem Web Share (ou falhou por outro motivo): baixa o arquivo.
    const a = document.createElement("a");
    a.href = estado.url;
    a.download = nome || "anexo";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [estado, nome]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95">
      <div className="flex items-center gap-1 px-2 py-2 text-white">
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
        <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{nome || "Anexo"}</span>

        {podeZoom && (
          <>
            <button
              type="button"
              onClick={menosZoom}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Diminuir zoom"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" d="M5 12h14" />
              </svg>
            </button>
            <span className="w-11 shrink-0 text-center text-xs tabular-nums text-white/80">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={maisZoom}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Aumentar zoom"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-35"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </>
        )}

        {estado.fase === "pronto" && (
          <button
            type="button"
            onClick={compartilhar}
            aria-label="Compartilhar ou baixar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13M8 7l4-4 4 4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13v6a1 1 0 001 1h12a1 1 0 001-1v-6" />
            </svg>
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onPointerDown={podeZoom ? onPointerDown : undefined}
        onPointerMove={podeZoom ? onPointerMove : undefined}
        onPointerUp={podeZoom ? onPointerUp : undefined}
        onPointerCancel={podeZoom ? onPointerUp : undefined}
        onDoubleClick={podeZoom ? alternarZoom : undefined}
        style={{ touchAction: pinchAtivo ? "none" : "pan-x pan-y" }}
        className="flex-1 overflow-auto overscroll-contain bg-neutral-900"
      >
        {estado.fase === "carregando" && (
          <p className="p-6 text-center text-sm text-white/70">Carregando anexo...</p>
        )}

        {estado.fase === "erro" && (
          <p className="p-6 text-center text-sm text-white/80">{estado.msg}</p>
        )}

        {estado.fase === "pronto" && estado.tipo === "imagem" && (
          <div className="w-full p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob local do anexo, sem otimização de next/image */}
            <img
              src={estado.url}
              alt={nome || "Anexo"}
              draggable={false}
              style={{
                width: zoom === 1 ? "auto" : `${zoom * 100}%`,
                maxWidth: zoom === 1 ? "100%" : "none",
              }}
              className="mx-auto block h-auto select-none"
            />
          </div>
        )}

        {estado.fase === "pronto" && estado.tipo === "pdf" && (
          <PdfCanvas blob={estado.blob} url={estado.url} zoom={zoom} />
        )}

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
 *
 * Os bytes chegam pelo `blob` já em memória (não por `fetch(url)` sobre o object URL: buscar um
 * `blob:` via fetch cai na CSP `connect-src` e quebrava com "Failed to fetch"). O `url` fica só
 * para o link "Baixar PDF" do fallback de erro.
 *
 * O zoom nao re-renderiza as paginas: elas sao rasterizadas uma vez com folga de resolucao
 * (`fator` abaixo) e o `zoom` so estica a largura do container por CSS - rapido e suficiente
 * ate 4x.
 */
function PdfCanvas({ blob, url, zoom }: { blob: Blob; url: string; zoom: number }) {
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

        const buffer = await blob.arrayBuffer();
        if (cancelado) return;

        doc = await pdfjs.getDocument({ data: buffer }).promise;
        if (cancelado || !doc) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        const larguraBase = Math.min(container.clientWidth || 360, 900);
        // Rasteriza com folga (2x a 3x) pra o zoom por CSS ate 4x nao ficar borrado demais.
        const fator = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
        const larguraRender = Math.min(larguraBase * fator, 2600);

        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelado) return;
          const base = page.getViewport({ scale: 1 });
          const escala = larguraRender / base.width;
          const viewport = page.getViewport({ scale: escala });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-2 block h-auto w-full bg-white";
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
  }, [blob]);

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
      <div
        ref={containerRef}
        className="mx-auto"
        style={{
          width: zoom === 1 ? undefined : `${zoom * 100}%`,
          maxWidth: zoom === 1 ? "900px" : "none",
        }}
      />
    </div>
  );
}
