import type { KruxEvent, KruxMood, KruxScene, KruxSpeaker } from '../types'
import { ASK_ACTS } from './acts/ask'
import { BUILD_ACTS } from './acts/build'
import { HAMMER_ACTS } from './acts/hammer'
import { HORN_ACTS } from './acts/horn'
import { PICK_ACTS } from './acts/pick'
import { PLAN_ACTS } from './acts/plan'
import { RAVEN_ACTS } from './acts/raven'
import { READ_ACTS } from './acts/read'
import { REST_ACTS } from './acts/rest'
import { SCOUT_ACTS } from './acts/scout'
import { SEAL_ACTS } from './acts/seal'
import { TEAR_ACTS } from './acts/tear'
import { TEST_ACTS, canaryResult } from './acts/test'
import { THINK_ACTS } from './acts/think'
import { TORCH_ACTS } from './acts/torch'
import { WRITE_ACTS } from './acts/write'
import { NAMELESS_APRON, dress } from './apron'
import type { Face } from './apron'
import { PALETTE } from './palette'
import { MATES, ROSTER } from './roster'
import { GESTURES } from './fidget'
import { terminalText } from './terminal-text'
import { H, STAND, W, actFrame, at, dots, draw, entryOf, finalLoop, flame, kitLead, leadIn, legAt, legDone, lerp, moodOf, noise, pad, restFrame, rotation, settleFrames, stander, walker } from './stage'
import type { Act, Frame, Layer, Leg, Route } from './stage'

// Siatki pikseli kowala i hordy. Czyste funkcje: płótno `forge.ts` tylko je rysuje.

// Jeden znak siatki = jeden piksel; komórka terminala niesie dwa piksele w pionie.
export { PALETTE }

// Scena na płótnie: robota ze `KruxScene` albo czekanie na hordę.
export type StageScene = KruxScene | 'lounge'

export const ACTS: Record<StageScene, readonly Act[]> = {
  hammer: HAMMER_ACTS,
  pick: PICK_ACTS,
  test: TEST_ACTS,
  seal: SEAL_ACTS,
  build: BUILD_ACTS,
  tear: TEAR_ACTS,
  think: THINK_ACTS,
  write: WRITE_ACTS,
  torch: TORCH_ACTS,
  horn: HORN_ACTS,
  read: READ_ACTS,
  plan: PLAN_ACTS,
  scout: SCOUT_ACTS,
  raven: RAVEN_ACTS,
  ask: ASK_ACTS,
  lounge: REST_ACTS,
}

const HEARTH = ['kkkkkkkkkk', 'k........k', 'k........k', 'k........k', 'kcccccccck', 'kkkkkkkkkk']

// Ogień paleniska: wiersz 3 to żar tuż nad węglem, wyżej płomień i iskry.
function hearthRow(frame: number, y: number): string {
  const row = HEARTH[y]!
  return [...row].map((cell, x) => (cell === '.' ? flame(frame, x, 3 - y) : cell)).join('')
}

// Mrugnięcie co 6 s; dumny ork nie mruga.
const BLINK_EVERY = 40

function finish(rows: Frame, variant: 'band' | 'pane', mood: KruxMood, blink: boolean, frame: number): string[] {
  const grid = pad(moodOf(rows, mood, blink))
  if (variant === 'band') return grid
  return grid.map((row, y) => `${row}..${hearthRow(frame, y)}`)
}

// Takt płótna: klatka co 150 ms.
export const FRAME_MS = 150
const SECOND = 1000 / FRAME_MS

// Czynność sceny przy robocie gra około 30 s, potem następna z tej samej sceny.
const WORK_FRAMES = Math.round(30 * SECOND)

// Czynności sceny, które gra ten ork: bez `who` każdy, z `who` tylko wymieniony fach.
export function actsFor(scene: StageScene, face: Face): Act[] {
  return ACTS[scene].filter(act => act.who === undefined || (face !== null && act.who.includes(face)))
}

function gesturesFor(face: Face) {
  return GESTURES.filter(gesture => gesture.who === undefined || (face !== null && gesture.who.includes(face)))
}

// Czekanie na hordę opowiada historię i idzie tylko naprzód: krótko fotel albo szezlong,
// dłużej ryby albo szezlong, potem znowu coś innego, na końcu ognisko. Progi pływają o ±25%.
const WAIT_STAGES = [20, 60, 180]

function waitLegs(seed: number): Leg[] {
  const named = (name: string) => REST_ACTS.find(act => act.name === name)!
  const pick = (names: string[], i: number) => names[Math.floor(noise(seed, i, 11) * names.length)]!
  const first = pick(['fotel', 'szezlong'], 0)
  const second = pick(['ryby', 'szezlong'].filter(name => name !== first), 1)
  const third = pick(['ryby', 'szezlong', 'fotel'].filter(name => name !== second), 2)
  const ends = WAIT_STAGES.map((seconds, i) => Math.round(seconds * (0.75 + 0.5 * noise(seed, i, 13)) * SECOND))
  return [
    { act: named(first), frames: ends[0]! },
    { act: named(second), frames: ends[1]! - ends[0]! },
    { act: named(third), frames: ends[2]! - ends[1]! },
    { act: named('ognisko'), frames: Infinity },
  ]
}

// Przy ognisku Krux zasypia po minucie.
const DOZE_FRAMES = Math.round(60 * SECOND)

// Trasa orka w scenie: `first` to czynność, od której rusza epizod roboty; `done` to odcinki
// czekania już zagrane, bo między nimi ork chodzi po nowy mebel.
export function routeOf(scene: StageScene, face: Face, seed: number, first = seed, done = 0): Route {
  const gestures = gesturesFor(face)
  const every = 3 + (seed % 2)
  if (scene === 'lounge') {
    const legs = waitLegs(seed)
    return { legs: legs.slice(Math.min(done, legs.length - 1)), cyclic: false, gestures, every, seed }
  }
  return { legs: rotation(actsFor(scene, face), first, WORK_FRAMES), cyclic: true, gestures, every, seed }
}

// Siatka pikseli jednej klatki: `step` liczy od początku sceny, `seed` wybiera pierwszą czynność,
// `frame` to zegar płótna dla szumu ognia i wody.
export function frameGrid(step: number, variant: 'band' | 'pane', scene: StageScene = 'hammer', mood: KruxMood = 'calm', seed = 0, frame = step, face: Face = 'Krux'): string[] {
  return finish(actFrame(routeOf(scene, face, seed), step, frame), variant, mood, step % BLINK_EVERY === BLINK_EVERY - 1, frame)
}

// ——— Oś czynności jednego orka ———
// Która scena gra od której klatki i co jeszcze schodzi do stójki. Płótno trzyma
// jedną oś na orka i pyta ją o siatkę; sloty i marsz to już sprawa płótna.

export type Track = {
  scene: StageScene
  // Kto gra: od fachu zależą czynności i gesty.
  face: Face
  // Klatka, od której gra obecna scena (po marszu i po zejściu poprzedniej).
  since: number
  // Klatka, w której ta scena przyszła: od niej liczy się przytrzymanie.
  setAt: number
  // Los epizodu: gesty, historia czekania.
  seed: number
  // Czynność, od której rusza epizod roboty.
  first: number
  // Odcinki czekania już zagrane.
  done: number
  // Klatki czynności sprzed scenki: liczą się do jej 30 s, inaczej scenki nie dałyby jej skończyć.
  spent: number
  // Czynność, od której ruszy następny epizod każdej sceny: epizody się różnią.
  memory: Partial<Record<StageScene, number>>
  // Przerwana scena, która jeszcze schodzi do stójki; `fast`, gdy czeka już nowa; `kept`, gdy kończy przy rekwizycie.
  // `face` z chwili przerwania: kumpel, który w trakcie zejścia dostał imię, schodzi tą samą trasą.
  leaving: { scene: StageScene; face: Face; seed: number; first: number; done: number; step: number; at: number; fast?: boolean; kept?: boolean } | null
  // Ork skończył i czeka na następny epizod: przy rekwizycie na ziemi albo z pustymi rękami.
  stops?: 'kit' | 'bare'
}

