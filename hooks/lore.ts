// Życie hordy z prawdziwych zdarzeń sesji. Model nie wymyśla kumpla z
// powietrza: dostaje jeden fakt i imię, które dawno nie padło. Kumpel
// komentuje; roboty, której nikt mu nie zlecił, mu nie przypisujemy.

import type { KruxDrift, KruxEvent, KruxLore, KruxMate } from '../types'
import { testPassed } from './board'
import { gauge, matesNamed } from './gauge'
import { MATES, ROSTER } from './roster'
import { isBackgroundToolCall } from './outcome'
import { isCommitCommand, parsePhrase, pick, workOf } from './voice'

export const EMPTY_LORE: KruxLore = {
  testRuns: 0,
  testFails: 0,
  builds: 0,
  buildFails: 0,
  commits: 0,
  tears: 0,
  edits: 0,
  uiEdits: 0,
  last: null,
  lastMate: null,
  quietTurns: 0,
}

// Pliki interfejsu: o nich gada Ochra.
const UI_FILE = /\.(?:css|scss|sass|less|html?|vue|svelte|tsx|jsx)$/iu

// Błąd budowania w wyjściu: `| tail` zjada kod wyjścia, a dymek mówi tylko prawdę.
const BUILD_ERROR = /(?<![\p{L}\d])error(?:\[\w+\]|:|\s+TS\d+)|✖\s+[1-9]/iu

// Co jedno wywołanie narzędzia dopisuje do kroniki. Zawał to padła komenda, która
// coś robiła: sam `grep` bez trafień albo `git diff` z kodem 1 tylko patrzyły.
// Łańcuch z inną robotą zachowuje błąd, nawet gdy zawiera odczyt. Przebieg testów
// ocenia `testPassed` z wyjścia (`text`), tak jak tablica Sztolni.
export function recordTool(lore: KruxLore, tool: string, input: Record<string, unknown>, isError: boolean, text = '', result?: unknown): KruxLore {
  if (isBackgroundToolCall(tool, input, result)) return lore
  const work = workOf(tool, input)
  switch (work) {
    case null:
    case 'agent':
      return lore
    case 'edit': {
      if (isError) return lore
      const path = input.file_path ?? input.notebook_path
      const ui = typeof path === 'string' && UI_FILE.test(path) ? 1 : 0
      return { ...lore, edits: lore.edits + 1, uiEdits: lore.uiEdits + ui }
    }
    case 'test': {
      const failed = !testPassed(text, isError)
      const last: KruxEvent = failed ? 'test-fail' : 'test-pass'
      return { ...lore, testRuns: lore.testRuns + 1, testFails: lore.testFails + (failed ? 1 : 0), last }
    }
    case 'build': {
      const failed = isError || BUILD_ERROR.test(text)
      const last: KruxEvent = failed ? 'build-fail' : 'build-pass'
      return { ...lore, builds: lore.builds + 1, buildFails: lore.buildFails + (failed ? 1 : 0), last }
    }
    case 'seal':
      if (!isError && isCommitCommand(input.command)) return { ...lore, commits: lore.commits + 1, last: 'commit' }
      break
    case 'tear':
      if (!isError) return { ...lore, tears: lore.tears + 1, last: 'tear' }
      break
    case 'look':
    case 'trail':
      return lore
  }
  return isError ? { ...lore, last: 'zawał' } : lore
}

// Po turze: kto z hordy padł w odpowiedzi i ile tur minęło bez nikogo.
export function recordAnswer(lore: KruxLore, mates: readonly KruxMate[]): KruxLore {
  if (mates.length === 0) return { ...lore, quietTurns: lore.quietTurns + 1 }
  return { ...lore, lastMate: mates[mates.length - 1]!, quietTurns: 0 }
}

// Co kilka tur, nie co turę: wstawka w każdej odpowiedzi to wytarty szablon.
const QUIET_TURNS = 2

