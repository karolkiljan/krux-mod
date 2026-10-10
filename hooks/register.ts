import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'

import type { KruxActivity, KruxBoard, KruxEvent, KruxGit, KruxHordeMember, KruxMode, KruxModes, KruxTestRun } from '../types'
import { CAPTION_COLUMNS, CAPTION_GAP, bandPlan } from './band'
import type { BandInput } from './band'
import { EMPTY_CREW, crewAfter } from './crew'
import type { CrewEvent } from './crew'
import { gauge, matesNamed } from './gauge'
import { EMPTY_LORE, lifeNote, moodNote, recordAnswer, recordTool, replay, turnsAfter } from './lore'
import { CALM, EVENT_HOLD_MS, eventOf, mateIn, mateMoodAfter, mateOfType, moodsAfter, moodsTick } from './mood'
import { MATES, ROSTER } from './roster'
import type { BoardCall } from './board'
import { EMPTY_BOARD, boardAfter, replayBoard, returnNote, usageOf } from './board'
import { GIT_CHECK, GIT_CHECK_CACHED, GIT_LOG, GIT_STATUS, GIT_UNPUSHED, GIT_TOOLS, gitOf } from './git'
import { EMPTY_THREADS, THREAD_SPEC, THREAD_TOOL_NAME, replayThreads, saveThread, threadsAfter, threadsReport } from './threads'
import { dayReport } from './report'
import { EMPTY_MUSTER, anyRunning, musterDone, musterRows, musterSpawn, musterTool } from './muster'
import { KRUX_COLOR, ORC_COLOR, shaftDigest, shaftTabs, shaftTree } from './shaft'
import { TOOL_INDENT, chatTree, toolIndent } from './chat'
import type { AvatarSpeaker } from './avatar'
import { EMPTY_JOURNAL, journalAfter, journalTree, toolLine } from './journal'
import { forgeColumns } from './sprites'
import {
  DEFAULT_MODES,
  HELP,
  MODES,
  NAMEPLATE,
  COMPACT_NOTE,
  anchorFor,
  applyToggle,
  asksRelease,
  describeTool,
  describeToolAhead,
  describePhase,
  formatHint,
  fromPerson,
  modelNote,
  parseCommand,
  parsePhrase,
  personaSections,
  promptKind,
  riskHint,
  spinnerWord,
  statusLine,
  stripFrontmatter,
  userLine,
  workOf,
} from './voice'
import type { Texts, Toggle } from './voice'

const PANE = 'krux'
// Panel ze stanem roboty; w pełnoekranowym terminalu dokuje się obok transkryptu.
const SHAFT_PANE = 'sztolnia'
// Komórka przycisku trybu w panelu `/krux`: najdłuższy „6: sztolnia: off” i oddech.
const MODE_CELL = 18
const SHAFT_COLUMNS = 56
// Najwęższy skrót Sztolni w pasie: znak, ułamek planu i kilka liter zadania.
const DIGEST_COLUMNS = 18
// Szerzej skrót się nie rozlewa: długa linia ucina się, zamiast ciągnąć oko przez pół ekranu.
const DIGEST_MAX = 64
// Tabliczki, kreska bloków, pas i płótno kuźni liczą siatkę znaków terminala:
// pusty wiersz nad wiadomością, piksele z półbloków. Desktop rysuje je krzywo
// (tabliczka na tekście, piksele z przerwami), więc stoją tylko w terminalu.
const GRID_SURFACE = 'terminal'

// Kolor Morry: chłodny błękit (człowiek, nie ork; czytelny na jasnym i ciemnym tle).
const MORRA_COLOR = '#5b9bd5'

const modes = atom({ plugin: 'krux-mod', key: 'modes' } as const, DEFAULT_MODES)
const activity = atom({ plugin: 'krux-mod', key: 'activity' } as const, null)
const strikes = atom({ plugin: 'krux-mod', key: 'strikes' } as const, 0)
const sessionStrikes = atom({ plugin: 'krux-mod', key: 'sessionStrikes' } as const, 0)
const still = atom({ plugin: 'krux-mod', key: 'still' } as const, false)
const turns = atom({ plugin: 'krux-mod', key: 'turns' } as const, 0)
const drift = atom({ plugin: 'krux-mod', key: 'drift' } as const, null)
const lore = atom({ plugin: 'krux-mod', key: 'lore' } as const, EMPTY_LORE)
// Zdarzenie kroniki, o którego nastroju model już słyszał: linia nastroju raz na zdarzenie.
const moodSeen = atom({ plugin: 'krux-mod', key: 'moodSeen' } as const, null)
const replayed = atom({ plugin: 'krux-mod', key: 'replayed' } as const, false)
const moods = atom({ plugin: 'krux-mod', key: 'mood' } as const, CALM)
const crew = atom({ plugin: 'krux-mod', key: 'crew' } as const, EMPTY_CREW)
// Wywołania `Agent` w toku z wątku głównego: Krux czeka na hordę.
const waiting = atom({ plugin: 'krux-mod', key: 'waiting' } as const, 0)
const board = atom({ plugin: 'krux-mod', key: 'board' } as const, EMPTY_BOARD)
const usage = atom({ plugin: 'krux-mod', key: 'usage' } as const, null)
const muster = atom({ plugin: 'krux-mod', key: 'muster' } as const, EMPTY_MUSTER)
const musterNow = atom({ plugin: 'krux-mod', key: 'musterNow' } as const, 0)
const git = atom({ plugin: 'krux-mod', key: 'git' } as const, null)
const threads = atom({ plugin: 'krux-mod', key: 'threads' } as const, EMPTY_THREADS)
const autoKonkret = atom({ plugin: 'krux-mod', key: 'autoKonkret' } as const, false)
const turnAt = atom({ plugin: 'krux-mod', key: 'turnAt' } as const, null)
const seenAt = atom({ plugin: 'krux-mod', key: 'seenAt' } as const, null)
const journal = atom({ plugin: 'krux-mod', key: 'journal' } as const, { entries: [] })
const shaftTab = atom({ plugin: 'krux-mod', key: 'shaftTab' } as const, 'stan')

// Godzina pierwszego rysunku po id wiadomości, bez niedozwolonego zapisu $.state
// w ui.render. Nie ma zegara historii: redraw i resize zachowują tę samą godzinę.
const messageTimes = new Map<string, number>()
// Id narzędzi z grup w czacie: wcięcie daje grupa, jej wiersze `ToolUse` (także
// zwinięty wiersz, który silnik rysuje przez `ToolUse`) stoją w niej bez drugiego.
const groupedTools = new Set<string>()
let journalWatch: { cancel: () => void } | null = null
let journalWatchVersion = 0
let journalWatchRequests = 0

// Teksty głosu czyta session.start; reload modułu czyta je od nowa.
let texts: Texts = { persona: '', konkret: '', flow: '' }

// Notki dla modelu po przełączeniu z panelu: dojadą z następnym promptem.
const NOTES_LIMIT = 16
const NOTES_TTL_MS = 5 * 60 * 1000
let pendingNotes: { text: string; at: number }[] = []