function routeOfTrack(track: Pick<Track, 'scene' | 'face' | 'seed' | 'first' | 'done'>): Route {
  return routeOf(track.scene, track.face, track.seed, track.first, track.done)
}

// Przed zmianą sceny: następny epizod tej sceny ruszy od czynności po obecnej.
function remember(track: Track, frame: number): Track['memory'] {
  if (track.scene === 'lounge') return track.memory
  return { ...track.memory, [track.scene]: track.first + legAt(routeOfTrack(track), Math.max(0, frame - track.since)) + 1 }
}

// Nowy epizod sceny: los z klatki, czynność z pamięci albo z losu. Dalszy ciąg czekania
// trzyma los, bo od niego zależą odcinki, i przechodzi do następnego.
export type Episode = Pick<Track, 'scene' | 'seed' | 'first' | 'done' | 'memory'>

export function nextEpisode(track: Track, scene: StageScene, key: string, frame: number): Episode {
  if (scene === 'lounge' && track.scene === 'lounge') return { scene, seed: track.seed, first: track.first, done: track.done + 1, memory: track.memory }
  const memory = remember(track, frame)
  const seed = seedOf(key, frame)
  return { scene, seed, first: memory[scene] ?? seed, done: 0, memory }
}

// Rekwizyt, którego wymaga epizod: po niego ork idzie, zanim zacznie.
export function episodeKit(episode: Episode, face: Face): Frame | undefined {
  return routeOf(episode.scene, face, episode.seed, episode.first, episode.done).legs[0]!.act.kit
}

// Rekwizyt, który stoi na ziemi przy orku czekającym na następny epizod.
export function trackKit(track: Track): Frame | undefined {
  return track.stops === 'kit' ? routeOfTrack(track).legs[0]!.act.kit : undefined
}

// Scena, której sprzęt jest poza ścianą: gra albo stoi przy orku.
export function trackOut(track: Track): StageScene | null {
  return track.stops === 'bare' || routeOfTrack(track).legs[0]!.act.kit === undefined ? null : track.scene
}

// Czynność zagrała swoje: pora odnieść rekwizyt i przynieść następny.
export function trackDue(track: Track, frame: number): boolean {
  return track.stops === undefined && frame >= track.since && legDone(routeOfTrack(track), frame - track.since + track.spent)
}

// Scena gra co najmniej 1,5 s: szybkie Read, Grep, Read nie mogą mrugać co klatkę.
export const HOLD_FRAMES = 10

// Ten sam ork w tej samej klatce zaczyna od tej samej czynności; różni orkowie od różnych.
function seedOf(key: string, frame: number): number {
  let hash = frame
  for (const char of key) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return hash
}

// Nowa oś w klatce `frame`: `'in-loop'` — ork już w pętli roboty (start płótna);
// liczba — tyle klatek marszu do slotu, potem stójka i wejście czynności.
export function trackStart(scene: StageScene, key: string, frame: number, start: 'in-loop' | number, face: Face = key === 'krux' ? 'Krux' : null): Track {
  const seed = seedOf(key, frame)
  const since = start === 'in-loop' ? frame - leadIn(routeOf(scene, face, seed)) : frame + start
  return { scene, face, since, setAt: frame, seed, first: seed, done: 0, spent: 0, memory: {}, leaving: null }
}

// Ork doszedł na stanowisko: scena rusza od stójki, nowym epizodem, także ta sama.
// `set`: przyniósł rekwizyt, więc rusza od klatki z rekwizytem na ziemi.
export function trackArrive(track: Track, episode: Episode, frame: number, set = false): Track {
  const { act } = routeOf(episode.scene, track.face, episode.seed, episode.first, episode.done).legs[0]!
  const { stops: _done, ...rest } = track
  return { ...rest, ...episode, spent: 0, since: set ? frame - kitLead(act) : frame, setAt: frame, leaving: null }
}

// Ork wraca do tej samej czynności przy rekwizycie, który został na ziemi.
export function trackResume(track: Track, frame: number): Track {
  const { act } = routeOfTrack(track).legs[0]!
  const { stops: _done, ...rest } = track
  return { ...rest, since: frame - (track.stops === 'kit' ? kitLead(act) : 0), setAt: frame, leaving: null }
}

// Rekwizyt wrócił na ścianę: ork stoi z pustymi rękami.
export function trackBare(track: Track): Track {
  return { ...track, stops: 'bare' }
}

// Nowa scena po przytrzymaniu: stara schodzi do stójki, dopiero potem wchodzi nowa.
// Póki ork maszeruje albo schodzi (`frame < since`), oś czeka, więc nic nie skacze.
// W bezruchu zmiana od razu, bez zejścia.
export function trackTo(track: Track, scene: StageScene, key: string, frame: number, still: boolean): Track {
  if (scene === track.scene) return track
  const { stops: _done, ...rest } = track
  if (still) return { ...rest, ...nextEpisode(track, scene, key, frame), since: frame, setAt: frame, leaving: null }
  if (frame < track.since || frame - track.setAt < HOLD_FRAMES) return track
  return { ...rest, ...settle(track, frame, true), ...nextEpisode(track, scene, key, frame), setAt: frame }
}

// Kumpel dostał imię: jego czynności się zmieniają, więc obecna schodzi do stójki,
// a scena rusza od nowa trasą fachu. W marszu albo w bezruchu podmiana od razu.
export function trackFace(track: Track, face: Face, key: string, frame: number, still: boolean): Track {
  if (face === track.face) return track
  if (still || frame < track.since) return { ...track, face }
  return { ...track, ...settle(track, frame, true), ...nextEpisode(track, track.scene, key, frame), face, setAt: frame }
}

// Krux drzemie przy ognisku, gdy czekanie na hordę trwa długo.
export function trackDozing(track: Track, frame: number): boolean {
  if (track.scene !== 'lounge' || frame < track.since) return false
  return (finalLoop(routeOfTrack(track), frame - track.since) ?? -1) >= DOZE_FRAMES
}

// Zejście w pośpiechu, gdy nowa scena już czeka: co druga klatka, stójka na końcu
// zostaje. Rekwizyt odjeżdża dwa razy szybciej, ale dalej odjeżdża, nie znika.
function hurried(frames: Frame[]): Frame[] {
  return frames.filter((_, i) => i % 2 === 1 || i === frames.length - 1)
}

function settleOf(left: NonNullable<Track['leaving']>): Frame[] {
  const frames = settleFrames(routeOfTrack(left), left.step, left.kept)
  return left.fast === true ? hurried(frames) : frames
}

// Obecna scena schodzi do stójki od klatki `frame`: `since` to klatka, w której ork stoi.
function settle(track: Track, frame: number, fast: boolean, kept = false): Pick<Track, 'since' | 'leaving'> {
  const left = { scene: track.scene, face: track.face, seed: track.seed, first: track.first, done: track.done, step: frame - track.since, at: frame, fast, kept }
  const back = settleOf(left).length
  return { since: frame + back, leaving: back > 0 ? left : null }
}

// Ork kończy robotę: scena schodzi do stójki, a `since` mówi, od której klatki może ruszyć w marsz.
// W marszu do slotu albo w trakcie zejścia oś już zmierza do stójki w `since`, więc zostaje.
// `kept`: w pokoju rekwizyt zostaje na ziemi, aż ork go odniesie.
export function trackOff(track: Track, frame: number, kept = false): Track {
  if (frame < track.since || track.stops !== undefined) return track
  if (!kept) return { ...track, ...settle(track, frame, false) }
  const route = routeOfTrack(track)
  const leg = legAt(route, frame - track.since)
  const settled = { ...track, ...settle(track, frame, false, true) }
  // Oś trzyma odcinek, przy którym ork stoi: rekwizyt na ziemi to rekwizyt tej czynności.
  const playing = track.scene === 'lounge' ? { done: track.done + leg } : { first: track.first + leg }
  return { ...settled, ...playing, spent: track.spent + frame - track.since, stops: route.legs[leg]!.act.kit === undefined ? 'bare' : 'kit' }
}

