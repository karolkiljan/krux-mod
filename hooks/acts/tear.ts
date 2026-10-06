import { SLIDE, STAND, at, croucher, dots, draw, head, line, noise, pusher, stander } from '../stage'
import type { Act, Frame, Layer, Look, Point } from '../stage'

// Rozbiórka przy rm, git rm, git clean, git reset i git restore. Skała wyrasta z ziemi,
// kupka gruzu z taczką albo stary mur wjeżdża z prawej; Krux rozwala, wywozi i zgarnia,
// a przy zejściu wszystko wraca tą samą drogą, którą przyszło.

// Pętla z kolejnych ujęć: każde trwa swoją liczbę klatek i dostaje klatkę od swojego początku.
type Beat = readonly [number, (k: number, frame: number) => Frame]

function script(beats: readonly Beat[]): Pick<Act, 'length' | 'loop'> {
  const length = beats.reduce((sum, [n]) => sum + n, 0)
  const loop = (t: number, frame: number): Frame => {
    let k = t
    for (const [n, shot] of beats) {
      if (k < n) return shot(k, frame)
      k -= n
    }
    return beats[0]![1](0, frame)
  }
  return { length, loop }
}

// Krux z dłonią przed sobą na wysokości fartucha; nogi drepczą w marszu.
function holder(step: number, look: Look): Frame {
  return [...head(look), 'bbbbbbg', '.bGGb.', step % 2 === 0 ? '.G..G.' : '..GG..']
}

// ——— Dynamit ———
const ROCK: Frame = ['..kkk.', '.kkqkk', 'kkkkkq', 'kqkkkk', 'kkkqkk']
const ROCK_AT = 14
// Skała wyrasta z ziemi: `sink` pikseli jeszcze pod ziemią.
const rockAt = (sink: number): Layer => [ROCK, ROCK_AT, 1 + sink]

// Laska dynamitu: knot na czubku, dwa piksele czerwieni. Przy skale stoi w kolumnie 13.
const STICK: Frame = ['h', 'd', 'd']
const STICK_X = 13
const placed: Layer = [STICK, STICK_X, 3]
// Laska w dłoni: tuż za dłonią, w górę.
const heldAt = (x: number): Layer => [STICK, x + 7, 1]

// Lont od knota do końca, który Krux trzyma przy sobie.
const FUSE: readonly Point[] = [[12, 3], [11, 4], [10, 5], [9, 5], [8, 5], [7, 5]]
// Iskra biegnie od końca lontu do knota.
const SPARK: readonly Point[] = [...[...FUSE].reverse(), [STICK_X, 3]]

// Lont rozwinięty do dłoni w kolumnie `hand`: leży na ziemi, z dłoni zwisa piksel.
function unrolled(hand: number): Layer[] {
  return [...dots(FUSE.filter(([x]) => x > hand), 'h'), at('h', hand, 4)]
}

// Przykuc z dłońmi na uszach i zaciśniętymi oczami: zaraz huknie.
const COWER: Frame = ['', '.gggg.', 'gGggGg', 'gtggtg', 'gbbbbg', 'GG..GG']

// Kupka gruzu po skale.
const RUBBLE: Frame = ['.kq.k.', 'kqkkqk']

// Kula ognia i dym w chwili `k` od huku; środek nad laską przy skale.
const BLAST: Point = [16, 3]

function blast(k: number): Layer[] {
  const out: Layer[] = []
  for (let y = 0; y < 6; y += 1) {
    for (let x = 9; x < 22; x += 1) {
      const lift = Math.max(0, k - 2) * 0.7
      const d = Math.hypot(x - BLAST[0], y - (BLAST[1] - lift))
      const n = noise(k, x, y)
      const cell = blastCell(k, d, n)
      if (cell !== '.') out.push(at(cell, x, y))
    }
  }
  return out
}

