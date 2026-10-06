import { SQUAT, dots, draw, head, lerp, line, stander, stroll } from '../stage'
import type { Act, Frame, Layer, Look, Point } from '../stage'

// Planowanie: mapa na sztaludze, plan bitwy patykiem na ziemi, lista z odhaczaniem, makieta z pionkami.
// Rekwizyt wjeżdża albo spada, kartka rozwija się wiersz po wierszu; zejście cofa to samo.

// ——— Mapa na sztaludze ———
// Węgiel kreśli szlak kropka po kropce, czerwony krzyżyk na celu, potem szmata ściera szlak od początku.
const ROUTE: readonly Point[] = [[9, 4], [10, 3], [11, 3], [12, 4], [13, 3], [14, 2], [15, 2], [16, 3], [17, 2], [18, 1]]
const PEAKS: readonly Point[] = [[12, 1], [11, 2], [13, 2]]
const EASEL: Frame = ['.hhhhhhhhhh.', 'h..........h', 'h..........h', 'h..........h', 'h..........h', '.h........h.']

// Sztaluga przesunięta o `dx`, z kartką rozwiniętą na `rows` wierszy.
function easel(dx: number, rows: number): Layer[] {
  const sheet: Layer[] = rows > 0 ? [[Array.from({ length: rows }, () => 'pppppppppp'), 9 + dx, 0]] : []
  const peaks = rows === 5 ? dots(PEAKS, 'k') : []
  return [[EASEL, 8 + dx, 0], ...sheet, ...peaks]
}

function easelLoop(t: number): Frame {
  // 25 klatek: 10 kropek szlaku, chwila nad gotową mapą, 10 klatek ścierania od początku.
  const drawn = Math.min(t, ROUTE.length)
  const wiped = Math.max(0, t - 14)
  const route = ROUTE.slice(wiped, drawn)
  const goal = drawn === ROUTE.length && wiped < ROUTE.length ? dots([ROUTE[ROUTE.length - 1]!], 'R') : []
  return draw(...easel(0, 5), ...dots(route, 'n'), ...goal, [stander(t > 14 ? 'right' : 'mid', 'gg'), 0, 0])
}

const easelAct: Act = {
  name: 'sztaluga',
  intro: [
    // Pusta sztaluga wjeżdża z prawej, kartka rozwija się z górnej listwy, Krux podnosi węgiel.
    ...[12, 8, 4, 0].map(dx => draw(...easel(dx, 0), [stander('right'), 0, 0])),
    ...[1, 2, 3, 4].map(rows => draw(...easel(0, rows), [stander('right'), 0, 0])),
    draw(...easel(0, 5), [stander('mid', 'g'), 0, 0]),
  ],
  length: 25,
  loop: easelLoop,
}