// Siatka orka w klatce: w bezruchu poza z rekwizytem (pierwsza klatka pętli), w trakcie
// zejścia przerwanej sceny jej klatka, potem obecna scena.
export function trackGrid(track: Track, frame: number, variant: 'band' | 'pane', mood: KruxMood, still: boolean): string[] {
  if (still) return finish(restFrame(routeOfTrack(track)), variant, mood, false, 0)
  const left = track.leaving
  if (left !== null && frame < track.since) {
    const rows = settleOf(left)[frame - left.at]
    if (rows !== undefined) return finish(rows, variant, mood, false, frame)
  }
  if (track.stops !== undefined) {
    const { act } = routeOfTrack(track).legs[0]!
    return finish(track.stops === 'kit' ? entryOf(act)[kitLead(act) - 1]! : STAND, variant, mood, false, frame)
  }
  const step = Math.max(0, frame - track.since)
  return finish(actFrame(routeOfTrack(track), step, frame), variant, mood, step % BLINK_EVERY === BLINK_EVERY - 1, frame)
}

export type Run = { text: string; color?: string; backgroundColor?: string }

// Wycinek wiersza po kolumnach: pod dymek, który leży na ścianie. Ciągi to znaki blokowe, po jednej kolumnie.
export function sliceRuns(runs: readonly Run[], from: number, to: number): Run[] {
  const out: Run[] = []
  let at = 0
  for (const run of runs) {
    const start = Math.max(from - at, 0)
    const end = Math.min(to - at, run.text.length)
    if (start < end) out.push({ ...run, text: run.text.slice(start, end) })
    at += run.text.length
  }
  return out
}

function scaleGrid(grid: readonly string[], scale: number): string[] {
  if (scale === 1) return [...grid]
  return grid.flatMap(row => {
    const wide = [...row].map(cell => cell.repeat(scale)).join('')
    return Array.from({ length: scale }, () => wide)
  })
}

function cellStyle(top: string, bottom: string): Run {
  const up = PALETTE[top]
  const down = PALETTE[bottom]
  if (up === undefined && down === undefined) return { text: ' ' }
  if (up === undefined) return { text: '▄', color: down }
  if (down === undefined || down === up) return { text: down === up ? '█' : '▀', color: up }
  return { text: '▀', color: up, backgroundColor: down }
}

// Wiersze komórek jako ciągi jednakowo pokolorowanych znaków: mniej elementów w drzewie.
export function runsOf(grid: readonly string[], scale: 1 | 2): Run[][] {
  const pixels = scaleGrid(grid, scale)
  const lines: Run[][] = []
  for (let y = 0; y < pixels.length; y += 2) {
    const top = pixels[y]!
    const bottom = pixels[y + 1] ?? ''
    const runs: Run[] = []
    for (let x = 0; x < top.length; x += 1) {
      const cell = cellStyle(top[x]!, bottom[x] ?? '.')
      const last = runs[runs.length - 1]
      if (last && last.color === cell.color && last.backgroundColor === cell.backgroundColor) {
        last.text += cell.text
      } else {
        runs.push(cell)
      }
    }
    lines.push(runs)
  }
  return lines
}

// Szerokość klatki bez jej rysowania: ork, a w panelu jeszcze dwie kolumny przerwy i palenisko.
export function forgeColumns(variant: 'band' | 'pane', scale: 1 | 2): number {
  return (variant === 'band' ? W : W + 2 + HEARTH[0]!.length) * scale
}

export const ORC_WIDTH = W
export const ORC_GAP = 2
export const BUBBLE_TEXT = 40

// Fartuchy hordy żyją w `apron.ts`; płótno i testy biorą je stąd razem z resztą sceny.
export type { Face }
export { dress }

// Dymek mówi kolorem fartucha; Krux iskrą.
export const SPEAKER_COLOR = {
  Krux: PALETTE.o!,
  ork: PALETTE[NAMELESS_APRON]!,
  ...Object.fromEntries(MATES.map(mate => [mate, PALETTE[ROSTER[mate].apron]!])),
} as Record<KruxSpeaker, string>

// Zielony i czerwień stanu roboty na tablicach: Sztolnia i dziennik dzielą je stąd.
// Czerwień to ta sama wartość co oko orka w palecie; zielonego paleta nie zna.
export const OK_COLOR = '#3fb950'
export const ALARM_COLOR = PALETTE.r!

export function bandColumns(count: number): number {
  return count * ORC_WIDTH + Math.max(0, count - 1) * ORC_GAP
}

// Płótno z dymkiem musi zmieścić dymek pełnej długości, nawet nad samym Kruxem.
export function canvasColumns(count: number, withBubble: boolean): number {
  return Math.max(bandColumns(count), withBubble ? BUBBLE_TEXT + 4 : 0)
}

// Lewa krawędź orka w miejscu składu: tak stoi w bezruchu i na najwęższym pasie.
export function slotX(slot: number): number {
  return slot * (ORC_WIDTH + ORC_GAP)
}

// Wspólna podłoga pasa: stanowiska pracy jako ułamek wolnej szerokości, palenisko
// na lewym końcu. Kuźnia przy ogniu, stół w środku, próba dalej, sztolnia z prawej.
type Station = 'forge' | 'table' | 'trial' | 'mine'

const STATION_AT: Record<Station, number> = { forge: 0, table: 0.3, trial: 0.55, mine: 1 }

const STATIONS: Record<StageScene, Station> = {
  hammer: 'forge', build: 'forge', seal: 'forge', horn: 'forge', lounge: 'forge',
  read: 'table', plan: 'table', think: 'table', write: 'table', ask: 'table',
  test: 'trial',
  pick: 'mine', tear: 'mine', torch: 'mine', scout: 'mine', raven: 'mine',
}

// Palenisko staje, gdy obok zostaje miejsce na wszystkich orków.
const HEARTH_ROOM = HEARTH[0]!.length + ORC_GAP

export function hasHearth(floor: number, slots: number): boolean {
  return slots > 1 && floor >= bandColumns(slots) + HEARTH_ROOM
}

// Pierwsza kolumna podłogi, na której ork może stanąć: palenisko nie wchodzi pod nogi.
export function floorStart(hearth: boolean): number {
  return hearth ? HEARTH_ROOM : 0
}

// Palenisko jako dekoracja podłogi, z tym samym ogniem co w panelu.
export function hearthProp(frame: number): Placed {
  return { rows: HEARTH.map((_, y) => hearthRow(frame, y)), x: 0 }
}

// Lewa krawędź orka na stanowisku tej sceny.
export function stationX(scene: StageScene, floor: number, hearth: boolean): number {
  const left = floorStart(hearth)
  return left + Math.round(STATION_AT[STATIONS[scene]] * Math.max(0, floor - ORC_WIDTH - left))
}

// Domy orków na podłodze: każdy jak najbliżej swojego stanowiska, bez nachodzenia
// na sąsiada. `want` równe wiąże `slot`, więc kolejność nie mruga między rysunkami.
export function floorHomes(orcs: readonly { key: string; want: number; slot: number }[], floor: number): Record<string, number> {
  const line = [...orcs].sort((a, b) => a.want - b.want || a.slot - b.slot)
  const step = ORC_WIDTH + ORC_GAP
  const xs = line.map(orc => orc.want)
  xs.forEach((x, i) => { xs[i] = Math.max(x, i === 0 ? 0 : xs[i - 1]! + step) })
  for (let i = xs.length - 1; i >= 0; i -= 1) xs[i] = Math.min(xs[i]!, i === xs.length - 1 ? floor - ORC_WIDTH : xs[i + 1]! - step)
  return Object.fromEntries(line.map((orc, i) => [orc.key, xs[i]!]))
}