// Fakty z sesji dla kumpli, których fach pasuje do roboty Kruxa. Liczby w formie
// etykiety („padłe: 2”): bez odmiany, której model by po nas powtarzał.
function factsOf(lore: KruxLore): Partial<Record<KruxMate, string>> {
  const facts: Partial<Record<KruxMate, string>> = {}
  if (lore.testRuns > 0) {
    const lastRun = lore.last === 'test-pass' ? ', ostatni zielony' : lore.last === 'test-fail' ? ', ostatni czerwony' : ''
    facts.Młot = `przebiegi testów w tej sesji: ${lore.testRuns}, padłe: ${lore.testFails}${lastRun}`
  }
  if (lore.commits > 0) facts.Piryt = `commity w tej sesji: ${lore.commits}`
  if (lore.last === 'zawał') facts.Niuch = 'ostatnia komenda padła z błędem'
  if (lore.builds > 0) facts.Grom = `przebiegi budowania, typów i lintu w tej sesji: ${lore.builds}, padłe: ${lore.buildFails}`
  else if (lore.edits >= 10) facts.Grom = `edycje plików w tej sesji: ${lore.edits}`
  if (lore.uiEdits > 0) facts.Ochra = `edycje plików interfejsu w tej sesji: ${lore.uiEdits}`
  if (lore.tears > 0) facts.Lont = `rozbiórki w tej sesji (rm, git clean, reset): ${lore.tears}`
  return facts
}

// Forma wstawki z kodu, nie z modelu: sam powtarza raz złapaną budowę
// („Niuch dziś…”, „Młot dziś…”), a losować nie umie.
const FORMS = [
  'słowa kumpla w cudzysłowie',
  'coś, co kumpel zrobił w kuźni albo w kopalni',
  'docinek albo pytanie kumpla do Kruxa',
  'krótka scenka: Krux i kumpel przy jednej rzeczy',
] as const

// Miejsce też z kodu: notka bez miejsca kończyła 31 z 32 odpowiedzi benchu, czyli
// kumpel zajął slot dawnego „Morra powie…” jako stałe zamknięcie. Środek mówi
// wprost „nie na końcu”: przy samym „w środku” Haiku i tak stawiał kumpla w ostatnim
// zdaniu w 2–4 z 10 tur, a po turach z linią nastroju częściej.
const PLACES = ['w środku, przy punkcie, do którego pasuje, nie na końcu odpowiedzi', 'na końcu'] as const

// Notka dla modelu albo nic. Neutralna polszczyzna, bo to instrukcja. O tym, czy
// wstawka ma sens w tej turze, decyduje wołający (prośba o ruch nieodwracalny
// notki nie dostaje), więc notka nie zostawia modelowi „jeśli pasuje”.
export function lifeNote(lore: KruxLore, seed: number): string | null {
  if (lore.quietTurns < QUIET_TURNS) return null
  const facts = factsOf(lore)
  // Kumpel z faktem ma pierwszeństwo, ale fakty rozkłada seed: inaczej przy
  // częstych commitach gadałby w kółko Piryt.
  const fresh = MATES.filter(name => name !== lore.lastMate)
  const known = fresh.filter(name => facts[name] !== undefined)
  const mate = pick(known.length > 0 ? known : fresh, seed)
  const found = facts[mate]
  // Fakt z sesji to robota Kruxa: kumpel ją komentuje, nie przejmuje.
  const why = found ? ` Fakt z sesji: ${found}; to robota Kruxa, kumpel ją tylko komentuje.` : ' Coś z dnia kumpla, bez przypisywania kumplowi roboty w tym repo.'
  const avoid = lore.lastMate ? ` Nie ${ROSTER[lore.lastMate].accusative}: o ${ROSTER[lore.lastMate].locative} była ostatnia wstawka.` : ''
  const { locative, trait, words } = ROSTER[mate]
  return `Życie hordy: jedno zdanie łamaną mową o ${locative} (${trait}), słowa fachu: ${words}; miejsce: ${pick(PLACES, seed + 1)}; forma: ${pick(FORMS, seed)}.${why}${avoid}`
}

