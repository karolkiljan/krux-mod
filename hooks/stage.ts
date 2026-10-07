// Warsztat czynności: z czego składa się klatka orka, jak czynność wchodzi, gra i schodzi.
// Czyste funkcje; `sprites.ts` tylko składa z nich scenę, a `acts/*.ts` rysują czynności.

import type { KruxMate } from '../types'

// Prostokąt jednego orka w pikselach. Komórka terminala niesie dwa piksele w pionie.
export const W = 22
export const H = 6

// Klatka: H wierszy, każdy najwyżej W znaków; '.' to przezroczysty piksel, krótszy wiersz dopełnia się kropkami.
export type Frame = readonly string[]

// Czynność. Wejście startuje tuż po stójce (`STAND`) i kończy się pozą, z której rusza pętla;
// zejście to wejście puszczone wstecz, więc ork wstaje z szezlonga, a nie znika.
// Oczy to dokładnie dwa piksele 'r' (zamknięte oczy: zero) — humor maluje brwi nad nimi.
// Fartuch to 'b': kumpel dostaje w tym miejscu swój kolor, więc rekwizyty go nie używają.
// `who` zawęża czynność do orków jednego fachu; bez niego gra każdy.
export type Act = {
  name: string
  intro: readonly Frame[]
  length: number
  loop: (t: number, frame: number) => Frame
  who?: readonly ('Krux' | KruxMate)[]
}

// Stójka: od niej zaczyna się i na niej kończy każda czynność, także marsz na scenę.
export const STAND: Frame = ['.gggg.', 'grggrg', '.tggt.', 'bbbbbb', '.bGGb.', '.G..G.']

// Głowa w trzech wierszach; `look` przesuwa źrenice.
export type Look = 'mid' | 'left' | 'right' | 'shut'
export function head(look: Look = 'mid'): Frame {
  const eyes = { mid: 'grggrg', left: 'rggrgg', right: 'ggrggr', shut: 'gGggGg' }[look]
  return ['.gggg.', eyes, '.tggt.']
}

// Krok w miejscu albo w drodze: ręce przy bokach, nogi na zmianę.
export function walker(step: number, look: Look = 'mid'): Frame {
  return [...head(look), 'gbbbbg', '.bGGb.', step % 2 === 0 ? '.G..G.' : '..GG..']
}

// Warstwa do `draw`: sprite i jego lewy górny róg; punkt w prostokącie orka.
export type Layer = readonly [Frame, number, number]
export type Point = readonly [number, number]

// Pojedynczy piksel jako warstwa: iskra, oko kruka, kropla.
export function at(cell: string, x: number, y: number): Layer {
  return [[cell], x, y]
}

// Odcinek pikseli od `from` do `to` włącznie: trzonek, ręka, żyłka.
export function line(from: Point, to: Point, cell: string): Layer[] {
  const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]))
  return Array.from({ length: steps + 1 }, (_, i) => [[cell], lerp(from[0], to[0], i / (steps || 1)), lerp(from[1], to[1], i / (steps || 1))] as Layer)
}

// Pojedyncze piksele jednego koloru w podanych punktach: szlak, kropki znaku.
export function dots(points: readonly Point[], cell: string): Layer[] {
  return points.map(([x, y]) => at(cell, x, y))
}

// Stójka z ręką wyciągniętą w bok na wysokości fartucha.
export function stander(look: Look, arm = ''): Frame {
  return [...head(look), `bbbbbb${arm}`, '.bGGb.', '.G..G.']
}

// Stójka z ręką przed sobą na narzędziu; nogi drepczą, gdy ork przesuwa się za nim.
export function pusher(step: number, arm = 'gg'): Frame {
  return [...head('mid'), `bbbbbb${arm}`, '.bGGb.', step % 2 === 0 ? '.G..G.' : '..GG..']
}

// Przykuc: głowa niżej o piksel, kolana na boki; `arm` jak w `stander`.
export function croucher(look: Look, arm = ''): Frame {
  return ['', ...head(look), `bbbbbb${arm}`, 'GG..GG']
}

// Przykuc z dłonią przed sobą: ognisko, strumień, rysunek w piachu.
export const SQUAT: Frame = croucher('mid', 'g')

// Wjazd rekwizytu z prawej: zwalnia przed metą, żeby nie stanąć jak wryty.
export const SLIDE = [12, 9, 6, 4, 2, 1, 0] as const

// Marsz od stójki do x, piksel na klatkę, między rekwizytami; `held` niesie przy prawej dłoni.
export function stroll(to: number, props: readonly Layer[], held: Frame = []): Frame[] {
  return Array.from({ length: to }, (_, i) => draw(...props, [walker(i, 'right'), i + 1, 0], [held, i + 7, 2]))
}

type Canvas = string[][]

function canvas(): Canvas {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => '.'))
}

function put(c: Canvas, x: number, y: number, cell: string): void {
  const X = Math.round(x)
  const Y = Math.round(y)
  if (X >= 0 && X < W && Y >= 0 && Y < H) c[Y]![X] = cell
}