// Czy dwie sceny mają sprzęt na tym samym meblu: wymiana bez chodzenia po podłodze.
export function sameStation(a: StageScene, b: StageScene): boolean {
  return STATIONS[a] === STATIONS[b]
}

// Co ork niesie ze stanowiska: stal z kuźni, zwój ze stołu, rudę ze sztolni.
const LOADS: Record<Station, Frame | null> = { forge: ['RR'], table: ['hph'], trial: null, mine: ['oS', 'SS'] }

// Ładunek przy dłoni orka idącego ze stanowiska tej sceny, po stronie marszu.
export function carried(scene: StageScene, x: number, rightward: boolean): Placed | null {
  const load = LOADS[STATIONS[scene]]
  if (load === null) return null
  return { rows: draw([load, 0, 3]), x: rightward ? x + 6 : x - load[0]!.length }
}

// Pokój za orkami: 12 pikseli wysokości, sprzęty na górze, orki na dole. Pas ma 6 wierszy,
// a piksele są kwadratowe, więc scena dostaje głębię bez zabierania ekranu i bez tła.
export const ROOM_ROWS = 12

// Meble na ścianie. `x` to odstęp od stanowiska; meble rozsuwa `wallSpots`, żeby się nie wpychały.
const WALL_PROPS: Record<Station, { x: number; rows: Frame }> = {
  forge: { x: 1, rows: ['', '', 'EEEEEEEEEEEEEE'] },
  table: { x: 2, rows: ['', '', 'EEEEEEEEEEEEE', '.UU.U..UU.U..', '.UU.U..UU.U..', 'EEEEEEEEEEEEE'] },
  trial: { x: 2, rows: ['', '', '', 'EEEEEEEE', 'ECCCCCCE', 'EEEEEEEE'] },
  mine: { x: 2, rows: ['..EEEEEEEE..', '.EEIIIIIIEE.', '.EIIIIIIIIE.', '.EIIIIIIIIE.', '.EIIIIIIIIE.', '.EIIIIIIIIE.'] },
}

const WALL_ORDER: readonly Station[] = ['forge', 'table', 'trial', 'mine']

const SCENE_OF: Record<Station, StageScene> = { forge: 'hammer', table: 'read', trial: 'test', mine: 'pick' }

// Miejsce sprzętu każdej sceny na meblu jej stanowiska: stąd ork go bierze, tu odnosi.
// `x`, `y` liczą się od lewego górnego rogu mebla; zdjęty sprzęt zostawia puste miejsce.
const STASH: Record<StageScene, { x: number; y: number; rows: Frame }> = {
  hammer: { x: 0, y: 3, rows: ['SS', '.h', '.h'] },
  build: { x: 3, y: 3, rows: ['.h', '.h', 'ss'] },
  seal: { x: 6, y: 3, rows: ['.h', 'SS', 'dd'] },
  horn: { x: 9, y: 3, rows: ['t.', '.t', 'tt'] },
  lounge: { x: 12, y: 3, rows: ['vv', 'vv', 'hh'] },
  read: { x: 0, y: 0, rows: ['BU', 'BU'] },
  plan: { x: 3, y: 0, rows: ['pp', 'hh'] },
  think: { x: 6, y: 0, rows: ['.y', 'ss'] },
  write: { x: 8, y: 0, rows: ['j.', 'nn'] },
  ask: { x: 11, y: 0, rows: ['pn', '.h'] },
  test: { x: 2, y: 4, rows: ['iWfd'] },
  pick: { x: 2, y: 3, rows: ['SS', '.h', '.h'] },
  tear: { x: 5, y: 4, rows: ['dd', 'hh'] },
  torch: { x: -1, y: 1, rows: [] },
  scout: { x: 8, y: 2, rows: ['S', 'h', 'h', 'h'] },
  raven: { x: 5, y: 1, rows: ['wy', 'ww'] },
}

const wallCache = new Map<string, Record<Station, number>>()

// Lewe krawędzie mebli: każdy jak najbliżej stanowiska, bez nachodzenia na sąsiada.
function wallSpots(floor: number, hearth: boolean): Record<Station, number> {
  const key = `${floor}:${hearth}`
  const known = wallCache.get(key)
  if (known) return known
  const wide = WALL_ORDER.map(station => Math.max(...WALL_PROPS[station].rows.map(row => row.length)))
  const xs = WALL_ORDER.map(station => stationX(SCENE_OF[station], floor, hearth) + WALL_PROPS[station].x)
  xs.forEach((x, i) => { xs[i] = i === 0 ? x : Math.max(x, xs[i - 1]! + wide[i - 1]! + 1) })
  for (let i = xs.length - 1; i >= 0; i -= 1) xs[i] = Math.max(0, Math.min(xs[i]!, i === xs.length - 1 ? floor - wide[i]! - 1 : xs[i + 1]! - wide[i]! - 1))
  const spots = Object.fromEntries(WALL_ORDER.map((station, i) => [station, xs[i]!])) as Record<Station, number>
  wallCache.set(key, spots)
  return spots
}

function wallX(station: Station, floor: number, hearth: boolean): number {
  return wallSpots(floor, hearth)[station]
}

// Prycze hordy pod ścianą, od paleniska po sztolnię: kumpel śpi przy swoim fachu.
const BEDS: readonly Exclude<Face, null>[] = ['Krux', 'Grom', 'Ochra', 'Piryt', 'Młot', 'Niuch', 'Lont']
const COT: Frame = ['', '', 'hhhhhhh', 'x.....x']
const COT_Y = 6
const SLEEPER: Frame = ['.gg....', 'gGgbbGG']

// Lewa krawędź pryczy; ork bez imienia wychodzi ze sztolni i tam wraca.
export function bedX(face: Face, floor: number, hearth: boolean): number {
  if (face === null) return depthSpot('pick', floor, hearth)
  const left = floorStart(hearth)
  const step = (floor - left) / BEDS.length
  return left + Math.max(0, Math.floor(step * BEDS.indexOf(face) + (step - COT[2]!.length) / 2))
}

// Meble i prycze, bez tła: pusta komórka zostaje kolorem terminala. Stałe dla szerokości, liczone raz.
const roomCache = new Map<string, string[][]>()

function roomBase(width: number, hearth: boolean): string[][] {
  const key = `${width}:${hearth}`
  const known = roomCache.get(key)
  if (known) return known
  const room = Array.from({ length: ROOM_ROWS }, () => Array.from({ length: width }, (): string => '.'))
  const stamp = (rows: Frame, left: number, top: number) => rows.forEach((row, y) => [...row].forEach((cell, dx) => {
    if (cell !== '.' && room[top + y]?.[left + dx] !== undefined) room[top + y]![left + dx] = cell
  }))
  for (const station of WALL_ORDER) stamp(WALL_PROPS[station].rows, wallX(station, width, hearth), 0)
  for (const face of BEDS) stamp(COT, bedX(face, width, hearth), COT_Y)
  roomCache.set(key, room)
  return room
}

// Wózek wytacza się ze sztolni ku widzowi i wraca: rośnie jak ork w drodze z głębi.
const CART: readonly Frame[] = [['CC', 'YY'], ['CCC', 'YYY', 'C.C'], ['CCCC', 'YYYY', 'YYYY', 'C..C']]
const CART_EVERY = 160
const CART_TRIP = 20
const RAT_EVERY = 240
const RAT_TRIP = 48
// Pył z zawału: tyle ziaren spada ze stropu.
const DUST_GRAINS = 9
// Tyle pieczęci mieści się na ścianie.
const MAX_SEALS = 12

