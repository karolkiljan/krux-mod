// Humory hordy i dymki nad orkami. Czyste funkcje: stan trzyma register.ts.
// Dymek podaje tylko fakty z sesji; kumpel mówi, gdy był wysłany albo
// komentuje zdarzenie z kroniki, nigdy z powietrza.

import type { KruxActivity, KruxBubble, KruxEvent, KruxLore, KruxMate, KruxMood, KruxMoods } from '../types'
import { MATES, ROSTER } from './roster'
import { pick } from './voice'

export const FADE_TOOLS = 8

export const EVENT_HOLD_MS = 4000

export const CALM: KruxMoods = {
  faces: Object.fromEntries(['Krux', ...MATES].map(face => [face, 'calm'])) as KruxMoods['faces'],
  fade: 0,
}

// Kto z hordy komentuje zdarzenie, gdy stoi na scenie: każde zdarzenie ma kumpla
// z pasującym fachem. Ochra zdarzenia nie ma, mówi o własnej robocie na scenie.
export const EVENT_SPEAKER: Record<KruxEvent, KruxMate> = {
  'test-fail': 'Młot',
  'test-pass': 'Młot',
  'build-fail': 'Grom',
  'build-pass': 'Grom',
  commit: 'Piryt',
  tear: 'Lont',
  zawał: 'Niuch',
}

// Nowe zdarzenie między dwoma stanami kroniki; edycja czy odczyt to nie zdarzenie.
export function eventOf(before: KruxLore, after: KruxLore): KruxEvent | null {
  if (after.testRuns > before.testRuns) return after.last
  if (after.builds > before.builds) return after.last
  if (after.commits > before.commits) return 'commit'
  if (after.tears > before.tears) return 'tear'
  if (after !== before && after.last === 'zawał' && after.edits === before.edits) return 'zawał'
  return null
}

export function moodsAfter(event: KruxEvent, lore: KruxLore): KruxMoods {
  const faces: Record<'Krux' | KruxMate, KruxMood> = { ...CALM.faces }
  switch (event) {
    case 'test-fail':
      faces.Krux = 'grumpy'
      faces.Młot = 'grumpy'
      break
    case 'test-pass':
      faces.Krux = lore.testFails > 0 ? 'proud' : 'calm'
      faces.Młot = 'proud'
      break
    case 'build-fail':
      faces.Krux = 'grumpy'
      faces.Grom = 'grumpy'
      break
    case 'build-pass':
      faces.Krux = lore.buildFails > 0 ? 'proud' : 'calm'
      faces.Grom = 'proud'
      break
    case 'commit':
      faces.Krux = 'proud'
      break
    case 'tear':
      faces.Lont = 'proud'
      break
    case 'zawał':
      faces.Krux = 'grumpy'
      faces.Niuch = 'grumpy'
      break
  }
  return { faces, fade: FADE_TOOLS }
}

const GRUMPY_EVENTS: ReadonlySet<KruxEvent> = new Set(['test-fail', 'build-fail', 'zawał'])

// Wynik roboty wysłanego kumpla zmienia tylko jego minę: jego czerwone testy
// marszczą jego brwi, a reszta sceny zostaje, jaka była.
export function mateMoodAfter(moods: KruxMoods, mate: KruxMate, event: KruxEvent): KruxMoods {
  return { faces: { ...moods.faces, [mate]: GRUMPY_EVENTS.has(event) ? 'grumpy' : 'proud' }, fade: FADE_TOOLS }
}

export function moodsTick(moods: KruxMoods): KruxMoods {
  if (moods.fade === 0) return moods
  return moods.fade === 1 ? CALM : { ...moods, fade: moods.fade - 1 }
}

// Pierwsze imię z hordy w opisie, potem w prompcie zadania.
export function mateIn(...texts: string[]): KruxMate | null {
  for (const text of texts) {
    let best: { mate: KruxMate; at: number } | null = null
    for (const mate of MATES) {
      const at = text.search(ROSTER[mate].pattern)
      if (at >= 0 && (best === null || at < best.at)) best = { mate, at }
    }
    if (best) return best.mate
  }
  return null
}

// Liczby przy bezokoliczniku albo w etykiecie: „2 na 2 padać”, „smrodów po
// drodze: 1”. Tak nie trzeba odmiany, której „padło” i „po 1 smrodach” nie miały.
export function eventLine(event: KruxEvent, lore: KruxLore, seed: number): string {
  switch (event) {
    case 'test-fail':
      return pick([`Smród! ${lore.testFails} na ${lore.testRuns} padać.`, 'Czerwono. Robak gryźć.', 'Test padać. Kilof w dłoń!'], seed)
    case 'test-pass':
      return lore.testFails > 0
        ? pick([`Zielono! Smrodów po drodze: ${lore.testFails}.`, 'Robak wynocha!', 'Stal trzymać. Hej!'], seed)
        : pick(['Zielono za pierwszym!', 'Stal od razu dobra.', 'Czysto. Ani smrodu.'], seed)
    case 'build-fail':
      return pick([`Piec pluć! ${lore.buildFails} na ${lore.builds} padać.`, 'Krzywa stal. Do pieca!', 'Hartowanie padać. Grr.'], seed)
    case 'build-pass':
      return lore.buildFails > 0
        ? pick(['Stal wreszcie prosta!', 'Piec przyjąć stal. Hej!', 'Hartowanie czyste.'], seed)
        : pick(['Stal zahartowana.', 'Piec przyjąć stal.', 'Czysto w piecu.'], seed)
    case 'commit':
      return pick([`Pieczęć nr ${lore.commits}.`, 'Zapieczętować w skale.', 'Commit leżeć w sztolni.'], seed)
    case 'tear':
      return pick(['Gruz wynocha!', 'Lont syczeć. Czysto.', 'Rozbiórka skończona.'], seed)
    case 'zawał':
      return pick(['Zawał! Komenda paść.', 'Strop pękać. Ostrożnie.', 'Kamień spaść. Sprawdzić.'], seed)
  }
}

