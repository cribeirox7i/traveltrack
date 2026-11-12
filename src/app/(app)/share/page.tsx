"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiFetch, mensagemErro } from "@/lib/apiFetch";
import { statusViagem } from "@/lib/tripStatus";

interface Trip {
  id: string;
  nome: string;
  status: string;
  data_inicio: string;
  data_fim: string;
}

interface Classificacao {
  id: string;
  nome: string;
  ativo: string;
}

interface MeioPagamento {
  id: string;
  nome: string;
  proprio: boolean;
}

interface NotificacaoExtraida {
  descricao: string;
  valor: string;
  natureza: "debito" | "credito" | "";
  data_pagamento: string;
  nome_local: string;
}

const hoje = new Date().toISOString().slice(0, 10);

/** Tenta sugerir uma classificacao comparando o texto da notificacao com os nomes
 * das classificacoes cadastradas usando palavras-chave comuns em portugues. */
function sugerirClassificacao(
  descricao: string,
  nomeLocal: string,
  classificacoes: Classificacao[]
): string {
  if (!classificacoes.length) return "";
  const normalizar = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const texto = normalizar(`${descricao} ${nomeLocal}`);

  const grupos: Record<string, string[]> = {
    alimentacao: [
      "restaurante", "lanchonete", "padaria", "cafe", "pizza", "hamburguer",
      "sushi", "bar", "boteco", "food", "ifood", "rappi", "delivery", "bistro",
      "brunch", "acai", "refeicao", "mercado", "supermercado", "mercearia",
      "sorveteria", "doceria", "confeitaria", "cozinha", "cervejaria",
    ],
    hospedagem: ["hotel", "pousada", "hostel", "airbnb", "resort", "motel", "hospedagem"],
    traslado: [
      "uber", "taxi", "transfer", "traslado", "onibus", "metro", "cabify",
      "combustivel", "gasolina", "posto",
    ],
    passeio: [
      "museu", "teatro", "show", "ingresso", "excursao", "tour", "passeio",
      "parque", "zoologico", "aquario", "atrativo",
    ],
    repasse: ["pix", "transferencia", "ted", "doc", "repasse", "reembolso"],
  };

  let melhorId = "";
  let melhorPontos = 0;

  for (const cl of classificacoes) {
    let pontos = 0;
    const nomeNorm = normalizar(cl.nome);

    for (const [grupo, palavras] of Object.entries(grupos)) {
      if (palavras.some((p) => texto.includes(p))) {
        if (palavras.some((p) => nomeNorm.includes(p)) || nomeNorm.includes(grupo)) {
          pontos += 2;
        }
      }
    }

    // Bonus: palavra significativa do nome da classificacao aparece no texto
    for (const p of nomeNorm.split(/\s+/).filter((w) => w.length > 3)) {
      if (texto.includes(p)) pontos += 1;
    }

    if (pontos > melhorPontos) {
      melhorPontos = pontos;
      melhorId = cl.id;
    }
  }

  return melhorPontos >= 2 ? melhorId : "";
}

function ShareContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const userId = session?.user?.id ?? "";

  const textoOriginal =
    [params.get("text"), params.get("title"), params.get("url")].filter(Boolean).join(" ").trim();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);
  const [meiosPagamento, setMeiosPagamento] = useState<MeioPagamento[]>([]);
  const [tripId, setTripId] = useState("");
  const [classificacaoId, setClassificacaoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [moeda, setMoeda] = useState("BRL");
  const [meioPagamentoId, setMeioPagamentoId] = useState("");
  // data e oculta - vem do Gemini ou default hoje
  const [data, setData] = useState(hoje);
  const [analisando, setAnalisando] = useState(false);
  const [erroAnalise, setErroAnalise] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  // resultado bruto do Gemini (guardado pra sugestao de classificacao rever quando classificacoes chegar)
  const [resultadoGemini, setResultadoGemini] = useState<NotificacaoExtraida | null>(null);
  // incrementar para re-disparar analise manualmente
  const [analiseTrigger, setAnaliseTrigger] = useState(0);

  const carregarDados = useCallback(async () => {
    const [tripsRes, clasRes, mpRes] = await Promise.all([
      apiFetch<Trip[]>("/api/trips"),
      apiFetch<Classificacao[]>("/api/classificacoes"),
      apiFetch<MeioPagamento[]>("/api/meios-pagamento"),
    ]);

    if (tripsRes.ok && Array.isArray(tripsRes.data)) {
      const ativas = tripsRes.data.filter(
        (t) => t.status !== "cancelada" && t.status !== "concluida"
      );
      setTrips(ativas);

      // Auto-selecao: em_andamento primeiro; senao planejada com data_inicio mais proxima
      const emAndamento = ativas.find((t) => statusViagem(t) === "em_andamento");
      if (emAndamento) {
        setTripId(emAndamento.id);
      } else {
        const planejadas = ativas
          .filter((t) => statusViagem(t) === "planejada")
          .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
        if (planejadas.length) setTripId(planejadas[0].id);
      }
    }

    if (clasRes.ok && Array.isArray(clasRes.data)) {
      setClassificacoes(clasRes.data.filter((c) => c.ativo !== "false"));
    }

    if (mpRes.ok && Array.isArray(mpRes.data)) {
      setMeiosPagamento((mpRes.data as MeioPagamento[]).filter((m) => m.proprio));
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Auto-dispara analise Gemini assim que tripId e texto estiverem disponiveis.
  // `analiseTrigger` permite reanalisar manualmente.
  useEffect(() => {
    if (!tripId || !textoOriginal) return;
    let cancelado = false;

    (async () => {
      setErroAnalise("");
      setAnalisando(true);
      const res = await apiFetch<NotificacaoExtraida>(
        `/api/trips/${tripId}/itens/analisar-texto`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto: textoOriginal }),
        }
      );
      if (cancelado) return;
      setAnalisando(false);
      if (!res.ok) {
        setErroAnalise(mensagemErro(res.error));
        return;
      }
      const d = res.data!;
      if (d.descricao) setDescricao(d.descricao);
      if (d.valor) setValor(d.valor.replace(".", ","));
      if (d.data_pagamento) setData(d.data_pagamento);
      setResultadoGemini(d);
    })();

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, textoOriginal, analiseTrigger]);

  // Aplica sugestao de classificacao quando resultado Gemini e classificacoes estiverem prontos.
  // Nao sobrescreve selecao manual do usuario (classificacaoId ja preenchido).
  useEffect(() => {
    if (!resultadoGemini || !classificacoes.length || classificacaoId) return;
    const sugerido = sugerirClassificacao(
      resultadoGemini.descricao,
      resultadoGemini.nome_local,
      classificacoes
    );
    if (sugerido) setClassificacaoId(sugerido);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultadoGemini, classificacoes]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!tripId || !classificacaoId || !descricao || !data) return;
    if (!userId) {
      setErro(
        sessionStatus === "loading"
          ? "Sessão ainda carregando - aguarde e tente novamente"
          : `Sessão inválida (id ausente, status: ${sessionStatus}) - recarregue a página`
      );
      return;
    }
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
        natureza: "debito",
        moeda: moeda.trim().toUpperCase() || "BRL",
        data,
        pagador_id: userId,
        status: "pago",
        ...(meioPagamentoId ? { meio_pagamento_id: meioPagamentoId } : {}),
      }),
    });
    setSalvando(false);
    if (!res.ok) {
      setErro(mensagemErro(res.error));
      return;
    }
    router.push(`/trips/${tripId}/itens`);
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Nova despesa
      </h1>

      {/* Texto recebido - só quando veio de notificacao */}
      {textoOriginal && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4">
          <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Notificacao recebida
          </p>
          <p className="text-sm text-slate-800 dark:text-slate-200 break-words">{textoOriginal}</p>
        </div>
      )}

      {/* Estado da analise */}
      {analisando && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Analisando com IA...</p>
      )}
      {erroAnalise && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {erroAnalise} — preencha os campos abaixo manualmente.
        </p>
      )}

      <form onSubmit={salvar} className="flex flex-col gap-4">
        {/* Viagem */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Viagem <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={tripId}
            onChange={(e) => setTripId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="">Selecione...</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>

        {/* Classificacao */}
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

        {/* Descricao */}
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

        {/* Valor + Moeda */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Valor
            </label>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
          <div className="w-24">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Moeda
            </label>
            <input
              value={moeda}
              onChange={(e) => setMoeda(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="BRL"
              maxLength={3}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm uppercase"
            />
          </div>
        </div>

        {/* Meio de pagamento */}
        {meiosPagamento.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Meio de pagamento
            </label>
            <select
              value={meioPagamentoId}
              onChange={(e) => setMeioPagamentoId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="">Nao informar</option>
              {meiosPagamento.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </div>
        )}

        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={salvando || analisando}
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

      {/* Reanalisar: util se a analise automatica falhou ou o usuario quer tentar de novo */}
      {textoOriginal && !analisando && (
        <button
          type="button"
          onClick={() => {
            setResultadoGemini(null);
            setAnaliseTrigger((n) => n + 1);
          }}
          className="self-start text-xs text-slate-500 dark:text-slate-400 hover:underline"
        >
          Reanalisar com IA
        </button>
      )}
    </div>
  );
}

/**
 * Destino do Web Share Target (manifest.json `share_target`) e do TravelNotif.
 * Recebe o texto de uma notificacao de pagamento, analisa automaticamente com Gemini
 * e pre-preenche o formulario de novo Item financeiro.
 */
export default function SharePage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">Carregando...</div>}>
      <ShareContent />
    </Suspense>
  );
}