// Co dzieje się w pokoju samo: dym, kanarek, wózek, szczur. Fazy tak dobrane, że w klatce 0
// (bezruch) nic nie stoi w pół kroku.
function roomLife(room: string[][], width: number, frame: number, hearth: boolean, state: RoomState): void {
  const put = (x: number, y: number, cell: string) => { if (room[y]?.[x] !== undefined) room[y]![x] = cell }
  if (hearth) {
    for (let i = 0; i < 3; i += 1) {
      const y = 5 - ((Math.floor(frame / 2) + i * 2) % 5)
      put(4 + ((y + i) % 2), y, 'V')
    }
  }
  const cage = wallX('trial', width, hearth) + 1
  for (const dx of [0, 1, 2, 3, 4]) put(cage + dx, 1, 'C')
  put(cage, 2, 'C')
  put(cage + 4, 2, 'C')
  // Kanarek to monitoring: przy czerwonych testach szarzeje i przestaje skakać.
  if (state.red) put(cage + 2, 2, 'V')
  else put(cage + 1 + (state.alive ? Math.floor(frame / 4) % 3 : 1), 2, 'Z')
  // Horda śpi na pryczach, gdy nie ma jej w robocie.
  for (const face of state.absent) {
    const left = bedX(face, width, hearth)
    const shade = face === 'Krux' ? 'b' : String(MATES.indexOf(face) + 1)
    SLEEPER.forEach((row, dy) => [...row].forEach((cell, dx) => { if (cell !== '.') put(left + dx, COT_Y + dy, cell === 'b' ? shade : cell) }))
    if (state.alive && face !== 'Krux' && (frame + left) % 24 < 8) put(left - 1, COT_Y - 1 - Math.floor(((frame + left) % 24) / 4), 'm')
  }
  // Runa snu nad Kruxem, gdy cały pokój dawno zamarł.
  if (state.nap) {
    const left = bedX('Krux', width, hearth)
    ;(['mmm', '..m', '.m.'] as const).forEach((row, dy) => [...row].forEach((cell, dx) => { if (cell !== '.') put(left + 8 + dx, COT_Y - 2 + dy, cell) }))
  }
  // Pieczęcie: każdy commit sesji to czerwona kropka wosku na ścianie, na wolnym kamieniu.
  const wax = wallX('table', width, hearth) + 14
  for (let i = 0; i < Math.min(state.seals, MAX_SEALS); i += 1) {
    const cell = room[5]?.[wax + 2 * i]
    if (cell === '.') put(wax + 2 * i, 5, 'd')
  }
  // W spoczynku zegar stoi: wózek i szczur nie zamarzają w pół drogi.
  if (!state.alive) return
  const trip = (frame + 60) % CART_EVERY
  const way = trip < CART_TRIP ? trip : trip < 2 * CART_TRIP ? 2 * CART_TRIP - trip : -1
  if (way >= 0) {
    const cart = CART[Math.min(CART.length - 1, Math.floor((way * CART.length) / CART_TRIP))]!
    const left = wallX('mine', width, hearth) + 6 - Math.floor(cart[0]!.length / 2)
    cart.forEach((row, dy) => [...row].forEach((cell, dx) => { if (cell !== '.') put(left + dx, 4 + dy, cell) }))
  }
  const run = (frame + 100) % RAT_EVERY
  if (run < RAT_TRIP) {
    const x = width - 1 - run * Math.ceil(width / RAT_TRIP)
    put(x, 11, 'C')
    put(x + 1, 11, 'C')
  }
}

// Co pokój wie o robocie: zdarzenie, którym żyje Krux, ruch, czerwone testy, pieczęcie, kto śpi,
// czyj sprzęt zszedł ze ściany.
export type RoomState = { feel: { kind: KruxEvent | 'handoff'; age: number } | null; alive: boolean; red: boolean; seals: number; absent: readonly Exclude<Face, null>[]; phase: DayPhase; taken: readonly StageScene[]; nap: boolean }

const ROOM_AT_REST: RoomState = { feel: null, alive: true, red: false, seals: 0, absent: [], phase: 'day', taken: [], nap: false }

// Okienko na ścianie: drewniana rama, w środku niebo o tej porze; nocą gwiazda.
function roomSky(room: string[][], width: number, hearth: boolean, phase: DayPhase): void {
  // Za wejściem do sztolni, gdzie nic innego nie wisi; bez miejsca okienka nie ma.
  const left = wallX('mine', width, hearth) + 13
  if (left + 6 > width) return
  for (let dx = 0; dx < 6; dx += 1) {
    for (let y = 0; y < 3; y += 1) {
      const frame = dx === 0 || dx === 5 || y === 0 || y === 2
      if (room[y]?.[left + dx] === '.') room[y]![left + dx] = frame ? 'E' : SKY[phase]
    }
  }
  if (phase === 'night' && room[1]?.[left + 2] !== undefined) room[1]![left + 2] = 'j'
}

// Pokój w klatce `frame`: pochodnie, życie pokoju i reakcja na zdarzenie kroniki.
export function roomGrid(width: number, frame: number, hearth: boolean, state: Partial<RoomState> = {}): string[] {
  const full = { ...ROOM_AT_REST, ...state }
  const { feel } = full
  const room = roomBase(width, hearth).map(row => [...row])
  for (const scene of Object.keys(STASH) as StageScene[]) {
    if (full.taken.includes(scene)) continue
    const { x, y, rows } = STASH[scene]
    const left = wallX(STATIONS[scene], width, hearth) + x
    rows.forEach((row, dy) => [...row].forEach((cell, dx) => { if (cell !== '.' && room[y + dy]?.[left + dx] !== undefined) room[y + dy]![left + dx] = cell }))
  }
  roomSky(room, width, hearth, full.phase)
  roomLife(room, width, frame, hearth, full)
  const red = feel?.kind === 'test-fail' || feel?.kind === 'build-fail' || feel?.kind === 'zawał'
  const bright = feel?.kind === 'test-pass' || feel?.kind === 'build-pass' || feel?.kind === 'commit'
  // Pierwsza pochodnia świeci między kuźnią a regałem, druga przy wejściu do sztolni:
  // tę ork bierze ze sobą, gdy idzie szukać.
  const between = Math.round((wallX('forge', width, hearth) + WALL_PROPS.forge.rows[2]!.length + wallX('table', width, hearth)) / 2)
  for (const x of [between, wallX('mine', width, hearth) - 1]) {
    if (x >= width || x < 0) continue
    room[3]![x] = 'E'
    room[4]![x] = 'E'
    if (x !== between && full.taken.includes('torch')) continue
    room[2]![x] = red ? 'R' : bright ? 'Z' : (frame + x) % 3 === 0 ? 'Z' : 'Q'
    room[1]![x] = red ? 'Q' : bright ? 'Z' : (frame + x) % 4 === 1 ? 'Q' : room[1]![x]!
  }
  if (feel?.kind === 'zawał' || feel?.kind === 'tear') {
    for (let i = 0; i < DUST_GRAINS; i += 1) {
      const y = 1 + (feel.age + i) % 5
      const x = Math.round(((i * 37 + 11) % 100) * width / 100)
      if (room[y]?.[x] !== undefined) room[y]![x] = 'q'
    }
  }
  return room.map(row => row.join(''))
}

// Prostokąt pikseli wklejony w siatkę; '.' przepuszcza to, co pod spodem.
export function paint(grid: readonly string[], rows: readonly string[], x: number, y: number): string[] {
  const out = grid.map(row => [...row])
  rows.forEach((row, dy) => [...row].forEach((cell, dx) => {
    if (cell !== '.' && out[y + dy]?.[x + dx] !== undefined) out[y + dy]![x + dx] = cell
  }))
  return out.map(row => row.join(''))
}

