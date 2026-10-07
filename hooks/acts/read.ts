import { SLIDE, at, draw, flame, head, lerp, line, pingPong, stander, stroll, walker } from '../stage'
import type { Act, Frame, Layer, Look, Point } from '../stage'

// Czytanie: zwój, księga na pulpicie, kamienna tablica z runami, książka przy świecy.
// Każdy rekwizyt wyjmuje się, wjeżdża albo wyrasta na oczach; przy zejściu wraca tą samą drogą.

// Stojący ork z rękami przy bokach albo z ręką wyciągniętą w wierszu 3.

// Kreska z pikseli od punktu do punktu, oba końce włącznie.

// Krok za krokiem od kolumny 1 do `to`, rekwizyty stoją.

// ——— Zwój ———
// Oczy biegną po wierszach, zwój zwija się na nowy ustęp i rozwija z powrotem.
const INK = ['n.nnn.nn.n', 'nnn.n.nnn.', 'n.nn.nnn.n']

// Zwój od kolumny 7: drążek, `open` pikseli pergaminu, drążek; górny wiersz w `y`.
function scroll(open: number, y: number): Layer {
  const rows = [0, 1, 2, 3].map(r => {
    const sheet = r === 0 || open < 2 ? 'p'.repeat(open) : `p${INK[r - 1]!.slice(0, open - 2)}p`
    return `h${sheet}h`
  })
  return [rows, 7, y]
}

function scrollOpen(t: number): number {
  // 20 klatek: 12 klatek czytania, zwinięcie do 8, rozwinięcie do 12.
  if (t < 12) return 12
  if (t < 16) return 23 - t
  return t - 7
}

function scrollLoop(t: number): Frame {
  const look: Look = t >= 12 ? 'right' : t % 4 < 2 ? 'mid' : 'right'
  return draw([stander(look, 'g'), 0, 0], scroll(scrollOpen(t), 1))
}

const scrollAct: Act = {
  name: 'zwój',
  intro: [
    // Wyjąć zwinięty zwój zza fartucha, podnieść do oczu, rozwinąć.
    ...[3, 2, 1].map(y => draw([stander('right', 'g'), 0, 0], scroll(0, y))),
    ...[2, 4, 6, 8, 10].map(open => draw([stander('right', 'g'), 0, 0], scroll(open, 1))),
  ],
  length: 20,
  loop: scrollLoop,
}

// ——— Księga na pulpicie ———
const LX = 10
const LECTERN: Frame = ['', '', '', '', '.hhhhhhh.', '..x...x..']
// Strony po 4 piksele w dwóch wierszach; cztery różne, żeby kartkowanie było widać.
const PAGES: readonly Frame[] = [
  ['pnnp', 'pnpp'],
  ['nnpn', 'npnn'],
  ['pnpn', 'nnpp'],
  ['nnnp', 'pnnp'],
]
const CLOSED: Frame = ['', 'BBBBB', 'jjjjB', 'BBBBB']
const SHELF = 3

function lectern(dx: number, book: readonly Layer[]): Layer[] {
  return [[LECTERN, LX + dx, 0], ...book.map(([s, x, y]) => [s, x + dx, y] as Layer)]
}

function openBook(left: number, right: number): Layer[] {
  return [[PAGES[left % 4]!, LX, 1], [['B', 'B'], LX + 4, 1], [PAGES[right % 4]!, LX + 5, 1], [['BBBBBBBBB'], LX, 3]]
}

// Strona w locie nad grzbietem: z prawej, pionowo, z lewej.
const FLIP: readonly Layer[][] = [
  [[['..jj', 'jj'], LX + 5, 0]],
  [[['j', 'j'], LX + 4, 0]],
  [[['jj', '..jj'], LX + 0, 0]],
]

function bookLoop(t: number): Frame {
  // 26 klatek: dwie rozkładówki po 13 — 10 klatek czytania i 3 klatki przewracania.
  const spread = Math.floor(t / 13)
  const p = t % 13
  const turning = p >= 10
  const left = 2 * spread
  const right = turning ? left + 3 : left + 1
  const look: Look = turning ? 'right' : p < 5 ? 'mid' : 'right'
  const flip = turning ? FLIP[p - 10]! : []
  return draw(...lectern(0, openBook(left, right)), ...flip, [stander(look, 'g'), SHELF, 0])
}

