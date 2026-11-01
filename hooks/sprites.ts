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
import { H, W, actFrame, at, dots, draw, finalLoop, flame, leadIn, legAt, moodOf, noise, pad, restFrame, rotation, settleFrames, stander, walker } from './stage'
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

// Trasa orka w scenie: `first` to czynność, od której rusza epizod roboty.
export function routeOf(scene: StageScene, face: Face, seed: number, first = seed): Route {
  const gestures = gesturesFor(face)
  const every = 3 + (seed % 2)
  if (scene === 'lounge') return { legs: waitLegs(seed), cyclic: false, gestures, every, seed }
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
  // Czynność, od której ruszy następny epizod każdej sceny: epizody się różnią.
  memory: Partial<Record<StageScene, number>>
  // Przerwana scena, która jeszcze schodzi do stójki; `fast`, gdy czeka już nowa.
  // `face` z chwili przerwania: kumpel, który w trakcie zejścia dostał imię, schodzi tą samą trasą.
  leaving: { scene: StageScene; face: Face; seed: number; first: number; step: number; at: number; fast?: boolean } | null
}

function routeOfTrack(track: Pick<Track, 'scene' | 'face' | 'seed' | 'first'>): Route {
  return routeOf(track.scene, track.face, track.seed, track.first)
}

// Przed zmianą sceny: następny epizod tej sceny ruszy od czynności po obecnej.
function remember(track: Track, frame: number): Track['memory'] {
  if (track.scene === 'lounge') return track.memory
  return { ...track.memory, [track.scene]: track.first + legAt(routeOfTrack(track), Math.max(0, frame - track.since)) + 1 }
}

// Nowy epizod sceny: los z klatki, czynność z pamięci albo z losu.
function episode(track: Track, scene: StageScene, key: string, frame: number): Pick<Track, 'scene' | 'seed' | 'first' | 'memory'> {
  const memory = remember(track, frame)
  const seed = seedOf(key, frame)
  return { scene, seed, first: memory[scene] ?? seed, memory }
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
  return { scene, face, since, setAt: frame, seed, first: seed, memory: {}, leaving: null }
}

// Ork doszedł na stanowisko: scena rusza od stójki, nowym epizodem, także ta sama.
export function trackArrive(track: Track, scene: StageScene, key: string, frame: number): Track {
  return { ...track, ...episode(track, scene, key, frame), since: frame, setAt: frame, leaving: null }
}

// Nowa scena po przytrzymaniu: stara schodzi do stójki, dopiero potem wchodzi nowa.
// Póki ork maszeruje albo schodzi (`frame < since`), oś czeka, więc nic nie skacze.
// W bezruchu zmiana od razu, bez zejścia.
export function trackTo(track: Track, scene: StageScene, key: string, frame: number, still: boolean): Track {
  if (scene === track.scene) return track
  if (still) return { ...track, ...episode(track, scene, key, frame), since: frame, setAt: frame, leaving: null }
  if (frame < track.since || frame - track.setAt < HOLD_FRAMES) return track
  return { ...track, ...settle(track, frame, true), ...episode(track, scene, key, frame), setAt: frame }
}

// Kumpel dostał imię: jego czynności się zmieniają, więc obecna schodzi do stójki,
// a scena rusza od nowa trasą fachu. W marszu albo w bezruchu podmiana od razu.
export function trackFace(track: Track, face: Face, key: string, frame: number, still: boolean): Track {
  if (face === track.face) return track
  if (still || frame < track.since) return { ...track, face }
  return { ...track, ...settle(track, frame, true), ...episode(track, track.scene, key, frame), face, setAt: frame }
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
  const frames = settleFrames(routeOfTrack(left), left.step)
  return left.fast === true ? hurried(frames) : frames
}

// Obecna scena schodzi do stójki od klatki `frame`: `since` to klatka, w której ork stoi.
function settle(track: Track, frame: number, fast: boolean): Pick<Track, 'since' | 'leaving'> {
  const left = { scene: track.scene, face: track.face, seed: track.seed, first: track.first, step: frame - track.since, at: frame, fast }
  const back = settleOf(left).length
  return { since: frame + back, leaving: back > 0 ? left : null }
}