// Ork w głębi: im dalej, tym mniejszy i wyżej na podłodze. Stopy na wierszu `FEET`.
const FAR_ORCS: readonly (readonly [Frame, Frame])[] = [
  [['.ggg.', 'grgrg', 'bbbbb', '.bGb.', '.G.G.'], ['.ggg.', 'grgrg', 'bbbbb', '.bGb.', '..G..']],
  [['.gg.', 'rggr', 'bbbb', 'G..G'], ['.gg.', 'rggr', 'bbbb', '.GG.']],
  [['rgr', 'bbb', 'G.G'], ['rgr', 'bbb', '.G.']],
]
const FEET = [10, 8, 7] as const

export type Far = { rows: readonly string[]; x: number; y: number }

function levelOf(depth: number): number {
  return Math.max(1, Math.ceil(depth * FAR_ORCS.length)) - 1
}

// Ork w drodze przez głąb pokoju: `depth` 0 tuż przy widzu, 1 przy ścianie.
export function farPose(depth: number, x: number, step: number, face: Face): Far {
  const level = levelOf(depth)
  const rows = FAR_ORCS[level]![step % 2]!
  return { rows: dress(rows, face), x, y: FEET[level]! - rows.length + 1 }
}

// Wstawanie z pryczy: otwiera oczy, siada, staje przy niej.
const RISING: readonly Frame[] = [['.gg....', 'grgbbGG'], ['gg.', 'rg.', 'bbG']]
export const RISE_FRAMES = RISING.length + 1

export function risePose(t: number, bed: number, face: Face): Far {
  const rows = RISING[t]
  return rows === undefined ? farPose(1, bed, t, face) : { rows: dress(rows, face), x: bed, y: COT_Y + 2 - rows.length }
}

// Wyprawa do ściany: wejście, chwila przy sprzęcie, powrót.
const ERRAND_IN = 7
const ERRAND_HOLD = 3
export const ERRAND_FRAMES = 2 * ERRAND_IN + ERRAND_HOLD
// Przy sprzęcie, w tej klatce wyprawy, ork odkłada jedno i bierze drugie.
export const ERRAND_SWAP = ERRAND_IN + Math.floor(ERRAND_HOLD / 2)

// Kolumna orka przy miejscu sprzętu tej sceny na ścianie.
export function depthSpot(scene: StageScene, floor: number, hearth: boolean): number {
  const station = STATIONS[scene]
  return wallX(station, floor, hearth) + STASH[scene].x - 1
}

// Rekwizyt zmniejszony do `size` wierszy: komórka bierze pierwszy niepusty piksel swojego pola.
function shrunk(kit: Frame, size: number): string[] {
  const grid = pad(kit)
  const ratio = H / size
  return Array.from({ length: size }, (_, y) => Array.from({ length: Math.ceil(W / ratio) }, (_, x) => {
    const cells = grid.slice(Math.floor(y * ratio), Math.ceil((y + 1) * ratio)).flatMap(row => [...row.slice(Math.floor(x * ratio), Math.ceil((x + 1) * ratio))])
    return cells.find(cell => cell !== '.') ?? '.'
  }).join(''))
}

export type ErrandRoute = { spot: number; back: number; took?: Frame; brings?: Frame }

// Poza w klatce `t` wyprawy: do sprzętu i z powrotem, wielkość z głębokości, rekwizyt razem z orkiem.
export function errandPose(t: number, from: number, route: ErrandRoute, face: Face): Far[] {
  const going = t < ERRAND_IN
  const holding = !going && t < ERRAND_IN + ERRAND_HOLD
  const depth = going ? t / ERRAND_IN : holding ? 1 : Math.max(0, ERRAND_FRAMES - t) / ERRAND_IN
  const x = holding ? lerp(route.spot, route.back, (t - ERRAND_IN) / ERRAND_HOLD) : lerp(from, going ? route.spot : route.back, depth)
  const orc = farPose(depth, x, t, face)
  const kit = t < ERRAND_SWAP ? route.took : route.brings
  return kit === undefined ? [orc] : [{ rows: shrunk(kit, orc.rows.length), x, y: orc.y }, orc]
}

// Scenka dwóch orków: gospodarz z lewej, gość z prawej, twarzą w twarz, między nimi miejsce na rekwizyt.
export type DuetKind = 'fence' | 'pass' | 'highfive' | 'argue'
export const DUET_GAP = 14
export const DUET_FRAMES = 32

// Gość patrzy w lewo: lustro stójki z ręką; rama 8 kolumn, więc ręka wchodzi między orków.
function facing(look: 'mid' | 'right', arm: string): string[] {
  return pad(stander(look, arm)).map(row => [...row.padEnd(8, '.').slice(0, 8)].reverse().join('').replace(/\.+$/u, ''))
}

type DuetFrame = { host: string[]; guest: string[]; prop: Frame }

const RIGHT = (arm: string) => pad(stander('right', arm))
const HIGH_HOST = pad(draw([stander('right'), 0, 0], at('g', 6, 2), at('g', 7, 1)))
const raised = (rows: readonly string[]): string[] => rows.map(row => [...row.padEnd(8, '.').slice(0, 8)].reverse().join('').replace(/\.+$/u, ''))
const HIGH_GUEST = raised(pad(draw([stander('right'), 0, 0], at('g', 6, 2), at('g', 7, 1))))

// Klatka scenki `t`. Współrzędne rekwizytu od lewej krawędzi gospodarza.
export function duetPose(kind: DuetKind, t: number): DuetFrame {
  const step = Math.floor(t / 3)
  if (kind === 'fence') {
    const up = step % 2 === 1
    const low = draw(at('s', 8, 3), at('s', 9, 3), at('S', 10, 3), at('S', 11, 3))
    const high = draw(at('s', 8, 2), at('s', 9, 1), at('S', 11, 2), at('S', 10, 1), at('y', 9, 0), at('o', 10, 0))
    return { host: RIGHT('gg'), guest: facing('right', 'gg'), prop: up ? high : low }
  }
  if (kind === 'pass') {
    const x = Math.round(8 + Math.max(0, Math.min(1, (t - 8) / 14)) * 2)
    return { host: RIGHT(t < 22 ? 'gg' : ''), guest: facing('right', t > 8 ? 'gg' : ''), prop: t < 26 ? draw([['RR'], x, 3]) : [] }
  }
  if (kind === 'highfive') {
    const touch = step % 3 === 2
    return { host: touch ? HIGH_HOST : RIGHT(''), guest: touch ? HIGH_GUEST : facing('right', ''), prop: touch ? draw(at('y', 9, 0), at('y', 10, 1), at('o', 8, 1)) : [] }
  }
  const shout = step % 2 === 0
  return { host: shout ? HIGH_HOST : RIGHT('g'), guest: shout ? facing('right', 'g') : HIGH_GUEST, prop: draw(at('R', 8 + (step % 3), 1), at('y', 10 - (step % 3), 0)) }
}

// Pora dnia z godziny: w okienku na ścianie widać niebo.
export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk'

export function dayPhase(hour: number): DayPhase {
  if (hour >= 22 || hour < 5) return 'night'
  if (hour < 8) return 'dawn'
  return hour < 18 ? 'day' : 'dusk'
}

const SKY: Record<DayPhase, string> = { night: '7', dawn: '8', day: '9', dusk: '0' }

// Ork w drodze po podłodze: nogi na zmianę.
export function walkerRows(step: number, face: Face): string[] {
  return dress(walker(step), face)
}

export type Placed = { rows: readonly string[]; x: number }

// Scena o stałej szerokości: każdy ork wklejony od swojego x, poza płótnem ucięty.
export function stageGrid(placed: readonly Placed[], width: number): string[] {
  const canvas = Array.from({ length: H }, () => Array.from({ length: width }, () => '.'))
  for (const orc of placed) {
    orc.rows.forEach((row, y) => {
      ;[...row].forEach((cell, dx) => {
        const x = orc.x + dx
        if (cell !== '.' && x >= 0 && x < width) canvas[y]![x] = cell
      })
    })
  }
  return canvas.map(row => row.join(''))
}

