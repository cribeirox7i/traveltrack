/**
 * Leitura de voucher (PDF/imagem) via Gemini API (Google AI Studio, free tier) - só chamado do
 * servidor, a `GEMINI_API_KEY` nunca chega ao cliente (mesmo padrão de
 * `APPS_SCRIPT_SHARED_SECRET`, ver client.ts). `fetch` direto na REST API, sem SDK novo como
 * dependência - mesmo padrão que `weather.ts`/`exchangeRate.ts` já usam pra API externa.
 */
// "gemini-2.5-flash" parou de aceitar chave nova em 2026-08 ("no longer available to new
// users"). Testei o catálogo inteiro de modelos "flash" contra a API real em 2026-08-25: só a
// geração 3.x responde pra essa chave. Entre os que respondem, o painel de cota do AI Studio
// mostrou "Gemini 3.6 Flash" com só 20 requisições/dia (RPD) no free tier, contra 500 RPD do
// "Gemini 3.5 Flash Lite" - 25x mais teto. O motivo de eu não ter ido de Lite direto: com o
// schema antigo (campos "opcionais" no responseSchema) o Lite pulava metade dos campos, mesmo
// a informação estando no documento. Forçando todo campo como "required" no schema (ver abaixo),
// ele passou a extrair tão bem quanto o Flash "cheio" nos testes - o problema nunca foi o modelo,
// era o schema deixando campo em branco parecer uma opção válida.
const MODEL = "gemini-3.5-flash-lite";
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

