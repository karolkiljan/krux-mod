import { STAND, SQUAT, bonfire, croucher, draw, head, line, noise, stander, stroll } from '../stage'
import type { Act, Frame, Layer } from '../stage'

// Odpoczynek, gdy Krux czeka na hordę. Każdy mebel wjeżdża albo rośnie na oczach,
// Krux do niego podchodzi i siada; przy zejściu wstaje i mebel odjeżdża.

// ——— Szezlong z kuflem ———
const MUG: Frame = ['t', 'y']
const CHAISE: Frame = ['', '', 'v', 'v', 'vvvvvvvvvv', '.hh....hh.']
const CHAISE_AT = 6
// Kufel stoi na siedzisku w tym miejscu, aż Krux usiądzie i po niego sięgnie.
const MUG_ON_SEAT = 7

const chaiseAt = (x: number): Layer => [CHAISE, x, 0]

const LIE = {
  rest: ['.gggg.', 'grggrg', '.tggtgg', '.bbbbGGGgg'],
  tap: ['.gggg.', 'grggrg', '.tggtgg..gg', '.bbbbGGG'],
} as const

function chaiseLoop(t: number): Frame {
  // 24 klatki: leżeć, stuknąć stopą dwa razy, unieść kufel, łyk, odstawić.
  const tap = t === 4 || t === 6
  const body = tap ? LIE.tap : LIE.rest
  const mug: Layer =
    t >= 14 && t <= 19 ? [['tt', 'yy'], 11, 0] : t === 13 || t === 20 ? [['tt', 'yy'], 12, 0] : [['tt', 'yy'], 13, 1]
  const sipping = t >= 15 && t <= 18
  return draw(chaiseAt(CHAISE_AT), [body, CHAISE_AT, 0], mug, ...(sipping ? [[head('shut'), CHAISE_AT, 0] as Layer, mug] : []))
}

const chaise: Act = {
  name: 'szezlong',
  intro: [
    // Szezlong wjeżdża z prawej z kuflem na siedzisku, Krux patrzy.
    ...[20, 16, 12, 9, 7, CHAISE_AT].map(x => draw(chaiseAt(x), [MUG, x + MUG_ON_SEAT, 2], [stander('right'), 0, 0])),
    // Podejść do szezlonga.
    ...stroll(CHAISE_AT, [chaiseAt(CHAISE_AT), [MUG, CHAISE_AT + MUG_ON_SEAT, 2]]),
    // Usiąść prosto, nogi zwisają.
    draw(chaiseAt(CHAISE_AT), [['.gggg.', 'grggrg', '.tggtg', '.bbbbbgg', '......GG', '.......G'], CHAISE_AT, 0], [MUG, 13, 2]),
    // Odchylić się, kolana w górę.
    draw(chaiseAt(CHAISE_AT), [['.gggg.', 'grggrg', '.tggtgg', '.bbbbGGG', '........G'], CHAISE_AT, 0], [['tt', 'yy'], 13, 1]),
  ],
  length: 24,
  loop: chaiseLoop,
}

// ——— Fotel z fajką ———
const ARMCHAIR: Frame = ['e', 'e', 'e', 'e.....e', 'eeeeeee', '.x...x.']
const CHAIR_AT = 7

function smoke(t: number): Layer[] {
  // Dwa kłęby wędrują w górę i w prawo od cybucha.
  const puffs: Layer[] = []
  for (const born of [0, 8]) {
    const age = (t - born + 16) % 16
    if (age > 9) continue
    const x = 15 + Math.floor(age / 3)
    const y = 2 - Math.floor(age / 3)
    if (y >= 0) puffs.push([['m'], x + (age % 2), y])
  }
  return puffs
}

const SEATED: Frame = ['.gggg.', 'grggrg', '.tggt.', '.bbbbb', '.bbGGGG', '.....GG']

function armchairLoop(t: number): Frame {
  // 16 klatek: pyknąć z fajki, wypuścić kłęby; co jakiś czas przymknąć oczy.
  const drowsy = t >= 10 && t <= 12
  const face = drowsy ? [[head('shut'), CHAIR_AT, 0] as Layer] : []
  return draw([ARMCHAIR, CHAIR_AT - 1, 0], [SEATED, CHAIR_AT, 0], ...face, [['hx'], CHAIR_AT + 6, 2], [['x'], CHAIR_AT + 7, 1], ...smoke(t))
}

const armchair: Act = {
  name: 'fotel',
  intro: [
    // Fotel spada z góry i siada na nóżkach.
    ...[-5, -3, -1, 1, 0].map(y => draw([ARMCHAIR, CHAIR_AT - 1, y], [stander(y < 0 ? 'mid' : 'right'), 0, 0])),
    ...stroll(CHAIR_AT, [[ARMCHAIR, CHAIR_AT - 1, 0]]),
    // Klapnąć, wyciągnąć fajkę.
    draw([ARMCHAIR, CHAIR_AT - 1, 0], [['.gggg.', 'grggrg', '.tggt.', 'gbbbbg', '.bbGG', '..GG'], CHAIR_AT, 0]),
    draw([ARMCHAIR, CHAIR_AT - 1, 0], [SEATED, CHAIR_AT, 0]),
    draw([ARMCHAIR, CHAIR_AT - 1, 0], [SEATED, CHAIR_AT, 0], [['hx'], CHAIR_AT + 6, 2]),
  ],
  length: 16,
  loop: armchairLoop,
}