function freshNotes(now: number): typeof pendingNotes {
  return pendingNotes.filter(note => now - note.at <= NOTES_TTL_MS).slice(-NOTES_LIMIT)
}

// Błąd dodatku nie blokuje sesji; nawet logowanie może zawieść.
function hookFailure($: EngineInterface, event: string, error: { kind: string; message?: string }): void {
  try { $.ui.log(`krux-mod: ${event}: ${error.kind}${error.message === undefined ? '' : `: ${error.message}`}`) } catch { /* Log nie zastępuje zdarzenia. */ }
}

// Jeden zegar apelu naraz; reload modułu zaczyna bez zegara.
let ticking = false

function savedModes(saved: unknown): KruxModes {
  const result: KruxModes = { ...DEFAULT_MODES }
  if (typeof saved !== 'object' || saved === null) return result
  for (const mode of MODES) {
    const value = (saved as Record<string, unknown>)[mode]
    if (typeof value === 'boolean') result[mode] = value
  }
  return result
}

// Stary obiekt zostaje źródłem trybów jeszcze niezapisanych pod osobnym kluczem.
// Migracja przy zapisie jednego trybu nie nadpisuje zmian z równoległej sesji.
async function readSavedModes($: EngineInterface): Promise<KruxModes> {
  const loaded = savedModes(await $.store.get('modes'))
  const values = await Promise.all(MODES.map(mode => $.store.get(`mode.${mode}`)))
  MODES.forEach((mode, index) => {
    if (typeof values[index] === 'boolean') loaded[mode] = values[index] as boolean
  })
  return loaded
}

async function loadModes($: EngineInterface): Promise<void> {
  const loaded = await readSavedModes($)
  await update($, modes, () => loaded)
}

// Zapis trybu i notka dla modelu, jeśli ten tryb ją ma.
async function setModes($: EngineInterface, toggle: Toggle): Promise<{ next: KruxModes; on: boolean; note: string | null }> {
  let next = applyToggle(await readSavedModes($), toggle)
  const on = next[toggle.mode]
  await $.store.set(`mode.${toggle.mode}`, on)
  await update($, modes, current => {
    next = { ...current, [toggle.mode]: on }
    return next
  })
  // Persona wraca po przerwie: pierwsza tura znowu dostaje pełną kotwicę.
  if (toggle.mode === 'persona' && on) await update($, turns, () => 0)
  return { next, on, note: modelNote(toggle.mode, on) }
}

async function readText($: EngineInterface, name: string): Promise<string> {
  try {
    return stripFrontmatter(await $.fs.read(`${$.plugin.root}/voice/${name}.md`))
  } catch {
    $.ui.log(`brak voice/${name}.md — ten tryb nie trafi do promptu`)
    return ''
  }
}

// Tryby i ruch od nowa: na starcie i po komendach, które zerują `$.state`.
async function loadSession($: EngineInterface): Promise<void> {
  messageTimes.clear()
  groupedTools.clear()
  journalWatch?.cancel()
  journalWatch = null
  journalWatchVersion += 1
  await loadModes($)
  await loadMotion($)
}

async function loadMotion($: EngineInterface): Promise<void> {
  let reduced = false
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    reduced = settings.prefersReducedMotion === true
  } catch {
    reduced = false
  }
  await update($, still, () => reduced)
}

// Plugin Krux i ten mod naraz to podwójna persona i podwójna kotwica.
async function warnAboutPlugin($: EngineInterface): Promise<void> {
  try {
    const commands = await $.command.list()
    if (commands.some(command => command.plugin === 'krux' || command.name.startsWith('krux:'))) {
      $.ui.toast('Plugin krux też aktywny: persona podwójna. Wyłącz go: claude plugin disable krux@krux-marketplace')
    }
  } catch {
    // Brak listy komend to nie powód, by psuć start sesji.
  }
}

// Pusty `$.state` przy niepustej historii to wznowiona sesja: licznik tur,
// kronikę, dryf i tablicę Sztolni odtwarzamy raz, przy pierwszym prompcie po
// starcie albo notatce czy raporcie. Równoległe wywołania czekają na wynik,
// żeby zapis notatki nie wyprzedził odtworzenia wątków.
let restoring: Promise<void> | null = null

function restore($: EngineInterface): Promise<void> {
  if (restoring === null) restoring = restoreOnce($).finally(() => { restoring = null })
  return restoring
}

async function restoreOnce($: EngineInterface): Promise<void> {
  // Sprawdzenie i zapis w jednym `update`: dwa równoległe prompty nie odtworzą dwa razy.
  let first = false
  await update($, replayed, was => {
    first = !was
    return true
  })
  if (!first) return
  try {
    const messages = await $.session.messages()
    if (messages.length === 0) return
    await update($, board, () => replayBoard(messages))
    await update($, threads, () => replayThreads(messages))
    const found = replay(messages)
    await update($, turns, () => found.turns)
    await update($, lore, () => found.lore)
    const last = found.lore.last
    if (last !== null) await update($, moods, () => moodsAfter(last, found.lore))
    await update($, drift, () => found.drift)
  } catch (error) {
    $.ui.log(`nie odtworzyć historii: ${String(error)}`)
  }
}

// Jedno przejście sceny; bez zapisu, gdy nic się nie zmienia.
async function crewStep($: EngineInterface, event: CrewEvent): Promise<void> {
  const now = await $.clock.now()
  const seen = await read($, crew)
  if (crewAfter(seen, event, now) === seen) return
  await update($, crew, current => crewAfter(current, event, now))
}

// Faza strumienia na scenie: Krux w pasie albo kumpel na płótnie, od chwili, gdy się zaczęła.
async function noteStep($: EngineInterface, agentId: string | undefined, description: KruxActivity | null): Promise<void> {
  if (description === null) return
  const doing = { ...description, startedAt: await $.clock.now() }
  if (agentId === undefined) await update($, activity, () => doing)
  else await crewStep($, { kind: 'mate-tool', agentId, doing })
}

// Agenci, których silnik widzi jako `running`; `null`, gdy listy nie ma.
async function runningIds($: EngineInterface): Promise<ReadonlySet<string> | null> {
  try {
    return new Set((await $.agent.list()).filter(agent => agent.status === 'running').map(agent => agent.id))
  } catch {
    return null
  }
}

// Agenci w tle kończą się poza turą: na scenie zostaje tylko to, co silnik widzi jako `running`.
async function liveMembers($: EngineInterface, members: KruxHordeMember[]): Promise<KruxHordeMember[]> {
  if (members.length === 0) return members
  const ids = await runningIds($)
  return ids === null ? members : members.filter(member => ids.has(member.agentId))
}

