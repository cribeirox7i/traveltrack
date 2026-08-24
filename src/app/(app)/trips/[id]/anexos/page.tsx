"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getLocalAnexoUrl,
  useOfflineAnexos,
  useOfflineCollection,
} from "@/lib/offline/useOfflineData";
import { deleteAnexoAndRefresh } from "@/lib/offline/sync";
import { AnexoUpload, CATEGORIAS_UPLOAD } from "@/components/AnexoUpload";

interface Anexo {
  fileId: string;
  name: string;
  url: string;
  size: number;
  mimeType: string;
  categoria: string;
  criadoEm: string;
}

const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS_UPLOAD.map((c) => [c.value, c.label])
);

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AnexosPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { items: anexos, loading } = useOfflineAnexos<Anexo>(tripId);
  const { items: days } = useOfflineCollection<{ id: string; data: string }>("tripDays", tripId);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});

  const datasDaViagem = [...days].map((d) => d.data).sort((a, b) => a.localeCompare(b));

  // Resolve, pra cada anexo já baixado neste aparelho, um object URL local que abre offline -
  // os que ainda não foram baixados caem pro link ao vivo do Drive (a.url) na renderização.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    (async () => {
      const entries = await Promise.all(
        anexos.map(async (a) => {
          const url = await getLocalAnexoUrl(a.fileId);
          if (url) created.push(url);
          return [a.fileId, url] as const;
        })
      );
      if (cancelled) {
        created.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      setLocalUrls(Object.fromEntries(entries.filter(([, url]) => url) as [string, string][]));
    })();

    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [anexos]);

  async function handleDelete(fileId: string) {
    if (!confirm("Excluir este anexo? Ele vai para a lixeira do Drive.")) return;
    await deleteAnexoAndRefresh(tripId, fileId);
  }

  const porCategoria = CATEGORIAS_UPLOAD.map((c) => ({
    ...c,
    itens: anexos.filter((a) => a.categoria === c.value),
  })).filter((c) => c.itens.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <AnexoUpload tripId={tripId} datasDaViagem={datasDaViagem} />

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>}
      {!loading && anexos.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum anexo enviado ainda.</p>
      )}

      {porCategoria.map((c) => (
        <div key={c.value} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
            {CATEGORIA_LABEL[c.value]}
          </p>
          <ul className="flex flex-col gap-2">
            {c.itens.map((a) => (
              <li
                key={a.fileId}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2 text-sm"
              >
                <a
                  href={localUrls[a.fileId] ?? a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-slate-700 dark:text-slate-300 hover:text-blue-600 hover:underline"
                >
                  {a.name}
                </a>
                <div className="flex shrink-0 items-center gap-3">
                  {localUrls[a.fileId] && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400" title="Baixado neste aparelho">
                      ⬇️
                    </span>
                  )}
                  <span className="text-xs text-slate-400 dark:text-slate-500">{formatSize(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(a.fileId)}
                    className="text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-700"
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