// ——— Plan bitwy patykiem na ziemi ———
// Krux kuca i kreśli w piachu strzałę natarcia i wieżę wroga, potem zamiata rysunek patykiem.
const HALF: Frame = ['.gggg.', 'grggrg', '.tggt.', 'bbbbbbg', '.bGGb.', 'GG..GG']
const SHOULDER_LOW: Point = [6, 4]
const SKETCH: readonly Point[] = [
  // Strzała natarcia.
  [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [12, 5],
  // Wieża wroga z blankami.
  [17, 5], [17, 4], [18, 5], [19, 5], [19, 4],
]
const SKETCHED = SKETCH.length

// Krux drepcze w kucki za czubkiem patyka, więc ręka zostaje krótka.
function crouchAt(tip: Point): number {
  return Math.max(0, tip[0] - 11)
}

// Ręka nad rysunkiem w wierszu 2, piksel na lewo od czubka; patyk z dłoni do ziemi, czubek ciemny.
function stick(tip: Point): Layer[] {
  const hand: Point = [tip[0] - 1, 2]
  const shoulder: Point = [SHOULDER_LOW[0] + crouchAt(tip), SHOULDER_LOW[1]]
  return [...line(shoulder, hand, 'g'), ...line(hand, tip, 'h').slice(1, -1), [['x'], tip[0], tip[1]]]
}

function groundLoop(t: number): Frame {
  // 26 klatek: 11 kresek, 4 klatki namysłu, 11 klatek zamiatania od końca.
  const n = SKETCHED
  const shown = t < n ? t + 1 : t < n + 4 ? n : 2 * n + 3 - t
  const tip = SKETCH[Math.min(n - 1, t < n ? t : t < n + 4 ? n - 1 : shown)]!
  const look: Look = t >= n && t < n + 4 ? 'mid' : 'right'
  const x = crouchAt(tip)
  return draw(...dots(SKETCH.slice(0, shown), 'q'), [SQUAT, x, 0], [head(look), x, 1], ...stick(tip))
}

const ground: Act = {
  name: 'patyk',
  intro: [
    // Rozejrzeć się, przykucnąć, wyciągnąć patyk zza fartucha i opuścić go do ziemi.
    draw([stander('right'), 0, 0]),
    draw([HALF, 0, 0]),
    draw([SQUAT, 0, 0]),
    draw([SQUAT, 0, 0], ...line([7, 4], [7, 5], 'h')),
    draw([SQUAT, 0, 0], ...line([7, 4], [8, 3], 'h')),
    draw([SQUAT, 0, 0], ...line(SHOULDER_LOW, [7, 2], 'g'), ...line([8, 2], [9, 3], 'h')),
    draw([SQUAT, 0, 0], [head('right'), 0, 1], ...line(SHOULDER_LOW, [8, 2], 'g'), ...line([8, 3], [9, 3], 'h')),
  ],
  length: 2 * SKETCHED + 4,
  loop: groundLoop,
}

// ——— Lista roboty na tablicy ———
const BX = 10
const BOARD: Frame = ['hhhhhhhhh', 'h.......h', 'h.......h', 'h.......h', 'h.......h', '.h.....h.']
const ITEMS = ['nnpn', 'npnn', 'nnnp', 'npnp']
const STAND_AT = 3
const SHOULDER: Point = [9, 3]

// Kartka na tablicy: `rows` wierszy od góry, `ticked` odhaczonych pozycji, `edge` to brzeg nowej kartki.
function sheet(rows: number, ticked: number, fresh: number): Layer[] {
  const lines = ITEMS.slice(0, rows).map((ink, i) => `${i < ticked && i >= fresh ? 'f' : 'm'}p${ink}p`)
  const edge: Layer[] = fresh > 0 && fresh < 4 ? [[['jjjjjjj'], BX + 1, fresh + 1]] : []
  return [[lines, BX + 1, 1], ...edge]
}

function board(y: number, rows: number, ticked = 0, fresh = 0): Layer[] {
  return [[BOARD, BX, y], ...sheet(rows, ticked, fresh).map(([s, x, yy]) => [s, x, yy + y] as Layer)]
}

function listLoop(t: number): Frame {
  // 18 klatek: przy każdej z 4 pozycji ręka staje, stawia znak i schodzi niżej;
  // potem nowa kartka zjeżdża z góry, a ręka wraca do pierwszej pozycji.
  const item = Math.min(3, Math.floor(t / 3))
  const ticking = t < 12
  const ticked = ticking ? item + (t % 3 === 2 ? 1 : 0) : 4
  const fresh = ticking ? 0 : Math.min(4, t - 11)
  const hand: Point = ticking ? [11, item + 1] : [11, lerp(4, 1, (t - 11) / 6)]
  return draw(...board(0, 4, ticked, fresh), [stander(ticking ? 'right' : 'mid'), STAND_AT, 0], ...line(SHOULDER, hand, 'g'))
}

const list: Act = {
  name: 'lista',
  intro: [
    // Tablica spada z góry i siada na nóżkach, kartka zjeżdża, Krux podchodzi z węglem.
    ...[-5, -3, -1, 1, 0].map(y => draw(...board(y, 0), [stander(y < 0 ? 'mid' : 'right'), 0, 0])),
    ...[1, 2, 3, 4].map(rows => draw(...board(0, rows), [stander('right'), 0, 0])),
    ...stroll(STAND_AT, board(0, 4)),
    draw(...board(0, 4), [stander('right'), STAND_AT, 0], ...line(SHOULDER, [10, 2], 'g')),
  ],
  length: 18,
  loop: listLoop,
}

// ——— Makieta z pionkami ———
// Na stole stoją pionki; Krux przestawia jeden, drugi, waha się i cofa oba ruchy.
const TX = 9
const TABLE: Frame = ['', '', '', 'hhhhhhhhhhh', '.x.......x.', '.x.......x.']
const MX = 2
const ARM_FROM: Point = [8, 3]
type Pawn = { cell: string; x: number }
const PAWNS: readonly Pawn[] = [
  { cell: 'R', x: 11 },
  { cell: 'y', x: 13 },
  { cell: 'j', x: 17 },
]
// Ruchy: który pionek, skąd, dokąd.
const MOVES: readonly (readonly [number, number, number])[] = [
  [1, 13, 15],
  [0, 11, 13],
  [0, 13, 11],
  [1, 15, 13],
]
const MOVE = 8

function pawnLayers(dx: number, pawns: readonly Pawn[], lifted = -1, liftX = 0, liftY = 1): Layer[] {
  return pawns.map((p, i) => (i === lifted ? [[p.cell, p.cell], liftX + dx, liftY] : [[p.cell, p.cell], p.x + dx, 1]) as Layer)
}

function table(dx: number, pawns: readonly Pawn[] = PAWNS, ...lift: [number, number, number] | []): Layer[] {
  return [[TABLE, TX + dx, 0], ...pawnLayers(dx, pawns, ...lift)]
}

function modelLoop(t: number): Frame {
  // 32 klatki: 4 ruchy po 8 — namysł, sięgnięcie, uniesienie, dwa kroki, odstawienie, cofnięcie ręki.
  const k = Math.floor(t / MOVE)
  const p = t % MOVE
  const pawns = PAWNS.map(pawn => ({ ...pawn }))
  for (const [who, , to] of MOVES.slice(0, k)) pawns[who]!.x = to
  const [who, from, to] = MOVES[k]!
  const dir = Math.sign(to - from)
  const look: Look = p < 2 ? (k % 2 === 0 ? 'right' : 'mid') : 'right'
  const orc: Layer = [stander(look), MX, 0]
  if (p < 2) return draw(...table(0, pawns), orc)
  if (p === 2) return draw(...table(0, pawns), orc, ...line(ARM_FROM, [from - 1, 2], 'g'))
  if (p === 7) return draw(...table(0, pawns.map((pw, i) => (i === who ? { ...pw, x: to } : pw))), orc, ...line(ARM_FROM, [9, 2], 'g'))
  const x = p === 3 ? from : p === 4 ? from + dir : to
  const y = p === 6 ? 1 : 0
  return draw(...table(0, pawns, who, x, y), orc, ...line(ARM_FROM, [x - 1, y + 1], 'g'))
}

const model: Act = {
  name: 'makieta',
  intro: [
    // Stół z pionkami wjeżdża z prawej, Krux podchodzi.
    ...[12, 9, 6, 3, 0].map(dx => draw(...table(dx), [stander('right'), 0, 0])),
    ...stroll(MX, table(0)),
  ],
  length: MOVES.length * MOVE,
  loop: modelLoop,
}

export const PLAN_ACTS: Act[] = [easelAct, ground, list, model]
