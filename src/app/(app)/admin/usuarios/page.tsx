"use client";

import { Fragment, useEffect, useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";

interface UserItem {
  id: string;
  nome: string;
  email: string;
  role: "admin" | "user";
  ativo: "true" | "false";
}

export default function UsuariosAdminPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", senha: "", role: "user" as "admin" | "user" });
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nome: "", email: "", role: "user" as "admin" | "user" });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetSenha, setResetSenha] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erro ao criar usuário");
      return;
    }

    setForm({ nome: "", email: "", senha: "", role: "user" });
    load();
  }

  async function toggleActive(user: UserItem) {
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: user.ativo !== "true" }),
    });
    load();
  }

  function startEdit(user: UserItem) {
    setResettingId(null);
    setEditingId(user.id);
    setEditError(null);
    setEditForm({ nome: user.nome, email: user.email, role: user.role });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    setEditError(null);
    setEditSaving(true);

    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });

    setEditSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setEditError(data.error ?? "Erro ao salvar usuário");
      return;
    }

    setEditingId(null);
    load();
  }

  function startReset(user: UserItem) {
    setEditingId(null);
    setResettingId(user.id);
    setResetSenha("");
    setResetError(null);
  }

  function cancelReset() {
    setResettingId(null);
    setResetError(null);
  }

  async function saveReset(id: string) {
    setResetError(null);
    if (resetSenha.length < 6) {
      setResetError("A senha precisa ter pelo menos 6 caracteres");
      return;
    }
    setResetSaving(true);

    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha: resetSenha }),
    });

    setResetSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setResetError(data.error ?? "Erro ao redefinir senha");
      return;
    }

    setResettingId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">Usuários</h1>

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex-1 min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Nome</label>
          <input
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Senha</label>
          <PasswordInput
            required
            minLength={6}
            value={form.senha}
            onChange={(e) => setForm({ ...form, senha: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-[120px]">
          <label className="mb-1 block text-xs font-medium text-slate-600">Papel</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "user" })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="user">Usuário</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Criando..." : "Criar usuário"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Papel</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-4 py-3 text-slate-500" colSpan={5}>
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-slate-500" colSpan={5}>
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <Fragment key={u.id}>
                <tr className="border-t border-slate-100">
                  {editingId === u.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input
                          value={editForm.nome}
                          onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={editForm.role}
                          onChange={(e) =>
                            setEditForm({ ...editForm, role: e.target.value as "admin" | "user" })
                          }
                          className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                        >
                          <option value="user">Usuário</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            u.ativo === "true"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {u.ativo === "true" ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => saveEdit(u.id)}
                            disabled={editSaving}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                          >
                            {editSaving ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-xs font-medium text-slate-500 hover:text-slate-900"
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2">{u.nome}</td>
                      <td className="px-4 py-2">{u.email}</td>
                      <td className="px-4 py-2 capitalize">{u.role}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            u.ativo === "true"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {u.ativo === "true" ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => startEdit(u)}
                            className="text-xs font-medium text-slate-500 hover:text-slate-900"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => startReset(u)}
                            className="text-xs font-medium text-slate-500 hover:text-slate-900"
                          >
                            Redefinir senha
                          </button>
                          <button
                            onClick={() => toggleActive(u)}
                            className="text-xs font-medium text-slate-500 hover:text-slate-900"
                          >
                            {u.ativo === "true" ? "Desativar" : "Ativar"}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
                {editingId === u.id && editError && (
                  <tr key={`${u.id}-edit-error`} className="border-t border-slate-100 bg-red-50">
                    <td className="px-4 py-2 text-xs text-red-600" colSpan={5}>
                      {editError}
                    </td>
                  </tr>
                )}
                {resettingId === u.id && (
                  <tr key={`${u.id}-reset`} className="border-t border-slate-100 bg-slate-50">
                    <td className="px-4 py-3" colSpan={5}>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[220px]">
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Nova senha para {u.nome}
                          </label>
                          <PasswordInput
                            minLength={6}
                            value={resetSenha}
                            onChange={(e) => setResetSenha(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <button
                          onClick={() => saveReset(u.id)}
                          disabled={resetSaving}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {resetSaving ? "Salvando..." : "Salvar nova senha"}
                        </button>
                        <button
                          onClick={cancelReset}
                          className="text-xs font-medium text-slate-500 hover:text-slate-900"
                        >
                          Cancelar
                        </button>
                      </div>
                      {resetError && <p className="mt-2 text-xs text-red-600">{resetError}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
