"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useOfflineCollection, useOfflineTrip } from "@/lib/offline/useOfflineData";
import { createCheckOffline, deleteCheckOffline, updateCheckOffline } from "@/lib/offline/sync";
import { viagemBloqueada } from "@/lib/tripStatus";
import { InfoDisclaimer } from "@/components/InfoDisclaimer";

interface CheckItem {
  id: string;
  trip_id: string;
  user_id: string;
  descritivo: string;
  data_alvo: string;
  status: "true" | "false";
  criado_em: string;
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function ChecklistPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const { items: allItems, loading } = useOfflineCollection<CheckItem>("checklist", tripId);
  const { trip } = useOfflineTrip<{ id: string; status?: string; data_inicio: string; data_fim: string }>(tripId);
  const bloqueada = !!trip && viagemBloqueada(trip);

  // Filtra pelo usuário atual - o cache pode ter itens de outros usuários.
  const items = allItems.filter((i) => i.user_id === session?.user.id);

  const pendentes = items.filter((i) => i.status !== "true").sort((a, b) => {
    const da = a.data_alvo || "9999-99-99";
    const db = b.data_alvo || "9999-99-99";
    return da !== db ? da.localeCompare(db) : a.criado_em.localeCompare(b.criado_em);
  });
  const concluidos = items.filter((i) => i.status === "true").sort((a, b) =>
    a.criado_em.localeCompare(b.criado_em)
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [descritivo, setDescritivo] = useState("");
  const [dataAlvo, setDataAlvo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function openNew() {
    setEditingId(null);
    setDescritivo("");
    setDataAlvo("");
    setError(null);
    setFormOpen(true);
  }

  function openEdit(item: CheckItem) {
    setEditingId(item.id);
    setDescritivo(item.descritivo);
    setDataAlvo(item.data_alvo);
    setError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!descritivo.trim()) { setError("Descritivo é obrigatório"); return; }
    if (!session?.user) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateCheckOffline(tripId, editingId, { descritivo: descritivo.trim(), data_alvo: dataAlvo });
      } else {
        await createCheckOffline(
          tripId,
          { descritivo: descritivo.trim(), data_alvo: dataAlvo },
          { id: session.user.id }
        );
      }
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(item: CheckItem) {
    if (bloqueada) return;
    await updateCheckOffline(tripId, item.id, {
      status: item.status === "true" ? "false" : "true",
    });
  }

  async function handleDelete(id: string) {
    setRemovingId(id);
    try {
      await deleteCheckOffline(tripId, id);
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <InfoDisclaimer>
        Checklist pessoal da viagem - cada usuário vê e gerencia apenas as próprias tarefas. Marque
        como concluído ao completar cada item.
      </InfoDisclaimer>

      {!bloqueada && (
        <button
          type="button"
          onClick={openNew}
          className="self-start rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-semibold text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-300"
        >
          + Nova tarefa
        </button>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50"
        >
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {editingId ? "Editar tarefa" : "Nova tarefa"}
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Descritivo *
            </label>
            <input
              type="text"
              value={descritivo}
              onChange={(e) => setDescritivo(e.target.value)}
              placeholder="Ex.: Comprar adaptador de tomada"
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
              autoFocus
              maxLength={500}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Data alvo (opcional)
            </label>
            <input
              type="date"
              value={dataAlvo}
              onChange={(e) => setDataAlvo(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-semibold text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-300 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {items.length === 0 && !formOpen && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Nenhuma tarefa ainda. Adicione a primeira!
        </p>
      )}

      {pendentes.length > 0 && (
        <div className="flex flex-col gap-2">
          {pendentes.length > 0 && concluidos.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Pendentes ({pendentes.length})
            </p>
          )}
          {pendentes.map((item) => (
            <CheckRow
              key={item.id}
              item={item}
              bloqueada={bloqueada}
              removingId={removingId}
              onToggle={toggleStatus}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {concluidos.length > 0 && (
        <div className="flex flex-col gap-2">
          {pendentes.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Concluídos ({concluidos.length})
            </p>
          )}
          {concluidos.map((item) => (
            <CheckRow
              key={item.id}
              item={item}
              bloqueada={bloqueada}
              removingId={removingId}
              onToggle={toggleStatus}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckRow({
  item,
  bloqueada,
  removingId,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: CheckItem;
  bloqueada: boolean;
  removingId: string | null;
  onToggle: (item: CheckItem) => void;
  onEdit: (item: CheckItem) => void;
  onDelete: (id: string) => void;
}) {
  const concluido = item.status === "true";
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${concluido ? "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`}>
      <button
        type="button"
        disabled={bloqueada}
        onClick={() => onToggle(item)}
        aria-label={concluido ? "Marcar como pendente" : "Marcar como concluído"}
        className={`mt-0.5 flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${concluido ? "bg-slate-700 dark:bg-slate-300 border-slate-700 dark:border-slate-300" : "border-slate-400 dark:border-slate-500 hover:border-slate-600 dark:hover:border-slate-300"}`}
      >
        {concluido && (
          <svg className="h-3 w-3 text-white dark:text-slate-900" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${concluido ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
          {item.descritivo}
        </p>
        {item.data_alvo && (
          <p className={`text-xs mt-0.5 ${concluido ? "text-slate-400 dark:text-slate-600" : "text-slate-500 dark:text-slate-400"}`}>
            Alvo: {formatDateBR(item.data_alvo)}
          </p>
        )}
      </div>
      {!bloqueada && (
        <div className="flex gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="rounded px-2 py-1 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Editar
          </button>
          <button
            type="button"
            disabled={removingId === item.id}
            onClick={() => onDelete(item.id)}
            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            {removingId === item.id ? "..." : "Excluir"}
          </button>
        </div>
      )}
    </div>
  );
}
