/**
 * Leitura de voucher (PDF/imagem) via Gemini API (Google AI Studio, free tier) - só chamado do
 * servidor, a `GEMINI_API_KEY` nunca chega ao cliente (mesmo padrão de
 * `APPS_SCRIPT_SHARED_SECRET`, ver client.ts). `fetch` direto na REST API, sem SDK novo como
 * dependência - mesmo padrão que `weather.ts`/`exchangeRate.ts` já usam pra API externa.
 */
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const CATEGORIAS = [
  "traslado",
  "passagem",
  "hospedagem",
  "alimentacao",
  "atrativo",
  "repasse",
  "documento",
  "outro",
] as const;

const PROMPT = `Você recebe um comprovante/voucher de viagem (passagem, traslado, hospedagem,
restaurante, ingresso/excursão, comprovante de repasse entre pessoas, ou documento pessoal como
RG/passaporte/visto/seguro). Identifique a categoria mais provável entre exatamente estas 8
opções e extraia os campos do documento, devolvendo SÓ o JSON pedido pelo schema - nunca invente
um valor que não está no documento, deixe o campo como string vazia "" se não encontrar.

Categorias:
- "traslado": ônibus/van/carro/transfer entre dois pontos dentro do destino (não é a viagem
  principal de ida/volta).
- "passagem": passagem aérea, rodoviária, de trem ou embarcação entre cidades/países.
- "hospedagem": reserva de hotel, pousada, Airbnb.
- "alimentacao": nota fiscal/comprovante de restaurante ou similar.
- "atrativo": ingresso de atração turística ou excursão/passeio guiado.
- "repasse": comprovante de transferência/Pix entre pessoas do grupo (não é pagamento a
  fornecedor).
- "documento": documento pessoal (RG, CPF, passaporte, visto, CNH, seguro-viagem, cartão de
  vacina) ou comprovante de taxa/pedágio.
- "outro": não se encaixa em nenhuma acima.

Campos (preencha só os que fizerem sentido pra categoria escolhida, o resto fica ""):
- tipo: em traslado/passagem, o meio de transporte (ônibus, van, carro, avião, embarcação, trem);
  em atrativo, "excursão" ou "ingresso".
- localizador, nome_companhia, numero: código de reserva, nome da companhia/fornecedor, número
  do voo/ônibus/pedido.
- origem, destino: cidades de partida/chegada (traslado/passagem).
- nome_local, endereco: nome e endereço do hotel/restaurante.
- data_inicio, hora_inicio, data_fim, hora_fim: partida/chegada (traslado/passagem), check-in/
  check-out (hospedagem/alimentação), início/término (atrativo) - formato AAAA-MM-DD e HH:MM.
- data, horario: só preencha se a categoria for "repasse", "documento" ou "outro" (as demais usam
  data_inicio/hora_inicio como data do item).
- tipo_documento: só para "documento" - um destes: Taxa, Pedágio, RG, CPF, Passaporte, Visto,
  CNH, PID, Seguro, Cartão de Vacina.
- descricao: um resumo curto de uma linha do que é o documento.
- valor: valor total pago, só o número (ex.: "150.00"), sem símbolo de moeda.
- data_pagamento: data em que o pagamento foi feito, se aparecer no documento (AAAA-MM-DD).`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    categoria: { type: "STRING", enum: CATEGORIAS },
    tipo: { type: "STRING" },
    localizador: { type: "STRING" },
    nome_companhia: { type: "STRING" },
    numero: { type: "STRING" },
    data: { type: "STRING" },
    horario: { type: "STRING" },
    origem: { type: "STRING" },
    destino: { type: "STRING" },
    nome_local: { type: "STRING" },
    endereco: { type: "STRING" },
    data_inicio: { type: "STRING" },
    hora_inicio: { type: "STRING" },
    data_fim: { type: "STRING" },
    hora_fim: { type: "STRING" },
    tipo_documento: { type: "STRING" },
    descricao: { type: "STRING" },
    valor: { type: "STRING" },
    data_pagamento: { type: "STRING" },
  },
  required: ["categoria"],
};

export interface VoucherExtraido {
  categoria: (typeof CATEGORIAS)[number];
  tipo: string;
  localizador: string;
  nome_companhia: string;
  numero: string;
  data: string;
  horario: string;
  origem: string;
  destino: string;
  nome_local: string;
  endereco: string;
  data_inicio: string;
  hora_inicio: string;
  data_fim: string;
  hora_fim: string;
  tipo_documento: string;
  descricao: string;
  valor: string;
  data_pagamento: string;
}

const CAMPOS_TEXTO: Exclude<keyof VoucherExtraido, "categoria">[] = [
  "tipo",
  "localizador",
  "nome_companhia",
  "numero",
  "data",
  "horario",
  "origem",
  "destino",
  "nome_local",
  "endereco",
  "data_inicio",
  "hora_inicio",
  "data_fim",
  "hora_fim",
  "tipo_documento",
  "descricao",
  "valor",
  "data_pagamento",
];

/** Normaliza a resposta do modelo pro formato esperado - o `responseSchema` já reduz muito o
 * risco de campo faltando ou com tipo errado, mas nunca confia cegamente numa API externa: todo
 * campo de texto vira string (mesmo se o modelo mandar número/null por engano), e a categoria
 * cai em "outro" se vier fora do enum. */
function normalizar(bruto: unknown): VoucherExtraido {
  const obj = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const categoria = CATEGORIAS.includes(obj.categoria as (typeof CATEGORIAS)[number])
    ? (obj.categoria as (typeof CATEGORIAS)[number])
    : "outro";
  const resultado = { categoria } as VoucherExtraido;
  for (const campo of CAMPOS_TEXTO) {
    const valor = obj[campo];
    resultado[campo] = typeof valor === "string" ? valor : "";
  }
  return resultado;
}

export class GeminiIndisponivelError extends Error {}

/** Envia o arquivo (base64) pro Gemini e devolve os campos identificados. Lança
 * `GeminiIndisponivelError` em qualquer falha (rede, cota estourada, resposta inesperada) - o
 * chamador trata isso como "não deu pra analisar automaticamente", nunca como erro fatal: o
 * upload manual continua funcionando sem a análise. */
export async function analisarVoucher(base64Data: string, mimeType: string): Promise<VoucherExtraido> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiIndisponivelError("GEMINI_API_KEY não configurada");

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ inline_data: { mime_type: mimeType, data: base64Data } }, { text: PROMPT }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
  } catch {
    throw new GeminiIndisponivelError("Falha de rede ao chamar o Gemini");
  }

  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    throw new GeminiIndisponivelError(`Gemini respondeu ${res.status}: ${corpo.slice(0, 200)}`);
  }

  const json = await res.json();
  const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof texto !== "string") {
    throw new GeminiIndisponivelError("Resposta do Gemini sem conteúdo de texto");
  }

  try {
    return normalizar(JSON.parse(texto));
  } catch {
    throw new GeminiIndisponivelError("Resposta do Gemini não é um JSON válido");
  }
}
