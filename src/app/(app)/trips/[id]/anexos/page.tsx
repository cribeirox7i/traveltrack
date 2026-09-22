"use client";

import { useRef, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  useOfflineCollection,
  useOfflineTrip,
  useOnlineStatus,
} from "@/lib/offline/useOfflineData";
import {
  createAnexoSoltoOnline,
  deleteAnexoSoltoOnline,
  updateAnexoSoltoOnline,
  type AnexoSoltoInfo,
} from "@/lib/offline/sync";
import { viagemBloqueada } from "@/lib/tripStatus";
import { InfoDisclaimer } from "@/components/InfoDisclaimer";
import { AnexoViewer } from "@/components/AnexoViewer";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.bmp,application/pdf,image/jpeg,image/png,image/bmp";

function formatDataBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/**
 * Aba solta de anexos (fora de Itens) - reforma do cadastro, 2026-09-21. Registro simples: data,
 * descrição, arquivo. Upload/edição/remoção exigem internet na hora (mesmo padrão dos anexos
 * extras de Item) - a lista em si abre offline via `useOfflineCollection`.
 */
export default function AnexosPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { items: anexos, loading } = useOfflineCollection<AnexoSoltoInfo>("anexosSoltos", tripId);
  const { trip } = useOfflineTrip<{ id: string; status?: string; data_fim: string }>(tripId);
  const bloqueada = !!trip && viagemBloqueada(trip);
  const online = useOnlineStatus();

  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [dataEdicao, setDataEdicao] = useState("");
  const [descricaoEdicao, setDescricaoEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [aberto, setAberto] = useState<{ fileId: string; nome: string } | null>(null);

  async function handleEnviar(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setErroEnvio("Escolha um arquivo");
      return;
    }
    setErroEnvio(null);
    setEnviando(true);
    const res = await createAnexoSoltoOnline(tripId, { data, descricao, file });
    setEnviando(false);
    if (!res.ok) {
      setErroEnvio(res.error);
      return;
    }
    setDescricao("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function iniciarEdicao(a: AnexoSoltoInfo) {
    setEditandoId(a.id);
    setDataEdicao(a.data);
    setDescricaoEdicao(a.descricao);
    setErroEdicao(null);
  }

  async function salvarEdicao(e: FormEvent) {
    e.preventDefault();
    if (!editandoId) return;
    setSalvandoEdicao(true);
    setErroEdicao(null);
    const res = await updateAnexoSoltoOnline(tripId, editandoId, {
      data: dataEdicao,
      descricao: descricaoEdicao,
    });
    setSalvandoEdicao(false);
    if (!res.ok) {
      setErroEdicao(res.error);
      return;
    }
    setEditandoId(null);
  }

  async function handleRemover(a: AnexoSoltoInfo) {
    if (!confirm(`Remover o anexo "${a.nome}"?`)) return;
    setRemovendoId(a.id);
    await deleteAnexoSoltoOnline(tripId, a.id);
    setRemovendoId(null);
  }

  const ordenados = [...anexos].sort((a, b) => (b.data + b.criado_em).localeCompare(a.data + a.criado_em));

  return (
    <div className="flex flex-col gap-4">
      <InfoDisclaimer>
        Arquivo solto da viagem - voucher, comprovante ou documento qualquer, sem precisar virar um
        Item. Só data, descrição e o arquivo.
      </InfoDisclaimer>

      {bloqueada && (
        <p className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Viagem concluída ou cancelada - anexos em somente leitura.
        </p>
      )}

      {!bloqueada && (
        <form
          onSubmit={handleEnviar}
          className="flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
        >
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              Data
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm font-normal"
              />
            </label>
            <label className="flex-1 min-w-[200px] flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              Descrição
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Comprovante de vacina"
                maxLength={200}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1.5 text-sm font-normal"
              />
            </label>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
          {erroEnvio && <p className="text-xs text-red-600 dark:text-red-400">{erroEnvio}</p>}
          {!online && (
            <p className="text-xs text-slate-400">Adicionar anexo precisa de internet.</p>
          )}
          <button
            type="submit"
            disabled={enviando || !online}
            className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {enviando ? "Enviando..." : "Enviar anexo"}
          </button>
        </form>
      )}

      <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {loading && <p className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">Carregando...</p>}
        {!loading && ordenados.length === 0 && (
          <p className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">Nenhum anexo ainda.</p>
        )}
        {ordenados.map((a) => {
          const editando = editandoId === a.id;
          return (
            <div key={a.id} className="flex flex-col gap-1 px-3 py-2">
              {editando ? (
                <form onSubmit={salvarEdicao} className="flex flex-wrap items-end gap-2">
                  <input
                    type="date"
                    value={dataEdicao}
                    onChange={(e) => setDataEdicao(e.target.value)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs"
                  />
                  <input
                    value={descricaoEdicao}
                    onChange={(e) => setDescricaoEdicao(e.target.value)}
                    maxLength={200}
                    className="flex-1 min-w-[160px] rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={salvandoEdicao}
                    className="text-xs font-medium text-slate-900 hover:underline disabled:opacity-50 dark:text-slate-100"
                  >
                    {salvandoEdicao ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoId(null)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    Cancelar
                  </button>
                  {erroEdicao && <p className="w-full text-xs text-red-600 dark:text-red-400">{erroEdicao}</p>}
                </form>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                      <span className="whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                        {formatDataBR(a.data)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAberto({ fileId: a.file_id, nome: a.nome })}
                        className="truncate text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        📎 {a.nome}
                      </button>
                    </div>
                    {a.descricao && (
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{a.descricao}</p>
                    )}
                  </div>
                  {!bloqueada && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => iniciarEdicao(a)}
                        disabled={!online}
                        className="text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:underline disabled:opacity-40"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemover(a)}
                        disabled={removendoId === a.id || !online}
                        className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-40"
                      >
                        {removendoId === a.id ? "Removendo..." : "Excluir"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