const book: Act = {
  name: 'księga',
  intro: [
    // Pulpit z zamkniętą księgą wjeżdża z prawej, Krux podchodzi i otwiera okładkę.
    ...[12, 8, 4, 0].map(dx => draw(...lectern(dx, [[CLOSED, LX + 4, 0]]), [stander('right'), 0, 0])),
    ...stroll(SHELF, lectern(0, [[CLOSED, LX + 4, 0]])),
    draw(...lectern(0, [[PAGES[1]!, LX + 5, 1], [['BBBBB'], LX + 4, 3], [['B', 'B', 'B'], LX + 4, 0]]), [stander('right', 'g'), SHELF, 0]),
    draw(...lectern(0, [[PAGES[1]!, LX + 5, 1], [['BBBBB'], LX + 4, 3], [['BB', '..B'], LX + 2, 1]]), [stander('mid', 'g'), SHELF, 0]),
  ],
  length: 26,
  loop: bookLoop,
}

// ——— Kamienna tablica z runami ———
const TX = 11
const TABLET: Frame = ['.qqqqqq.', 'qqqqqqqq', 'qnqnnqnq', 'qqqqqqqq', 'qnnqnqnq', 'qqqqqqqq']
const SHOULDER: Point = [9, 3]
const TRACE = 3

// Runy jako piksele 'n' tablicy; `lit` mówi, czy palec już przy nich był, `glow` daje kolor.
function tablet(y: number, lit: (x: number, row: number) => boolean, glow: string): Layer[] {
  const rows = TABLET.map((row, r) => [...row].map((cell, c) => (cell === 'n' && lit(TX + c, r) ? glow : cell)).join(''))
  return [[rows, TX, y]]
}

function finger(t: number): Point {
  // Wiersz 2 od lewej, skos w dół, wiersz 4 od lewej, potem ręka wraca na początek.
  if (t < 6) return [12 + t, 2]
  if (t === 6) return [15, 3]
  if (t === 7) return [12, 4]
  if (t < 14) return [12 + t - 8, 4]
  const back = (t - 13) / 8
  return [lerp(17, 12, back), lerp(4, 2, back)]
}

function runesLoop(t: number): Frame {
  // 22 klatki: palec wodzi po dwóch wierszach run, runy płoną, gasną, ręka wraca.
  const [fx, fy] = finger(t)
  const lit = (x: number, row: number) => (t < 6 ? row === 2 && x <= fx : t < 8 ? row === 2 : t < 14 ? row === 2 || x <= fx : true)
  const glow = t < 18 ? 'y' : t < 20 ? 'o' : t < 21 ? 'R' : 'n'
  return draw(...tablet(0, lit, glow), [stander(t >= 14 ? 'mid' : 'right'), TRACE, 0], ...line(SHOULDER, [fx, fy], 'g'))
}

const runes: Act = {
  name: 'tablica',
  intro: [
    // Tablica wyrasta z ziemi wiersz po wierszu, Krux podchodzi i unosi palec.
    ...[5, 4, 3, 2, 1, 0].map(y => draw(...tablet(y, () => false, 'n'), [stander('right'), 0, 0])),
    ...stroll(TRACE, tablet(0, () => false, 'n')),
    draw(...tablet(0, () => false, 'n'), [stander('right'), TRACE, 0], ...line(SHOULDER, [10, 3], 'g')),
    draw(...tablet(0, () => false, 'n'), [stander('right'), TRACE, 0], ...line(SHOULDER, [11, 2], 'g')),
  ],
  length: 22,
  loop: runesLoop,
}

// ——— Książka przy świecy ———
const SX = 4
const STOOL: Frame = ['', '', '', '', 'hhh', 'x.x']
const SEATED: Frame = ['.gggg.', 'grggrg', '.tggt.', 'bbbbbbg', 'bbbGGG', '.....G']
const CROUCH: Frame = ['', '.gggg.', 'grggrg', '.tggt.', 'bbbbbbg', '.bGGG.']
const SMALL_BOOK: Frame = ['pnp', 'BBB']
const CANDLE_AT: Point = [16, 2]

// Świeca na spodeczku: płomień, dwa piksele wosku, spodek; (x, y) to płomień.
function candle(frame: number, x: number, y: number): Layer[] {
  const tip = flame(frame, 0, 1)
  return [[[tip === '.' ? 'o' : tip, 'j', 'j'], x, y], [['hhh'], x - 1, y + 3]]
}

function candleLoop(t: number, frame: number): Frame {
  // 16 klatek: wzrok biegnie po stronie, w połowie Krux przysypia nad książką, płomień drga.
  const nod = t >= 10 && t <= 11
  const look: Look = nod ? 'shut' : t % 4 < 2 ? 'mid' : 'right'
  const bookY = nod ? 2 : 1
  return draw([STOOL, SX, 0], ...candle(frame, ...CANDLE_AT), [SEATED, SX, 0], [head(look), SX, 0], [SMALL_BOOK, SX + 6, bookY])
}

