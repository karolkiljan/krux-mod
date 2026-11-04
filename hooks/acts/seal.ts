import { STAND, draw, line, pingPong, stander } from '../stage'
import type { Act, Frame, Layer } from '../stage'

// Zatwierdzanie roboty: pieczęć w wosku, prasa i przewiązany zwój.
// Rekwizyty ork przynosi ze ściany kuźni; odwrócone wejście odkłada narzędzie.
const BENCH: Frame = ['hhhhhhhhhhhhh', '.x.........x.']
const BENCH_X = 8

// ——— Pieczęć w wosku ———
// Wosk leży na lewym brzegu pergaminu, tuż przy orku: stempel w dłoni, nie na końcu ręki.
const PAPER: Frame = ['pnnppnnpppp', 'ppppppppppp']
const STAMP: Frame = ['.h.', 'SSS']
const STAMP_X = 10
// Lico stempla w wierszu y + 1: w powietrzu, na wosku (1) i w wosku (2), nie w pergaminie.
const STAMP_Y = [0, 0, 1, 1, 2, 2, 2, 1, 0, 0, 0, 0] as const

function waxBench(sealed: boolean): Layer[] {
  return [[BENCH, BENCH_X, 4], [PAPER, 9, 3], [[sealed ? 'dSd' : 'ddd'], STAMP_X, 3]]
}

function stampAt(y: number): Layer[] {
  return [[STAMP, STAMP_X, y], ...line([6, 3], [STAMP_X, y], 'g')]
}

function waxLoop(t: number): Frame {
  const y = STAMP_Y[t]!
  const pressing = t >= 4 && t <= 6
  // Wciśnięty stempel wypycha wosk spod lica na boki.
  const squeezed: Layer[] = pressing ? [[['d'], STAMP_X - 1, 3], [['d'], STAMP_X + 3, 3]] : []
  return draw(...waxBench(t >= 4), [stander(pressing ? 'mid' : 'right', 'g'), 0, 0], ...stampAt(y), ...squeezed)
}

const wax: Act = {
  name: 'wosk',
  kit: draw(...waxBench(false), [STAMP, STAMP_X, 1]),
  intro: [
    draw(...waxBench(false), [STAMP, STAMP_X, 1], [stander('right', 'g'), 0, 0]),
    draw(...waxBench(false), [STAMP, STAMP_X, 1], [stander('right', 'g'), 0, 0], ...line([6, 3], [8, 2], 'g')),
    draw(...waxBench(false), [stander('right', 'g'), 0, 0], ...stampAt(1)),
  ],
  length: STAMP_Y.length,
  loop: waxLoop,
}

// ——— Odcisk pod prasą ———
const PRESS: Frame = ['sssssssss', 's...h...s', 's...h...s', 's.......s', 's.ppppp.s', 'sssssssss']
const PRESS_X = 12
const PRESS_DOWN = [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0] as const

function pressAt(down: number, printed: boolean): Layer[] {
  return [[PRESS, PRESS_X, 0], [['SSSSS'], PRESS_X + 2, 1 + down], ...(printed ? [[['pnpnp'], PRESS_X + 2, 4] as Layer] : [])]
}

function pressLever(down: number): Layer[] {
  return [...line([11, 2], [8, 1 + down], 'h'), ...line([6, 3], [8, 1 + down], 'g')]
}

function pressLoop(t: number): Frame {
  const down = PRESS_DOWN[t]!
  return draw(...pressAt(down, t >= 5), [stander(down === 2 ? 'mid' : 'right'), 0, 0], ...pressLever(down))
}

const press: Act = {
  name: 'prasa',
  kit: draw(...pressAt(0, false), ...line([11, 2], [8, 1], 'h')),
  intro: [
    draw(...pressAt(0, false), ...line([11, 2], [8, 1], 'h'), [stander('right', 'g'), 0, 0]),
    draw(...pressAt(0, false), [stander('right'), 0, 0], ...pressLever(0)),
  ],
  length: PRESS_DOWN.length,
  loop: pressLoop,
}

// ——— Wiązanie zwoju ———
const ROLL: Frame = ['.ppppppp.', 'hppppppph', '.ppppppp.']
const ROLL_X = 7

function rollAt(tight: number, knot: boolean): Layer[] {
  const cord = tight === 0 ? [[['ddddddd'], ROLL_X + 1, 1] as Layer] : [
    [['d', 'd', 'd'], ROLL_X + 4, 1] as Layer,
    ...line([ROLL_X + 4, 1], [ROLL_X + 1 + tight, 0], 'd'),
    ...line([ROLL_X + 4, 1], [ROLL_X + 7 - tight, 0], 'd'),
  ]
  return [[BENCH, BENCH_X, 4], [ROLL, ROLL_X, 1], ...cord, ...(knot ? [[['d.d', '.d.'], ROLL_X + 3, 0] as Layer] : [])]
}