// Nakłada sprite od (x, y); '.' w sprite niczego nie zasłania.
function stamp(c: Canvas, sprite: Frame, x = 0, y = 0): Canvas {
  sprite.forEach((row, dy) => [...row].forEach((cell, dx) => cell !== '.' && put(c, x + dx, y + dy, cell)))
  return c
}

// Warstwy od spodu do wierzchu, każda jako [sprite, x, y].
export function draw(...layers: readonly Layer[]): Frame {
  const c = canvas()
  for (const [sprite, x, y] of layers) stamp(c, sprite, x, y)
  return c.map(row => row.join(''))
}

// Pośrednie położenie: t w [0, 1].
export function lerp(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * Math.min(1, Math.max(0, t)))
}

// Trójkątna fala 0 → n → 0 o okresie 2n: ruch tam i z powrotem bez skoku.
export function pingPong(t: number, n: number): number {
  const p = t % (2 * n)
  return p <= n ? p : 2 * n - p
}

// Deterministyczny szum: ta sama klatka zawsze daje ten sam ogień.
export function noise(frame: number, x: number, y: number): number {
  let n = (frame * 374761393 + x * 668265263 + y * 2147483647) >>> 0
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

// Płomień w danym pikselu; `y` liczy od dołu ognia: 0 żar, wyżej iskry.
export function flame(frame: number, x: number, up: number): string {
  const heat = noise(frame, x, up)
  if (up === 0) return heat < 0.55 ? 'R' : 'o'
  if (up === 1) return heat < 0.35 ? 'o' : heat < 0.6 ? 'y' : heat < 0.8 ? 'R' : '.'
  return heat < 0.3 ? 'y' : heat < 0.45 ? 'o' : '.'
}

// Ognisko z polan od `x - 1`, płomień trzy piksele szeroki i `size` wysoki; ujemny `size` — bez polan.
export function bonfire(x: number, frame: number, size: number): Layer[] {
  const cells: Layer[] = size >= 0 ? [[['xxxxx', '.x.x.'], x - 1, 4]] : []
  for (let up = 0; up < size; up += 1) {
    for (let dx = 0; dx < 3; dx += 1) {
      const cell = flame(frame, dx, up)
      if (cell !== '.') cells.push([[cell], x + dx, 3 - up])
    }
  }
  return cells
}

// ——— Oś czasu sceny ———
// Trasa to kolejne odcinki: każdy gra jedną czynność przez około `frames` klatek,
// stójka → wejście → pętla × k → zejście, potem następny odcinek. Trasa roboty krąży,
// trasa czekania idzie tylko naprzód i kończy się odcinkiem bez końca.

export type Leg = { act: Act; frames: number }

// Gest wiercenia: na chwilę zmienia pozę z początku pętli, nie puszcza rekwizytu.
// `apply` dostaje tę pozę i krok gestu; klatka zostaje w zasadach czynności.
export type Gesture = {
  name: string
  who?: readonly ('Krux' | KruxMate)[]
  length: number
  apply: (rows: Frame, t: number) => Frame
}

// `gestures` grają na początku co `every`-tego obiegu pętli; `seed` wybiera który.
export type Route = { legs: readonly Leg[]; cyclic: boolean; gestures: readonly Gesture[]; every: number; seed: number }

type Spot = { leg: number; act: Act; phase: 'stand' | 'intro' | 'loop' | 'outro'; i: number }

function loopsOf(leg: Leg): number {
  if (leg.frames === Infinity) return Infinity
  return Math.max(1, Math.round((leg.frames - 1 - 2 * leg.act.intro.length) / leg.act.length))
}

function totalOf(leg: Leg): number {
  return 1 + 2 * leg.act.intro.length + loopsOf(leg) * leg.act.length
}

// Odcinki po kolei od czynności `start`, każdy po `frames` klatek.
export function rotation(acts: readonly Act[], start: number, frames: number): Leg[] {
  const first = Math.abs(Math.trunc(start)) % acts.length
  return acts.map((_, j) => ({ act: acts[(first + j) % acts.length]!, frames }))
}

function spotOf(route: Route, step: number): Spot {
  const { legs } = route
  const period = legs.reduce((sum, leg) => sum + totalOf(leg), 0)
  let t = route.cyclic ? ((step % period) + period) % period : Math.max(0, step)
  let k = 0
  while (k < legs.length - 1 && t >= totalOf(legs[k]!)) t -= totalOf(legs[k++]!)
  const act = legs[k]!.act
  const n = act.intro.length
  const loops = loopsOf(legs[k]!) * act.length
  // Trasa naprzód kończy się na ostatnim odcinku: po jego czasie pętla gra dalej.
  if (!route.cyclic && k === legs.length - 1 && t >= totalOf(legs[k]!)) return { leg: k, act, phase: 'loop', i: t - 1 - n }
  if (t === 0) return { leg: k, act, phase: 'stand', i: 0 }
  if (t <= n) return { leg: k, act, phase: 'intro', i: t - 1 }
  if (t <= n + loops) return { leg: k, act, phase: 'loop', i: t - 1 - n }
  return { leg: k, act, phase: 'outro', i: t - 1 - n - loops }
}

// Gest w kroku `i` pętli: na początku co `every`-tego obiegu, gdy do końca pętli
// starczy klatek. Odcinek bez końca też się wierci.
function gestureAt(route: Route, spot: Spot): { gesture: Gesture; t: number } | null {
  if (spot.phase !== 'loop' || route.gestures.length === 0) return null
  const { act, i } = spot
  const span = Math.max(act.length, Math.ceil(GESTURE_SPAN / act.length) * act.length)
  const round = Math.floor(i / span)
  if (round % route.every !== route.every - 1) return null
  const t = i - round * span
  const gesture = route.gestures[Math.floor(noise(route.seed, spot.leg, round) * route.gestures.length)]!
  if (t >= gesture.length) return null
  const loops = loopsOf(route.legs[spot.leg]!) * act.length
  if (i - t + gesture.length > loops) return null
  return { gesture, t }
}

// Obieg wiercenia liczy się w pełnych pętlach czynności, około 3 s.
const GESTURE_SPAN = 20

function frameOf(route: Route, spot: Spot, frame: number): Frame {
  const { act, phase, i } = spot
  if (phase === 'stand') return STAND
  if (phase === 'intro') return act.intro[i]!
  if (phase === 'loop') {
    const fidget = gestureAt(route, spot)
    if (fidget !== null) return fidget.gesture.apply(act.loop((i - fidget.t) % act.length, frame - fidget.t), fidget.t)
    return act.loop(i % act.length, frame)
  }
  return act.intro[act.intro.length - 1 - i]!
}

export function actFrame(route: Route, step: number, frame: number): Frame {
  return frameOf(route, spotOf(route, step), frame)
}

// Który odcinek trasy gra w kroku `step`: z niego pamięć sceny wybiera następny epizod.
export function legAt(route: Route, step: number): number {
  return spotOf(route, step).leg
}

// Ile klatek ostatni odcinek trasy naprzód już gra w pętli; przed nim `null`.
export function finalLoop(route: Route, step: number): number | null {
  if (route.cyclic) return null
  const spot = spotOf(route, step)
  return spot.leg === route.legs.length - 1 && spot.phase === 'loop' ? spot.i : null
}

// Klatki od stójki do pierwszej klatki pętli: płótno na starcie od razu pokazuje robotę.
export function leadIn(route: Route): number {
  return 1 + route.legs[0]!.act.intro.length
}

// Poza w bezruchu: pierwsza klatka pętli pierwszej czynności, z rekwizytem w ręku.
export function restFrame(route: Route): Frame {
  return route.legs[0]!.act.loop(0, 0)
}

// Droga do stójki po przerwanej scenie: reszta wejścia albo całe zejście, na końcu stójka.
export function settleFrames(route: Route, step: number): Frame[] {
  const { act, phase, i } = spotOf(route, step)
  const back = (from: number) => [...act.intro.slice(0, from)].reverse()
  if (phase === 'stand') return []
  if (phase === 'intro') return [...back(i), STAND]
  if (phase === 'loop') return [...back(act.intro.length), STAND]
  return [...back(act.intro.length - 1 - i), STAND]
}

// Humor na oczach: brwi nad 'r' przy złości, złote oczy przy dumie, mrugnięcie w spokoju.
export function moodOf(rows: Frame, mood: 'calm' | 'grumpy' | 'proud', blink: boolean): Frame {
  const grid = rows.map(row => [...row])
  if (mood === 'grumpy') frown(grid)
  grid.forEach(row =>
    row.forEach((cell, x) => {
      if (cell !== 'r') return
      if (mood === 'proud') row[x] = 'y'
      else if (blink) row[x] = 'G'
    }),
  )
  return grid.map(row => row.join(''))
}

// Brew nad każdym okiem. Gdy oko zerka w bok, nad nim bywa już tło: brew siada
// na sąsiednim pikselu czoła, bliżej drugiego oka, więc złość zawsze ma dwie brwi.
function frown(grid: string[][]): void {
  grid.forEach((row, y) => {
    if (y === 0) return
    const eyes = row.flatMap((cell, x) => (cell === 'r' ? [x] : []))
    const above = grid[y - 1]!
    for (const x of eyes) {
      const other = eyes.find(e => e !== x)
      const inward = other === undefined || other > x ? 1 : -1
      const spot = [x, x + inward, x - inward].find(at => above[at] === 'g')
      if (spot !== undefined) above[spot] = 'G'
    }
  })
}

// Klatka zawsze pełny prostokąt H × W.
export function pad(rows: Frame): string[] {
  return Array.from({ length: H }, (_, y) => (rows[y] ?? '').padEnd(W, '.').slice(0, W))
}
