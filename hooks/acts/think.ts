import { STAND, at, draw, line, pingPong, stander } from '../stage'
import type { Act, Frame, Layer, Point } from '../stage'

// Dumanie: porównanie ciężarów, liczenie kamieni na palcach i wybór drogi na mapie.
// Rekwizyty ork przynosi z półki i tam je odnosi.

// ——— Ważenie rudy ———
const POST = 13
const NEAR = 10
const FAR = 16

function scale(tilt: number): Layer[] {
  const nearY = 1 - tilt
  const farY = 1 + tilt
  return [
    [['x', 'x', 'x'], POST, 2], [['xxx'], POST - 1, 5],
    ...line([NEAR, nearY], [FAR, farY], 'h'),
    at('y', POST, 1),
    ...line([NEAR, nearY + 1], [NEAR, nearY + 2], 'm'),
    ...line([FAR, farY + 1], [FAR, farY + 2], 'm'),
    [['SSS', 'sss'], NEAR - 1, nearY + 2],
    [['kyq', 'sss'], FAR - 1, farY + 2],
  ]
}

function scaleFrame(tilt: number): Frame {
  return draw(...scale(tilt), [stander(tilt < 0 ? 'mid' : 'right'), 0, 0])
}

const weighing: Act = {
  name: 'ważenie rudy',
  kit: draw(...scale(0)),
  intro: [scaleFrame(0)],
  length: 24,
  loop: t => scaleFrame(t < 3 ? 0 : t < 9 ? 1 : t < 12 ? 0 : t < 18 ? -1 : 0),
}

// ——— Liczenie palcami i kamykami ———
const STONES = [14, 16, 18, 20]
function countFrame(shown: number): Frame {
  const fingers = Array.from({ length: shown }, (_, i) => at('g', 8 + i, 2))
  const stones = STONES.map((x, i) => at(i < shown ? 'y' : 'q', x, 5))
  return draw(...stones, [stander('right', 'gg'), 0, 0], [['gggg'], 8, 3], ...fingers)
}

const counting: Act = {
  name: 'liczenie kamyków',
  kit: draw(...STONES.map(x => at('q', x, 5))),
  intro: [
    draw(...STONES.map(x => at('q', x, 5)), [stander('right', 'g'), 0, 0]),
    countFrame(0),
  ],
  length: 32,
  loop: t => countFrame(Math.floor(pingPong(t, 16) / 4)),
}

// ——— Rozważanie dwóch dróg na mapie ———
const MAP: Frame = ['hhhhhhhhhhh', 'hppppppppph', 'hpknnnnppph', 'hpppppknnph', 'hhhhhhhhhhh', '.x.......x.']
const OPTIONS: readonly Point[] = [[11, 2], [12, 1], [13, 2], [14, 3], [15, 2], [16, 1]]
function mapProps(): Layer[] {
  return [[MAP, 10, 0], at('R', 18, 3)]
}
function mapFrame(t: number): Frame {
  const choice = Math.floor(pingPong(t, 12) / 3)
  const [x, y] = OPTIONS[choice]!
  return draw(...mapProps(), [stander(t >= 10 && t <= 14 ? 'mid' : 'right'), 0, 0],
    ...line([6, 3], [9, 3], 'g'), ...line([9, 3], [x, y], 'h'), at('y', x, y))
}

const pondering: Act = {
  name: 'rozważanie mapy',
  kit: draw(...mapProps()),
  intro: [
    draw(...mapProps(), [stander('right', 'g'), 0, 0]),
    draw(...mapProps(), [stander('right', 'ggg'), 0, 0], [['hh'], 9, 3]),
    mapFrame(0),
  ],
  length: 24,
  loop: mapFrame,
}

// ——— Nasłuchiwanie kamertonu ———
// Piryt uderza widełkami o stal, przysuwa je do ucha i słucha.
// Drgający ząb przesuwa się o piksel; oboje oczu zamyka na chwilę.
const SOUND_BENCH: Frame = ['hhhhhhhhhhhhh', '.x.........x.']
const SOUND_STEEL: Frame = ['sssss', 'S.S.S', 'SSSSS']
const FORK_X = [10, 11, 12, 13, 12, 11, 10, 9, 8, 8, 8, 8, 8, 8, 9, 10] as const