// Własne narzędzie Kruxa: kronika, humor, a po zdarzeniu wtręt na cztery sekundy.
async function afterOwnTool($: EngineInterface, tool: string, input: Record<string, unknown>, isError: boolean, text: string, failure?: string, result?: unknown): Promise<KruxEvent | null> {
  let after = EMPTY_LORE
  let found: KruxEvent | null = null
  // Kronika liczona w środku `update`: równoległe narzędzia nie gubią sobie zapisów.
  await update($, lore, before => {
    after = recordTool(before, tool, input, isError, text, result)
    found = eventOf(before, after)
    return after
  })
  const event = found as KruxEvent | null
  if (event === null) {
    await update($, moods, now => moodsTick(now))
  } else {
    await update($, moods, () => moodsAfter(event, after))
    // Martwy wpis nie dostanie wtrętu: najpierw scena według listy silnika.
    const ids = await runningIds($)
    if (ids !== null) await crewStep($, { kind: 'running', ids })
  }
  await crewStep($, { kind: 'own-tool', event, lore: after, seed: await read($, sessionStrikes), failure })
  // Timer startuje po zapisie dymka, więc nigdy nie wyprzedzi jego `until`.
  if (event !== null) $.clock.after(EVENT_HOLD_MS, () => void crewStep($, { kind: 'expire' }))
  return event
}

// Narzędzie kumpla na scenie: wynik jego roboty zmienia jego minę i daje jego wtręt
// na cztery sekundy. Kronika Kruxa go nie liczy: to nie robota Kruxa.
async function afterMateTool($: EngineInterface, agentId: string, tool: string, input: Record<string, unknown>, isError: boolean, text: string, failure?: string, result?: unknown): Promise<void> {
  const single = recordTool(EMPTY_LORE, tool, input, isError, text, result)
  const event = eventOf(EMPTY_LORE, single)
  if (event === null) return
  const member = (await read($, crew)).members.find(one => one.agentId === agentId)
  if (member === undefined) return
  const mate = member.mate
  if (mate !== null) await update($, moods, now => mateMoodAfter(now, mate, event))
  await crewStep($, { kind: 'mate-event', agentId, event, lore: single, seed: await read($, sessionStrikes), failure })
  $.clock.after(EVENT_HOLD_MS, () => void crewStep($, { kind: 'expire' }))
}

// Sztolnia idzie za trybem: otwarty, gdy `sztolnia` on. Bez pytania silnik
// stawia go od 144 kolumn; poniżej czeka, aż terminal się poszerzy.
async function syncShaftPane($: EngineInterface, on: boolean): Promise<void> {
  try {
    if (on) await $.ui.open({ id: SHAFT_PANE, title: 'Sztolnia', columns: SHAFT_COLUMNS })
    else await $.ui.close({ id: SHAFT_PANE })
  } catch (error) {
    $.ui.log(`sztolnia: ${String(error)}`)
  }
}

// Tabliczka raz na turę. Silnik stawia kropkę (`isFirstOfReply`) na każdym
// bloku po grupie narzędzi, a stanu w trakcie rysowania zapisać nie wolno:
// `turn.start` zaznacza turę, pierwszy blok z kropką zabiera tabliczkę po
// `requestId` (przerysowanie go nie gubi). Historia sprzed pierwszej żywej tury
// po wczytaniu modułu dostaje tabliczkę na każdej kropce, bez zapamiętywania.
// Żywe bloki zachowują tabliczkę przy przerysowaniu przez ostatnie 32 tury.
const PLATES_LIMIT = 32
const plates = { live: false, pending: false, ids: new Set<string>() }

function claimPlate(id: string): boolean {
  if (!plates.live) return true
  if (plates.ids.has(id)) return true
  if (!plates.pending) return false
  plates.pending = false
  plates.ids.add(id)
  if (plates.ids.size > PLATES_LIMIT) plates.ids.delete(plates.ids.values().next().value!)
  return true
}

// Stan repo po narzędziu, które mogło go zmienić; poza repo albo bez gita `null`.
// Bez zmiany bez zapisu: zapis przerysowuje Sztolnię i pas.
let gitRefresh: Promise<void> | null = null
let gitAgain = false

function refreshGit($: EngineInterface): Promise<void> {
  if (gitRefresh !== null) {
    // Narzędzia mogły zmienić repo podczas odczytu: jeden wspólny odczyt po nim.
    gitAgain = true
    return gitRefresh
  }
  gitRefresh = (async () => {
    try {
      do {
        gitAgain = false
        let found: KruxGit | null = null
        // Czekamy na wszystkie także po błędzie, żeby kolejny odczyt nie nakładał się na stary.
        const [run, log, check, cachedCheck] = await Promise.all([
          $.process.run(GIT_STATUS, { timeoutMs: 5000 }).catch(() => null),
          $.process.run(GIT_LOG, { timeoutMs: 5000 }).catch(() => null),
          $.process.run(GIT_CHECK, { timeoutMs: 5000 }).catch(() => null),
          $.process.run(GIT_CHECK_CACHED, { timeoutMs: 5000 }).catch(() => null),
        ])
        if (run?.exitCode === 0) {
          const status = gitOf(run.stdout)
          const local = status.upstream === null ? null : await $.process.run(GIT_UNPUSHED, { timeoutMs: 5000 }).catch(() => null)
          found = gitOf(run.stdout, log?.exitCode === 0 ? log.stdout : '', local?.exitCode === 0 && !local.isStdoutTruncated ? local.stdout : null)
          found.whitespace = check?.exitCode === 2 || cachedCheck?.exitCode === 2 ? false
            : check?.exitCode === 0 && cachedCheck?.exitCode === 0 ? true : null
        }
        const previous = await read($, git)
        if (JSON.stringify(previous) !== JSON.stringify(found)) {
          await update($, git, () => found)
          if (previous !== null && found !== null && found.behind > previous.behind) $.ui.toast(`origin ma ${found.behind} nowych commitów — git pull.`)
        }
      } while (gitAgain)
    } finally {
      // Blokada znika razem z pętlą, zanim następne mikrozadanie poprosi o odczyt.
      gitRefresh = null
    }
  })()
  return gitRefresh
}

async function shaftShown($: EngineInterface, on: boolean): Promise<boolean> {
  if (!on) return false
  return (await $.ui.panes()).some(pane => pane.id === SHAFT_PANE && pane.isPlaced && pane.isShown)
}

// Raport zadania powłoki też ma task.id. Dopiero apel lub lista potwierdza agenta;
// null oznacza potwierdzonego orka bez imienia, undefined — nieznanego nadawcę.
async function reportMate($: EngineInterface, agentId: string): Promise<AvatarSpeaker | undefined> {
  const run = (await read($, muster)).runs.find(one => one.agentId === agentId)
  if (run !== undefined) return run.mate
  try {
    const agent = (await $.agent.list()).find(one => one.id === agentId)
    return agent === undefined ? undefined : mateOfType(agent.type) ?? mateIn(agent.description, '')
  } catch {
    return undefined
  }
}

type MessageInput = RenderInput<'AssistantMessage' | 'UserMessage', 'terminal'>

