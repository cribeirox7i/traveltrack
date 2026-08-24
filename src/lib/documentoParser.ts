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

/** O que o usuário escolheu no upload - evita ter que adivinhar o tipo do documento pelo texto. */
export type TipoDocumento = "passagem" | "hospedagem";

export interface DocumentoExtraido {
  /** Datas encontradas (yyyy-MM-dd), sem repetição, na ordem em que aparecem no texto. */
  datas: string[];
  /** Horários encontrados (HH:MM), sem repetição, na ordem em que aparecem. */
  horarios: string[];
  /** Palpites de título, do mais provável pro menos. */
  titulos: string[];
  /** Descrição pronta pro compromisso - em passagem é o trecho (origem/destino), que é o dado
   * que interessa e não cabe no título. Vazio quando não há nada útil a sugerir. */
  descricaoSugerida: string;
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
 * Palavras que indicam que a linha CARREGA um nome de hospedagem ("Hotel Riu Palace"). Nunca
 * palavras de rótulo tipo "reserva"/"check-in" - essas encabeçam linha de DADO, não de nome, e
 * quando estavam aqui faziam "Reservation Confirmation" ganhar do nome real do hotel.
 *
 * Passagem não usa esta lista: um bilhete aéreo simplesmente NÃO TEM um nome pra achar - o que
 * existe é número do voo e trecho, e caçar "a linha do nome" ali só produzia lixo (cabeçalho de
 * tabela, texto de multa de remarcação, número de cartão). Ver `montarVoo`.
 */
const PALAVRAS_TITULO = [
  "hotel", "pousada", "resort", "hostel", "inn", "flat", "apart", "lodge",
];

/**
 * Rótulos de coluna/campo. Duas ou mais na mesma linha = é o cabeçalho de uma tabela ("N° de voo
 * Origem Destino Data"), que o pdf.js entrega como uma linha só, separada dos valores. Era
 * justamente o que vinha ganhando como título em bilhete da LATAM.
 */
const PALAVRAS_ROTULO = [
  "n°", "no.", "num.", "numero", "número", "origem", "destino", "data", "horario",
  "horário", "hora", "assento", "portao", "portão", "terminal", "classe", "status",
  "saida", "saída", "chegada", "duracao", "duração",
];

/** Preço, moeda ou cartão mascarado - linha de dado financeiro, nunca título. */
const TEM_DINHEIRO_OU_CARTAO =
  /\b(?:BRL|USD|EUR|MXN|GBP|ARS|CLP|R\$|US\$)\b|X{4,}\d|\d+[.,]\d{3}[.,]\d{2}\b/i;

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
  // Texto jurídico/informativo de bilhete - vinha aparecendo como candidato a título ("São
  // permitidas remarcações antes do voo com uma multa de ...").
  "permitida", "permitidas", "remarcac", "remarcaç", "reembolso", "multa", "sujeito",
  "consulte", "informacao sobre", "informação sobre", "regras",
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
  if (TEM_DINHEIRO_OU_CARTAO.test(limpa)) return -1;
  // Cabeçalho de tabela (2+ rótulos de coluna na mesma linha) - ver PALAVRAS_ROTULO.
  if (PALAVRAS_ROTULO.filter((r) => norm.includes(normalizar(r))).length >= 2) return -1;
  // Linha que é só número/data/hora/símbolo não é nome de nada.
  if (!/[a-zA-ZÀ-ÿ]{3}/.test(limpa)) return -1;
  // Mais dígito que letra: é linha de valor/código, não de nome.
  const digitos = (limpa.match(/\d/g) ?? []).length;
  const letras = (limpa.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
  if (digitos > letras) return -1;

  let score = 0;
  if (PALAVRAS_TITULO.some((p) => norm.includes(p))) score += 10;
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

/** Códigos IATA (3 letras maiúsculas) do nome do arquivo - "GRU - CMX - GRU.pdf" vira
 * ["GRU","CMX","GRU"]. O nome do arquivo costuma ser a fonte MAIS limpa do trecho: quem baixou
 * o bilhete recebeu (ou deu) um nome já resumindo a viagem, sem o ruído da tabela do PDF. */
function rotaDoNomeArquivo(nomeArquivo: string): string[] {
  const semExtensao = nomeArquivo.replace(/\.[a-z0-9]+$/i, "");
  return semExtensao.match(/\b[A-Z]{3}\b/g) ?? [];
}

/** "GRU → CMX" escrito explicitamente no texto, com separador - exigir o separador evita casar
 * com qualquer trio de maiúsculas solto ("TAM", "BRL", "S.A."), que num bilhete tem de sobra. */
function rotaDoTexto(texto: string): string[] {
  const m = texto.match(/\b([A-Z]{3})\s*(?:->|→|—|-|\/)\s*([A-Z]{3})\b/);
  return m ? [m[1], m[2]] : [];
}

/** Número do voo, procurado PERTO da palavra voo/flight - solto, o padrão "2 letras + dígitos"
 * casaria com meio bilhete (código de tarifa, sigla de terminal, etc.). */
function numeroDoVoo(texto: string): string {
  const m = texto.match(/(?:voo|flight|vôo)\s*(?:n[°º.]?)?\s*:?\s*([A-Z]{2}\s?\d{2,4})\b/i);
  return m ? m[1].replace(/\s+/g, "") : "";
}

/**
 * Passagem aérea não tem "nome" pra extrair - tem número de voo e trecho. Tentar achar a linha do
 * nome ali só rendia lixo (cabeçalho de tabela, texto de multa, número de cartão mascarado). Então
 * pra esse tipo o título é montado, não garimpado: "Voo LA3420", e o trecho (origem/destino) vai
 * pra descrição, que é onde ele é útil sem espremer o título.
 */
function montarVoo(texto: string, nomeArquivo: string): { titulos: string[]; descricao: string } {
  const numero = numeroDoVoo(texto);
  const codigos = rotaDoNomeArquivo(nomeArquivo);
  const rota = (codigos.length >= 2 ? codigos : rotaDoTexto(texto)).join(" → ");

  const titulos = [
    numero ? `Voo ${numero}` : "",
    rota ? `Voo ${rota}` : "",
    "Voo",
  ].filter(Boolean);

  return { titulos: Array.from(new Set(titulos)), descricao: rota };
}

export function parseDocumento(
  texto: string,
  opcoes: { tipo?: TipoDocumento; nomeArquivo?: string } = {}
): DocumentoExtraido {
  const base = { datas: extrairDatas(texto), horarios: extrairHorarios(texto) };

  if (opcoes.tipo === "passagem") {
    const { titulos, descricao } = montarVoo(texto, opcoes.nomeArquivo ?? "");
    return { ...base, titulos, descricaoSugerida: descricao };
  }

  return { ...base, titulos: extrairTitulos(texto), descricaoSugerida: "" };
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