function tieLoop(t: number): Frame {
  // Naciągnąć sznur, skrzyżować końce, rozluźnić przed kolejnym węzłem.
  const tight = Math.min(3, Math.floor(pingPong(t, 8) / 2))
  const knot = t >= 6 && t <= 10
  const handY = tight > 1 ? 0 : 1
  // Dłoń trzyma lewy koniec sznura.
  return draw(...rollAt(tight, knot), [stander('right', 'g'), 0, 0], ...line([6, 3], [ROLL_X + 1 + tight, handY], 'g'))
}

const tie: Act = {
  name: 'zwój ze sznurem',
  kit: draw(...rollAt(0, false)),
  intro: [
    draw(...rollAt(0, false), [stander('right', 'g'), 0, 0]),
    tieLoop(0),
  ],
  length: 16,
  loop: tieLoop,
}

// ——— Pieczęć pod światło ———
// Piryt podnosi pergamin ku świecy i mruży oboje oczu.
// Pieczęć jedzie na pergaminie, świeca na stole; nic nie znika.
const SEALED_PAPER: Frame = ['ppdpp', 'pdydp', 'ppdpp']
const CANDLE: Frame = ['.y.', '.o.', '.p.', '.p.', 'sss']
// Pergamin od dłoni ku świecy: lewy brzeg w PAPER_X i dwa piksele dalej.
const PAPER_X = 8

function lightBench(x: number, y: number): Layer[] {
  return [[BENCH, BENCH_X, 4], [CANDLE, PAPER_X + 8, 0], [SEALED_PAPER, x, y]]
}

function lightLoop(t: number): Frame {
  const x = PAPER_X + Math.floor(pingPong(t, 8) / 3)
  const y = t < 3 || t >= 13 ? 1 : 0
  return draw(...lightBench(x, y), [stander(t >= 6 && t <= 9 ? 'shut' : 'right', 'g'), 0, 0], ...line([6, 3], [x, y + 2], 'g'))
}

const light: Act = {
  name: 'pod światło',
  who: ['Piryt'],
  kit: draw(...lightBench(PAPER_X, 1)),
  intro: [
    draw(...lightBench(PAPER_X, 1), [stander('right', 'g'), 0, 0]),
    lightLoop(0),
  ],
  length: 16,
  loop: lightLoop,
}

// ——— Pomiar pieczęci Piryta ———
// Szczęka suwmiarki zaciska się na metalowej pieczęci i wraca.
// Piryt mruży oczy nad ciemną rysą, zanim zatwierdzi odcisk.
const SEAL_MEDAL: Frame = ['.yyy.', 'ysnsy', '.yyy.']
const MEDAL_X = 11
// Ruchoma szczęka domyka się na prawym brzegu pieczęci (MEDAL_X + 5), nie wchodzi w nią.
const CALIPER_JAW = [18, 18, 17, 17, 16, 16, 16, 16, 16, 16, 16, 17, 17, 18, 18, 18] as const

function measureSealAt(jaw: number): Layer[] {
  return [[BENCH, BENCH_X, 4], [SEAL_MEDAL, MEDAL_X, 1],
    [['sjsjsjsjsj'], MEDAL_X - 2, 0], [['S', 'S'], MEDAL_X - 1, 1], [['S', 'S'], jaw, 1],
    ...line([MEDAL_X - 2, 3], [MEDAL_X - 1, 2], 'h')]
}

function measureSealLoop(t: number): Frame {
  return draw(...measureSealAt(CALIPER_JAW[t]!),
    [stander(t >= 6 && t <= 9 ? 'shut' : 'right', 'g'), 0, 0],
    ...line([6, 3], [MEDAL_X - 2, 3], 'g'), [['g'], MEDAL_X - 2, 2])
}

const measureSeal: Act = {
  name: 'pomiar pieczęci',
  who: ['Piryt'],
  kit: draw(...measureSealAt(CALIPER_JAW[0])),
  intro: [
    draw(...measureSealAt(CALIPER_JAW[0]), [stander('right', 'g'), 0, 0]),
    draw(...measureSealAt(CALIPER_JAW[0]), [stander('right', 'g'), 0, 0], ...line([6, 3], [7, 3], 'g')),
    measureSealLoop(0),
  ],
  length: CALIPER_JAW.length,
  loop: measureSealLoop,
}

export const SEAL_ACTS: Act[] = [wax, press, tie, light, measureSeal]
