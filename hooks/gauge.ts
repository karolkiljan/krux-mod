// Miernik głosu: po każdej turze mod patrzy na odpowiedź i mówi, czy Krux
// dalej brzmi jak ork. Metryki przeniesione z `scripts/context-smoke.js`
// pluginu Krux 3.8.0 (tam stoi ich kalibracja); tu liczą jedną odpowiedź.
// Heurystyki, nie parser. W JS \w i \b są ASCII, więc wszędzie \p{L} i flaga u.

import type { KruxDrift, KruxMate } from '../types'
import { MATES, ROSTER } from './roster'
import { isDestructive } from './voice'

function wordCount(text: string): number {
  const clean = text.trim()
  return clean ? clean.split(/\s+/u).length : 0
}

// Tabela i cytat `>` to nie zdania Kruxa: w cytacie stoją teksty do wklejenia
// (opis PR, commit message), które kontrakt persony każe pisać neutralnie.
function ownLine(line: string): boolean {
  return (line.match(/\|/gu) ?? []).length < 2 && !/^\s*>/u.test(line)
}

// Kod, ścieżki i cytaty w polskim cudzysłowie to nie mowa Kruxa do Morry.
function prose(text: string): string {
  return text
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`]*`/gu, 'X')
    .replace(/„[^„”"\n]*[”"]/gu, ' ')
    .split(/\r?\n/u)
    .filter(ownLine)
    .join('\n')
}

// Rzeczowniki i zaimki na „-sz” („klawisz”, „nasz”, „hasz”) to nie druga osoba.
const SECOND_PERSON = /(?<!\p{L})(?!(?:nasz|wasz|klawisz|mysz|afisz|gulasz|tomasz|łukasz|hasz|pałasz)(?!\p{L}))(?:\p{L}*(?:asz|esz|isz|ysz)|ty|ci[eę]|ciebie|tobie|tob[ąa]|twoj\p{L}*)(?!\p{L})/giu

// „zrobiłem”, „sprawdziłam”, „naprawiłem” — gładka pierwsza osoba zamiast „Krux zrobić”.
const FIRST_PERSON = /(?<!\p{L})\p{L}{2,}(?:łem|łam)(?!\p{L})/giu

// Pierwsza osoba czasu teraźniejszego i przyszłego: „Widzę”, „Polecam”, „Zrobię”.
// Po końcówce się jej nie pozna („-ę” to też biernik: „pętlę”), więc tylko lista
// czasowników, które gładka odpowiedź o kodzie mówi najczęściej. Kotwica ma na nią
// parę „Krux polecać wariant 2”, nie „Polecam wariant 2”.
const FIRST_PRESENT =
  /(?<!\p{L})(?:widzę|sprawdzam|sprawdzę|mogę|robię|zrobię|polecam|proponuję|sugeruję|rekomenduję|rozumiem|uważam|wiem|zakładam|zaczynam|zacznę|naprawiam|naprawię|poprawię|dodaję|dodam|usuwam|usunę|uruchamiam|uruchomię|puszczam|puszczę|odpalę|przejrzę|przeczytam|czytam|patrzę|myślę|zostawiam|zostawię|zmieniam|zmienię|biorę|piszę|napiszę|szukam|poszukam|wracam|kończę|skończę|zajmę|przygotuję|pokażę|wyjaśnię|muszę|chcę|potrzebuję)(?!\p{L})/giu