// Dziś wiadomości nie mają czasu ani bodyColumns w kontrakcie. Przyjmujemy
// timestamp/createdAt (ms lub ISO), jeśli host je poda; inaczej czas pierwszego
// rysunku. Bez pomiaru szerokości zostaje natywna treść, bez zgadywania 80 kolumn.
async function drawChat($: EngineInterface, e: MessageInput, speaker: AvatarSpeaker, content: RenderElement): Promise<RenderElement> {
  const props = e.props as unknown as Record<string, unknown>
  const columns = props.bodyColumns ?? props.columns ?? e.viewport?.columns
  if (typeof columns !== 'number' || !Number.isFinite(columns) || columns <= 0) return content
  const key = `${e.component}:${e.requestId}`
  let at = messageTimes.get(key)
  for (const value of [props.timestamp, props.createdAt]) {
    const time = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN
    if (Number.isFinite(time) && Number.isFinite(new Date(time).getTime())) { at = time; break }
  }
  if (at === undefined) {
    const first = await $.clock.now()
    at = messageTimes.get(key) ?? first
  }
  // Dwa równoległe pierwsze rysunki tego id nie zastępują sobie czasu.
  if (!messageTimes.has(key)) messageTimes.set(key, at)
  const date = new Date(at)
  const time = [date.getHours(), date.getMinutes()].map(value => String(value).padStart(2, '0')).join(':')
  return chatTree($.ui.resolve(e), { speaker, time, content })
}

async function journalShown($: EngineInterface, surface: string): Promise<boolean> {
  if (surface !== GRID_SURFACE) return false
  const now = await read($, modes)
  if (!now.czat || !now.sztolnia || (await read($, shaftTab)) !== 'dziennik') return false
  const shown = await shaftShown($, true)
  watchJournalVisibility($, shown)
  return shown
}

// ui.panes jest snapshotem, nie zależnością renderu. Zakładki silnika nie mają
// zdarzenia zmiany widoczności: jeden zegar sprawdza ją, póki czat ma Dziennik.
// Nie rysuje co tyk ani nie zapisuje stanu z ui.render; unieważnia tylko zmianę.
function watchJournalVisibility($: EngineInterface, visible: boolean): void {
  journalWatchRequests += 1
  if (journalWatch !== null) return
  const version = ++journalWatchVersion
  const tick = (delay = 250) => {
    journalWatch = $.clock.after(delay, async () => {
      if (version !== journalWatchVersion) return
      const requested = journalWatchRequests
      try {
        const now = await read($, modes)
        if (version !== journalWatchVersion) return
        const tab = await read($, shaftTab)
        if (version !== journalWatchVersion) return
        if (!now.czat || !now.sztolnia || tab !== 'dziennik') {
          // Aktywny render mógł wrócić, gdy ten tyk czekał na stary odczyt off.
          if (requested !== journalWatchRequests) tick()
          else journalWatch = null
          return
        }
        const shown = await shaftShown($, true)
        if (version !== journalWatchVersion) return
        if (shown !== visible) { visible = shown; $.ui.invalidate('ui.render') }
        tick()
      } catch (error) {
        if (version !== journalWatchVersion) return
        try { $.ui.log(`dziennik: widoczność: ${String(error)}`) } catch { /* Zegar ma odzyskać odczyt. */ }
        tick(1000)
      }
    })
  }
  tick()
}

// Panel i skrót pasa odświeżają utknięcie przy 15 min, potem na pełnych minutach.
// Nowy plan unieważnia poprzedni timer; zegar apelu pozostaje wspólną zależnością.
let boardClock = 0

function tickBoard($: EngineInterface, plan: KruxBoard, now: number): void {
  const revision = ++boardClock
  const starts = plan.tasks.flatMap(task => task.status === 'in_progress' && task.startedAt !== undefined ? [task.startedAt] : [])
  if (starts.length === 0) return
  const at = Math.min(...starts.map(start => start + Math.max(15, Math.floor((now - start) / 60_000) + 1) * 60_000))
  $.clock.after(Math.max(1, at - now), async () => {
    if (revision !== boardClock) return
    const current = await read($, board)
    const time = await $.clock.now()
    if (revision !== boardClock || !current.tasks.some(task => task.status === 'in_progress' && task.startedAt !== undefined)) return
    await update($, musterNow, () => time)
    if (revision === boardClock) tickBoard($, current, time)
  })
}

// Tablica po narzędziu, liczona w środku `update` (równoległe narzędzia nie gubią
// zapisów); bez zmiany bez zapisu, bo zapis przerysowuje Sztolnię. `TodoWrite`
// i przebieg testów dają nowy obiekt także przy tej samej treści.
async function boardStep($: EngineInterface, tool: string, input: Record<string, unknown>, result: unknown, call: BoardCall): Promise<KruxTestRun | null> {
  const now = await $.clock.now()
  const seen = await read($, board)
  const next = boardAfter(seen, tool, input, result, call, now)
  if (next === seen || JSON.stringify(next) === JSON.stringify(seen)) return next.test !== seen.test ? next.test : null
  let run: KruxTestRun | null = null
  let plan = seen
  let tasksChanged = false
  await update($, board, current => {
    const after = boardAfter(current, tool, input, result, call, now)
    if (after.test !== current.test) run = after.test
    tasksChanged = after.tasks !== current.tasks
    plan = after
    return after
  })
  if (tasksChanged) tickBoard($, plan, now)
  return run
}

// Zapełnienie kontekstu, limity i koszt dla Sztolni; bez odczytu zostaje stary.
let usageVersion = 0

async function refreshUsage($: EngineInterface): Promise<void> {
  const version = ++usageVersion
  try {
    const now = usageOf(await $.session.usage())
    if (version !== usageVersion) return
    // Bez zmiany bez zapisu: zapis przerysowuje Sztolnię.
    // Starszy odczyt nie cofa resetu, także gdy czekał na zapis stanu.
    await update($, usage, current => version !== usageVersion || JSON.stringify(current) === JSON.stringify(now) ? current : now)
    if (version !== usageVersion) return
    const automatic = now.limits.some(limit => limit.percentUsed >= 80)
    // Toast należy do żądania, które było najnowsze w chwili zapisu flagi: nowsze
    // żądanie widzi już zmienioną flagę, więc samo by go nie pokazało.
    let changed = false
    await update($, autoKonkret, current => {
      if (version !== usageVersion) return current
      changed = current !== automatic
      return automatic
    })
    if (changed) $.ui.toast(automatic ? 'Limit planu 80%: konkret włączony do resetu.' : 'Konkret automatyczny wyłączony: limity planu poniżej 80%.')
  } catch {
    // Brak odczytu to nie powód, by psuć narzędzie czy turę.
  }
}

