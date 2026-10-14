"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/apiFetch";
import { AnexoViewer } from "@/components/AnexoViewer";
import type { DriveFileInfo } from "@/lib/sheets/driveFiles";

const CATEGORIA_LABEL: Record<string, string> = {
  traslado: "Traslado",
  passagem: "Passagem",
  alimentacao: "Alimentação",
  passeio: "Passeio",
  hospedagem: "Hospedagem",
  documentos: "Documentos",
  outros: "Outros",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDataBR(iso: string): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  return day && m && y ? `${day}/${m}/${y}` : d;
}

function iconeArquivo(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType === "application/pdf") return "📄";
  return "📎";
}

export default function DrivePage() {
  const { id: tripId } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const [arquivos, setArquivos] = useState<DriveFileInfo[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<{ fileId: string; nome: string } | null>(null);

  if (sessionStatus === "loading") {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>;
  }

  const role = session?.user.role;
  if (role !== "admin" && role !== "gestor") {
    router.replace(`/trips/${tripId}/itens`);
    return null;
  }

  async function carregar() {
    setCarregando(true);
    setErro(null);
    const res = await apiFetch<DriveFileInfo[]>(`/api/trips/${tripId}/drive-files`);
    setCarregando(false);
    if (!res.ok) {
      setErro(res.error ?? "Erro ao listar arquivos");
      return;
    }
    const lista = Array.isArray(res.data) ? res.data : [];
    lista.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    setArquivos(lista);
  }

  // Agrupa por categoria para exibição
  const porCategoria = new Map<string, DriveFileInfo[]>();
  for (const arq of arquivos ?? []) {
    const cat = arq.categoria || "outros";
    const lista = porCategoria.get(cat) ?? [];
    lista.push(arq);
    porCategoria.set(cat, lista);
  }
  const categorias = [...porCategoria.keys()].sort((a, b) =>
    (CATEGORIA_LABEL[a] ?? a).localeCompare(CATEGORIA_LABEL[b] ?? b)
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Listagem direta da pasta de anexos no Google Drive.
        </p>
        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {carregando ? (
            <>Carregando...</>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 9a8 8 0 0 1 14.93-2.69M20 15a8 8 0 0 1-14.93 2.69" />
              </svg>
              Atualizar
            </>
          )}
        </button>
      </div>

      {erro && (
        <p className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {erro}
        </p>
      )}

      {arquivos === null && !carregando && (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Clique em Atualizar para listar os arquivos.
        </p>
      )}

      {arquivos !== null && arquivos.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum arquivo encontrado.</p>
      )}

      {categorias.map((cat) => {
        const lista = porCategoria.get(cat) ?? [];
        return (
          <div key={cat} className="flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {CATEGORIA_LABEL[cat] ?? cat} ({lista.length})
            </p>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
              {lista.map((arq) => (
                <button
                  key={arq.fileId}
                  type="button"
                  onClick={() => setAberto({ fileId: arq.fileId, nome: arq.name })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 first:rounded-t-2xl last:rounded-b-2xl"
                >
                  <span className="text-lg leading-none">{iconeArquivo(arq.mimeType)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-800 dark:text-slate-200">{arq.name}</span>
                    <span className="text-[11px] text-slate-400">
                      {[formatDataBR(arq.criadoEm), formatBytes(arq.size)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {aberto && (
        <AnexoViewer
          tripId={tripId}
          fileId={aberto.fileId}
          nome={aberto.nome}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}
