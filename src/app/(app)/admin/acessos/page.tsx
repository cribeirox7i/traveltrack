"use client";

import { useEffect, useState } from "react";
import { apiFetch, mensagemErro } from "@/lib/apiFetch";
import { useOnlineStatus } from "@/lib/offline/useOfflineData";

interface UserItem {
  id: string;
  nome: string;
  email: string;
}

interface TripItem {
  id: string;
  nome: string;
}

interface UserTripLink {
  id: string;
  user_id: string;
  trip_id: string;
}

export default function AcessosAdminPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [tripId, setTripId] = useState("");
  const [userId, setUserId] = useState("");
  const [links, setLinks] = useState<UserTripLink[]>([]);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  // Conceder/remover acesso não tem versão offline (nada disso entra no outbox), então sem sinal
  // esta tela só mostra o que o Service Worker guardou da última visita com internet.
  const online = useOnlineStatus();

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      const [resUsers, resTrips] = await Promise.all([
        apiFetch<UserItem[]>("/api/users"),
        apiFetch<TripItem[]>("/api/trips"),
      ]);
      // A resposta de erro do servidor é um objeto `{error}`, não uma lista - guardá-la em
      // `users`/`trips` sem checar fazia o `.map()` do JSX quebrar a tela inteira, em vez de só
      // mostrar a lista vazia.
      if (resUsers.ok && Array.isArray(resUsers.data)) setUsers(resUsers.data);
      if (resTrips.ok && Array.isArray(resTrips.data)) {
        setTrips(resTrips.data);
        if (resTrips.data[0]) setTripId(resTrips.data[0].id);
      }
      if (!resUsers.ok) setErro(mensagemErro(resUsers.error));
      else if (!resTrips.ok) setErro(mensagemErro(resTrips.error));
      setCarregando(false);
    }
    carregar();
  }, []);

  async function carregarLinks(id: string) {
    const res = await apiFetch<UserTripLink[]>(`/api/user-trip?trip_id=${id}`);
    setLinks(res.ok && Array.isArray(res.data) ? res.data : []);
  }

  useEffect(() => {
    if (!tripId) return;
    carregarLinks(tripId);
  }, [tripId]);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !tripId) return;
    setSaving(true);
    setErro(null);
    const res = await apiFetch("/api/user-trip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, trip_id: tripId }),
    });
    setSaving(false);
    if (!res.ok) {
      setErro(mensagemErro(res.error));
      return;
    }
    await carregarLinks(tripId);
  }

  async function handleUnlink(userIdToRemove: string) {
    if (!tripId) return;
    setRemovingId(userIdToRemove);
    setErro(null);
    const res = await apiFetch("/api/user-trip", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userIdToRemove, trip_id: tripId }),
    });
    setRemovingId(null);
    if (!res.ok) {
      setErro(mensagemErro(res.error));
      return;
    }
    await carregarLinks(tripId);
  }

  const linkedUserIds = new Set(links.map((l) => l.user_id));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Acesso a viagens</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Escolha uma viagem e conceda acesso de visualização a cada usuário.
      </p>

      <form
        onSubmit={handleLink}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Viagem</label>
          <select
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          >
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Usuário</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
          >
            <option value="">Selecione...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} ({u.email})
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={saving || !userId || !online}
          title={online ? undefined : "Conceder acesso precisa de internet"}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Concedendo..." : "Conceder acesso"}
        </button>
      </form>

      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Quem já tem acesso a esta viagem</p>
        <ul className="flex flex-col gap-1 text-sm">
          {users
            .filter((u) => linkedUserIds.has(u.id))
            .map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
                <span>
                  {u.nome} ({u.email})
                </span>
                <button
                  type="button"
                  onClick={() => handleUnlink(u.id)}
                  disabled={removingId === u.id || !online}
                  title={online ? undefined : "Remover acesso precisa de internet"}
                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 disabled:opacity-50"
                >
                  {removingId === u.id ? "Removendo..." : "Remover"}
                </button>
              </li>
            ))}
          {carregando && <li className="text-slate-400 dark:text-slate-500">Carregando...</li>}
          {!carregando && links.length === 0 && (
            <li className="text-slate-400 dark:text-slate-500">Ninguém ainda.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
