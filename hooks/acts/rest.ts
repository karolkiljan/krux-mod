import { STAND, SQUAT, bonfire, croucher, draw, head, line, noise, stander, stroll } from '../stage'
import type { Act, Frame, Layer } from '../stage'

// Odpoczynek, gdy Krux czeka na hordę. Każdy mebel Krux przynosi ze ściany, podchodzi
// do niego i siada; przy zejściu wstaje i odnosi mebel na miejsce.

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
  kit: draw(chaiseAt(CHAISE_AT), [MUG, CHAISE_AT + MUG_ON_SEAT, 2]),
  intro: [
    // Podejść do szezlonga z kuflem na siedzisku.
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
const SEATED: Frame = ['.gggg.', 'grggrg', '.tggt.', '.bbbbb', '.bbGGGG', '.....GG']
// Fajka w kąciku pyska: ustnik przy prawym kle, główka piksel dalej i wyżej.
const PIPE_AT = CHAIR_AT + 5
const PIPE: readonly Layer[] = [[['hx'], PIPE_AT, 2], [['x'], PIPE_AT + 1, 1]]

function smoke(t: number): Layer[] {
  // Dwa kłęby wędrują w górę i w prawo od główki fajki.
  const puffs: Layer[] = []
  for (const born of [0, 8]) {
    const age = (t - born + 16) % 16
    if (age > 9) continue
    const x = PIPE_AT + 2 + Math.floor(age / 3)
    const y = 2 - Math.floor(age / 3)
    if (y >= 0) puffs.push([['m'], x + (age % 2), y])
  }
  return puffs
}

function armchairLoop(t: number): Frame {
  // 16 klatek: pyknąć z fajki, wypuścić kłęby; co jakiś czas przymknąć oczy.
  const drowsy = t >= 10 && t <= 12
  const face = drowsy ? [[head('shut'), CHAIR_AT, 0] as Layer] : []
  return draw([ARMCHAIR, CHAIR_AT - 1, 0], [SEATED, CHAIR_AT, 0], ...face, ...PIPE, ...smoke(t))
}

const armchair: Act = {
  name: 'fotel',
  kit: draw([ARMCHAIR, CHAIR_AT - 1, 0]),
  intro: [
    ...stroll(CHAIR_AT, [[ARMCHAIR, CHAIR_AT - 1, 0]]),
    // Klapnąć, wyciągnąć fajkę.
    draw([ARMCHAIR, CHAIR_AT - 1, 0], [['.gggg.', 'grggrg', '.tggt.', 'gbbbbg', '.bbGG', '..GG'], CHAIR_AT, 0]),
    draw([ARMCHAIR, CHAIR_AT - 1, 0], [SEATED, CHAIR_AT, 0]),
    draw([ARMCHAIR, CHAIR_AT - 1, 0], [SEATED, CHAIR_AT, 0], PIPE[0]!),
  ],
  length: 16,
  loop: armchairLoop,
}

// ——— Ryby ———
// Koryto z wodą: Krux łowi w tym, co sam przyniósł.
const POND_FROM = 11
const POND = 22 - POND_FROM - 1

function pond(frame: number): Layer {
  const top = Array.from({ length: POND }, (_, i) => (noise(frame, i, 4) < 0.18 ? 'i' : 'W')).join('')
  return [[`x${top}x`, 'x'.repeat(POND + 2)], POND_FROM - 1, 4]
}

// Wędka leży przy korycie, zanim Krux po nią sięgnie.
const LAID_ROD: Layer = [['hhhh'], 6, 5]

// Siedzi na brzegu: głowa wiersz niżej, nogi przed sobą.
const SITTER: Frame = ['', '.gggg.', 'grggrg', '.tggt.', 'bbbbbbg', '.bGGGGG']
const HAND: readonly [number, number] = [7, 4]

// Wędka od dłoni do czubka, żyłka z czubka do spławika. Rękojeść leży tuż przy dłoni SITTER (6, 4).
function tackle(tip: readonly [number, number], bobber: readonly [number, number] | null): Layer[] {
  const rod = line(HAND, tip, 'h')
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
  return draw(pond(frame), [SITTER, 0, 0], ...ripple, ...tackle(tip, bobber), ...fish, ...splash)
}

const fishing: Act = {
  name: 'ryby',
  kit: draw(pond(0), LAID_ROD),
  intro: [
    // Krux siada na brzegu koryta i podnosi wędkę.
    draw(pond(4), LAID_ROD, [croucher('mid'), 0, 0]),
    draw(pond(5), LAID_ROD, [SITTER, 0, 0]),
    // Zamach za głowę, rzut, spławik leci łukiem na wodę.
    draw(pond(6), [SITTER, 0, 0], ...tackle([6, 0], null)),
    draw(pond(7), [SITTER, 0, 0], ...tackle([10, 0], null), [['d'], 12, 0]),
    draw(pond(8), [SITTER, 0, 0], ...tackle([12, 0], [14, 1])),
    draw(pond(9), [SITTER, 0, 0], ...tackle([12, 0], [16, 3])),
  ],
  length: 32,
  loop: fishingLoop,
}

// ——— Ognisko z kiełbasą ———
const FIRE_X = 13

// Patyk od dłoni (7, 4) skośnie w górę nad ogień.
const STICK: Frame = ['', '...hh', '.hh', 'h']

// Kęs: lewy piksel kiełbasy w drodze od ognia do kła i z powrotem, piksel albo dwa na klatkę.
const BITE: readonly (readonly [number, number])[] = [[10, 2], [8, 3], [6, 3], [5, 3], [5, 3], [5, 3], [5, 3], [6, 3], [8, 3], [10, 2]]

function campfireLoop(t: number, frame: number): Frame {
  // 28 klatek: kiełbasa nad ogniem rumieni się, Krux przyciąga patyk do pyska, gryzie dwa razy
  // i oddaje kiełbasę nad ogień. Patyk nie znika z dłoni, kiełbasa nie przeskakuje.
  const eat = t - 18
  if (eat < 0) {
    const color = t < 6 ? 'd' : t < 12 ? 'R' : 'x'
    return draw(...bonfire(FIRE_X, frame, 2), [SQUAT, 0, 0], [STICK, 7, 1], [[color + color], 12, 1])
  }
  // Patyk zawsze od tej samej rękojeści przy dłoni (7, 4) do kiełbasy; przy pysku zostaje sama rękojeść.
  const [sx, sy] = BITE[eat]!
  const stick = line([7, 4], sx > 7 ? [sx - 1, sy] : [7, 4], 'h')
  // Paszcza otwiera się przed kęsem i między kęsami.
  const jaw: Layer[] = eat === 2 || eat === 5 ? [[['', '', '', '..cc'], 0, 0]] : []
  return draw(...bonfire(FIRE_X, frame, 2), [SQUAT, 0, 0], ...stick, [['xx'], sx, sy], ...jaw)
}

// Patyk leży obok polan, zanim Krux po niego sięgnie.
const LAID_STICK: Layer = [['hhhh'], 7, 5]

const campfire: Act = {
  name: 'ognisko',
  kit: draw(...bonfire(FIRE_X, 0, 0), LAID_STICK),
  intro: [
    // Iskra, ogień rośnie, Krux kuca i podnosi patyk.
    draw(...bonfire(FIRE_X, 0, 0), LAID_STICK, [STAND, 0, 0], [['y'], FIRE_X + 1, 3]),
    draw(...bonfire(FIRE_X, 1, 1), LAID_STICK, [STAND, 0, 0]),
    draw(...bonfire(FIRE_X, 2, 2), LAID_STICK, [SQUAT, 0, 0]),
    draw(...bonfire(FIRE_X, 3, 2), [SQUAT, 0, 0], [['', '.hh', 'h'], 7, 1]),
    draw(...bonfire(FIRE_X, 4, 2), [SQUAT, 0, 0], [STICK, 7, 1], [['dd'], 12, 1]),
  ],
  length: 28,
  loop: campfireLoop,
}

export const REST_ACTS: Act[] = [chaise, armchair, fishing, campfire]