const PROMPT_BASE = `Você recebe um comprovante/voucher de viagem (passagem, traslado, hospedagem,
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

O schema pede TODOS os campos abaixo (o formato exige a chave presente) - preencha com "" os que
não fizerem sentido pra categoria escolhida ou que não aparecerem no documento, mas SEMPRE tente
preencher os que fizerem sentido: não deixe em branco um campo cuja informação está no
documento.

Campos:
- tipo: em traslado/passagem, o meio de transporte - exatamente um destes, com a MESMA
  capitalização (primeira letra maiúscula): "Ônibus", "Van", "Carro", "Avião", "Embarcação",
  "Trem"; em atrativo, um destes: "Excursão", "Ingresso", "Bar", "Ponto Turístico".
- localizador: código de reserva/confirmação (geralmente letras+números, ex.: "ABC123").
- nome_companhia: nome da companhia aérea/rodoviária/fornecedor.
- numero: número do VOO/ÔNIBUS/EMBARCAÇÃO em si (ex.: "LA3420") - NUNCA o localizador, são campos
  diferentes mesmo quando parecidos.
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

const PROMPT_TRECHOS = `ATENÇÃO A DOCUMENTOS COM MAIS DE UM TRECHO (ida e volta, ou múltiplas conexões, tudo no mesmo
PDF): NUNCA misture dados de trechos diferentes num mesmo campo (ex.: não pegue a partida do
trecho 1 com a chegada do trecho 2). Extraia nos campos principais (origem, destino, numero,
data_inicio/hora_inicio, data_fim/hora_fim) só o PRIMEIRO trecho (geralmente a ida). Se houver um
segundo trecho, preencha o objeto "segundo_trecho" com os dados dele (mesmo significado de
campo, só que desse segundo trecho); se não houver, deixe "segundo_trecho" com todos os campos
em "".`;

/** Monta o prompt final, injetando o período da viagem (quando conhecido) pra o modelo resolver
 * o ano de datas sem ano explícito no documento (ver `PROMPT_BASE`) - sem isso, o Gemini tende a
 * inventar um ano qualquer (observado devolvendo 2020) em vez de deixar o campo vazio. */
function montarPrompt(periodoViagem?: { inicio: string; fim: string }): string {
  const instrucaoAno = periodoViagem
    ? `Use o ano da viagem, que ocorre entre ${periodoViagem.inicio} e ${periodoViagem.fim} - ` +
      "escolha dentro desse período o mês/dia mais próximo do que estiver escrito no documento " +
      "(ex.: viagem em 2026-09-10 a 2026-09-20 e documento \"15 de set.\" sem ano -> 2026-09-15)."
    : "Se não houver nenhuma pista de ano em lugar nenhum do documento, deixe o campo de data vazio.";
  return `${PROMPT_BASE}\n\n${instrucaoAno}\n\n${PROMPT_TRECHOS}`;
}

// Todo campo marcado "required" no responseSchema - não significa "precisa ter valor não-vazio",
// só força o modelo a incluir a CHAVE na resposta em vez de omiti-la. Testado em 2026-08-25:
// com os campos como "opcionais" (sem required), o gemini-3.5-flash-lite pulava campos cuja
// informação estava claramente no documento; forçado a sempre responder todos, ele passou a
// preencher tão bem quanto o Flash "cheio" - o Flash "cheio" já fazia isso por conta própria,
// então marcar required não piora nada pra ele.

/** Mesma forma de origem/destino/horários do trecho principal, pra um eventual 2º trecho (ex.:
 * volta) que o documento também descreva - ver `analisarVoucher`. */
const SEGUNDO_TRECHO_SCHEMA = {
  type: "OBJECT",
  properties: {
    numero: { type: "STRING" },
    origem: { type: "STRING" },
    destino: { type: "STRING" },
    data_inicio: { type: "STRING" },
    hora_inicio: { type: "STRING" },
    data_fim: { type: "STRING" },
    hora_fim: { type: "STRING" },
    descricao: { type: "STRING" },
  },
  required: [
    "numero",
    "origem",
    "destino",
    "data_inicio",
    "hora_inicio",
    "data_fim",
    "hora_fim",
    "descricao",
  ],
};

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
    segundo_trecho: SEGUNDO_TRECHO_SCHEMA,
  },
  required: [
    "categoria",
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
    "segundo_trecho",
  ],
};

export interface SegundoTrecho {
  numero: string;
  origem: string;
  destino: string;
  data_inicio: string;
  hora_inicio: string;
  data_fim: string;
  hora_fim: string;
  descricao: string;
}

const CAMPOS_SEGUNDO_TRECHO: (keyof SegundoTrecho)[] = [
  "numero",
  "origem",
  "destino",
  "data_inicio",
  "hora_inicio",
  "data_fim",
  "hora_fim",
  "descricao",
];

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
  /** Preenchido só quando o documento descreve ida e volta (ou mais de um trecho) - ver o aviso
   * no `PROMPT`. `null` se o documento tiver um trecho só. */
  segundo_trecho: SegundoTrecho | null;
}

const CAMPOS_TEXTO: Exclude<keyof VoucherExtraido, "categoria" | "segundo_trecho">[] = [
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
function normalizarSegundoTrecho(bruto: unknown): SegundoTrecho | null {
  if (!bruto || typeof bruto !== "object") return null;
  const obj = bruto as Record<string, unknown>;
  const trecho = {} as SegundoTrecho;
  for (const campo of CAMPOS_SEGUNDO_TRECHO) {
    const valor = obj[campo];
    trecho[campo] = typeof valor === "string" ? valor : "";
  }
  // Só considera que existe um 2º trecho de verdade se pelo menos um dos campos que importam
  // (origem/destino/data de início) veio preenchido - o modelo às vezes devolve o objeto todo
  // com campos vazios em vez de omitir, quando o documento só tem 1 trecho.
  const temDado = trecho.origem || trecho.destino || trecho.data_inicio;
  return temDado ? trecho : null;
}

function normalizar(bruto: unknown): VoucherExtraido {
  const obj = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const categoria = CATEGORIAS.includes(obj.categoria as (typeof CATEGORIAS)[number])
    ? (obj.categoria as (typeof CATEGORIAS)[number])
    : "outro";
  const resultado = { categoria, segundo_trecho: null } as VoucherExtraido;
  for (const campo of CAMPOS_TEXTO) {
    const valor = obj[campo];
    resultado[campo] = typeof valor === "string" ? valor : "";
  }
  resultado.segundo_trecho = normalizarSegundoTrecho(obj.segundo_trecho);
  return resultado;
}

export class GeminiIndisponivelError extends Error {}

/** Envia o arquivo (base64) pro Gemini e devolve os campos identificados. Lança
 * `GeminiIndisponivelError` em qualquer falha (rede, cota estourada, resposta inesperada) - o
 * chamador trata isso como "não deu pra analisar automaticamente", nunca como erro fatal: o
 * upload manual continua funcionando sem a análise. */
export async function analisarVoucher(
  base64Data: string,
  mimeType: string,
  periodoViagem?: { inicio: string; fim: string }
): Promise<VoucherExtraido> {
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
            parts: [
              { inline_data: { mime_type: mimeType, data: base64Data } },
              { text: montarPrompt(periodoViagem) },
            ],
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