// Trzy wiersze dymka nad slotem `index`, każdy dokładnie na szerokość płótna.
export function bubbleLines(text: string, index: number, width: number): string[] {
  return bubbleAt(text, slotX(index), width)
}

// Dymek nad orkiem stojącym od kolumny `x`; idzie za nim po podłodze.
export function bubbleAt(text: string, x: number, width: number): string[] {
  const body = terminalText(text, BUBBLE_TEXT)
  const inner = body.columns + 2
  const box = inner + 2
  const center = x + 2
  const left = Math.max(0, Math.min(width - box, center - Math.floor(box / 2)))
  const tail = Math.max(1, Math.min(inner, center - left))
  const place = (line: string) => `${' '.repeat(left)}${line}${' '.repeat(Math.max(0, width - left - box))}`
  return [
    place(`╭${'─'.repeat(inner)}╮`),
    place(`│ ${body.text} │`),
    place(`╰${'─'.repeat(tail - 1)}┬${'─'.repeat(inner - tail)}╯`),
  ]
}

// ——— Znaki dla płótna ———
// Reakcja na zdarzenie kroniki gra na wierzchu każdej czynności przez `CUE_FRAMES`
// klatek, w prostokącie orka, który robił robotę. Wszystko wlatuje od krawędzi,
// rośnie albo rozwiewa się dymem: nic nie wyskakuje i nie znika skokiem.

export const CUE_FRAMES = 14

// Fajerwerk: smuga w górę, gwiazdka, iskry gasną w locie.
function firework(x: number, t: number): Layer[] {
  if (t < 0 || t >= 8) return []
  if (t < 4) return [at('y', x, 5 - t), at('o', x, 6 - t)]
  if (t < 6) return [[['y.y', '.y.', 'y.y'], x - 1, 0]]
  return t === 6 ? dots([[x - 1, 1], [x + 1, 1], [x, 2]], 'o') : dots([[x - 1, 2], [x + 1, 3]], 'o')
}

// Błysk zahartowanej stali: gwiazdka rośnie i maleje.
const GLINT: readonly Frame[] = [['j'], ['.j.', 'jyj', '.j.'], ['..j..', '.jyj.', 'jyyyj', '.jyj.', '..j..']]

function glint(t: number): Layer[] {
  const size = [0, 1, 1, 2, 2, 2, 1, 1, 0][t]
  const spark = (x: number, y: number, from: number) => (t >= from && t < from + 3 ? [at('i', x, y)] : [])
  if (size === undefined) return []
  return [[GLINT[size]!, 16 - size, 2 - size], ...spark(11, 1, 2), ...spark(20, 3, 4)]
}

// Robak wpełza z prawej, przebiera nogami i smrodzi, przełazi pod nogami i znika z lewej.
function bug(t: number): Layer[] {
  if (t < 1) return []
  const x = 21 - 2 * (t - 1)
  return [[['Rdd'], x, 4], [[t % 2 === 0 ? 'S.S' : '.S.'], x, 5], at('f', x + 2 - (t % 2), 2 + (t % 2))]
}

// Piec pluje: kłęby sadzy szarzeją w górze, żar leci w lewo.
function soot(t: number): Layer[] {
  const out: Layer[] = []
  for (const start of [0, 3, 6]) {
    const age = t - start
    if (age < 0 || age > 5) continue
    out.push([[age < 4 ? (age < 2 ? 'cc' : 'mm') : 'm'], 18 + Math.floor(age / 3), 5 - age])
  }
  if (t >= 1 && t <= 4) out.push(at('R', 16 - t, 4 - Math.floor(t / 2)))
  return out
}

// Pieczęć z wosku spada z góry, złoty odcisk błyska, potem odjeżdża w prawo.
function waxSeal(t: number): Layer[] {
  const seal = (x: number, y: number, mark: boolean): Layer[] => [[['dd', 'dd'], x, y], ...(mark ? [at('y', x, y)] : [])]
  if (t < 5) return seal(16, t - 1, false)
  if (t < 10) return seal(16, 4, t >= 6)
  return seal(16 + 2 * (t - 9), 4, true)
}

// Wybuch: iskra, ognista kula, dym idzie w górę i rzednie.
const BLAST: readonly Frame[] = [
  ['y'],
  ['.o.', 'oyo', '.o.'],
  ['.oRo.', 'oyyyo', '.oRo.'],
  ['..o..', '.RyR.', 'oyyyo', '.RyR.', '..o..'],
  ['.m.m.', 'mRoRm', '.mmm.'],
]

function blast(t: number): Layer[] {
  if (t === 0) return [at('y', 16, 3)]
  if (t <= 2) return [[BLAST[t]!, 16 - t, 2]]
  if (t <= 4) return [[BLAST[t]!, 14, 1]]
  const k = t - 5
  if (k > 5) return []
  const cloud = k < 2 ? ['.mmm.', 'mmmmm'] : k < 4 ? ['.m.m.', 'm.m.m'] : ['..m..', 'm...m']
  return [[cloud, 14, 1 - Math.floor(k / 2)]]
}

// Zawał: kamienie lecą ze stropu, o ziemię rozbijają się w pył.
function rockfall(t: number): Layer[] {
  const out: Layer[] = []
  for (const [x, start] of [[10, 0], [14, 2], [18, 4], [12, 5]] as const) {
    const age = t - start
    if (age >= 0 && age < 6) out.push([['kq'], x, age])
    else if (age >= 6 && age < 8) out.push([['m.m'], x - 1, 11 - age])
  }
  return out
}

function cueLayers(kind: KruxEvent, t: number): Layer[] {
  switch (kind) {
    case 'test-pass':
      return [...firework(11, t), ...firework(15, t - 3), ...firework(19, t - 5)]
    case 'build-pass':
      return glint(t)
    case 'test-fail':
      return bug(t)
    case 'build-fail':
      return soot(t)
    case 'commit':
      return waxSeal(t)
    case 'tear':
      return blast(t)
    case 'zawał':
      return rockfall(t)
  }
}

// Lewa krawędź stojącego orka w jego klatce: szczęka w trzecim wierszu, pod nią
// fartuch, niżej nogi na ziemi. `null` w pozach leżących, siedzących i pochylonych:
// sama szczęka nad fartuchem pasuje też do Kruxa na szezlongu i w fotelu.
function standingX(grid: readonly string[]): number | null {
  const jaw = grid.findIndex(row => /t[gG]{2}t/u.test(row))
  if (jaw !== 2) return null
  const x = grid[jaw]!.search(/t[gG]{2}t/u) - 1
  if (x < 0 || x + 6 >= W || [...grid[3]!.slice(x, x + 6)].filter(cell => cell === 'b').length < 4) return null
  const legs = grid[4]!.slice(x, x + 6)
  const standing = (legs === 'bbbbbb' || (legs[1] === 'b' && legs[4] === 'b')) && grid[5]!.slice(x, x + 6).includes('G')
  return standing ? x : null
}

// Usuwamy wyłącznie ciało w jego prostokącie, nie sprzęt w scenie.
function withoutBody(grid: readonly string[], x: number): string[] {
  return grid.map(row => [...row].map((cell, i) => (i >= x && i < x + 6 && 'gGrtyb'.includes(cell) ? '.' : cell)).join(''))
}

