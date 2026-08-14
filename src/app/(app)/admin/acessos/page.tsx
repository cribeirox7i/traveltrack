"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then(setUsers);
    fetch("/api/trips")
      .then((r) => r.json())
      .then((data: TripItem[]) => {
        setTrips(data);
        if (data[0]) setTripId(data[0].id);
      });
  }, []);

  useEffect(() => {
    if (!tripId) return;
    fetch(`/api/user-trip?trip_id=${tripId}`)
      .then((r) => r.json())
      .then(setLinks);
  }, [tripId]);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !tripId) return;
    setSaving(true);
    await fetch("/api/user-trip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, trip_id: tripId }),
    });
    setSaving(false);
    const res = await fetch(`/api/user-trip?trip_id=${tripId}`);
    setLinks(await res.json());
  }

  const linkedUserIds = new Set(links.map((l) => l.user_id));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">Acesso a viagens</h1>
      <p className="text-sm text-slate-500">
        Escolha uma viagem e conceda acesso de visualização a cada usuário.
      </p>

      <form
        onSubmit={handleLink}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Viagem</label>
          <select
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Usuário</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
          disabled={saving || !userId}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Concedendo..." : "Conceder acesso"}
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-slate-700">Quem já tem acesso a esta viagem</p>
        <ul className="flex flex-col gap-1 text-sm">
          {users
            .filter((u) => linkedUserIds.has(u.id))
            .map((u) => (
              <li key={u.id} className="text-slate-600">
                {u.nome} ({u.email})
              </li>
            ))}
          {links.length === 0 && <li className="text-slate-400">Ninguém ainda.</li>}
        </ul>
      </div>
    </div>
  );
}
