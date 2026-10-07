import { SLIDE, STAND, draw, line, pingPong, stander } from '../stage'
import type { Act, Frame, Layer } from '../stage'

// Zatwierdzanie roboty: pieczęć w wosku, prasa i przewiązany zwój.
// Wszystkie rekwizyty wjeżdżają; odwrócone wejście odkłada narzędzie.
const BENCH: Frame = ['hhhhhhhhhhhhh', '.x.........x.']
const BENCH_X = 8

// ——— Pieczęć w wosku ———
const PAPER: Frame = ['pnnppnnpppp', 'ppppppppppp']
const STAMP: Frame = ['.h.', 'SSS']
const STAMP_Y = [1, 1, 2, 2, 3, 3, 3, 2, 1, 1, 1, 1] as const

function waxBench(dx: number, sealed: boolean): Layer[] {
  return [[BENCH, BENCH_X + dx, 4], [PAPER, 9 + dx, 3], [[sealed ? 'dSd' : 'ddd'], 15 + dx, 3]]
}

function stampAt(y: number): Layer[] {
  return [[STAMP, 15, y], ...line([8, 3], [15, y], 'g')]
}

function waxLoop(t: number): Frame {
  const y = STAMP_Y[t]!
  const pressing = t >= 4 && t <= 6
  return draw(...waxBench(0, t >= 4), [stander(pressing ? 'mid' : 'right', 'gg'), 0, 0], ...stampAt(y), ...(pressing ? [[['d'], 14, 4] as Layer, [['d'], 18, 4] as Layer] : []))
}

const wax: Act = {
  name: 'wosk',
  intro: [
    ...SLIDE.map(dx => draw(...waxBench(dx, false), [STAMP, 15 + dx, 1], [STAND, 0, 0])),
    draw(...waxBench(0, false), [STAMP, 15, 1], [stander('right', 'g'), 0, 0]),
    draw(...waxBench(0, false), [stander('right', 'gg'), 0, 0], ...line([8, 3], [11, 2], 'g'), [STAMP, 15, 1]),
    draw(...waxBench(0, false), [stander('right', 'gg'), 0, 0], ...stampAt(1)),
  ],
  length: STAMP_Y.length,
  loop: waxLoop,
}

// ——— Odcisk pod prasą ———
const PRESS: Frame = ['sssssssss', 's...h...s', 's...h...s', 's.......s', 's.ppppp.s', 'sssssssss']
const PRESS_X = 12
const PRESS_DOWN = [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0] as const

function pressAt(dx: number, down: number, printed: boolean): Layer[] {
  return [[PRESS, PRESS_X + dx, 0], [['SSSSS'], PRESS_X + dx + 2, 1 + down], ...(printed ? [[['pnpnp'], PRESS_X + dx + 2, 4] as Layer] : [])]
}

function pressLever(down: number): Layer[] {
  return [...line([11, 2], [8, 1 + down], 'h'), ...line([6, 3], [8, 1 + down], 'g')]
}

function pressLoop(t: number): Frame {
  const down = PRESS_DOWN[t]!
  return draw(...pressAt(0, down, t >= 5), [stander(down === 2 ? 'mid' : 'right'), 0, 0], ...pressLever(down))
}

const press: Act = {
  name: 'prasa',
  intro: [
    ...SLIDE.map(dx => draw(...pressAt(dx, 0, false), ...line([11 + dx, 2], [8 + dx, 1], 'h'), [STAND, 0, 0])),
    draw(...pressAt(0, 0, false), ...line([11, 2], [8, 1], 'h'), [stander('right', 'g'), 0, 0]),
    draw(...pressAt(0, 0, false), [stander('right'), 0, 0], ...pressLever(0)),
  ],
  length: PRESS_DOWN.length,
  loop: pressLoop,
}

// ——— Wiązanie zwoju ———
const ROLL: Frame = ['.ppppppp.', 'hppppppph', '.ppppppp.']
const ROLL_X = 11

function rollAt(dx: number, tight: number, knot: boolean): Layer[] {
  const cord = tight === 0 ? [[['ddddddd'], ROLL_X + dx + 1, 1] as Layer] : [
    [['d', 'd', 'd'], ROLL_X + dx + 4, 1] as Layer,
    ...line([ROLL_X + dx + 4, 1], [ROLL_X + dx + 1 + tight, 0], 'd'),
    ...line([ROLL_X + dx + 4, 1], [ROLL_X + dx + 7 - tight, 0], 'd'),
  ]
  return [[BENCH, BENCH_X + dx, 4], [ROLL, ROLL_X + dx, 1], ...cord, ...(knot ? [[['d.d', '.d.'], ROLL_X + dx + 3, 0] as Layer] : [])]
}

