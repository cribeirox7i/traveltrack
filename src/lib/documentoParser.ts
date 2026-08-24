/**
 * Interpreta o texto cru de um bilhete/voucher (extraído por OCR ou da camada de texto de um PDF,
 * ver `lib/ocr.ts`) procurando data, horário e um nome pro compromisso.
 *
 * É heurística deliberada, não "entendimento" do documento: data e horário saem de regex sobre
 * formatos bem padronizados (alta confiança), mas o NOME é só um palpite - cada companhia aérea e
 * site de reserva formata o voucher de um jeito, e sem um modelo de linguagem não dá pra saber
 * qual linha é "o título". Por isso devolve uma LISTA de candidatos ordenada por probabilidade, pra
 * tela deixar a pessoa escolher/editar, nunca um valor único cravado.
 *
 * Puro (sem I/O, sem DOM) de propósito - dá pra rodar num script Node de validação sem subir o app.
 */

export interface DocumentoExtraido {
  /** Datas encontradas (yyyy-MM-dd), sem repetição, na ordem em que aparecem no texto. */
  datas: string[];
  /** Horários encontrados (HH:MM), sem repetição, na ordem em que aparecem. */
  horarios: string[];
  /** Palpites de título, do mais provável pro menos - ver `pontuarLinha`. */
  titulos: string[];
}

const MESES_PT: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const MESES_EN: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Palavras que indicam que a linha CARREGA um nome (de hospedagem ou de voo). Só entram aqui
 * palavras que aparecem coladas no nome ("Hotel Riu Palace", "Voo LA 3420"), nunca palavras de
 * rótulo tipo "reserva"/"check-in"/"embarque" - essas encabeçam linha de DADO, não de nome, e
 * quando estavam nesta lista faziam "Reservation Confirmation" ganhar do nome real do hotel.
 */
const PALAVRAS_TITULO = [
  "hotel", "pousada", "resort", "hostel", "inn", "flat", "apart", "lodge",
  "voo", "flight", "trecho",
];

/** Linhas que são rótulo/dado/rodapé, não nome de nada - descartadas como candidato. */
const RUIDO = [
  "localizador", "codigo", "código", "cpf", "cnpj", "rg", "e-ticket", "eticket",
  "bilhete", "emitido", "emissao", "emissão", "total", "valor", "taxa", "tarifa",
  "politica", "política", "cancelamento", "termos", "condicoes", "condições",
  "telefone", "email", "e-mail", "endereco", "endereço", "cep", "www", "http",
  // Cabeçalhos de tipo de documento e rótulos de campo - o texto mais "gritante" da página,
  // e justamente o que nunca é o nome que a pessoa quer no compromisso.
  "confirmacao", "confirmação", "confirmation", "reserva", "reservation", "booking",
  "boarding", "embarque", "check-in", "checkin", "check in", "check-out", "checkout",
  "check out", "hospede", "hóspede", "passageiro", "passenger", "bagagem", "baggage",
];

/**
 * Data ou horário no meio da linha: é linha de dado ("Check-in: 10/09/2026 às 15:00"), não nome.
 * Os grupos precisam ser explícitos - `a|b|c` sem parênteses faria a alternância engolir os
 * âncoras `\b` e casar com qualquer dígito solto, descartando toda linha com um número.
 */
