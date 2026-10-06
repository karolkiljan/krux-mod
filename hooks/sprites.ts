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
import { H, W, actFrame, at, dots, draw, flame, leadIn, moodOf, pad, restFrame, settleFrames, stander, walker } from './stage'
import type { Act, Frame, Layer } from './stage'

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

// Siatka pikseli jednej klatki: `step` liczy od początku sceny, `seed` wybiera pierwszą czynność,
// `frame` to zegar płótna dla szumu ognia i wody.
export function frameGrid(step: number, variant: 'band' | 'pane', scene: StageScene = 'hammer', mood: KruxMood = 'calm', seed = 0, frame = step): string[] {
  return finish(actFrame(ACTS[scene], seed, step, frame), variant, mood, step % BLINK_EVERY === BLINK_EVERY - 1, frame)
}

// ——— Oś czynności jednego orka ———
// Która scena gra od której klatki i co jeszcze schodzi do stójki. Płótno trzyma
// jedną oś na orka i pyta ją o siatkę; sloty i marsz to już sprawa płótna.

export type Track = {
  scene: StageScene
  // Klatka, od której gra obecna scena (po marszu i po zejściu poprzedniej).
  since: number
  // Klatka, w której ta scena przyszła: od niej liczy się przytrzymanie.
  setAt: number
  // Wybiera pierwszą czynność sceny.
  seed: number
  // Przerwana scena, która jeszcze schodzi do stójki; `fast`, gdy czeka już nowa.
  leaving: { scene: StageScene; seed: number; step: number; at: number; fast?: boolean } | null
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
export function trackStart(scene: StageScene, key: string, frame: number, start: 'in-loop' | number): Track {
  const seed = seedOf(key, frame)
  const since = start === 'in-loop' ? frame - leadIn(ACTS[scene], seed) : frame + start
  return { scene, since, setAt: frame, seed, leaving: null }
}

// Nowa scena po przytrzymaniu: stara schodzi do stójki, dopiero potem wchodzi nowa.
// Póki ork maszeruje albo schodzi (`frame < since`), oś czeka, więc nic nie skacze.
// W bezruchu zmiana od razu, bez zejścia.
export function trackTo(track: Track, scene: StageScene, key: string, frame: number, still: boolean): Track {
  if (scene === track.scene) return track
  if (still) return { scene, since: frame, setAt: frame, seed: seedOf(key, frame), leaving: null }
  if (frame < track.since || frame - track.setAt < HOLD_FRAMES) return track
  return { ...settle(track, frame, true), scene, setAt: frame, seed: seedOf(key, frame) }
}

// Zejście w pośpiechu, gdy nowa scena już czeka: co druga klatka, stójka na końcu
// zostaje. Rekwizyt odjeżdża dwa razy szybciej, ale dalej odjeżdża, nie znika.
function hurried(frames: Frame[]): Frame[] {
  return frames.filter((_, i) => i % 2 === 1 || i === frames.length - 1)
}

function settleOf(left: NonNullable<Track['leaving']>): Frame[] {
  const frames = settleFrames(ACTS[left.scene], left.seed, left.step)
  return left.fast === true ? hurried(frames) : frames
}

// Obecna scena schodzi do stójki od klatki `frame`: `since` to klatka, w której ork stoi.
function settle(track: Track, frame: number, fast: boolean): Pick<Track, 'since' | 'leaving'> {
  const left = { scene: track.scene, seed: track.seed, step: frame - track.since, at: frame, fast }
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
  if (still) return finish(restFrame(ACTS[track.scene], track.seed), variant, mood, false, 0)
  const left = track.leaving
  if (left !== null && frame < track.since) {
    const rows = settleOf(left)[frame - left.at]
    if (rows !== undefined) return finish(rows, variant, mood, false, frame)
  }
  return frameGrid(Math.max(0, frame - track.since), variant, track.scene, mood, track.seed, frame)
}

export type Run = { text: string; color?: string; backgroundColor?: string }

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

export function bandColumns(count: number): number {
  return count * ORC_WIDTH + Math.max(0, count - 1) * ORC_GAP
}

// Płótno z dymkiem musi zmieścić dymek pełnej długości, nawet nad samym Kruxem.
export function canvasColumns(count: number, withBubble: boolean): number {
  return Math.max(bandColumns(count), withBubble ? BUBBLE_TEXT + 4 : 0)
}

// Lewa krawędź prostokąta orka: każdy ma swój slot i w nim robi wszystko.
export function slotX(slot: number): number {
  return slot * (ORC_WIDTH + ORC_GAP)
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
  const chars = [...text]
  const body = chars.length > BUBBLE_TEXT ? `${chars.slice(0, BUBBLE_TEXT - 1).join('')}…` : text
  const inner = [...body].length + 2
  const box = inner + 2
  const center = slotX(index) + 2
  const left = Math.max(0, Math.min(width - box, center - Math.floor(box / 2)))
  const tail = Math.max(1, Math.min(inner, center - left))
  const place = (line: string) => `${' '.repeat(left)}${line}`.padEnd(width)
  return [
    place(`╭${'─'.repeat(inner)}╮`),
    place(`│ ${body} │`),
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

// Dłoń Kruxa w slocie 0: tu dolatuje zwój.
export const CATCH_X = 6

// Po dolocie zwój zostaje w dłoni, potem chowa się pod fartuch.
export function caughtScroll(t: number, flight: number): Placed | null {
  const k = t - TOSS_WINDUP.length - flight
  if (k < 0 || k >= TOSS_AFTER) return null
  return { rows: draw([k === 0 ? ['hph'] : ['hp'], 0, 2 + k]), x: CATCH_X - k }
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
  const x = rows[top]!.search(/[gG]{4}/u) + 7
  const sleepy = rows.map((row, y) => y === top + 1 ? row.replaceAll('r', 'G').replaceAll('y', 'G') : row)
  return pad(draw([sleepy, 0, 0], [['mmm', '..m', '.m.'], x, 0]))
}