function tieLoop(t: number): Frame {
  // Naciągnąć sznur, skrzyżować końce, rozluźnić przed kolejnym węzłem.
  const tight = Math.min(3, Math.floor(pingPong(t, 8) / 2))
  const knot = t >= 6 && t <= 10
  const handY = tight > 1 ? 0 : 1
  return draw(...rollAt(0, tight, knot), [stander('right', 'gg'), 0, 0], ...line([8, 3], [12 + tight, handY], 'g'))
}

const tie: Act = {
  name: 'zwój ze sznurem',
  intro: [
    ...SLIDE.map(dx => draw(...rollAt(dx, 0, false), [STAND, 0, 0])),
    draw(...rollAt(0, 0, false), [stander('right', 'g'), 0, 0]),
    draw(...rollAt(0, 0, false), [stander('right', 'gg'), 0, 0], ...line([8, 3], [10, 2], 'g')),
    draw(...rollAt(0, 0, false), [stander('right', 'gg'), 0, 0], ...line([8, 3], [12, 1], 'g')),
  ],
  length: 16,
  loop: tieLoop,
}

// ——— Pieczęć pod światło ———
// Piryt podnosi pergamin ku świecy i mruży oboje oczu.
// Pieczęć jedzie na pergaminie, świeca na stole; nic nie znika.
const SEALED_PAPER: Frame = ['ppdpp', 'pdydp', 'ppdpp']
const CANDLE: Frame = ['.y.', '.o.', '.p.', '.p.', 'sss']

function lightBench(dx: number, x: number, y: number): Layer[] {
  return [[BENCH, BENCH_X + dx, 4], [CANDLE, 18 + dx, 0], [SEALED_PAPER, x + dx, y]]
}

function lightLoop(t: number): Frame {
  const x = 10 + Math.floor(pingPong(t, 8) / 3)
  const y = t < 3 || t >= 13 ? 1 : 0
  return draw(...lightBench(0, x, y), [stander(t >= 6 && t <= 9 ? 'shut' : 'right', 'gg'), 0, 0], ...line([8, 3], [x, y + 2], 'g'))
}

const light: Act = {
  name: 'pod światło',
  who: ['Piryt'],
  intro: [
    ...SLIDE.map(dx => draw(...lightBench(dx, 10, 1), [STAND, 0, 0])),
    draw(...lightBench(0, 10, 1), [stander('right', 'g'), 0, 0]),
    draw(...lightBench(0, 10, 1), [stander('right', 'gg'), 0, 0], ...line([8, 3], [9, 3], 'g')),
    lightLoop(0),
  ],
  length: 16,
  loop: lightLoop,
}

// ——— Pomiar pieczęci Piryta ———
// Szczęka suwmiarki zaciska się na metalowej pieczęci i wraca.
// Piryt mruży oczy nad ciemną rysą, zanim zatwierdzi odcisk.
const SEAL_MEDAL: Frame = ['.yyy.', 'ysnsy', '.yyy.']
const CALIPER_JAW = [21, 21, 20, 20, 19, 19, 19, 19, 19, 19, 19, 20, 20, 21, 21, 21] as const

function measureSealAt(dx: number, jaw: number): Layer[] {
  return [[BENCH, BENCH_X + dx, 4], [SEAL_MEDAL, 15 + dx, 1],
    [['sjsjsjsjs'], 13 + dx, 0], [['S', 'S'], 14 + dx, 1], [['S', 'S'], jaw + dx, 1],
    ...line([13 + dx, 3], [14 + dx, 2], 'h')]
}

function measureSealLoop(t: number): Frame {
  return draw(...measureSealAt(0, CALIPER_JAW[t]!),
    [stander(t >= 6 && t <= 9 ? 'shut' : 'right', 'gg'), 0, 0],
    ...line([8, 3], [13, 3], 'g'), [['g'], 13, 2])
}

const measureSeal: Act = {
  name: 'pomiar pieczęci',
  who: ['Piryt'],
  intro: [
    ...SLIDE.map(dx => draw(...measureSealAt(dx, 21), [STAND, 0, 0])),
    draw(...measureSealAt(0, 21), [stander('right', 'g'), 0, 0]),
    draw(...measureSealAt(0, 21), [stander('right', 'gg'), 0, 0], ...line([8, 3], [10, 3], 'g')),
    draw(...measureSealAt(0, 21), [stander('right', 'gg'), 0, 0], ...line([8, 3], [12, 3], 'g')),
    measureSealLoop(0),
  ],
  length: CALIPER_JAW.length,
  loop: measureSealLoop,
}

export const SEAL_ACTS: Act[] = [wax, press, tie, light, measureSeal]