// Ork kończy robotę: scena schodzi do stójki, a `since` mówi, od której klatki może ruszyć w marsz.
// W marszu do slotu albo w trakcie zejścia oś już zmierza do stójki w `since`, więc zostaje.
export function trackOff(track: Track, frame: number): Track {
  if (frame < track.since) return track
  return { ...track, ...settle(track, frame, false) }
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

// Co ork niesie ze stanowiska: stal z kuźni, zwój ze stołu, rudę ze sztolni.
const LOADS: Record<Station, Frame | null> = { forge: ['RR'], table: ['hph'], trial: null, mine: ['oS', 'SS'] }

// Ładunek przy dłoni orka idącego ze stanowiska tej sceny, po stronie marszu.
export function carried(scene: StageScene, x: number, rightward: boolean): Placed | null {
  const load = LOADS[STATIONS[scene]]
  if (load === null) return null
  return { rows: draw([load, 0, 3]), x: rightward ? x + 6 : x - load[0]!.length }
}

// Pokój za orkami: 12 pikseli wysokości, ściana nad podłogą. Pas ma 6 wierszy,
// a piksele są kwadratowe, więc scena dostaje głębię bez zabierania ekranu.
export const ROOM_ROWS = 12
const WALL_ROWS = 6

// Sprzęty na ścianie: co ork bierze z głębi przy swoim stanowisku. `x` to odstęp od stanowiska.
const WALL_PROPS: Record<Station, { x: number; rows: Frame }> = {
  forge: { x: 8, rows: ['', '', 'EEEEEEEEE', '.C..C..C.', '.C..C..C.'] },
  table: { x: 2, rows: ['', 'U.UU.U.UU.U', 'EEEEEEEEEEE', '.UU.U..UU.U', 'EEEEEEEEEEE'] },
  trial: { x: 2, rows: ['', '', '', 'EEEEEEEE', 'ECCCCCCE', 'EEEEEEEE'] },
  mine: { x: 2, rows: ['..EEEEEEEE..', '.EEIIIIIIEE.', '.EIIIIIIIIE.', '.EIIIIIIIIE.', '.EIIIIIIIIE.', '.EIIIIIIIIE.'] },
}

const SCENE_OF: Record<Station, StageScene> = { forge: 'hammer', table: 'read', trial: 'test', mine: 'pick' }

function wallX(station: Station, floor: number, hearth: boolean): number {
  const { x, rows } = WALL_PROPS[station]
  const wide = Math.max(...rows.map(row => row.length))
  return Math.max(0, Math.min(floor - wide - 1, stationX(SCENE_OF[station], floor, hearth) + x))
}

// Ściana z fugami, deski zbiegające się w głąb i szyny ze sztolni. Stałe dla szerokości,
// więc liczone raz; drzewo ma limit znaków, dlatego wzór jest rzadki.
const roomCache = new Map<string, string[][]>()

function roomBase(width: number, hearth: boolean): string[][] {
  const key = `${width}:${hearth}`
  const known = roomCache.get(key)
  if (known) return known
  const room = Array.from({ length: ROOM_ROWS }, (_, y) => Array.from({ length: width }, (_, x): string => {
    if (y >= WALL_ROWS) return 'F'
    if (y === 0) return 'E'
    return (y === 2 && x % 34 < 5) || (y === 4 && (x + 17) % 34 < 5) ? 'D' : 'A'
  }))
  const put = (x: number, y: number, cell: string) => { if (room[y]?.[x] !== undefined) room[y]![x] = cell }
  // Deski wychodzą z punktu zbiegu nad środkiem ściany.
  const middle = width / 2
  for (let foot = -width; foot < 2 * width; foot += 26) {
    for (let y = WALL_ROWS; y < ROOM_ROWS; y += 1) put(Math.round(middle + ((foot - middle) * (y - 2)) / (ROOM_ROWS - 3)), y, 'H')
  }
  for (const station of Object.keys(WALL_PROPS) as Station[]) {
    const left = wallX(station, width, hearth)
    WALL_PROPS[station].rows.forEach((row, y) => [...row].forEach((cell, dx) => { if (cell !== '.') put(left + dx, y, cell) }))
  }
  const mouth = wallX('mine', width, hearth) + 6
  for (let y = WALL_ROWS; y < ROOM_ROWS; y += 1) {
    const spread = 3 + (y - WALL_ROWS)
    put(mouth - spread - (y - WALL_ROWS), y, 'C')
    put(mouth + spread - (y - WALL_ROWS), y, 'C')
  }
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

// Co dzieje się w pokoju samo: dym, kanarek, wózek, szczur. Fazy tak dobrane, że w klatce 0
// (bezruch) nic nie stoi w pół kroku.
function roomLife(room: string[][], width: number, frame: number, hearth: boolean): void {
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
  put(cage + 1 + (Math.floor(frame / 4) % 3), 2, 'Z')
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
    put(x, 6, 'C')
    put(x + 1, 6, 'H')
  }
}

export type RoomFeel = { kind: KruxEvent | 'handoff'; age: number } | null

// Pokój w klatce `frame`: pochodnie, życie pokoju i reakcja na zdarzenie kroniki.
export function roomGrid(width: number, frame: number, hearth: boolean, feel: RoomFeel = null): string[] {
  const room = roomBase(width, hearth).map(row => [...row])
  roomLife(room, width, frame, hearth)
  const red = feel?.kind === 'test-fail' || feel?.kind === 'build-fail' || feel?.kind === 'zawał'
  const bright = feel?.kind === 'test-pass' || feel?.kind === 'build-pass' || feel?.kind === 'commit'
  for (const at of [0.17, 0.72]) {
    const x = Math.round(width * at)
    if (x >= width) continue
    room[3]![x] = 'E'
    room[4]![x] = 'E'
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

// Wyprawa w głąb: wejście, chwila przy sprzęcie, powrót z ładunkiem.
const ERRAND_IN = 9
const ERRAND_HOLD = 5
export const ERRAND_FRAMES = 2 * ERRAND_IN + ERRAND_HOLD

// Co ork przynosi z głębi: piksel przy dłoni, od chwili, gdy sięgnął po sprzęt.
const ERRAND_LOADS: Record<Station, string> = { forge: 'C', table: 'p', trial: 's', mine: 'q' }

// Kolumna orka przy sprzęcie na ścianie.
export function depthSpot(scene: StageScene, floor: number, hearth: boolean): number {
  const station = STATIONS[scene]
  const wide = Math.max(...WALL_PROPS[station].rows.map(row => row.length))
  return wallX(station, floor, hearth) + Math.floor(wide / 2) - 2
}

// Poza w klatce `t` wyprawy: skąd do sprzętu i z powrotem, wielkość z głębokości.
export function errandPose(t: number, from: number, spot: number, scene: StageScene, face: Face): { rows: string[]; x: number; y: number } {
  const depth = t < ERRAND_IN ? t / ERRAND_IN : t < ERRAND_IN + ERRAND_HOLD ? 1 : Math.max(0, ERRAND_FRAMES - t) / ERRAND_IN
  const level = Math.max(1, Math.ceil(depth * FAR_ORCS.length)) - 1
  const rows = FAR_ORCS[level]![t % 2]!
  const x = Math.round(from + (spot - from) * depth)
  const y = FEET[level]! - rows.length + 1
  const dressed = dress(rows, face)
  if (t < ERRAND_IN + ERRAND_HOLD - 1) return { rows: dressed, x, y }
  // Ładunek przy dłoni po prawej, na wysokości fartucha.
  return { rows: dressed.map((row, i) => (i === 1 ? `${row}${ERRAND_LOADS[STATIONS[scene]]}` : row)), x, y }
}

// Ork w drodze: wbiega z prawej do slotu albo schodzi w prawo; nogi na zmianę.
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
