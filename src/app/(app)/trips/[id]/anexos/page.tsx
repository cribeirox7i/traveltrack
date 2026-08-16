"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

interface Anexo {
  fileId: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  categoria: string;
  criadoEm: string;
}

const CATEGORIAS = [
  { value: "traslado", label: "Traslado" },
  { value: "passagem", label: "Passagem" },
  { value: "alimentacao", label: "Alimentação" },
  { value: "passeio", label: "Passeio" },
  { value: "hospedagem", label: "Hospedagem" },
  { value: "outros", label: "Outros" },
];

const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS.map((c) => [c.value, c.label])
);

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.7;

/** Reduz imagens grandes (foto de celular) antes do upload, pra caber no limite de corpo da API. PDFs e outros tipos passam direto. */
async function compressIfImage(file: File): Promise<File> {
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

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AnexosPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoria, setCategoria] = useState("outros");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/trips/${tripId}/anexos`);
    if (res.ok) setAnexos(await res.json());
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

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
      const res = await fetch(`/api/trips/${tripId}/anexos`, { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erro ao enviar anexo");
        return;
      }
      await load();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(fileId: string) {
    if (!confirm("Excluir este anexo? Ele vai para a lixeira do Drive.")) return;
    await fetch(`/api/trips/${tripId}/anexos/${fileId}`, { method: "DELETE" });
    setAnexos((prev) => prev.filter((a) => a.fileId !== fileId));
  }

  const porCategoria = CATEGORIAS.map((c) => ({
    ...c,
    itens: anexos.filter((a) => a.categoria === c.value),
  })).filter((c) => c.itens.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Categoria</label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-600">Arquivo</label>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            accept="image/*,application/pdf"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
        </div>
        {uploading && <span className="text-xs text-slate-500">Enviando...</span>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading && <p className="text-sm text-slate-500">Carregando...</p>}
      {!loading && anexos.length === 0 && (
        <p className="text-sm text-slate-500">Nenhum anexo enviado ainda.</p>
      )}

      {porCategoria.map((c) => (
        <div key={c.value} className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
            {CATEGORIA_LABEL[c.value]}
          </p>
          <ul className="flex flex-col gap-2">
            {c.itens.map((a) => (
              <li
                key={a.fileId}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
              >
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-slate-700 hover:text-blue-600 hover:underline"
                >
                  {a.name}
                </a>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-slate-400">{formatSize(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(a.fileId)}
                    className="text-xs font-medium text-red-500 hover:text-red-700"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
