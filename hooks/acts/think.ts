import { SLIDE, STAND, at, draw, line, pingPong, stander } from '../stage'
import type { Act, Frame, Layer, Point } from '../stage'

// Dumanie: porównanie ciężarów, liczenie kamieni na palcach i wybór drogi na mapie.
// Rekwizyty wjeżdżają przy wejściu; ta sama droga puszczona wstecz je zabiera.

// ——— Ważenie rudy ———
const POST = 13
const NEAR = 10
const FAR = 16

function scale(dx: number, tilt: number): Layer[] {
  const nearY = 1 - tilt
  const farY = 1 + tilt
  return [
    [['x', 'x', 'x'], POST + dx, 2], [['xxx'], POST - 1 + dx, 5],
    ...line([NEAR + dx, nearY], [FAR + dx, farY], 'h'),
    at('y', POST + dx, 1),
    ...line([NEAR + dx, nearY + 1], [NEAR + dx, nearY + 2], 'm'),
    ...line([FAR + dx, farY + 1], [FAR + dx, farY + 2], 'm'),
    [['SSS', 'sss'], NEAR - 1 + dx, nearY + 2],
    [['kyq', 'sss'], FAR - 1 + dx, farY + 2],
  ]
}

function scaleFrame(tilt: number, dx = 0): Frame {
  return draw(...scale(dx, tilt), [stander(tilt < 0 ? 'mid' : 'right'), 0, 0])
}

const weighing: Act = {
  name: 'ważenie rudy',
  intro: [STAND, ...SLIDE.map(dx => scaleFrame(0, dx))],
  length: 24,
  loop: t => scaleFrame(t < 3 ? 0 : t < 9 ? 1 : t < 12 ? 0 : t < 18 ? -1 : 0),
}

// ——— Liczenie palcami i kamykami ———
const STONES = [14, 16, 18, 20]
function countFrame(shown: number, dx = 0): Frame {
  const fingers = Array.from({ length: shown }, (_, i) => at('g', 8 + i, 2))
  const stones = STONES.map((x, i) => at(i < shown ? 'y' : 'q', x + dx, 5))
  return draw(...stones, [stander('right', 'gg'), 0, 0], [['gggg'], 8, 3], ...fingers)
}

const counting: Act = {
  name: 'liczenie kamyków',
  intro: [
    STAND,
    ...SLIDE.map(dx => draw(...STONES.map(x => at('q', x + dx, 5)), [stander('right'), 0, 0])),
    draw(...STONES.map(x => at('q', x, 5)), [stander('right', 'g'), 0, 0]),
    countFrame(0),
  ],
  length: 32,
  loop: t => countFrame(Math.floor(pingPong(t, 16) / 4)),
}

// ——— Rozważanie dwóch dróg na mapie ———
const MAP: Frame = ['hhhhhhhhhhh', 'hppppppppph', 'hpknnnnppph', 'hpppppknnph', 'hhhhhhhhhhh', '.x.......x.']
const OPTIONS: readonly Point[] = [[11, 2], [12, 1], [13, 2], [14, 3], [15, 2], [16, 1]]
function mapProps(dx = 0): Layer[] {
  return [[MAP, 10 + dx, 0], at('R', 18 + dx, 3)]
}
function mapFrame(t: number): Frame {
  const choice = Math.floor(pingPong(t, 12) / 3)
  const [x, y] = OPTIONS[choice]!
  return draw(...mapProps(), [stander(t >= 10 && t <= 14 ? 'mid' : 'right'), 0, 0],
    ...line([6, 3], [9, 3], 'g'), ...line([9, 3], [x, y], 'h'), at('y', x, y))
}

const pondering: Act = {
  name: 'rozważanie mapy',
  intro: [
    STAND, ...SLIDE.map(dx => draw(...mapProps(dx), [stander('right'), 0, 0])),
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

function soundBench(dx: number): Layer[] {
  return [[SOUND_BENCH, 8 + dx, 4], [SOUND_STEEL, 15 + dx, 1]]
}

function forkAt(x: number, ringing: boolean): Layer[] {
  const fork: Frame = ringing ? ['s..s', 's..s', 'sss.', '.h..', '.h..'] : ['s.s', 's.s', 'sss', '.h.', '.h.']
  return [[fork, x, 0]]
}

function forkLoop(t: number): Frame {
  const x = FORK_X[t]!
  const listening = t >= 8 && t <= 11
  return draw(...soundBench(0), ...forkAt(x, t >= 4 && t <= 11 && t % 2 === 1),
    [stander(listening ? 'shut' : 'right', 'gg'), 0, 0], ...line([8, 3], [x + 1, 3], 'g'))
}

const tuningFork: Act = {
  name: 'kamerton',
  who: ['Piryt'],
  intro: [
    ...SLIDE.map(dx => draw(...soundBench(dx), ...forkAt(10 + dx, false), [STAND, 0, 0])),
    draw(...soundBench(0), ...forkAt(10, false), [stander('right', 'g'), 0, 0]),
    draw(...soundBench(0), ...forkAt(10, false), [stander('right', 'gg'), 0, 0], ...line([8, 3], [9, 3], 'g')),
    forkLoop(0),
  ],
  length: FORK_X.length,
  loop: forkLoop,
}

export const THINK_ACTS: Act[] = [weighing, counting, pondering, tuningFork]
