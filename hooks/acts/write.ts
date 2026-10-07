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

// ——— Kaligrafia Ochry ———
// Sztaluga z arkuszem na wałku, kałamarz z pędzlem u nogi. Trzy runy, trzecia wychodzi krzywo:
// Ochra przygląda się, ściera ją i kładzie prosto, potem przewija arkusz na czysty.
const EASEL: Frame = ['xxxxxxxxx', '', '', '', '.x.....x.', '.x.....x.']
const SHEET: Frame = ['ppppppp', 'ppppppp', 'ppppppp']
const EASEL_AT = 7
// Kałamarz u nogi Ochry; pędzel stoi w nim, póki Ochra go nie weźmie.
const POT_AT = 6
const DIPPED: Frame = ['n', 'h']
// Runy: dwa piksele w pionie; trzecia krzywa, zanim Ochra ją poprawi.
const RUNES: readonly Point[] = [[9, 1], [9, 2], [11, 1], [11, 2], [13, 1], [14, 2]]
const STRAIGHT: Point = [13, 2]

// Sztaluga z kałamarzem przesunięta o `dx`; `marks` to już położone piksele run, `scrolled` —
// o ile wierszy arkusz przewinął się pod wałek.
function easel(dx: number, marks: readonly Point[] = [], scrolled = 0): Layer[] {
  return [
    at('q', POT_AT + dx, 5),
    [SHEET, EASEL_AT + 1 + dx, 1],
    ...marks.map(([x, y]) => at('n', x + dx, y - scrolled)),
    [EASEL, EASEL_AT + dx, 0],
  ]
}

// Pędzel w dłoni: dłoń dwa piksele w lewo i w dół od czubka, trzonek między nimi.
function brushAt(tip: Point, cell = 'n'): Layer[] {
  const [x, y] = tip
  return [...line([6, 3], [x - 2, y + 2], 'g'), at('h', x - 1, y + 1), at(cell, x, y)]
}

// Pędzel uniesiony przy twarzy, gdy Ochra patrzy na robotę.
const RAISED: Layer[] = [at('g', 6, 3), at('h', 7, 2), at('n', 7, 1)]

function calligraphy(t: number): Frame {
  const orc = (look: 'mid' | 'right'): Layer => [stander(look), 0, 0]
  // 0–5: runa po runie, piksel na klatkę; przy szóstym ręka się omsknęła.
  if (t < 6) return draw(...easel(0, RUNES.slice(0, t)), orc('right'), ...brushAt(RUNES[t]!))
  const fixed = [...RUNES.slice(0, 5), STRAIGHT]
  // 6–7: unieść pędzel i przyjrzeć się krzywej runie.
  if (t < 8) return draw(...easel(0, RUNES), orc('right'), ...RAISED)
  // 8: zetrzeć krzywy piksel czystym pędzlem; 9: położyć go prosto.
  if (t === 8) return draw(...easel(0, RUNES.slice(0, 5)), orc('right'), ...brushAt(RUNES[5]!, 'j'))
  if (t === 9) return draw(...easel(0, fixed), orc('right'), ...brushAt(STRAIGHT))
  // 10–11: teraz dobrze, Ochra spogląda z zadowoleniem.
  if (t < 12) return draw(...easel(0, fixed), orc(t === 10 ? 'right' : 'mid'), ...RAISED)
  // 12–13: arkusz przewija się pod wałek, 14: wychodzi czysty.
  return draw(...easel(0, fixed, t - 11), orc('right'), ...RAISED)
}

const calligraphyAct: Act = {
  name: 'kaligrafia',
  who: ['Ochra'],
  intro: [
    // Sztaluga z kałamarzem wjeżdża z prawej, pędzel stoi w kałamarzu.
    ...SLIDE.map(dx => draw(...easel(dx), [DIPPED, POT_AT + dx, 3], [STAND, 0, 0])),
    // Sięgnąć po pędzel i unieść go przy twarzy.
    draw(...easel(0), [DIPPED, POT_AT, 3], [stander('right'), 0, 0], at('g', POT_AT, 4)),
    draw(...easel(0), [DIPPED, POT_AT, 2], [stander('right'), 0, 0], at('g', POT_AT, 3)),
    draw(...easel(0), [stander('right'), 0, 0], ...RAISED),
  ],
  length: 15,
  loop: calligraphy,
}

export const WRITE_ACTS: Act[] = [quill, trimming, rolling, calligraphyAct]
