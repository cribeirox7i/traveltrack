"use client";

import { useState } from "react";
import { createAgendaOffline } from "@/lib/offline/sync";
import { DocumentoExtraido, priorizarDatasDaViagem } from "@/lib/documentoParser";

/**
 * Rascunho de compromisso montado a partir do que foi lido do anexo (ver `lib/documentoParser.ts`).
 *
 * **Nunca cria o compromisso sozinho**: a leitura é heurística e erra - principalmente no título,
 * que sai como uma lista de palpites pra pessoa escolher. Data e horário vêm pré-selecionados no
 * melhor palpite, mas continuam editáveis, e dá pra descartar tudo sem salvar nada.
 */
export function SugestaoAgendaModal({
  tripId,
  extraido,
  datasDaViagem,
  nomeArquivo,
  onClose,
}: {
  tripId: string;
  extraido: DocumentoExtraido;
  /** Datas válidas da viagem - o compromisso precisa cair numa delas (regra da API de Agenda). */
  datasDaViagem: string[];
  nomeArquivo: string;
  onClose: () => void;
}) {
  const datasSugeridas = priorizarDatasDaViagem(extraido.datas, datasDaViagem).filter((d) =>
    datasDaViagem.includes(d)
  );

  const [form, setForm] = useState({
    titulo: extraido.titulos[0] ?? "",
    data: datasSugeridas[0] ?? datasDaViagem[0] ?? "",
    horario: extraido.horarios[0] ?? "",
    descricao: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.titulo.trim() || !form.data || !form.horario) {
      setError("Título, data e horário são obrigatórios");
      return;
    }
    setError(null);
    setSaving(true);
    await createAgendaOffline(tripId, {
      data: form.data,
      horario: form.horario,
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim(),
      url: "",
    });
    setSaving(false);
    onClose();
  }

  const naoAchouNada =
    extraido.titulos.length === 0 && extraido.datas.length === 0 && extraido.horarios.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xl">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Criar compromisso a partir do anexo
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500" title={nomeArquivo}>
          {nomeArquivo}
        </p>

        {naoAchouNada ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Não consegui identificar data, horário nem um nome neste documento. O anexo foi salvo
            normalmente - dá pra criar o compromisso à mão na aba Roteiro.
          </p>
        ) : (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Li o documento e preenchi o que consegui identificar. Confira antes de salvar - a
            leitura automática erra às vezes, principalmente no nome.
          </p>
        )}

        {!naoAchouNada && (
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Título
              </label>
              <input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex.: Voo GRU - CUN"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
              />
              {extraido.titulos.length > 1 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {extraido.titulos.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, titulo: t })}
                      className={`max-w-full truncate rounded-full border px-2 py-1 text-[11px] ${
                        form.titulo === t
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                          : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Data
                </label>
                <select
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
                >
                  {datasDaViagem.map((d) => {
                    const [y, m, dd] = d.split("-");
                    return (
                      <option key={d} value={d}>
                        {`${dd}/${m}/${y}`}
                        {datasSugeridas.includes(d) ? " (do documento)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="w-32">
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Horário
                </label>
                <input
                  type="time"
                  value={form.horario}
                  onChange={(e) => setForm({ ...form, horario: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {extraido.horarios.length > 1 && (
              <div className="-mt-1 flex flex-wrap gap-1.5">
                {extraido.horarios.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setForm({ ...form, horario: h })}
                    className={`rounded-full border px-2 py-1 text-[11px] ${
                      form.horario === h
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                        : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Descrição <span className="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
              </label>
              <input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 flex items-center gap-2">
          {!naoAchouNada && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Criar compromisso"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {naoAchouNada ? "Fechar" : "Descartar"}
          </button>
        </div>
      </div>
    </div>
  );
}