function carrying(step: number, x: number): Frame {
  return draw([STOOL, SX, 0], ...candle(step, x + 6, 0), [walker(step, 'right'), x, 0])
}

const candleAct: Act = {
  name: 'świeca',
  intro: [
    // Stołek wjeżdża z prawej, Krux ze świecą w ręku podchodzi i siada,
    // stawia świecę obok, wyjmuje książkę zza fartucha.
    ...[16, 11, 7].map((x, i) => draw([STOOL, x, 0], ...candle(i, 6, 0), [walker(0, 'right'), 0, 0])),
    ...[1, 2, 3, SX].map((x, i) => carrying(i + 3, x)),
    draw([STOOL, SX, 0], ...candle(7, SX + 6, 1), [CROUCH, SX, 0]),
    draw([STOOL, SX, 0], ...candle(8, 13, 1), [SEATED, SX, 0]),
    draw([STOOL, SX, 0], ...candle(9, 15, 2), [SEATED, SX, 0]),
    ...[4, 3, 2].map((y, i) => draw([STOOL, SX, 0], ...candle(10 + i, ...CANDLE_AT), [SEATED, SX, 0], [SMALL_BOOK, SX + 6, y])),
  ],
  length: 16,
  loop: candleLoop,
}

// ——— Niuch: obwąchiwanie zwoju ———
// Nos zbliża się do starego pergaminu; kichnięcie wygania pył za prawą krawędź.
const SNIFF_SCROLL: Frame = ['hpppph', 'hpnpph', 'hpppph']
const SNIFF_LEAN = [0, 1, 2, 2, 1, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0] as const

function sniffScrollLoop(t: number): Frame {
  const x = SNIFF_LEAN[t]!
  const sneeze = t >= 8 && t <= 10
  const dust: Layer[] = t >= 9 ? [
    at('m', 15 + 2 * (t - 9), 1),
    ...(t >= 10 ? [at('p', 14 + 2 * (t - 9), 2), at('m', 15 + 2 * (t - 9), 3)] : []),
  ] : []
  return draw(
    [stander(sneeze ? 'shut' : 'right'), x, 0],
    ...line([x + 5, 3], [8, 3], 'g'),
    [SNIFF_SCROLL, 9, 1],
    ...dust,
  )
}

const sniffScroll: Act = {
  name: 'obwąchiwanie',
  who: ['Niuch'],
  intro: [
    // Zwój wjeżdża do dłoni; Niuch wyciąga rękę, zanim pergamin do niej dotrze.
    ...SLIDE.map(dx => draw([stander('right', dx <= 2 ? 'ggg' : dx <= 4 ? 'gg' : 'g'), 0, 0], [SNIFF_SCROLL, 9 + dx, 1])),
    sniffScrollLoop(0),
  ],
  length: 16,
  loop: sniffScrollLoop,
}

// ——— Piryt: lupa jubilera ———
// Szkło i zwój przyjeżdżają na pulpicie; lupa wędruje wzdłuż drobnych run.
const JEWEL_SCROLL: Frame = ['hpppppph', 'hpnnpnph']
const JEWEL_DESK: Frame = ['hhhhhhhhh', 'x......x.']
const JEWEL_LENS: Frame = ['.ss.', 'siis', '.ss.']

function jewelerProps(dx: number, lensX: number): Layer[] {
  return [[JEWEL_DESK, 11 + dx, 4], [JEWEL_SCROLL, 11 + dx, 2], [JEWEL_LENS, lensX + dx, 0], at('h', lensX + dx + 1, 3)]
}

function jewelerPose(lensX: number, look: Look): Frame {
  return draw(
    [stander(look), 2, 0],
    ...line([7, 3], [lensX, 3], 'g'),
    ...jewelerProps(0, lensX),
  )
}

function jewelerLoop(t: number): Frame {
  const sweep = pingPong(t, 4)
  const rows = jewelerPose(9 + sweep, sweep < 2 ? 'mid' : 'right')
  return t % 4 === 2 ? draw([rows, 0, 0], at('j', 10 + sweep, 1)) : rows
}

const jeweler: Act = {
  name: 'lupa jubilera',
  who: ['Piryt'],
  intro: [
    // Pulpit wjeżdża z lupą; Piryt podchodzi i przesuwa szkło pod oko.
    ...SLIDE.map(dx => draw(...jewelerProps(dx, 15), [stander('right'), 0, 0])),
    ...stroll(2, jewelerProps(0, 15)),
    ...[15, 14, 13, 12, 11, 10].map(x => jewelerPose(x, 'right')),
    jewelerLoop(0),
  ],
  length: 16,
  loop: jewelerLoop,
}

export const READ_ACTS: Act[] = [scrollAct, book, runes, candleAct, sniffScroll, jeweler]