// Zegar apelu: co sekundę zapis `musterNow`, który przerysowuje Sztolnię i skrót pasa,
// póki jakiś ork z apelu biega według zdarzeń i według listy silnika.
function tickMuster($: EngineInterface): void {
  if (ticking) return
  ticking = true
  $.clock.after(1000, async () => {
    ticking = false
    const ids = await runningIds($)
    const runs = (await read($, muster)).runs
    const now = await $.clock.now()
    // Ostatni zapis też przerysowuje: ork zabity bez `turn.complete` traci `●` i schodzi ze sceny.
    await update($, musterNow, () => now)
    // Brak listy kończy tykanie; panel ma wtedy ograniczoną czasem heurystykę.
    if (ids === null) return
    if (anyRunning({ runs: runs.filter(run => ids.has(run.agentId)) })) {
      tickMuster($)
      return
    }
    await crewStep($, { kind: 'running', ids })
  })
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    usageVersion += 1
    await loadSession($)
    texts = {
      persona: await readText($, 'persona'),
      konkret: await readText($, 'konkret'),
      flow: await readText($, 'flow'),
    }
    await warnAboutPlugin($)
    if ((await read($, modes)).sztolnia) await syncShaftPane($, true)
    // Reload modułu kasuje zegar apelu; orkowie z `$.state` biegną dalej.
    if (anyRunning(await read($, muster))) tickMuster($)
    tickBoard($, await read($, board), await $.clock.now())
    await refreshUsage($)
    await refreshGit($)
    try {
      await $.tool.register(THREAD_SPEC)
    } catch (error) {
      $.ui.log(`nie zarejestrować narzędzia wątków: ${String(error)}`)
    }
    try {
      await $.command.register({
        name: 'krux',
        description: 'Kuźnia Kruxa: persona, konkret, flow, animacje, kowal, czat, dziennik, horda',
        argumentHint: '[on|off|konkret|flow|animacje|kowal|sztolnia|czat|dziennik|zapisz <tekst>|raport|status]',
        immediate: true,
      })
    } catch (error) {
      $.ui.log(`nie zarejestrować /krux: ${String(error)}`)
    }
    return next(e)
  })

  // /clear, /resume i /branch zerują $.state, a session.start już nie wraca.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    usageVersion += 1
    await loadSession($)
    await update($, journal, () => EMPTY_JOURNAL)
    await update($, shaftTab, () => 'stan')
    await refreshGit($)
    return next(e)
  }).catch(($, e, next) => { hookFailure($, 'classic.SessionStart', next.error); return next(e) })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const now = await read($, modes)
    const sections = personaSections({ ...now, konkret: now.konkret || await read($, autoKonkret) }, texts)
    if (sections.length === 0) return composed
    return { sections: [...composed.sections, ...sections] }
  })

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    const extra = freshNotes(now).map(note => note.text)
    pendingNotes = []
    await restore($)
    if (fromPerson(e.origin)) {
      let returned = false
      await update($, seenAt, previous => { returned = previous !== null && now - previous >= 1_800_000; return now })
      if (returned) {
        const note = returnNote(await read($, board), await read($, threads), await read($, git))
        if (note) $.ui.toast(note)
      }
    }
    const phrase = fromPerson(e.origin) ? parsePhrase(e.text) : null
    if (phrase) {
      const { note } = await setModes($, phrase)
      if (note) extra.push(note)
    } else if ((await read($, modes)).persona) {
      const turn = await read($, turns)
      extra.push(anchorFor(turn, await read($, drift)))
      // Raport subagenta czy wiadomość innej sesji to nie prośba Morry: głos tak, format i horda nie.
      if (fromPerson(e.origin)) {
        // Prośba o ruch nieodwracalny: zamiast wstawki o hordzie linia o ostrzeżeniu, na końcu.
        const risk = riskHint(e.text)
        const chronicle = await read($, lore)
        const life = risk === null ? lifeNote(chronicle, turn) : null
        if (life) extra.push(life)
        // Nastrój z ostatniego zdarzenia, raz na zdarzenie. Decyzja o wydaniu, plan i ruch
        // nieodwracalny idą samymi faktami: tam nastrój przechylał wybór, więc przepada.
        const mood = moodNote(chronicle)
        if (mood) {
          let fresh = false
          await update($, moodSeen, seen => { fresh = seen !== mood.key; return mood.key })
          if (fresh && risk === null && promptKind(e.text) !== 'plan' && !asksRelease(e.text)) extra.push(mood.text)
        }
        const hint = formatHint(e.text)
        if (hint) extra.push(hint)
        if (risk) extra.push(risk)
      }
    }
    await update($, turns, count => turnsAfter(count, e.text))
    if (extra.length === 0) return next(e)
    return next({ ...e, context: [...(e.context ?? []), ...extra] })
  }).catch(($, e, next) => { hookFailure($, 'prompt.submit', next.error); return next(e) })

  // Kompakcja: streszczenie bez klimatu, a następna tura dostaje pełną kotwicę,
  // bo po streszczeniu w historii nie ma już przykładów głosu.
  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined || !(await read($, modes)).persona) return next(e)
    const instructions = [e.instructions, COMPACT_NOTE].filter(Boolean).join('\n\n')
    const result = await next({ ...e, instructions })
    if (result.messages !== undefined && e.trigger !== 'precompute') await update($, turns, () => 0)
    return result
  }).catch(($, e, next) => { hookFailure($, 'session.compact', next.error); return next(e) })

  on('command.run', { command: 'krux' }, async ($, e) => {
    const command = parseCommand(e.args)
    if (command.kind === 'status') return { text: statusLine(await read($, modes), await read($, autoKonkret)) }
    if (command.kind === 'help') return { text: `Krux nie znać „${command.unknown}”.\n${HELP}` }
    if (command.kind === 'save') {
      await restore($)
      let id: number | null = null
      await update($, threads, current => {
        const next = saveThread(current, command.text)
        if (next.next > current.next) id = current.next
        return next
      })
      $.ui.toast(id === null ? 'Notatka już w otwartych wątkach.' : `Wątek #${id} zapisany.`)
      return {}
    }
    if (command.kind === 'report') {
      await restore($)
      return { text: dayReport(await read($, git), await read($, board), await read($, threads), await read($, lore)) }
    }
    if (command.kind === 'journal') {
      await update($, shaftTab, () => 'dziennik')
      const opened = (await $.ui.panes()).some(pane => pane.id === SHAFT_PANE)
      if (!(await read($, modes)).sztolnia) await setModes($, { mode: 'sztolnia', on: true })
      // Ponowne open pokazuje także panel czekający na szerokość albo ukrytą kartę.
      if (!opened || !await shaftShown($, true)) await syncShaftPane($, true)
      return {}
    }
    if (command.kind === 'toggle') {
      const { next: now, on: isOn, note } = await setModes($, command.toggle)
      if (command.toggle.mode === 'sztolnia') await syncShaftPane($, isOn)
      const text = `${userLine(command.toggle.mode, isOn)}\n${statusLine(now, await read($, autoKonkret))}`
      return note ? { text, context: [note] } : { text }
    }
    const opened = await $.ui.open({ id: PANE, title: 'Kuźnia Kruxa', focus: true, closeOnEscape: true })
    if (opened.isPlaced) return {}
    return { text: `${statusLine(await read($, modes), await read($, autoKonkret))}\n${HELP}` }
  })

  // Subagent z głównej pętli wbiega na scenę; kumpla bierze z typu, potem z opisu zadania.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (e.parentAgentId !== undefined || result.agentId === undefined) return result
    const mate = mateOfType(e.subagentType) ?? mateIn(e.description, e.prompt)
    await crewStep($, { kind: 'spawn', member: { agentId: result.agentId, mate, scene: 'hammer', target: '' } })
    const agentId = result.agentId
    const now = await $.clock.now()
    await update($, muster, current => musterSpawn(current, agentId, mate, e.description, now))
    tickMuster($)
    return result
  }).catch(($, e, next) => { hookFailure($, 'agent.spawn', next.error); return next(e) })

  on('turn.start', async ($, e, next) => {
    if ('agentId' in e && e.agentId !== undefined) return next(e)
    const now = await $.clock.now()
    await update($, turnAt, () => now)
    plates.live = true
    plates.pending = true
    await update($, strikes, () => 0)
    await update($, activity, () => null)
    await update($, waiting, () => 0)
    return next(e)
  })

  // Obserwacja strumienia nie zmienia ani kawałków, ani wyniku modelu. Jej błąd
  // gubi tylko scenę: strumień silnika zamyka wyłącznie przerwanie konsumenta.
  // Dziś nic jej nie wywraca (silnik sprawdza kawałki między hakami i odpowiedzi
  // `$`), więc `try` to bezpiecznik na przyszły robak w czystym kodzie sceny.
  on('turn.step', async function* ($, e, next) {
    let last = ''
    const stream = next(e)
    let done = false
    try {
      for (;;) {
        const item = await stream.next()
        if (item.done) {
          done = true
          return item.value
        }
        const chunk = item.value
        const phase = chunk.kind === 'thinking' ? 'think' : chunk.kind === 'text' ? 'write' : null
        const kind = phase ?? (chunk.kind === 'tool' ? `tool:${chunk.name}` : '')
        if (kind && kind !== last) {
          last = kind
          const description = phase !== null ? describePhase(phase, e.index) : chunk.kind === 'tool' ? describeToolAhead(chunk.name, e.index) : null
          try {
            await noteStep($, e.agentId, description)
          } catch (error) {
            $.ui.log(`scena strumienia: ${String(error)}`)
          }
        }
        yield chunk
      }
    } finally {
      // Przerwanie konsumenta zamyka także strumień silnika.
      if (!done) await stream.return(undefined as never)
    }
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const startedAt = await $.clock.now()
    if (e.agentId === undefined) {
      const seed = await read($, sessionStrikes)
      await update($, activity, () => ({ ...describeTool(tool, input, seed), startedAt }))
      await update($, strikes, count => count + 1)
      await update($, sessionStrikes, count => count + 1)
    } else {
      await crewStep($, { kind: 'mate-tool', agentId: e.agentId, doing: { ...describeTool(tool, input, 0), startedAt } })
    }
    const awaits = e.agentId === undefined && workOf(tool, input) === 'agent'
    if (awaits) await update($, waiting, count => count + 1)
    let result: Awaited<ReturnType<typeof next>>
    try {
      result = await next(e)
    } finally {
      if (awaits) await update($, waiting, count => Math.max(0, count - 1))
    }
    if (result.deny === undefined) {
      const isError = result.isError === true
      const text = typeof result.text === 'string' ? result.text : ''
      const who = e.agentId === undefined ? 'Krux' : (await read($, muster)).runs.find(one => one.agentId === e.agentId)?.mate ?? 'ork'
      const at = await $.clock.now()
      await update($, journal, current => journalAfter(current, { tool, input, result: result.result, text: result.text, isError, tool_use_id: e.tool_use_id, agentId: e.agentId, who, at }))
      if (e.agentId === undefined) {
        const run = await boardStep($, tool, input, result.result, { text, isError, who: 'Krux' })
        await afterOwnTool($, tool, input, isError, text, run?.failures[0], result.result)
        await refreshUsage($)
      } else {
        const agentId = e.agentId
        // Z pętli kumpla testy i edycje: jego lista zadań to nie plan Kruxa. Imię z apelu,
        // bo ze sceny kumpel schodzi, gdy pas się zwęża.
        let run: KruxTestRun | null = null
        const work = workOf(tool, input)
        if (work === 'test' || work === 'edit') {
          const mate = (await read($, muster)).runs.find(one => one.agentId === agentId)?.mate
          run = await boardStep($, tool, input, result.result, { text, isError, who: mate ?? 'ork' })
        }
        await update($, muster, current => musterTool(current, agentId, tool, input))
        await afterMateTool($, agentId, tool, input, isError, text, run?.failures[0], result.result)
      }
      if (GIT_TOOLS.has(tool)) await refreshGit($)
    }
    return result
  }).catch(($, e, next) => { hookFailure($, 'tool.call', next.error); return next(e) })

  // Narzędzie wątków: model otwiera i zamyka wątki Sztolni, w odpowiedzi widzi otwarte z id.
  on('tool.call', { tool: THREAD_TOOL_NAME }, async ($, e) => {
    let now = EMPTY_THREADS
    await update($, threads, current => (now = threadsAfter(current, e as unknown as Record<string, unknown>)))
    // Wynik narzędzia moda to tekst: rekord obiektem silnik odrzuca.
    const report = threadsReport(now)
    return { result: report, text: report }
  }).catch(($, e, next) => { hookFailure($, 'tool.call', next.error); return next(e) })

  // Po turze miernik ocenia głos, a kronika notuje, kto z hordy się odezwał.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      await crewStep($, { kind: 'mate-done', agentId: e.agentId })
      $.clock.after(EVENT_HOLD_MS, () => void crewStep($, { kind: 'expire' }))
      const agentId = e.agentId
      const now = await $.clock.now()
      await update($, muster, current => musterDone(current, agentId, now))
      return next(e)
    }
    const now = await $.clock.now()
    let elapsed = 0
    await update($, turnAt, started => { elapsed = started === null ? 0 : now - started; return null })
    if (elapsed >= 300_000) $.ui.toast(`Krux skończyć po ${Math.floor(elapsed / 60_000)} min.`)
    await update($, activity, () => null)
    await refreshUsage($)
    await refreshGit($)
    if (e.reason === 'answer' && (await read($, modes)).persona) {
      // Poprawka jedzie raz: krótka odpowiedź nie świadczy o dryfie, więc stary werdykt gaśnie.
      const verdict = gauge(e.answer)
      await update($, drift, () => verdict)
      await update($, lore, now => recordAnswer(now, matesNamed(e.answer)))
    }
    return next(e)
  })

  // Słowo spinnera po orkowemu; to samo słowo przez całą turę.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!(await read($, modes)).persona || e.props.message !== null) return next(e)
    const scene = (await read($, activity))?.scene
    return next({ ...e, props: { ...e.props, word: spinnerWord(e.props.mode, e.props.word, scene) } })
  })

  // Etykiety trybów w stopce, obok tych, które rysuje Claude Code.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const now = await read($, modes)
    const automatic = await read($, autoKonkret)
    const labels = (['persona', 'konkret', 'flow', 'czat'] as const)
      .filter(mode => now[mode] || (mode === 'konkret' && automatic))
      .map(mode => (mode === 'persona' ? 'krux' : mode === 'konkret' && !now.konkret ? 'konkret (auto)' : mode))
    if (labels.length === 0) return next(e)
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, ...labels] } })
  })

  // Tabliczki w transkrypcie: kto mówi. Sam rysunek, model ich nie czyta.
  // Silnik stawia pusty wiersz nad wiadomością; tabliczka leży na nim
  // (`absolute`), więc nie dokłada własnego wiersza ani przerwy pod sobą.
  // Każdy blok odpowiedzi stoi przy kresce w kolorze Kruxa (`quote`: krawędź
  // z lewej), więc długa rozmowa dzieli się na bloki; pierwszy dostaje tabliczkę.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== GRID_SURFACE) return next(e)
    const now = await read($, modes)
    if (now.czat) return drawChat($, e, 'Krux', await next(e))
    if (!now.persona) return next(e)
    const theirs = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    const block = Box({ borderStyle: 'quote', borderColor: KRUX_COLOR, marginBottom: -1, children: [Box({ marginTop: -1, children: [theirs] })] })
    if (!e.props.isFirstOfReply || !claimPlate(e.requestId)) return block
    const plate = Box({ key: 'nameplate', position: 'absolute', top: 0, left: 0, children: [Text({ bold: true, color: KRUX_COLOR, children: [NAMEPLATE.krux] })] })
    return Box({ flexDirection: 'column', children: [block, plate] })
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface !== GRID_SURFACE) return next(e)
    const now = await read($, modes)
    if (now.czat) {
      // task.id łączy raport po tożsamości, from.name samo nie dowodzi subagenta.
      const id = e.props.task?.id
      if (id !== undefined) {
        const mate = await reportMate($, id)
        if (mate !== undefined) return drawChat($, e, mate, await next(e))
      }
      if (fromPerson(e.props.origin)) return drawChat($, e, 'Morra', await next(e))
      return next(e)
    }
    if (!fromPerson(e.props.origin) || !now.persona) return next(e)
    const theirs = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    const plate = Box({ key: 'nameplate', position: 'absolute', top: 0, left: 0, children: [Text({ bold: true, color: MORRA_COLOR, children: [NAMEPLATE.morra] })] })
    return Box({ flexDirection: 'column', children: [theirs, plate] })
  })

  // Złączenie po tool_use_id, nigdy po nazwie narzędzia ani requestId grupy.
  // Bez wpisu (np. narzędzie w toku albo stara historia) pełny wiersz silnika.
  // W czacie wiersze narzędzi stoją pod treścią dymków, nie pod awatarami.
  on('ui.render', { component: ['ToolUse', 'ToolResult', 'ToolGroup'] }, async ($, e, next) => {
    if (e.surface !== GRID_SURFACE || !(await read($, modes)).czat) return next(e)
    const table = $.ui.resolve(e)
    if (e.component === 'ToolGroup') {
      // Id zapisane przed `next`: wiersze grupy rysują się w jego trakcie.
      // Wiersz narysowany samodzielnie, zanim dołączył do grupy, rysuje się
      // od nowa (`invalidate`), żeby nie dostał wcięcia drugi raz.
      let joined = false
      for (const call of e.props.calls) {
        if (call.tool_use_id === undefined || groupedTools.has(call.tool_use_id)) continue
        groupedTools.add(call.tool_use_id)
        joined = true
      }
      const content = await next(e)
      if (joined) $.ui.invalidate('ui.render')
      return toolIndent(table, content)
    }
    if (groupedTools.has(e.props.tool_use_id)) return next(e)
    return toolIndent(table, await next(e))
  })

  on('ui.render', { component: ['ToolUse', 'ToolResult', 'ToolGroup'] }, async ($, e, next) => {
    if (!await journalShown($, e.surface)) return next(e)
    const entries = (await read($, journal)).entries
    const calls = e.component === 'ToolGroup' ? e.props.calls : [e.props]
    const matched = calls.map(call => call.tool_use_id === undefined ? undefined : entries.findLast(entry => entry.id === call.tool_use_id))
    // Grupa jest całością: brak choć jednego id nie może zgubić jego wyniku.
    if (matched.length === 0 || matched.some(entry => entry === undefined)) return next(e)
    const columns = e.viewport?.columns
    if (columns === undefined || !Number.isFinite(columns) || columns <= 0) return next(e)
    const table = $.ui.resolve(e)
    // Wiersz narzędzia już niesie linię dziennika; osobny wynik dałby ją drugi raz.
    if (e.component === 'ToolResult') return table.Box({ key: 'journal-result', height: 0 })
    return toolLine(table, matched as NonNullable<typeof matched[number]>[], columns - TOOL_INDENT)
  })

  // Pas nad promptem: podpis z lewej, za nim Krux i wysłani kumple, dymek nad
  // tym, kto ostatnio coś zrobił. Plan liczy `band.ts`; tu tylko stan i elementy.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface !== GRID_SURFACE) return next(e)
    const now = await read($, modes)
    if (!now.persona || !now.animacje) return next(e)
    const working = e.props.isWorking
    if (!working && !now.kowal) return next(e)
    const table = $.ui.resolve(e)
    const scene = await read($, crew)
    const members = await liveMembers($, scene.members)
    const input: BandInput = {
      working,
      activity: working ? await read($, activity) : null,
      strikes: await read($, strikes),
      total: await read($, sessionStrikes),
      moods: await read($, moods),
      members,
      held: scene.bubble,
      cues: scene.cues ?? [],
      waiting: (await read($, waiting)) > 0,
      still: await read($, still),
      now: await $.clock.now(),
      columns: e.props.bodyColumns,
      rows: e.props.maxRows,
      hasClient: 'Client' in table,
    }
    // Skrót Sztolni za płótnem, gdy jej panelu nie widać: zamknięty, czeka na
    // szerszy terminal (bez pytania silnik stawia go od 144 kolumn) albo stoi
    // za inną kartą. Zabiera pusty slot kumpla, ale nie spycha kumpla ze sceny
    // i nie zmienia wysokości pasa.
    const digestShown = !(await shaftShown($, now.sztolnia))
    if (digestShown) await read($, musterNow)
    const digestExtra = digestShown ? { git: await read($, git), threads: await read($, threads), now: input.now } : null
    const lines = digestExtra === null ? [] : shaftDigest(await read($, board), await read($, usage), digestExtra)
    let plan = bandPlan(input)
    if (lines.length > 0 && plan.stage !== null) {
      const narrow = bandPlan({ ...input, columns: input.columns - DIGEST_COLUMNS - CAPTION_GAP })
      if (narrow.stage !== null && narrow.stage.height === plan.stage.height && narrow.stage.props.slots > members.length) plan = narrow
    }
    const theirs = await next(e)
    const { Box, Text } = table
    // Kreska nad pasem oddziela go od odpowiedzi i zabiera jeden wiersz.
    const rule = plan.rule ? [Text({ dimColor: true, wrap: 'truncate-end', children: ['─'.repeat(Math.max(1, e.props.bodyColumns))] })] : []
    if (plan.stage === null || !('Client' in table)) {
      const caption = [[plan.verb, plan.target].filter(Boolean).join(' '), plan.tally].filter(Boolean).join(' · ')
      const line = Text({ dimColor: true, wrap: 'truncate-end', children: [`⚒ ${caption}`] })
      return Box({ flexDirection: 'column', children: [...rule, line, theirs] })
    }
    const caption = Box({
      flexDirection: 'column',
      width: CAPTION_COLUMNS,
      children: [
        Text({ bold: true, color: KRUX_COLOR, wrap: 'truncate-end', children: [plan.verb] }),
        ...(plan.target ? [Text({ dimColor: true, wrap: 'truncate-middle', children: [plan.target] })] : []),
        ...(plan.tally ? [Text({ dimColor: true, wrap: 'truncate-end', children: [plan.tally] })] : []),
      ],
    })
    const forge = table.Client({ key: 'forge', module: './forge.ts', props: plan.stage.props, width: plan.stage.width, height: plan.stage.height })
    const free = e.props.bodyColumns - CAPTION_COLUMNS - plan.stage.width - 2 * CAPTION_GAP
    // Skrót nie podnosi pasa: tyle linii, ile wierszy płótna, od najważniejszej.
    const digest = free >= DIGEST_COLUMNS ? lines.slice(0, plan.stage.height) : []
    const aside =
      digest.length === 0
        ? []
        : [
            // Skrót stoi przy prawej krawędzi pasa, najwyżej `DIGEST_MAX` kolumn szeroki.
            Box({
              key: 'digest-slot',
              flexDirection: 'row',
              justifyContent: 'flex-end',
              width: free,
              children: [
                Box({
                  key: 'digest',
                  flexDirection: 'column',
                  width: Math.min(free, DIGEST_MAX),
                  children: digest.map(line =>
                    Box({
                      key: line.key,
                      flexDirection: 'row',
                      columnGap: 1,
                      children: [
                        Text({ ...(line.color === undefined ? {} : { color: line.color }), children: [line.mark] }),
                        Box({ flexGrow: 1, flexShrink: 1, children: [Text({ dimColor: true, wrap: 'truncate-end', children: [line.text] })] }),
                      ],
                    }),
                  ),
                }),
              ],
            }),
          ]
    return Box({
      flexDirection: 'column',
      children: [...rule, Box({ flexDirection: 'row', columnGap: CAPTION_GAP, alignItems: 'flex-start', children: [caption, forge, ...aside] }), theirs],
    })
  })

  // Krzyżyk Morry na Sztolni gasi tryb, żeby panel nie wracał przy następnym starcie.
  on('ui.close', async ($, e, next) => {
    if (e.id === SHAFT_PANE && e.origin.kind === 'person' && (await read($, modes)).sztolnia) {
      await setModes($, { mode: 'sztolnia', on: false })
      $.ui.toast('Sztolnia zamknięta. Wraca przez /krux sztolnia.')
    }
    return next(e)
  }).catch(($, e, next) => { hookFailure($, 'ui.close', next.error); return next(e) })

  // Sztolnia: stan roboty. Plan, ostatni przebieg testów, horda w biegu,
  // kontekst i limity; drzewo buduje `shaft.ts`. Diff i drzewo zmian rysuje silnik (`/diff`).
  on('ui.render', { component: 'Pane', requestId: SHAFT_PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const tab = await read($, shaftTab)
    const tabs = shaftTabs(table, tab, async selected => { await update($, shaftTab, () => selected) })
    const now = await $.clock.now()
    if (tab === 'dziennik') return table.Box({ flexDirection: 'column', children: [tabs, journalTree(table, await read($, journal), e.props.bodyColumns, now)] })
    const plan = await read($, board)
    // Odczyt tyknięcia apelu zapisuje panel na przerysowanie co 1 s: czas orków płynie.
    await read($, musterNow)
    const ids = await runningIds($)
    const horde = musterRows(await read($, muster), now, ids, 6)
    const content = shaftTree(table, { board: plan, horde, usage: await read($, usage), git: await read($, git), threads: await read($, threads), now, columns: e.props.bodyColumns, rows: Math.max(0, e.props.scroll.bodyRows - 1) })
    return table.Box({ flexDirection: 'column', children: [tabs, content] })
  })

  // Panel /krux: kuźnia, tryby pod klawiszami 1–7, horda.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const now = await read($, modes)
    const isStill = (await read($, still)) || !now.animacje
    const mood = await read($, moods)
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const toggleButton = (mode: KruxMode, hotkey: string) =>
      Button({
        key: `toggle-${mode}`,
        label: `${mode}: ${now[mode] ? 'on' : 'off'}`,
        hotkey,
        plain: true,
        dimColor: !now[mode],
        onPress: async () => {
          const { on: isOn, note } = await setModes($, { mode, on: 'flip' })
          if (mode === 'sztolnia') await syncShaftPane($, isOn)
          if (note) {
            const at = await $.clock.now()
            pendingNotes = [...freshNotes(at), { text: note, at }].slice(-NOTES_LIMIT)
          }
          $.ui.toast(userLine(mode, isOn))
        },
      })
    const scale = e.props.bodyColumns >= forgeColumns('pane', 2) + 2 ? 2 : 1
    const art =
      e.surface === GRID_SURFACE && 'Client' in table && e.props.bodyColumns >= forgeColumns('pane', 1)
        ? [
            table.Client({
              key: `forge-pane-${scale}-${isStill ? 'still' : 'live'}`,
              module: './forge.ts',
              props: { variant: 'pane', scale, still: isStill, rest: false, slots: 1, bubbleRows: false, orcs: [{ key: 'krux', face: 'Krux', scene: 'hammer', mood: mood.faces.Krux }], bubble: null },
              width: forgeColumns('pane', scale),
              height: 3 * scale,
            }),
          ]
        : []
    return Box({
      flexDirection: 'column',
      gap: 1,
      children: [
        ...art,
        Box({
          flexDirection: 'column',
          children: [
            Text({ bold: true, children: ['Tryby'] }),
            // Przyciski zawijają się do szerokości panelu w równych komórkach.
            Box({
              flexDirection: 'row',
              flexWrap: 'wrap',
              columnGap: 1,
              children: MODES.map((mode, index) => Box({ key: `cell-${mode}`, width: MODE_CELL, children: [toggleButton(mode, String(index + 1))] })),
            }),
          ],
        }),
        Box({
          flexDirection: 'column',
          children: [
            Text({ bold: true, children: ['Horda'] }),
            ...MATES.map(mate =>
              Box({
                key: `orc-${mate}`,
                flexDirection: 'row',
                columnGap: 1,
                children: [Text({ color: ORC_COLOR, bold: true, children: [mate.padEnd(6)] }), Text({ dimColor: true, children: [ROSTER[mate].trade] })],
              }),
            ),
          ],
        }),
        Text({ dimColor: true, children: ['1–7 przełączają · Esc zamyka · skill hordy: /krux-mod:krux-horda'] }),
      ],
    })
  })
}
