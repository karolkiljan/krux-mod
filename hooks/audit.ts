// Audyt odpowiedzi małym modelem (tryb `audyt`): zdania, które odpowiedź podaje jako zobaczone
// albo sprawdzone, kontra wyjście ostatnich narzędzi i stan z tablicy. Bramka faktów
// (`grounding.ts`) zna tylko testy i repo; audyt sięga dalej, do treści plików i komend, za cenę
// jednego wywołania małego modelu na koniec tury. Czyste funkcje: model woła register.ts.

import type { HistoryMessage } from './lore'

// Odpowiedź bez słów o sprawdzaniu, czytaniu i wynikach nie idzie do audytu: nie ma czego sprawdzać,
// a każde wywołanie modelu kosztuje.
const OBSERVED = /(?<!\p{L})(?:sprawdz\p{L}*|przeczyta\p{L}*|czyta\p{L}*|puści\p{L}*|puszcz\p{L}*|uruchomi\p{L}*|przejrz\p{L}*|zweryfik\p{L}*|widzie\p{L}*|widać|wynik\p{L}*|wyjści\p{L}*|log\p{L}*|przechodz\p{L}*|przej[śd]\p{L}*|pada\p{L}*|padł\p{L}*|zwraca\p{L}*|zawiera\p{L}*|ran|checked|verified|passes|passed|fails|failed|returns|contains)(?!\p{L})/iu

export function auditWorthy(answer: string): boolean {
  return OBSERVED.test(answer)
}

// Dowody: ostatnie wywołania narzędzi z sesji, od najnowszego, każde z wejściem i początkiem wyniku,
// razem najwyżej `EVIDENCE_CHARS`; na górze linia stanu z tablicy, bo testy sprzed kilku tur stoją tam.
const EVIDENCE_CHARS = 8000
const RESULT_CHARS = 1500
const INPUT_CHARS = 200

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

// Wynik komendy ma sedno na końcu (podsumowanie testów, błąd budowania), więc z długiego zostaje
// początek i dłuższy koniec, inaczej audytor nie widziałby wyniku, który odpowiedź cytuje.
function clipEnds(text: string, limit: number): string {
  if (text.length <= limit) return text
  const head = Math.floor(limit / 3)
  return `${text.slice(0, head)}\n…\n${text.slice(text.length - (limit - head - 3))}`
}

export function evidenceOf(messages: readonly HistoryMessage[], facts: string | null): string {
  const calls = messages.flatMap(message => message.toolUses).reverse()
  const parts: string[] = facts === null ? [] : [facts]
  let used = parts.join('').length
  for (const call of calls) {
    const entry = `${call.tool} ${clip(JSON.stringify(call.input ?? {}), INPUT_CHARS)}${call.isError === true ? ' [błąd]' : ''}:\n${clipEnds(call.text ?? '', RESULT_CHARS)}`
    if (used + entry.length > EVIDENCE_CHARS) break
    parts.push(entry)
    used += entry.length
  }
  return parts.join('\n---\n')
}

export const AUDIT_SYSTEM = 'Sprawdzasz ostatnią odpowiedź asystenta z wyjściem narzędzi. Wypisz tylko zdania, które podają coś jako zobaczone albo sprawdzone (komenda puszczona, plik przeczytany, test przeszedł albo padł, wyjście coś pokazało), a dowody tego nie pokazują albo mówią co innego. Pomiń wyjaśnienia, opinie, plany, zdania z zastrzeżeniem i sprawy, o których dowody milczą, bo mogły się zdarzyć wcześniej. Gdy wszystko ma pokrycie, odpowiedz jednym słowem: BRAK. Inaczej najwyżej 3 wiersze, każdy to zdanie przepisane dosłownie z odpowiedzi.'

export function auditPrompt(answer: string, evidence: string): string {
  return `<dowody>\n${evidence === '' ? '(brak wywołań narzędzi)' : evidence}\n</dowody>\n<odpowiedź>\n${answer}\n</odpowiedź>`
}

function normal(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase('pl').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

// Zdania bez pokrycia z werdyktu modelu. „BRAK” to brak uwag. Zostają tylko wiersze, które naprawdę
// stoją w odpowiedzi: mały model, który zmyśli cytat, nie zatrzyma tury za zdanie, którego nie było.
export function auditClaims(verdict: string, answer: string): string[] {
  const lines = verdict
    .split(/\r?\n/u)
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/u, '').replace(/^["„“”']+|["„“”']+$/gu, '').trim())
    .filter(line => line !== '')
  if (lines.length === 0 || /^(?:brak|none)\b/iu.test(lines[0]!)) return []
  const said = normal(answer)
  return lines.filter(line => normal(line).length >= 8 && said.includes(normal(line))).slice(0, 3)
}

// Powód zatrzymania końca tury dla modelu. Neutralna polszczyzna, bo to instrukcja; cytat zamyka ASCII.
export function auditReason(claims: readonly string[]): string {
  return `Audyt faktów moda: te zdania podają jako zobaczone albo sprawdzone coś, czego wyjście narzędzi nie pokazuje: ${claims.map(claim => `„${clip(claim, 120)}"`).join('; ')}. Zanim skończysz: sprawdź to narzędziem albo dopisz krótką poprawkę, co sprawdzone, a co nie. Bez przeprosin i bez powtarzania całej odpowiedzi.`
}