function soundBench(): Layer[] {
  return [[SOUND_BENCH, 8, 4], [SOUND_STEEL, 15, 1]]
}

function forkAt(x: number, ringing: boolean): Layer[] {
  const fork: Frame = ringing ? ['s..s', 's..s', 'sss.', '.h..', '.h..'] : ['s.s', 's.s', 'sss', '.h.', '.h.']
  return [[fork, x, 0]]
}

// Piryt drepcze za widełkami, jak przy skrobaniu run: ramię zostaje krótkie, nogi idą, gdy ciało się przesuwa.
const forkStep = (t: number) => Math.max(0, FORK_X[(t + FORK_X.length) % FORK_X.length]! - 9)

function forkLoop(t: number): Frame {
  const x = FORK_X[t]!
  const orcX = forkStep(t)
  const listening = t >= 8 && t <= 11
  const orc = stander(listening ? 'shut' : 'right', 'gg')
  const legs = orcX !== forkStep(t - 1) ? '..GG..' : '.G..G.'
  return draw(...soundBench(), ...forkAt(x, t >= 4 && t <= 11 && t % 2 === 1),
    [[...orc.slice(0, 5), legs], orcX, 0], ...line([orcX + 8, 3], [x + 1, 3], 'g'))
}

const tuningFork: Act = {
  name: 'kamerton',
  who: ['Piryt'],
  kit: draw(...soundBench(), ...forkAt(10, false)),
  intro: [
    draw(...soundBench(), ...forkAt(10, false), [stander('right', 'g'), 0, 0]),
    draw(...soundBench(), ...forkAt(10, false), [stander('right', 'gg'), 0, 0], ...line([8, 3], [9, 3], 'g')),
    forkLoop(0),
  ],
  length: FORK_X.length,
  loop: forkLoop,
}

// ——— Rysa pod lupą Piryta ———
// Lupa sunie wzdłuż stalowej belki, a ciemna rysa przechodzi przez szkło.
// Piryt zatrzymuje lupę na pęknięciu i patrzy, jak rysa żarzy się w szkle: nawet tę stal trzeba podejrzewać.
const CRACKED_BEAM: Frame = ['sssssnsssss', 'SSSSnSSSSSS', '..x.....x..', '..x.....x..']
const CRACK_LENS: Frame = ['.jij.', 'j...j', '.jij.']
// Środek szkła to x + 2; w x = 13 stoi nad rysą (15, 2).
const LENS_SCAN = [10, 10, 11, 12, 13, 13, 13, 13, 14, 15, 16, 15, 14, 13, 12, 11] as const
const CRACK: Point = [15, 2]

function crackAt(x: number): Layer[] {
  return [[CRACKED_BEAM, 10, 2],
    ...line([x - 1, 4], [x + 1, 3], 'h'), [CRACK_LENS, x, 1]]
}

// Piryt idzie za lupą o krok, żeby ramię nie rosło.
const lensStep = (t: number) => Math.max(0, LENS_SCAN[(t + LENS_SCAN.length) % LENS_SCAN.length]! - 11)

function crackLoop(t: number): Frame {
  const x = LENS_SCAN[t]!
  const orcX = lensStep(t)
  const found = t >= 5 && t <= 7
  const orc = stander('right', 'gg')
  const legs = orcX !== lensStep(t - 1) ? '..GG..' : '.G..G.'
  return draw(...crackAt(x), ...(found ? [at('R', ...CRACK)] : []), [[...orc.slice(0, 5), legs], orcX, 0],
    ...line([orcX + 8, 3], [x - 2, 4], 'g'))
}

const crack: Act = {
  name: 'rysa pod lupą',
  who: ['Piryt'],
  kit: draw(...crackAt(10)),
  intro: [
    draw(...crackAt(10), [stander('right', 'g'), 0, 0]),
    draw(...crackAt(10), [stander('right', 'gg'), 0, 0]),
    crackLoop(0),
  ],
  length: LENS_SCAN.length,
  loop: crackLoop,
}

export const THINK_ACTS: Act[] = [weighing, counting, pondering, tuningFork, crack]