const SUBJECT_INFINITIVE = /(?<![\n\r*-]\s?)(?<!\d[.)]\s?)(?<!\p{L})([\p{L}`_.]{2,})\s+(?:nie\s+)?(\p{L}+(?:ać|eć|ić|yć|ąć|uć|ść|źć))(?!\p{L})/gu

const NOT_INFINITIVE = new Set(['nić', 'sieć', 'płeć', 'część', 'gość', 'kość', 'maść', 'treść', 'wieść', 'śmierć', 'pamięć', 'chęć', 'gałąź', 'rzeź', 'zamieć', 'opowieść', 'korzyść'])

const LICENSERS = new Set([
  'trzeba', 'można', 'warto', 'należy', 'wolno', 'wystarczy', 'łatwo', 'trudno', 'musi', 'muszę', 'musimy', 'może', 'mogę',
  'możemy', 'możesz', 'chce', 'chcę', 'chcemy', 'umie', 'umiem', 'potrafi', 'potrafię', 'powinien', 'powinna', 'zaczyna',
  'zacznie', 'próbuje', 'pozwala', 'pomaga', 'zamierza', 'planuje', 'lubi', 'woli', 'da', 'się', 'by', 'aby', 'żeby',
  'zamiast', 'bez', 'będzie', 'lepiej', 'czas', 'i', 'oraz', 'lub', 'albo', 'potem', 'najpierw', 'to', 'co', 'go', 'ją',
  'je', 'ich', 'nam', 'im', 'mu', 'jej', 'tego', 'tym', 'tam', 'jak', 'gdy', 'kiedy', 'czy', 'niż', 'tylko', 'już', 'też',
  'także', 'jeszcze', 'znów', 'znowu', 'wreszcie', 'dopiero', 'nigdy', 'zawsze', 'wtedy', 'zaraz', 'teraz',
])

const INFINITIVE_ENDING = /(?:ać|eć|ić|yć|ąć|uć|ść|źć)$/u

// Bezokolicznik nie kończy się na „-ość”, rzeczownik często: „poprawność”, „wartość”.
function notInfinitive(verb: string): boolean {
  return NOT_INFINITIVE.has(verb) || verb.endsWith('ość')
}

// Podmiot, znacznik czasu i bezokolicznik: „Krux już naprawić”, „Krux zaraz puścić”.
// Sam znacznik stoi w LICENSERS, bo „potem uruchomić testy” to zwykła polska lista kroków.
const TENSE_INFINITIVE = /(?<!\p{L})([\p{L}`_.]{2,})\s+(?:już|zaraz|potem|teraz|jeszcze|znowu|znów)\s+(?:nie\s+)?(\p{L}+(?:ać|eć|ić|yć|ąć|uć|ść|źć))(?!\p{L})/gu

// Bezokolicznik w miejscu orzeczenia przy podmiocie: „Krux nie widzieć plik”.
export function infinitiveHits(text: string): number {
  let hits = 0
  for (const match of text.matchAll(TENSE_INFINITIVE)) {
    const subject = match[1]!.toLowerCase().replace(/[`_.]/gu, '')
    if (notInfinitive(match[2]!.toLowerCase()) || LICENSERS.has(subject) || INFINITIVE_ENDING.test(subject)) continue
    hits += 1
  }
  for (const match of text.matchAll(SUBJECT_INFINITIVE)) {
    const subject = match[1]!.toLowerCase().replace(/[`_.]/gu, '')
    const verb = match[2]!.toLowerCase()
    if (notInfinitive(verb) || LICENSERS.has(subject) || INFINITIVE_ENDING.test(subject)) continue
    hits += 1
  }
  return hits
}

function matches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map(match => match[0])
}