// Krótka reakcja ciała zachowuje twarz i rekwizyty. Przy pozach leżących
// lub pochylonych nie prostujemy orka skokiem: pozostają efekty zdarzenia.
function reactionBody(rows: readonly string[], kind: KruxEvent, t: number): string[] {
  const grid = pad(rows)
  const x = standingX(grid)
  if (x === null || t === 0 || t >= 12) return grid
  const happy = kind === 'test-pass' || kind === 'build-pass' || kind === 'commit'
  const danger = kind === 'zawał' || kind === 'tear' || kind === 'build-fail'
  const stomp = kind === 'test-fail'
  if (!happy && !danger && !stomp) return grid
  const crouch = happy ? t <= 2 || (t >= 8 && t <= 9) : danger ? t >= 2 && t <= 9 : t >= 5 && t <= 6
  const clear = withoutBody(grid, x)
  const head = grid.slice(0, 3).map(row => row.slice(x, x + 6))
  const pose = crouch ? ['', ...head, 'bbbbbb', 'GG..GG'] : [...head, 'bbbbbb', '.bGGb.', '.G..G.']
  const extra: Layer[] = []
  if (happy && t >= 3 && t <= 7) extra.push(...lineArm(x + 6, 3, t < 5 ? 1 : 0))
  if (danger && crouch) extra.push(at('g', x, 3), at('g', x + 5, 3))
  if (stomp && t >= 7 && t <= 10) {
    // Stopę unieść, potem przydepnąć robaka przed orkiem.
    pose[4] = t === 7 ? '.bGGG.' : '.bGGb.'
    pose[5] = t === 7 ? '.G....' : t <= 9 ? '.G..GGG' : '.G..G.'
    if (t === 10) extra.push(at('m', x + 7, 5))
  }
  return pad(draw([clear, 0, 0], [pose, x, 0], ...extra))
}

function lineArm(x: number, shoulder: number, hand: number): Layer[] {
  return Array.from({ length: shoulder - hand + 1 }, (_, dy) => at('g', x, hand + dy))
}

// Klatka orka z reakcją na wierzchu; `t` liczy od pierwszej klatki reakcji.
export function withCue(rows: readonly string[], kind: KruxEvent, t: number): string[] {
  if (t < 0 || t >= CUE_FRAMES) return [...rows]
  const body = reactionBody(rows, kind, t)
  if (kind === 'test-pass' || kind === 'test-fail') {
    const canary = canaryResult(body, kind === 'test-pass', t)
    if (canary !== null) return pad(canary)
  }
  const effects = kind === 'test-fail' && t >= 9 ? [] : cueLayers(kind, t)
  const overlaid = pad(draw([body, 0, 0], ...effects))
  // Czynność może przesunąć orka pod efekt. Skóra, twarz i fartuch
  // pozostają przed iskrami, kamieniami i dymem także w takich pozach.
  return overlaid.map((row, y) => [...row].map((cell, x) => 'gGrtyb'.includes(body[y]![x]!) ? body[y]![x]! : cell).join(''))
}

// ——— Zwój dla Kruxa ———
// Kumpel kończy robotę: patrzy na Kruxa, wyciąga zwój zza fartucha, unosi go
// i rzuca łukiem do dłoni Kruxa; po locie chwilę patrzy, potem schodzi w prawo.

const TOSS_WINDUP: readonly Frame[] = [
  stander('left'),
  draw([stander('left', 'g'), 0, 0], at('h', 7, 3)),
  draw([stander('left', 'g'), 0, 0], [['hph'], 7, 3]),
  draw([stander('left'), 0, 0], at('g', 6, 2), at('g', 6, 1), [['hph'], 6, 0]),
]
const TOSS_AFTER = 2
// Kolumny na klatkę lotu zwoju.
const SCROLL_SPEED = 4

// Klatki lotu na odległość `distance` kolumn.
export function tossFlight(distance: number): number {
  return Math.max(3, Math.ceil(distance / SCROLL_SPEED))
}

// Cały rzut od wyciągnięcia zwoju do kroku w marsz.
export function tossFrames(flight: number): number {
  return TOSS_WINDUP.length + flight + TOSS_AFTER
}

// Poza kumpla w klatce `t` rzutu.
export function tossGrid(t: number, mood: KruxMood): string[] {
  return finish(TOSS_WINDUP[t] ?? stander('left'), 'band', mood, false, 0)
}

// Zwój w locie: od uniesionej dłoni kumpla (`from`) do dłoni Kruxa (`to`), z góry w dół.
// `null` przed rzutem i po locie: Krux już go trzyma.
export function tossScroll(t: number, from: number, to: number, flight: number): Placed | null {
  const k = t - TOSS_WINDUP.length
  if (k < 0 || k >= flight) return null
  const s = (k + 1) / flight
  return { rows: draw([['hph'], 0, Math.round(2 * s * s)]), x: Math.round(from + (to - from) * s) }
}

// Dłoń Kruxa, licząc od jego lewej krawędzi: tu dolatuje zwój.
export const CATCH_X = 6

// Po dolocie zwój zostaje w dłoni, potem chowa się pod fartuch.
export function caughtScroll(t: number, flight: number, kruxX = 0): Placed | null {
  const k = t - TOSS_WINDUP.length - flight
  if (k < 0 || k >= TOSS_AFTER) return null
  return { rows: draw([k === 0 ? ['hph'] : ['hp'], 0, 2 + k]), x: kruxX + CATCH_X - k }
}

// Krok chwytu w klatce `t` rzutu: -1 — Krux wyciąga dłoń, 0 — zwój w dłoni,
// dalej chowa go pod fartuch; `null` poza chwytem.
export function catchStep(t: number, flight: number): number | null {
  const k = t - TOSS_WINDUP.length - flight
  return k >= -1 && k < TOSS_AFTER ? k : null
}

// Krux łapie zwój: stojący w swoim slocie unosi dłoń pod zwój, jak przy triumfie.
// Leżącego i pochylonego nie prostujemy skokiem: zwój chowa się wtedy za nim.
export function withCatch(rows: readonly string[], k: number): string[] {
  const grid = pad(rows)
  const x = standingX(grid)
  if (x === null || x + 6 !== CATCH_X || k < -1 || k >= TOSS_AFTER) return grid
  const head = grid.slice(0, 3).map(row => row.slice(x, x + 6))
  return pad(draw([withoutBody(grid, x), 0, 0], [[...head, 'bbbbbb', '.bGGb.', '.G..G.'], x, 0], ...lineArm(x + 6, 3, k === 0 ? 2 : 3)))
}

// Rekwizyt za orkiem: komórki nad skórą, twarzą i fartuchem zostają puste, więc
// zwój ląduje w dłoni, nie na policzku, i naprawdę chowa się pod fartuch.
export function behind(prop: Placed, orc: Placed): Placed {
  const rows = prop.rows.map((row, y) => [...row].map((cell, dx) => ('gGrtyb'.includes(orc.rows[y]?.[prop.x + dx - orc.x] ?? '.') ? '.' : cell)).join(''))
  return { rows, x: prop.x }
}

// Pot po 10 s pracy; po 30 s dłoń na chwilę ociera czoło.
export function withEffort(rows: readonly string[], age: number): string[] {
  if (age < 67) return [...rows]
  const top = rows.findIndex(row => /[gG]{4}/u.test(row))
  if (top < 0) return [...rows]
  const x = rows[top]!.search(/[gG]{4}/u) + 5
  const wipe = age >= 200 && age % 40 < 4
  return pad(draw([rows, 0, 0], ...(wipe ? [at('g', x, top), at('g', x + 1, top + 1)] : age % 12 < 5 ? [at('i', x, top + 1 + Math.floor((age % 12) / 3))] : [])))
}

// Po pół minuty spoczynku oczy się zamykają, obok głowy mała runa snu.
export function withNap(rows: readonly string[]): string[] {
  const top = rows.findIndex(row => /[gG]{4}/u.test(row))
  if (top < 0) return [...rows]
  const crown = rows[top]!.search(/[gG]{4}/u)
  const x = crown + 7
  // Oczy gasną tylko w obrębie głowy: płomień ogniska w tym samym wierszu zostaje ogniem.
  const shut = (row: string) => [...row].map((cell, at) => (at >= crown - 1 && at <= crown + 4 && (cell === 'r' || cell === 'y') ? 'G' : cell)).join('')
  const sleepy = rows.map((row, y) => (y === top + 1 ? shut(row) : row))
  return pad(draw([sleepy, 0, 0], [['mmm', '..m', '.m.'], x, 0]))
}