const TEM_DATA_OU_HORA = new RegExp(
  [
    "\\b\\d{1,2}[/\\-.]\\d{1,2}[/\\-.]\\d{2,4}\\b", // 10/09/2026
    "\\b\\d{4}-\\d{1,2}-\\d{1,2}\\b", // 2026-09-10
    "\\b\\d{1,2}\\s*(?:de\\s+)?[a-zç]{3,9}\\.?\\s*(?:de\\s+)?\\d{4}\\b", // 10 de setembro de 2026
    "\\b(?:[01]?\\d|2[0-3])\\s*[:h]\\s*[0-5]\\d\\b", // 15:00 / 15h00
  ].join("|"),
  "i"
);

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function iso(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  // Rejeita data que "transbordou" (ex.: 31/02 vira 03/03) - o OCR erra dígito com frequência.
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Ano de 2 dígitos -> 4, assumindo o século atual (bilhete de viagem nunca é do século passado). */
function expandirAno(ano: number): number {
  return ano < 100 ? 2000 + ano : ano;
}

function extrairDatas(texto: string): string[] {
  const achadas: string[] = [];
  const push = (v: string | null) => {
    if (v && !achadas.includes(v)) achadas.push(v);
  };

  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yy - o formato mais comum em documento brasileiro.
  for (const m of texto.matchAll(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/g)) {
    push(iso(expandirAno(Number(m[3])), Number(m[2]), Number(m[1])));
  }

  // yyyy-mm-dd (ISO, comum em confirmação de site internacional).
  for (const m of texto.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    push(iso(Number(m[1]), Number(m[2]), Number(m[3])));
  }

  // "10 de setembro de 2026", "10 set 2026", "10 SEP 2026" - com ou sem "de", pt ou en.
  for (const m of texto.matchAll(
    /\b(\d{1,2})\s*(?:de\s+)?([a-zç]{3,9})\.?\s*(?:de\s+)?(\d{2,4})\b/gi
  )) {
    const prefixo = normalizar(m[2]).slice(0, 3);
    const mes = MESES_PT[prefixo] ?? MESES_EN[prefixo];
    if (mes) push(iso(expandirAno(Number(m[3])), mes, Number(m[1])));
  }

  return achadas;
}

function extrairHorarios(texto: string): string[] {
  const achados: string[] = [];
  // HH:MM, HHhMM, HH h MM - exige separador pra não confundir com número solto de 4 dígitos
  // (localizador, número de voo, valor), que apareceria demais num bilhete.
  for (const m of texto.matchAll(/\b([01]?\d|2[0-3])\s*[:h]\s*([0-5]\d)\b/gi)) {
    const v = `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
    if (!achados.includes(v)) achados.push(v);
  }
  return achados;
}

/**
 * Quanto essa linha "parece" o nome do hotel/trecho. Score alto = candidato melhor. Negativo =
 * descartada. Os pesos são empíricos (ajustados olhando bilhete/voucher real), não uma ciência -
 * o objetivo é só ordenar a lista que a pessoa vai ver, não acertar sozinho.
 */
function pontuarLinha(linha: string): number {
  const limpa = linha.trim();
  const norm = normalizar(limpa);

  if (limpa.length < 4 || limpa.length > 70) return -1;
  if (RUIDO.some((r) => norm.includes(normalizar(r)))) return -1;
  if (TEM_DATA_OU_HORA.test(limpa)) return -1;
  // Linha que é só número/data/hora/símbolo não é nome de nada.
  if (!/[a-zA-ZÀ-ÿ]{3}/.test(limpa)) return -1;
  // Mais dígito que letra: é linha de valor/código, não de nome.
  const digitos = (limpa.match(/\d/g) ?? []).length;
  const letras = (limpa.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
  if (digitos > letras) return -1;

  let score = 0;
  if (PALAVRAS_TITULO.some((p) => norm.includes(p))) score += 10;
  // Trecho de voo: "GRU → CUN", "GRU - CUN", "GRU/CUN" (códigos IATA de 3 letras).
  if (/\b[A-Z]{3}\s*(?:->|→|-|\/|\s)\s*[A-Z]{3}\b/.test(limpa)) score += 12;
  // CAIXA ALTA costuma ser o destaque do documento (nome do hotel, nome do passageiro...).
  if (limpa === limpa.toUpperCase() && letras >= 6) score += 4;
  // Linha de tamanho "de nome" (nem sigla solta, nem parágrafo).
  if (limpa.length >= 8 && limpa.length <= 45) score += 2;

  return score;
}

function extrairTitulos(texto: string): string[] {
  const pontuadas = texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .map((l) => ({ linha: l, score: pontuarLinha(l) }))
    .filter((x) => x.score > 0);

  // Ordem estável por score (as de mesmo peso mantêm a ordem do documento, que costuma pôr o
  // dado mais importante no topo).
  pontuadas.sort((a, b) => b.score - a.score);

  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const { linha } of pontuadas) {
    const chave = normalizar(linha);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(linha);
    if (resultado.length === 5) break;
  }
  return resultado;
}

export function parseDocumento(texto: string): DocumentoExtraido {
  return {
    datas: extrairDatas(texto),
    horarios: extrairHorarios(texto),
    titulos: extrairTitulos(texto),
  };
}

/**
 * Reordena as datas achadas pra priorizar as que caem dentro da viagem - um voucher tem várias
 * datas (emissão, validade, política de cancelamento) e só as do período da viagem interessam pro
 * compromisso. As de fora não são descartadas, só vão pro fim: se o OCR errou um dígito, é melhor
 * a pessoa ver a opção errada e corrigir do que não ver nada.
 */
export function priorizarDatasDaViagem(datas: string[], datasDaViagem: string[]): string[] {
  const validas = new Set(datasDaViagem);
  return [...datas].sort((a, b) => Number(validas.has(b)) - Number(validas.has(a)));
}
