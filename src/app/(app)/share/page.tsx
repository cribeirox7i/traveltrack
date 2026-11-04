"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiFetch, mensagemErro } from "@/lib/apiFetch";
import { InfoDisclaimer } from "@/components/InfoDisclaimer";

interface Trip {
  id: string;
  nome: string;
  status: string;
}

interface Classificacao {
  id: string;
  nome: string;
  ativo: string;
}

interface NotificacaoExtraida {
  descricao: string;
  valor: string;
  natureza: "debito" | "credito" | "";
  data_pagamento: string;
  nome_local: string;
}

const hoje = new Date().toISOString().slice(0, 10);

function ShareContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  const textoOriginal =
    [params.get("text"), params.get("title"), params.get("url")].filter(Boolean).join(" ").trim();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);
  const [tripId, setTripId] = useState("");
  const [classificacaoId, setClassificacaoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [natureza, setNatureza] = useState<"debito" | "credito">("debito");
  const [data, setData] = useState(hoje);
  const [analisando, setAnalisando] = useState(false);
  const [analisado, setAnalisado] = useState(false);
  const [erroAnalise, setErroAnalise] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregarDados = useCallback(async () => {
    const [tripsRes, clasRes] = await Promise.all([
      apiFetch<Trip[]>("/api/trips"),
      apiFetch<Classificacao[]>("/api/classificacoes"),
    ]);
    if (tripsRes.ok && Array.isArray(tripsRes.data)) {
      const ativas = tripsRes.data.filter((t) => t.status !== "cancelada" && t.status !== "concluida");
      setTrips(ativas);
      if (ativas.length === 1) setTripId(ativas[0].id);
    }
    if (clasRes.ok && Array.isArray(clasRes.data)) {
      setClassificacoes(clasRes.data.filter((c) => c.ativo !== "false"));
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  async function analisar() {
    if (!tripId || !textoOriginal) return;
    setErroAnalise("");
    setAnalisando(true);
    const res = await apiFetch<NotificacaoExtraida>(`/api/trips/${tripId}/itens/analisar-texto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: textoOriginal }),
    });
    setAnalisando(false);
    if (!res.ok) {
      setErroAnalise(mensagemErro(res.error));
      return;
    }
    const d = res.data!;
    if (d.descricao) setDescricao(d.descricao);
    if (d.valor) setValor(d.valor.replace(".", ","));
    if (d.natureza) setNatureza(d.natureza as "debito" | "credito");
    if (d.data_pagamento) setData(d.data_pagamento);
    setAnalisado(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!tripId || !classificacaoId || !descricao || !data) return;
    setSalvando(true);
    setErro("");
    const res = await apiFetch(`/api/trips/${tripId}/itens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classificacao_id: classificacaoId,
        financeiro_ativo: "true",
        roteiro_ativo: "false",
        descricao,
        valor: valor.replace(",", "."),
        natureza,
        data,
        pagador_id: userId,
        status: "pago",
      }),
    });
    setSalvando(false);
    if (!res.ok) {
      setErro(mensagemErro(res.error));
      return;
    }
    router.push(`/trips/${tripId}/itens`);
  }

  if (!textoOriginal) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Compartilhar notificacao
        </h1>
        <InfoDisclaimer>
          Esta pagina recebe notificacoes compartilhadas do Android. Para usar: no celular,
          segure a notificacao do banco → toque em{" "}
          <strong>Compartilhar</strong> → escolha <strong>TravelTrack</strong>.
        </InfoDisclaimer>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Nova despesa por notificacao
      </h1>

      {/* Texto recebido */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4">
        <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Notificacao recebida
        </p>
        <p className="text-sm text-slate-800 dark:text-slate-200 break-words">{textoOriginal}</p>
      </div>

      <form onSubmit={salvar} className="flex flex-col gap-4">
        {/* Viagem */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Viagem <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={tripId}
            onChange={(e) => { setTripId(e.target.value); setAnalisado(false); }}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="">Selecione...</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>

        {/* Botao analisar */}
        {!analisado && (
          <button
            type="button"
            onClick={() => void analisar()}
            disabled={!tripId || analisando}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            {analisando ? "Analisando com IA..." : "Analisar com IA"}
          </button>
        )}
        {erroAnalise && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {erroAnalise} — preencha os campos abaixo manualmente.
          </p>
        )}

        {/* Campos financeiros */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Classificacao <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={classificacaoId}
            onChange={(e) => setClassificacaoId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="">Selecione...</option>
            {classificacoes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Descricao <span className="text-red-500">*</span>
          </label>
          <input
            required
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: Almoco restaurante"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Valor (R$)
            </label>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Natureza
            </label>
            <select
              value={natureza}
              onChange={(e) => setNatureza(e.target.value as "debito" | "credito")}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="debito">Debito</option>
              <option value="credito">Credito</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Data <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>

        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={salvando}
            className="flex-1 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50"
          >
            {salvando ? "Criando..." : "Criar item"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Destino do Web Share Target (manifest.json `share_target`). O usuario compartilha o texto de
 * uma notificacao bancaria do Android pra ca, o Gemini interpreta e pre-preenche o formulario de
 * novo Item financeiro.
 */
export default function SharePage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">Carregando...</div>}>
      <ShareContent />
    </Suspense>
  );
}