// Nastrój Kruxa z ostatniego zdarzenia kroniki: jedna linia dla modelu, a `key`
// pozwala wołającemu podać ją raz na zdarzenie. Zielone bez wcześniejszego
// smrodu to spokój, nie powód do nastroju. Neutralna polszczyzna, bo to instrukcja;
// linia sama mówi, że nastrój nie rusza ocen, bo w symulacji triumf przechylał decyzje.
// Forma zdania z kodu, „Krux + bezokolicznik”, bez słowa „nastrój”: przy „jednym
// zdaniu o tym nastroju” Haiku pisał formy osobowe („zniknął”, „nastrój jest”), poprawek
// dryfu było 2,70 zamiast 1,73 na przebieg, a w 4 z 19 zdań wracało samo słowo z linii.
export function moodNote(lore: KruxLore): { key: string; text: string } | null {
  if (lore.last === null) return null
  const key = `${lore.last}:${lore.testRuns}:${lore.builds}:${lore.commits}:${lore.tears}:${lore.edits}`
  const mood = (() => {
    switch (lore.last) {
      case 'test-fail': return `zadziorny (padłe przebiegi testów: ${lore.testFails} z ${lore.testRuns})`
      case 'build-fail': return `zadziorny (padłe budowania: ${lore.buildFails} z ${lore.builds})`
      case 'test-pass': return lore.testFails > 0 ? `dumny (testy zielone po padłych przebiegach: ${lore.testFails})` : null
      case 'build-pass': return lore.buildFails > 0 ? `dumny (budowanie zielone po padłych: ${lore.buildFails})` : null
      case 'commit': return `zadowolony (commity w tej sesji: ${lore.commits})`
      case 'tear': return `skupiony (rozbiórki w tej sesji: ${lore.tears})`
      case 'zawał': return 'czujny (ostatnia komenda padła z błędem)'
    }
  })()
  if (mood === null) return null
  return { key, text: `Nastrój Kruxa: ${mood}. Pokaż go jednym krótkim zdaniem „Krux + bezokolicznik”, bez słowa „nastrój”; nastrój barwi ton, nie zmienia ocen, ryzyka ani decyzji.` }
}

// Wiadomość historii w kształcie `$.session.messages()`, tyle, ile czyta replay.
export type HistoryMessage = {
  role: 'user' | 'assistant'
  text: string
  toolUses: { tool_use_id?: string; tool: string; input: Record<string, unknown>; isError?: true; result?: unknown; text?: string }[]
  toolResults?: unknown[]
}

// Historia nie zachowuje źródła promptu ani trybu persony. Rytm opiera się na
// treści: tekst (także raport) liczy turę niezależnie od persony; frazy nie.
// Włączenie Kruxa zaczyna rytm od nowa, puste teksty i wyniki narzędzi milczą.
export function turnsAfter(count: number, text: string, toolResults: readonly unknown[] = []): number {
  if (toolResults.length > 0 || !text.trim()) return count
  const phrase = parsePhrase(text)
  if (phrase) return phrase.mode === 'persona' && phrase.on === true ? 0 : count
  return count + 1
}

export type Replayed = { turns: number; lore: KruxLore; drift: KruxDrift | null }

// `/resume`, restart i `claude -p --resume` zaczynają z pustym `$.state`.
// Licznik tur, kronikę i ostatni werdykt miernika odtwarzamy z historii,
// żeby wznowiona sesja nie wracała do pełnej kotwicy i pustej hordy.
export function replay(messages: readonly HistoryMessage[]): Replayed {
  let turns = 0
  let lore = EMPTY_LORE
  let answer: string | null = null
  let latest: string | null = null
  const closeTurn = () => {
    if (answer !== null) lore = recordAnswer(lore, matesNamed(answer))
    answer = null
  }
  for (const message of messages) {
    if (message.role === 'user') {
      if ((message.toolResults?.length ?? 0) > 0 || !message.text.trim()) continue
      closeTurn()
      turns = turnsAfter(turns, message.text, message.toolResults)
      continue
    }
    for (const use of message.toolUses) {
      // Sam opis wywołania może pochodzić z przerwanej tury, bez zakończonej roboty.
      if (use.text === undefined && use.result === undefined && use.isError !== true) continue
      lore = recordTool(lore, use.tool, use.input, use.isError === true, use.text ?? '', use.result)
    }
    if (message.text.trim()) answer = latest = message.text
  }
  closeTurn()
  return { turns, lore, drift: latest === null ? null : gauge(latest) }
}