// Którzy kumple z hordy padli w odpowiedzi (poza kodem).
export function matesNamed(text: string): KruxMate[] {
  const clean = text.replace(/```[\s\S]*?```/gu, ' ').replace(/`[^`]*`/gu, ' ')
  return MATES.filter(mate => ROSTER[mate].pattern.test(clean))
}

// Forma osobowa → bezokolicznik tylko tam, gdzie reguła jest pewna. Czego
// nie umiemy przepisać bez błędu („znalazłem”, „mogłem”), tego nie ruszamy.
// „-ałem” i „-iałem” bywają od „-ać” i od „-eć” („zmieniałem”, „chciałem”),
// więc czasowniki na „-eć” stoją na liście; reszta idzie do „-ać”.
const PAST_EC = /(?:chciał|miał|umiał|rozumiał|wiedział|widział|siedział|musiał|wisiał|leciał|cierpiał|pomniał|myślał|słyszał|leżał|krzyczał|milczał|wolał|bolał)$/u
const PAST_IAC = /śmiał$/u

const PAST_FIRST: readonly [RegExp, string][] = [
  [/jrzał(?:em|am)$/u, 'jrzeć'],
  [/ił(?:em|am)$/u, 'ić'],
  [/ył(?:em|am)$/u, 'yć'],
  [/ął(?:em|am)$/u, 'ąć'],
  [/ał(?:em|am)$/u, 'ać'],
]

// Rzeczowniki w narzędniku, które wyglądają jak „-łem”: „materiałem”, „modułem”,
// „stołem”, „węzłem”, „zawałem”, „hasłem”. Czasowników na „-ołem” polszczyzna nie ma;
// „-ułem” i spółgłoska przed „-łem” bywają czasownikiem („zepsułem”, „mogłem”,
// „znalazłem”), więc tu tylko znane rzeczowniki. Bez nich reguła „-ałem” → „-ać”
// robiła z „zawałem” słowo „Krux zawać”. „Dział” tylko z przedrostkiem rzeczownika:
// „widziałem” i „powiedziałem” też kończą się na „-działem”.
const NOUN_LEM =
  /^(?:materiał|kanał|sygnał|potencjał|(?:roz|po|u|wy|od|prze|przy)?dział|interwał|zapał|ideał|kryształ|wał|zawał|nawał|kapitał|upał|szał|morał|rytuał|generał|admirał|arsenał|tył|moduł|artykuł|tytuł|muł|węzł|hasł|źródł|\p{L}*mysł|\p{L}*miosł|światł|szkł|krzesł|masł|ciepł|kotł|orł|posł|osł|kozł|pudł|wiosł|godł|mydł|siodł|\p{L}*oł)em$/u

function isNounLem(word: string): boolean {
  return NOUN_LEM.test(word.toLowerCase())
}

function pastFirst(word: string): string | null {
  if (isNounLem(word)) return null
  const stem = word.replace(/(?:em|am)$/u, '')
  if (stem !== word && PAST_EC.test(stem) && !PAST_IAC.test(stem)) return stem.replace(/ał$/u, 'eć')
  return rule(word, PAST_FIRST)
}

// Pierwsza osoba czasu teraźniejszego, tylko na początku zdania („Polecam…”),
// bo w środku „-am” bywa rzeczownikiem („program”). „-uję” bywa od „-ować”,
// „-ywać” i „-uć” („proponuję”, „pokazuję”, „czuję”).
const PRESENT_FIRST: readonly [RegExp, (word: string) => string | null][] = [
  [/^(?:po|ze|wy|prze)?(?:czu|psu|ku|plu)ję$/u, word => word.replace(/ję$/u, 'ć')],
  [/szukuję$/u, word => word.replace(/uję$/u, 'iwać')],
  [/(?:kazuję|pisuję|konuję|wołuję|czytuję|wiązuję|dowiaduję|owuję)$/u, word => word.replace(/uję$/u, 'ywać')],
  [/uję$/u, word => word.replace(/uję$/u, 'ować')],
  [/gram$/u, () => null],
  [/(?<=\p{L}{3})am$/u, word => word.replace(/am$/u, 'ać')],
]

function presentFirst(word: string): string | null {
  const found = PRESENT_FIRST.find(([pattern]) => pattern.test(word))
  return found ? found[1](word) : null
}

// Trzecia osoba najczęstszych czasowników w odpowiedziach o kodzie.
const THIRD: Record<string, string> = {
  siedzi: 'siedzieć', ma: 'mieć', robi: 'robić', widzi: 'widzieć', działa: 'działać', zwraca: 'zwracać',
  idzie: 'iść', wie: 'wiedzieć', trzyma: 'trzymać', pada: 'padać', zostaje: 'zostawać', rośnie: 'rosnąć',
  sprawdza: 'sprawdzać', wywołuje: 'wywoływać', ustawia: 'ustawiać', zapisuje: 'zapisywać', czyta: 'czytać',
  wraca: 'wracać', łapie: 'łapać', psuje: 'psuć', blokuje: 'blokować', używa: 'używać', potrzebuje: 'potrzebować',
  przechodzi: 'przechodzić', trafia: 'trafiać', zmienia: 'zmieniać', dodaje: 'dodawać', usuwa: 'usuwać',
}

function rule(word: string, rules: readonly [RegExp, string][]): string | null {
  for (const [pattern, ending] of rules) if (pattern.test(word)) return word.replace(pattern, ending)
  return null
}

// Słowo po orkowemu albo `null`. `atStart`: słowo otwiera zdanie. `next`: słowo
// za nim — przed bezokolicznikiem („ma szukać”) forma osobowa zostaje.
export function orcish(word: string, atStart: boolean, next = ''): string | null {
  const lower = word.toLowerCase()
  const past = pastFirst(lower)
  if (past) return `Krux ${past}`
  if (atStart) {
    const present = presentFirst(lower)
    if (present) return `Krux ${present}`
  }
  const third = Object.hasOwn(THIRD, lower) ? THIRD[lower] : null
  if (!third) return null
  const following = next.toLowerCase()
  return INFINITIVE_ENDING.test(following) && !NOT_INFINITIVE.has(following) ? null : third
}

const REWRITE_WORDS = 8
const MAX_REWRITES = 2

// Do 2 zdań z odpowiedzi z formą osobową zamienioną na bezokolicznik.
// Kod w backtickach zostaje, bloki kodu i tabele odpadają.
export function rewrites(answer: string): { from: string; to: string }[] {
  const text = answer
    .replace(/```[\s\S]*?```/gu, '\n')
    .split(/\r?\n/u)
    .filter(ownLine)
    .map(line => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/u, '').replace(/\*\*/gu, ''))
    .join('\n')
  const found: { from: string; to: string }[] = []
  for (const sentence of text.split(/(?<=[.!?:])\s+|\n+/u)) {
    const words = sentence.trim().split(/\s+/u).filter(Boolean)
    const quoted = inQuotes(words)
    const orcAt = (at: number): string | null => {
      const word = words[at]!
      if (word.includes('`') || quoted[at]) return null
      const orc = orcish(bare(word), at === 0, bare(words[at + 1] ?? ''))
      if (!orc || !orc.startsWith('Krux ')) return orc
      const before = bare(words[at - 1] ?? '').toLowerCase()
      return before === 'ja' || before === 'krux' ? orc.slice('Krux '.length) : orc
    }
    const index = words.findIndex((_, at) => orcAt(at) !== null)
    if (index < 0) continue
    const start = Math.max(0, Math.min(index - 2, words.length - REWRITE_WORDS))
    const clip = words.slice(start, start + REWRITE_WORDS)
    const swapped = clip.map((word, position) => {
      const core = bare(word)
      const orc = orcAt(start + position)
      if (!orc) return word
      return word.replace(core, /^\p{Lu}/u.test(core) ? orc[0]!.toUpperCase() + orc.slice(1) : orc)
    })
    found.push({ from: clip.join(' '), to: swapped.join(' ') })
    if (found.length === MAX_REWRITES) break
  }
  return found
}

