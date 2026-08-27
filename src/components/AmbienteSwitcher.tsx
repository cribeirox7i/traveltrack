"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { wipeLocalData } from "@/lib/offline/db";

interface Ambiente {
  id: string;
  nome: string;
  ativo: string;
}

/**
 * Seletor de ambiente do admin global (só ele aparece - gestor e usuário comum são presos ao
 * ambiente da própria sessão, e a API ignora o cookie pra eles).
 *
 * Trocar de ambiente limpa os dados locais (IndexedDB + caches do SW) antes de recarregar: o
 * cache offline é por aparelho e não sabe de ambiente, então sem essa limpeza a lista de viagens
 * do ambiente anterior continuaria aparecendo até a próxima sincronização - exatamente o
 * vazamento visual que o multitenant deveria evitar.
 */
export function AmbienteSwitcher() {
  const { data: session } = useSession();
  const router = useRouter();
  const [ambientes, setAmbientes] = useState<Ambiente[]>([]);
  const [atual, setAtual] = useState("");
  const [trocando, setTrocando] = useState(false);

  const isAdmin = session?.user.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/ambientes")
      .then((res) => (res.ok ? res.json() : []))
      .then((lista: Ambiente[]) => setAmbientes(lista.filter((a) => a.ativo !== "false")))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/ambientes/atual")
      .then((res) => (res.ok ? res.json() : { ambiente_id: "" }))
      .then((data: { ambiente_id?: string }) => setAtual(data.ambiente_id ?? ""))
      .catch(() => {});
  }, [isAdmin]);

  if (!isAdmin) return null;

  async function trocar(ambienteId: string) {
    setTrocando(true);
    try {
      const res = await fetch("/api/ambientes/ativo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ambiente_id: ambienteId }),
      });
      if (!res.ok) return;
      setAtual(ambienteId);
      await wipeLocalData().catch(() => {});
      // Volta pra lista de viagens e força o servidor a reavaliar: os hooks de offline remontam
      // e repuxam do zero, já com o cookie do ambiente novo.
      router.push("/trips");
      router.refresh();
    } finally {
      setTrocando(false);
    }
  }

  return (
    <select
      value={atual}
      disabled={trocando}
      onChange={(e) => trocar(e.target.value)}
      aria-label="Ambiente"
      title="Ambiente que você está navegando"
      className="max-w-[9rem] rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
    >
      <option value="">Todos os ambientes</option>
      {ambientes.map((a) => (
        <option key={a.id} value={a.id}>
          {a.nome}
        </option>
      ))}
    </select>
  );
}