// ——— Ryby ———
const POND_FROM = 11
const POND = 22 - POND_FROM

function pond(frame: number, width: number): Layer {
  const top = Array.from({ length: width }, (_, i) => (noise(frame, i, 4) < 0.18 ? 'i' : 'W')).join('')
  return [[top, 'W'.repeat(width)], 22 - width, 4]
}

// Siedzi na brzegu: głowa wiersz niżej, nogi przed sobą.
const SITTER: Frame = ['', '.gggg.', 'grggrg', '.tggt.', 'bbbbbbg', '.bGGGGG']
const HAND: readonly [number, number] = [7, 4]

// Wędka od dłoni do czubka, żyłka z czubka do spławika.
function tackle(tip: readonly [number, number], bobber: readonly [number, number] | null): Layer[] {
  const rod = line(HAND, tip, 'h').slice(1)
  if (bobber === null) return rod
  return [...rod, ...line(tip, bobber, 'm').slice(1, -1), [['d'], bobber[0], bobber[1]]]
}

function fishingLoop(t: number, frame: number): Frame {
  // 32 klatki: spławik kołysze się na wodzie, branie wciąga go pod wodę,
  // ryba wyskakuje łukiem w lewo i wpada z pluskiem.
  const bite = t >= 16 && t <= 19
  const tip: [number, number] = bite ? [13, 1] : [12, 0]
  const bobber: [number, number] = bite ? [16, 5] : [16, 4]
  const ripple: Layer[] = !bite && t % 8 < 2 ? [[['i.i'], 15, 4]] : []
  const fishT = t - 20
  const fish: Layer[] = []
  if (fishT >= 0 && fishT < 9) {
    const fx = 18 - Math.floor(fishT / 2)
    const fy = 4 - Math.round(3 * Math.sin((Math.PI * fishT) / 8))
    fish.push([['jj'], fx, fy])
  }
  const splash: Layer[] = fishT === 0 ? [[['i.i'], 17, 3]] : fishT === 8 ? [[['i.i'], 13, 3]] : []
  return draw(pond(frame, POND), [SITTER, 0, 0], ...ripple, ...tackle(tip, bobber), ...fish, ...splash)
}

const fishing: Act = {
  name: 'ryby',
  intro: [
    // Woda napływa z prawej, Krux siada na brzegu.
    ...[2, 4, 7, POND].map((w, i) => draw(pond(i, w), [STAND, 0, 0])),
    draw(pond(4, POND), [croucher('mid'), 0, 0]),
    draw(pond(5, POND), [SITTER, 0, 0]),
    // Zamach za głowę, rzut, spławik leci łukiem na wodę.
    draw(pond(6, POND), [SITTER, 0, 0], ...tackle([6, 0], null)),
    draw(pond(7, POND), [SITTER, 0, 0], ...tackle([10, 0], null), [['d'], 12, 0]),
    draw(pond(8, POND), [SITTER, 0, 0], ...tackle([12, 0], [14, 1])),
    draw(pond(9, POND), [SITTER, 0, 0], ...tackle([12, 0], [16, 3])),
  ],
  length: 32,
  loop: fishingLoop,
}

// ——— Ognisko z kiełbasą ———
const FIRE_X = 13

// Patyk od dłoni (7, 4) skośnie w górę nad ogień.
const STICK: Frame = ['', '...hh', '.hh', 'h']

function campfireLoop(t: number, frame: number): Frame {
  // 28 klatek: kiełbasa nad ogniem rumieni się, Krux ją zdejmuje, gryzie, i znowu na patyk.
  const cooking = t < 18
  const color = t < 6 ? 'd' : t < 12 ? 'R' : 'x'
  const stick: Layer[] = cooking ? [[STICK, 7, 1], [[color + color], 12, 1]] : []
  const eat = t - 18
  const bite: Layer[] = []
  if (!cooking) {
    const near = eat < 3 ? 9 - eat : eat < 7 ? 7 : 7 + (eat - 7)
    bite.push([['hh'], 6, 4], [[eat >= 4 && eat <= 6 ? 'x' : 'xx'], near, 3])
  }
  const face: Layer[] = !cooking && eat >= 4 && eat <= 6 ? [[['', '', '', '.t..t.'], 0, 0]] : []
  return draw(...bonfire(FIRE_X, frame, 2), [SQUAT, 0, 0], ...stick, ...bite, ...face)
}

const campfire: Act = {
  name: 'ognisko',
  intro: [
    // Polana układają się, iskra, ogień rośnie, Krux kuca.
    draw([['x'], FIRE_X + 1, 4], [STAND, 0, 0]),
    draw([['xxxxx'], FIRE_X - 1, 4], [STAND, 0, 0]),
    draw(...bonfire(FIRE_X, 0, 0), [STAND, 0, 0], [['y'], FIRE_X + 1, 3]),
    draw(...bonfire(FIRE_X, 1, 1), [STAND, 0, 0]),
    draw(...bonfire(FIRE_X, 2, 2), [SQUAT, 0, 0]),
    draw(...bonfire(FIRE_X, 3, 2), [SQUAT, 0, 0], [['', '.hh', 'h'], 7, 1]),
    draw(...bonfire(FIRE_X, 4, 2), [SQUAT, 0, 0], [STICK, 7, 1], [['dd'], 12, 1]),
  ],
  length: 28,
  loop: campfireLoop,
}

export const REST_ACTS: Act[] = [chaise, armchair, fishing, campfire]