// Krok wysłanego kumpla: opis narzędzia bez „Krux” na początku.
export function mateStep(doing: KruxActivity): string {
  const verb = doing.verb.replace(/^Krux /u, '')
  return doing.target ? `${verb} ${doing.target}` : verb
}

function flavor(text: string, mood: KruxMood): string {
  if (mood === 'grumpy') return `Grr. ${text}`
  if (mood === 'proud') return `${text} Hej!`
  return text
}

// Myśl bez celu: dumanie i pisanie mają swoje, reszta robi swoje.
const BARE_THOUGHTS: Partial<Record<KruxActivity['scene'], readonly string[]>> = {
  think: ['Hmm…', 'Ważyć to…', 'Myśl mielić…'],
  write: ['Ciąć zbędne…', 'Runa po runie.', 'Krótko. Konkret.'],
}

function workThought(doing: KruxActivity | null, mood: KruxMood, seed: number): string | null {
  if (doing === null) return null
  const t = doing.target
  const scene = doing.scene
  // Dumanie i pisanie nie mają celu (`describePhase`), więc mówią zawsze swoje.
  if (!t || scene === 'think' || scene === 'write') return flavor(pick(BARE_THOUGHTS[scene] ?? ['Hmm…', 'Dalej, dalej.', 'Robota iść.'], seed), mood)
  const pool: Record<Exclude<KruxActivity['scene'], 'think' | 'write'>, readonly string[]> = {
    torch: [`Gdzie ten ${t}?`, `Świecić za ${t}…`, `Trop… ${t}?`],
    pick: [`Kuć w skale: ${t}`, `Kilof iść: ${t}`, `Skała twarda… ${t}`],
    test: [`Próba: ${t}`, `Stal trzymać? ${t}`, `Kanarek śpiewać? ${t}`],
    seal: [`Pieczęć na ${t}`, `Wosk kapać: ${t}`, `Wózek do góry: ${t}`],
    build: [`Do pieca: ${t}`, `Hartować ${t}`, `Piec grzać: ${t}`],
    tear: [`Lont pod ${t}`, `Gruz wynocha: ${t}`, `Rozbierać ${t}`],
    horn: [`Horda, do mnie! ${t}`, `Róg grać: ${t}`, `Kumple biec: ${t}`],
    hammer: [`Hmm, ${t}…`, `Klepać ${t}`, `${t} — zaraz stal`],
    read: [`Czytać ${t}…`, `Runy w ${t}`, `Hmm, ${t} gadać…`],
    plan: [`Szlak przez ${t}`, `Mapa: ${t}`, `Tu krzyżyk — ${t}`],
    scout: [`Gdzie ${t}?`, `Coś szeleścić… ${t}`, `Wypatrywać ${t}`],
    raven: [`Kruk lecieć: ${t}`, `Goniec po ${t}`, `Kruk wracać? ${t}`],
    ask: [`Morra wiedzieć: ${t}?`, `Hmm… ${t}?`, `Pytać o ${t}`],
  }
  return flavor(pick(pool[scene], seed), mood)
}

// Spoczynek bez liczb: uderzenia stoją w podpisie obok.
function restLine(mood: KruxMood, seed: number): string {
  if (mood === 'grumpy') return pick(['Grr. Robak dalej siedzieć?', 'Grr. Smród jeszcze czuć.', 'Kilof czekać obok.'], seed)
  if (mood === 'proud') return pick(['Dobra robota była. Hej!', 'Stal kuta. Hej!', 'Krux zadowolony.'], seed)
  return pick(['Palenisko tlić.', 'Kowadło stygnąć.', 'Morra mówić, co kopać.'], seed)
}

export type BubbleInput = {
  now: number
  held: KruxBubble | null
  working: boolean
  activity: KruxActivity | null
  moods: KruxMoods
  seed: number
}

// Kolejność: trzymany wtręt po zdarzeniu, krok kumpla (także gdy Krux odpoczywa,
// a agent w tle dalej kuje), myśl Kruxa, spoczynek.
export function bubbleFor(input: BubbleInput): KruxBubble | null {
  const { held } = input
  if (held?.kind === 'event' && held.until > input.now) return held
  if (held?.kind === 'step') return held
  const mood = input.moods.faces.Krux
  const text = input.working ? workThought(input.activity, mood, input.seed) : restLine(mood, input.seed)
  return text === null ? null : { kind: 'thought', key: 'krux', speaker: 'Krux', text }
}
