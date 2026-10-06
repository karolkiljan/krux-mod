// Warsztat czynności: z czego składa się klatka orka, jak czynność wchodzi, gra i schodzi.
// Czyste funkcje; `sprites.ts` tylko składa z nich scenę, a `acts/*.ts` rysują czynności.

// Prostokąt jednego orka w pikselach. Komórka terminala niesie dwa piksele w pionie.
export const W = 22
export const H = 6

// Klatka: H wierszy, każdy najwyżej W znaków; '.' to przezroczysty piksel, krótszy wiersz dopełnia się kropkami.
export type Frame = readonly string[]

// Czynność. Wejście startuje tuż po stójce (`STAND`) i kończy się pozą, z której rusza pętla;
// zejście to wejście puszczone wstecz, więc ork wstaje z szezlonga, a nie znika.
// Oczy to dokładnie dwa piksele 'r' (zamknięte oczy: zero) — humor maluje brwi nad nimi.
// Fartuch to 'b': kumpel dostaje w tym miejscu swój kolor, więc rekwizyty go nie używają.
export type Act = {
  name: string
  intro: readonly Frame[]
  length: number
  loop: (t: number, frame: number) => Frame
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
// Scena ma kilka czynności; ta sama scena gra je po kolei, każdą przez około SEGMENT klatek:
// stójka → wejście → pętla × k → zejście, potem następna czynność. `seed` wybiera pierwszą.

const SEGMENT = 60

type Spot = { act: Act; phase: 'stand' | 'intro' | 'loop' | 'outro'; i: number }

function loopsOf(act: Act): number {
  return Math.max(1, Math.round((SEGMENT - 1 - 2 * act.intro.length) / act.length))
}

function totalOf(act: Act): number {
  return 1 + 2 * act.intro.length + loopsOf(act) * act.length
}

function order(acts: readonly Act[], seed: number): Act[] {
  const start = Math.abs(Math.trunc(seed)) % acts.length
  return acts.map((_, j) => acts[(start + j) % acts.length]!)
}

function spotOf(acts: readonly Act[], seed: number, step: number): Spot {
  const queue = order(acts, seed)
  const period = queue.reduce((sum, act) => sum + totalOf(act), 0)
  let t = ((step % period) + period) % period
  let k = 0
  while (t >= totalOf(queue[k]!)) t -= totalOf(queue[k++]!)
  const act = queue[k]!
  const n = act.intro.length
  const loops = loopsOf(act) * act.length
  if (t === 0) return { act, phase: 'stand', i: 0 }
  if (t <= n) return { act, phase: 'intro', i: t - 1 }
  if (t <= n + loops) return { act, phase: 'loop', i: t - 1 - n }
  return { act, phase: 'outro', i: t - 1 - n - loops }
}

function frameOf(spot: Spot, frame: number): Frame {
  const { act, phase, i } = spot
  if (phase === 'stand') return STAND
  if (phase === 'intro') return act.intro[i]!
  if (phase === 'loop') return act.loop(i % act.length, frame)
  return act.intro[act.intro.length - 1 - i]!
}

export function actFrame(acts: readonly Act[], seed: number, step: number, frame: number): Frame {
  return frameOf(spotOf(acts, seed, step), frame)
}

// Klatki od stójki do pierwszej klatki pętli: płótno na starcie od razu pokazuje robotę.
export function leadIn(acts: readonly Act[], seed: number): number {
  return 1 + order(acts, seed)[0]!.intro.length
}

// Poza w bezruchu: pierwsza klatka pętli pierwszej czynności, z rekwizytem w ręku.
export function restFrame(acts: readonly Act[], seed: number): Frame {
  const act = order(acts, seed)[0]!
  return act.loop(0, 0)
}

// Droga do stójki po przerwanej scenie: reszta wejścia albo całe zejście, na końcu stójka.
export function settleFrames(acts: readonly Act[], seed: number, step: number): Frame[] {
  const { act, phase, i } = spotOf(acts, seed, step)
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