function blastCell(k: number, d: number, n: number): string {
  if (k === 0) return d < 1.5 ? 'y' : d < 2.5 ? (n < 0.6 ? 'o' : 'y') : d < 3.3 && n < 0.5 ? 'R' : '.'
  if (k === 1) return d < 2 ? (n < 0.7 ? 'y' : 'o') : d < 3.2 ? (n < 0.5 ? 'o' : 'R') : d < 4.4 && n < 0.35 ? (n < 0.15 ? 'y' : 'R') : '.'
  if (k === 2) return d < 2.2 ? (n < 0.6 ? 'm' : 'R') : d < 3.6 ? (n < 0.5 ? 'm' : n < 0.75 ? 'o' : '.') : d < 4.8 && n < 0.2 ? 'o' : '.'
  const fade = (k - 2) / 7
  return d < 3.2 - fade && n > fade * 0.9 + 0.15 ? 'm' : '.'
}

const HOLD: Frame = draw(rockAt(0), [holder(0, 'right'), 0, 0], heldAt(0))

const dynamiteBeats: Beat[] = [
  // Krux z laską w dłoni idzie do skały.
  [1, () => HOLD],
  [6, k => draw(rockAt(0), [holder(k + 1, 'right'), k + 1, 0], heldAt(k + 1))],
  // Przykucnąć i postawić laskę przy skale, wstać z końcem lontu.
  [1, () => draw(rockAt(0), placed, [croucher('right', 'g'), 6, 0])],
  [1, () => draw(rockAt(0), placed, [stander('right', 'g'), 6, 0])],
  // Cofać się tyłem, lont rozwija się z dłoni.
  [6, k => draw(rockAt(0), placed, ...unrolled(11 - k), [holder(k, 'right'), 5 - k, 0])],
  // Przykucnąć przy końcu lontu i skrzesać iskrę.
  [1, () => draw(rockAt(0), placed, ...dots(FUSE, 'h'), [croucher('right', 'g'), 0, 0])],
  [1, () => draw(rockAt(0), placed, ...dots(FUSE.slice(0, -1), 'h'), [croucher('right', 'g'), 0, 0], at('y', 7, 4), at('o', 7, 5))],
  // Zatkać uszy; iskra biegnie lontem, za nią zostaje dymek.
  [6, k => {
    const spot = SPARK[k + 1]!
    const left = FUSE.filter(([x]) => x > spot[0])
    const [px, py] = SPARK[k]!
    return draw(rockAt(0), placed, ...dots(left, 'h'), [COWER, 0, 0], at('m', px, py - 1), at(k % 2 === 0 ? 'y' : 'o', spot[0], spot[1]))
  }],
  // Huk: kula ognia zasłania skałę, z dymu wyłania się gruz.
  [10, k => draw(k < 2 ? rockAt(0) : [RUBBLE, ROCK_AT, 4], ...blast(k), [COWER, 0, 0])],
  // Odetkać uszy, popatrzeć, wstać.
  [2, () => draw([RUBBLE, ROCK_AT, 4], [croucher('right'), 0, 0])],
  // Gruz zapada się w ziemię, nowa skała wyrasta.
  [2, k => draw([RUBBLE, ROCK_AT, 5 + k], [stander('right'), 0, 0])],
  [5, k => draw(rockAt(4 - k), [stander('right'), 0, 0])],
  // Sięgnąć do fartucha po nową laskę.
  [1, () => draw(rockAt(0), [STAND, 0, 0], at('g', 5, 4))],
  [1, () => draw(rockAt(0), [holder(0, 'mid'), 0, 0], [['d', 'd'], 6, 4])],
  [1, () => draw(rockAt(0), [holder(0, 'right'), 0, 0], [STICK, 7, 2])],
  [1, () => HOLD],
]

// Dynamit: skała wyrasta z ziemi, Krux wyciąga laskę z fartucha; pętla to marsz do skały,
// lont rozwinięty tyłem, iskra, huk, dym i gruz, który zapada się pod nową skałę.
const dynamite: Act = {
  name: 'dynamit',
  intro: [
    ...[4, 3, 2, 1, 0].map(sink => draw(rockAt(sink), [STAND, 0, 0])),
    draw(rockAt(0), [stander('right'), 0, 0]),
    draw(rockAt(0), [STAND, 0, 0], at('g', 5, 4)),
    draw(rockAt(0), [holder(0, 'mid'), 0, 0], [['d', 'd'], 6, 4]),
    draw(rockAt(0), [holder(0, 'right'), 0, 0], [STICK, 7, 2]),
    HOLD,
  ],
  ...script(dynamiteBeats),
}