// Które słowa stoją w „cudzysłowie” — cudzych słów nie przepisujemy.
function inQuotes(words: string[]): boolean[] {
  let open = false
  return words.map(word => {
    const opens = word.includes('„')
    const inside = open || opens
    if (opens) open = true
    if (/[”"]/u.test(word)) open = false
    return inside
  })
}

function bare(word: string): string {
  return word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
}

// Poniżej tylu słów prozy odpowiedź nic nie mówi o głosie: „Zrobione.” to nie dryf.
const MIN_WORDS = 25

// Kalibracja pluginu: pary wzorcowe 65% krótkich zdań, dryf 32%, gładka poradnia 0%.
const SHORT_SENTENCE_WORDS = 8
const MIN_SHORT_RATIO = 0.45

// Ostrzeżenie przed ruchem nieodwracalnym idzie pełnymi zdaniami, bo tak każe
// kontrakt persony; za takie zdania miernik nie może karać następnej tury.
const WARNING = /nieodwracaln|drog\p{L}*\s+odwrotu|bez\s+odwrotu|reflog|kopi\p{L}*\s+zapasow|z\s+backupu/iu

// Punkt listy i nagłówek kończą zdanie, nawet bez kropki; znacznik to nie słowo.
// Inaczej niż `context-smoke.js` pluginu, który tnie tylko po `.!?`: tam lista
// sklejała się w jedno długie zdanie; na 194 odpowiedziach z historii flag
// `long-sentences` było 57, po tej zmianie 36.
const LIST_MARK = /^\s*(?:[-*+]|\d+[.)]|#{1,6})\s+/u

// Werdykt jednej odpowiedzi: `null`, gdy za krótka, by sądzić, albo gdy
// ostrzega przed ruchem nieodwracalnym; inaczej lista odstępstw z przykładami,
// które kotwica zacytuje w następnej turze.
export function gauge(answer: string): KruxDrift | null {
  if (WARNING.test(answer) || isDestructive(answer)) return null
  const text = prose(answer)
  if (wordCount(text) < MIN_WORDS) return null
  const issues: KruxDrift['issues'] = []
  const second = matches(text, SECOND_PERSON)
  if (second.length > 0) issues.push({ kind: 'second-person', examples: second.slice(0, 3) })
  const first = [...matches(text, FIRST_PERSON).filter(word => !isNounLem(word)), ...matches(text, FIRST_PRESENT)]
  if (first.length >= 2) issues.push({ kind: 'first-person', examples: first.slice(0, 3) })
  if (infinitiveHits(text) === 0) issues.push({ kind: 'no-infinitive', examples: [] })
  const lengths = text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map(line => wordCount(line.replace(LIST_MARK, '')))
    .filter(words => words > 1)
  if (lengths.length >= 4) {
    const ratio = lengths.filter(words => words <= SHORT_SENTENCE_WORDS).length / lengths.length
    if (ratio < MIN_SHORT_RATIO) issues.push({ kind: 'long-sentences', examples: [] })
  }
  if (issues.length === 0) return { issues }
  const fixes = rewrites(answer)
  return fixes.length > 0 ? { issues, rewrites: fixes } : { issues }
}
