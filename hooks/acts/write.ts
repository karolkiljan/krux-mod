import { SLIDE, STAND, at, draw, line, pingPong, pusher, stander, stroll } from '../stage'
import type { Act, Frame, Layer, Point } from '../stage'

// Odpowiedź: pióro zapisuje runy, siekiera usuwa zbędne litery, dłonie zwijają zwój.
// Każda czynność ma własny rekwizyt i pętlę wracającą do pozy wejściowej.

// ——— Pióro i runy ———
const DESK: Frame = ['hhhhhhhhhhhh', '.x........x.', '.x........x.']
const PAPER: Frame = ['pppppppppp', 'pppppppppp']
const INK: readonly Point[] = [[11, 2], [12, 2], [14, 2], [15, 2], [17, 2], [18, 2]]
function desk(dx = 0): Layer[] {
  return [[DESK, 9 + dx, 3], [PAPER, 10 + dx, 1], [['nn', 'xx'], 19 + dx, 1]]
}
function quillFrame(t: number): Frame {
  const writing = t < 18
  const mark = writing ? Math.floor(t / 3) : Math.max(0, 5 - (t - 18))
  const [x, y] = INK[mark]!
  const done = writing ? mark + (t % 3 === 2 ? 1 : 0) : Math.max(0, 24 - t)
  const hand: Point = [x - 1, 2]
  const orcX = Math.max(2, x - 10)
  return draw(...desk(), ...INK.slice(0, done).map(([xx, yy]) => at('n', xx, yy)),
    [pusher(t, ''), orcX, 0], ...line([orcX + 6, 3], hand, 'g'),
    [['.j', 'jh'], x - 1, 0], at(writing ? 'n' : 'j', x, y))
}
const quill: Act = {
  name: 'skrobanie run',
  intro: [STAND, ...SLIDE.map(dx => draw(...desk(dx), [stander('right'), 0, 0])),
    ...stroll(2, desk()), quillFrame(0)],
  length: 25,
  loop: quillFrame,
}

// ——— Siekiera tnie zbędne litery ———
const LETTERS = [12, 14, 16, 18]
function strip(dx = 0, remaining = 4): Layer[] {
  return [[['ppppppppppp', 'xxxxxxxxxxx'], 10 + dx, 4],
    ...LETTERS.slice(4 - remaining).map(x => [['nn', 'n.'], x + dx, 2] as Layer)]
}
function axeFrame(t: number): Frame {
  const stroke = Math.floor(t / 6)
  const phase = t % 6
  const cutting = t < 24
  const remaining = cutting ? 4 - stroke - (phase >= 3 ? 1 : 0) : t < 30 ? 0 : Math.min(4, 1 + Math.floor((t - 30) / 2))
  const target = cutting ? LETTERS[stroke]! : 12
  const orcX = cutting ? Math.max(2, target - 10) : Math.max(2, 8 - (t - 24))
  const grip: Point = cutting && phase >= 2 && phase <= 4 ? [target - 3, 2] : [orcX + 8, 2]
  const bladeY = cutting && phase === 3 ? 3 : cutting && phase === 2 ? 1 : 0
  const bladeX = cutting && phase >= 2 && phase <= 4 ? target : orcX + 9
  const chips: Layer[] = cutting && phase === 4 ? [at('n', target + 1, 1), at('n', target - 1, 4)] : []
  return draw(...strip(0, remaining), [pusher(t, ''), orcX, 0],
    ...line([orcX + 6, 3], grip, 'g'), ...line(grip, [bladeX, bladeY + 1], 'h'),
    [['SS', 'Ss'], bladeX, bladeY], ...chips)
}
const trimming: Act = {
  name: 'cięcie zbędnych liter',
  intro: [STAND, ...SLIDE.map(dx => draw(...strip(dx), [stander('right'), 0, 0])),
    ...stroll(2, strip()),
    draw(...strip(), [stander('right'), 2, 0], ...line([8, 3], [10, 2], 'g'), [['h'], 10, 2]),
    axeFrame(0)],
  length: 40,
  loop: axeFrame,
}

// ——— Zwijanie zapisanego zwoju ———
function scroll(dx: number, edge: number): Layer[] {
  const body = Math.max(0, 18 - edge)
  return [
    [Array.from({ length: 2 }, () => 'p'.repeat(body)), edge + 1 + dx, 2],
    [['jj', 'pp', 'jj'], edge + dx, 1],
    [['j', 'p', 'j'], 20 + dx, 1],
    ...[12, 14, 16, 18].filter(x => x > edge + 1).map(x => at('n', x + dx, 2)),
  ]
}
function scrollFrame(t: number): Frame {
  const edge = 9 + Math.floor(pingPong(t, 12) / 2)
  const orcX = edge - 9
  return draw(...scroll(0, edge), [pusher(t, ''), orcX, 0],
    ...line([orcX + 6, 3], [edge - 1, 3], 'g'), at('g', edge, 3))
}
const rolling: Act = {
  name: 'zwijanie zwoju',
  intro: [STAND, ...SLIDE.map(dx => draw(...scroll(dx, 9), [stander('right'), 0, 0])),
    draw(...scroll(0, 9), [stander('right', 'g'), 0, 0]), scrollFrame(0)],
  length: 24,
  loop: scrollFrame,
}

export const WRITE_ACTS: Act[] = [quill, trimming, rolling]