// ——— Wywożenie gruzu ———
const CART: Frame = ['s.....s', 'sssssss', '.c...c.']
const CART_X = 8
const cart = (x: number, loaded: boolean): Layer[] => [
  [CART, x, 3], [['hh'], x - 2, 3], ...(loaded ? [[['.kqkk.'], x, 3] as Layer] : []),
]

function hauling(t: number): Frame {
  // Wózek wyjeżdża na skraj, wysypuje gruz i wraca pusty.
  const x = t < 8 ? t : t < 12 ? 7 : t < 20 ? 19 - t : 0
  const loaded = t < 10 || t >= 27
  const tipped = t >= 8 && t < 12
  const tippedCart: Layer[] = tipped
    ? [[['....s', '..sss', '.c..c'], CART_X + x, 3], ...line([CART_X + x - 2, 2], [CART_X + x, 3], 'h')]
    : cart(CART_X + x, loaded)
  const spill: Layer[] = t >= 10 && t < 16 ? [[['qk', 'kqk'], 20, t < 12 ? 3 : 4]] : []
  const refill: Layer[] = t >= 22 && t < 27 ? [[['qkq'], CART_X + 2, Math.min(3, t - 22)]] : []
  return draw(...tippedCart, ...spill, ...refill, [pusher(t, tipped ? 'g' : 'gg'), x, 0])
}

const haul: Act = {
  name: 'gruz',
  intro: [
    ...SLIDE.map(dx => draw(...cart(CART_X + dx, true), [STAND, 0, 0])),
    draw(...cart(CART_X, true), [stander('right', 'g'), 0, 0]),
    hauling(0),
  ],
  length: 28,
  loop: t => hauling(t),
}

// ——— Burzenie muru ———
const WALL: Frame = ['kkqkkq', 'qkkqkk', 'kkqkkq', 'qkkqkk', 'kkqkkq']
const WALL_X = 15

function wallLayers(crack: number): Layer[] {
  const layers: Layer[] = [[WALL, WALL_X, 1]]
  // Ciemne spoiny pękają przy uderzeniu; dolna cegła osuwa się w gruz.
  if (crack > 0) layers.push(...line([16, 2], [18, 4], 'c'))
  if (crack > 1) layers.push(at('c', 16, 4), at('c', 17, 4))
  if (crack > 2) return [[['kkqkkq', 'qkkqkk', 'kkqkkq', 'qkk..k', 'k..kkq'], WALL_X, 1], [['qkk'], 13, 5]]
  return layers
}

function wallWork(t: number): Frame {
  if (t >= 14 && t < 20) {
    return draw([WALL, WALL_X, 20 - t], [stander('right', 'gg'), 2, 0],
      ...line([9, 3], [11, 1], 'h'), [['SS', 'SS'], 11, 0])
  }
  const hit = t >= 5 && t <= 8
  const y = t < 3 || t >= 14 ? 1 : t < 5 || t >= 10 ? 2 : 3
  const toolX = hit ? 14 : 11
  return draw(
    ...wallLayers(t < 6 ? 0 : t < 8 ? 1 : t < 10 ? 2 : t < 14 ? 3 : 0),
    [stander('right', 'gg'), 2, 0],
    ...line([9, 3], [toolX, y], 'h'),
    [['SS', 'SS'], toolX, y - 1],
    ...(hit ? [at('q', 13, 4), at('q', 12, 5), at('m', 16, 0)] : []),
  )
}

const wall: Act = {
  name: 'mur',
  intro: [
    ...SLIDE.map(dx => draw([WALL, WALL_X + dx, 1], [['hhhhSS'], 8 + dx, 4], [STAND, 0, 0])),
    draw(...wallLayers(0), [['hhhhSS'], 8, 4], [stander('right', 'g'), 0, 0]),
    draw(...wallLayers(0), [['hhhhSS'], 8, 3], [pusher(0), 1, 0]),
    wallWork(3),
  ],
  length: 22,
  loop: t => wallWork(t),
}

export const TEAR_ACTS: Act[] = [dynamite, haul, wall]
