import { SQUAT, STAND, at, croucher, draw, head, line, noise, pingPong, stander } from '../stage'
import type { Act, Frame, Layer, Point } from '../stage'

// Szukanie w treści plików: ork świeci, węszy, ogląda ślady przez lupę i płucze złoto.
// Każdy rekwizyt ork przynosi ze sztolni; skała wychodzi z mroku dopiero w świetle pochodni.

// ——— Pochodnia na ścianie ———
const WALL_FROM = 10
const WALL_WIDTH = 12
const BEAM = 3
const VEINS = new Set(['13,1', '14,1', '17,3', '18,4', '20,2'])
const SWEEP = 2 * (WALL_WIDTH - BEAM)

// Ściana odsłonięta na `reveal` kolumn od pochodni; snop światła od kolumny `left`.
function wall(reveal: number, left: number): Layer[] {
  const cells: Layer[] = []
  for (let x = WALL_FROM; x < WALL_FROM + reveal; x += 1) {
    for (let y = 0; y < 6; y += 1) {
      const lit = x >= left && x < left + BEAM
      cells.push(at(lit ? (VEINS.has(`${x},${y}`) ? 'y' : 'q') : 'k', x, y))
    }
  }
  return cells
}

// Pochodnia zgaszona stoi na ziemi, zanim ork ją uniesie.
const UNLIT: Layer[] = [at('h', 8, 4), at('h', 8, 5)]

// Ręka z pochodnią; `fire` 0 zgaszona, 1 tli się, 2 płonie.
function torchInHand(frame: number, fire: number): Layer[] {
  const cells: Layer[] = [[['gg'], 6, 3], at('h', 8, 2), at('h', 8, 3)]
  if (fire >= 1) cells.push(at(noise(frame, 8, 1) < 0.7 ? 'y' : 'o', 8, 1))
  if (fire >= 2) cells.push(at(noise(frame, 8, 0) < 0.5 ? 'o' : 'y', 8, 0))
  return cells
}

function wallLoop(t: number, frame: number): Frame {
  // Snop jeździ tam i z powrotem; oczy idą za nim.
  const left = WALL_FROM + pingPong(t, WALL_WIDTH - BEAM)
  return draw(...wall(WALL_WIDTH, left), [stander(left >= 15 ? 'right' : 'mid'), 0, 0], ...torchInHand(frame, 2))
}

const torchWall: Act = {
  name: 'pochodnia',
  kit: draw(...UNLIT),
  intro: [
    // Sięgnąć po pochodnię, unieść ją z ziemi, skrzesać iskrę.
    draw([STAND, 0, 0], ...line([6, 3], [7, 4], 'g'), ...UNLIT),
    draw([STAND, 0, 0], [['gg'], 6, 3], at('h', 8, 3), at('h', 8, 4)),
    draw([STAND, 0, 0], ...torchInHand(0, 0)),
    draw([stander('right'), 0, 0], ...torchInHand(0, 0)),
    draw([stander('right'), 0, 0], ...torchInHand(0, 0), at('y', 9, 1)),
    draw([stander('right'), 0, 0], ...torchInHand(1, 1)),
    // Płomień rośnie, światło odsłania ścianę od pochodni w głąb.
    draw(...wall(3, WALL_FROM), [stander('mid'), 0, 0], ...torchInHand(2, 2)),
    draw(...wall(6, WALL_FROM), [stander('mid'), 0, 0], ...torchInHand(3, 2)),
    draw(...wall(9, WALL_FROM), [stander('mid'), 0, 0], ...torchInHand(4, 2)),
  ],
  length: SWEEP,
  loop: wallLoop,
}

// ——— Lupa nad ziemią ———
const LENS: Frame = ['.ss.', 'siis', '.ss.']
const CROUCH: Frame = ['', '.gggg.', 'ggrggr', '.tggt.', 'bbbbbbg']
const PRINTS = [10, 13, 17, 20]

// Lupa w dłoni orka stojącego od `x`; `low` to przykuc o piksel niżej.
function lens(x: number, low: number): Layer[] {
  return [at('h', x + 7, 3 + low), at('h', x + 8, 3 + low), [LENS, x + 8, 1 + low]]
}

function magnifyLoop(t: number): Frame {
  // Kaczy chód w prawo i z powrotem; pod szkłem widać ślady stóp, nad śladem szkło błyska.
  const x = pingPong(t, 8)
  const moving = t % 8 !== 0
  const legs = moving && t % 2 === 1 ? '.GGGG.' : 'GG..GG'
  const under = PRINTS.filter(p => p >= x + 8 && p <= x + 11)
  const glint = under.some(p => p === x + 9 || p === x + 10)
  return draw(
    ...under.map(p => at('h', p, 5)),
    [[...CROUCH, legs], x, 0],
    ...lens(x, 1),
    ...(glint ? [at('j', x + 9, 3)] : []),
  )
}

const magnify: Act = {
  name: 'lupa',
  kit: draw(...lens(0, 2)),
  intro: [
    // Chwycić rączkę lupy leżącej na ziemi, podnieść ją i spojrzeć przez szkło.
    draw([STAND, 0, 0], at('g', 6, 4), ...lens(0, 2)),
    draw([STAND, 0, 0], at('g', 6, 4), ...lens(0, 1)),
    draw([STAND, 0, 0], at('g', 6, 3), ...lens(0, 0)),
    draw([stander('right'), 0, 0], at('g', 6, 3), ...lens(0, 0)),
  ],
  length: 16,
  loop: magnifyLoop,
}

// ——— Węszenie po tropie ———
// Pochylony ork: fartuch na plecach poziomo, głowa wysunięta w prawo, nos nad ziemią.
const LEAN: Frame = ['', '.gggg.', 'ggrggr', 'bbbbbb', '.bGGb.', '.G..G.']
const BACK: Frame = ['', '', '..bb', 'bbbbb']
const STRIDE = [['.G..G', '.G..G'], ['.G.G.', '..G.G']] as const

function prints(offset: number, reach: number): Layer[] {
  // Trop: odciski na zmianę lewej i prawej stopy, przesuwają się pod orkiem.
  const cells: Layer[] = []
  for (let x = 8; x < Math.min(22, reach); x += 1) {
    const p = (x + offset) % 8
    if (p === 0) cells.push(at('h', x, 5))
    if (p === 4) cells.push(at('h', x, 4))
  }
  return cells
}

function bent(nose: number, step: number): Layer[] {
  return [[[...BACK, ...STRIDE[step % 2]!], 0, 0], [head('right'), 5, 1 + nose]]
}

function sniffLoop(t: number): Frame {
  // Iść w miejscu za tropem, który przesuwa się w lewo; co cztery klatki nos niżej.
  const nose = t % 4 < 2 ? 1 : 0
  return draw(...prints(Math.floor(t / 2), 22), ...bent(nose, Math.floor(t / 2)))
}

const sniff: Act = {
  name: 'węszenie',
  intro: [
    // Pochylić się, a ślady wypatrywać jeden po drugim, od najbliższego.
    draw([stander('right'), 0, 0]),
    draw([LEAN, 0, 0], [['.tggt.'], 1, 3]),
    draw([[...BACK, ...STRIDE[0]], 0, 0], [head('right'), 4, 0]),
    draw(...prints(0, 12), ...bent(0, 0)),
    draw(...prints(0, 16), ...bent(1, 0)),
    draw(...prints(0, 20), ...bent(1, 0)),
  ],
  length: 16,
  loop: sniffLoop,
}

// ——— Płukanie złota ———
// Rynna płuczkarska: woda w drewnianym korycie, zawsze ta sama długość.
const STREAM_FROM = 11
const SLUICE = 22 - STREAM_FROM - 1

function stream(frame: number): Layer {
  const top = Array.from({ length: SLUICE }, (_, i) => (noise(frame, i, 4) < 0.2 ? 'i' : 'W')).join('')
  return [[`x${top}x`, 'x'.repeat(SLUICE + 2)], STREAM_FROM - 1, 4]
}

// Misa leży przy nogach, zanim ork po nią sięgnie.
const LAID_PAN: Layer = [['S...S', '.SSS.'], 5, 4]

// Misa: brzeg i dno z grafitu, w środku to, co akurat w niej siedzi.
function pan(x: number, y: number, inside: string): Layer[] {
  const cells: Layer[] = [[['S...S', '.SSS.'], x, y]]
  ;[...inside].forEach((cell, i) => cell !== '.' && cells.push(at(cell, x + 1 + i, y)))
  for (let ax = 7; ax < x + 1; ax += 1) cells.push(at('g', ax, 4))
  return cells
}

const PAN_PATH: readonly (readonly [number, number])[] = [
  [7, 3], [8, 3], [9, 4], [10, 4], [10, 4], [9, 4], [8, 3], [7, 3],
]

function panLoop(t: number, frame: number): Frame {
  // 32 klatki: zanurzyć misę, wyjąć, trząść, piasek spływa, zostaje złoto,
  // złoto trafia za fartuch, pusta misa wraca do wody.
  let x = 7
  let y = 3
  let inside = '...'
  const extra: Layer[] = []
  if (t < 8) {
    ;[x, y] = PAN_PATH[t]!
    inside = t < 3 ? '...' : t < 5 ? 'WWW' : 'hWh'
  } else if (t < 20) {
    x = 7 + (t % 2)
    inside = t < 12 ? 'hWh' : t < 15 ? 'WhW' : t < 17 ? 'WyW' : '.y.'
    if (t % 3 === 0) extra.push(at('i', x + 5, 4 + (t % 2)))
  } else if (t < 26) {
    inside = t % 2 === 0 ? '.y.' : '.j.'
  } else {
    // Złoto wędruje do fartucha i znika pod nim.
    const path = [[9, 2], [8, 2], [7, 2], [6, 3], [5, 3], [4, 4]] as const
    const [gx, gy] = path[t - 26]!
    extra.push(at('y', gx, gy))
  }
  const gold = extra.filter(l => l[0][0] === 'y')
  const drips = extra.filter(l => l[0][0] !== 'y')
  return draw(stream(frame), ...gold, [SQUAT, 0, 0], ...pan(x, y, inside), ...drips)
}

const panning: Act = {
  name: 'płukanie',
  kit: draw(stream(0), LAID_PAN),
  intro: [
    // Ork kuca przy rynnie i podnosi misę.
    draw(stream(1), LAID_PAN, [stander('right'), 0, 0]),
    draw(stream(3), LAID_PAN, [SQUAT, 0, 0]),
    ...[4, 5, 6].map((x, i) => draw(stream(4 + i), ...pan(x, 3, '...'), [SQUAT, 0, 0])),
  ],
  length: 32,
  loop: panLoop,
}

// ——— Niuch: trop w świetle pochodni ———
// Nos tuż nad ziemią, dłoń na pochodni; światło wyławia kolejne odciski.
const TRACK_PRINTS: Frame = ['h..h..h', '.h..h..']
const TRACK_TORCH: Frame = ['y', 'o', 'h', 'h', 'h']
const TRACK_BODY: Frame = ['', '', '', '..bbb', 'bbbbbb', '.G..G.']

function trackProps(lean = 0): Layer[] {
  return [[TRACK_PRINTS, 15, 4], [TRACK_TORCH, 13 + lean, 1]]
}

function trackLoop(t: number): Frame {
  const lean = pingPong(t, 4) >= 2 ? 1 : 0
  const legs = t % 4 < 2 ? '.G..G.' : '..G.G.'
  const lit = 15 + 3 * (Math.floor(t / 4) % 3)
  return draw(
    ...trackProps(lean),
    [[...TRACK_BODY.slice(0, 5), legs], 0, 0],
    [head('right'), 5 + lean, 2],
    ...line([6, 5], [12 + lean, 5], 'g'),
    at(t % 2 === 0 ? 'y' : 'o', 13 + lean, 1),
    at('y', lit, 4),
  )
}

const track: Act = {
  name: 'trop',
  who: ['Niuch'],
  kit: draw(...trackProps()),
  intro: [
    // Niuch kuca, pochyla nos i chwyta trzonek pochodni.
    draw(...trackProps(), [croucher('right'), 0, 0]),
    ...[2, 4].map(x => draw(...trackProps(), [TRACK_BODY, 0, 0], [head('right'), x, 1])),
    trackLoop(0),
  ],
  length: 16,
  loop: trackLoop,
}

// ——— Niuch: dymna sonda ———
// Dłoń zagania dym z kadzielnicy ku skale; przeciąg wciąga smugę w szczelinę.
const DRAFT_ROCK: Frame = ['.kkkk', 'kkknk', 'kkknk', 'kknkk', 'kknkk', 'kkkkk']
const CENSER: Frame = ['.o.', 'S.S', '.SS']
const SMOKE_PATH: readonly Point[] = [[11, 2], [12, 1], [13, 1], [14, 2], [15, 2], [16, 2], [17, 2], [18, 2], [19, 2], [20, 2]]

function draftProps(): Layer[] {
  return [[DRAFT_ROCK, 17, 0], [CENSER, 10, 3]]
}

function draftLoop(t: number): Frame {
  const up = pingPong(t, 4)
  const tip = up < 2 ? 3 : up < 4 ? 2 : 1
  // Dwa kolejne piksele tworzą smugę; ostatni znika dopiero wewnątrz szczeliny.
  const smoke: Layer[] = []
  if (t >= 2 && t < 12) smoke.push(at('m', ...SMOKE_PATH[t - 2]!))
  if (t >= 3 && t < 13) smoke.push(at('m', ...SMOKE_PATH[t - 3]!))
  return draw(
    ...draftProps(),
    [stander('right'), 0, 0],
    ...line([5, 3], [7, 3], 'g'),
    ...line([7, 3], [8, tip], 'g'),
    ...smoke,
  )
}

const draft: Act = {
  name: 'dymna sonda',
  who: ['Niuch'],
  kit: draw(...draftProps()),
  intro: [
    // Niuch wyciąga dłoń nad żarem kadzielnicy.
    draw(...draftProps(), [stander('right', 'g'), 0, 0]),
    draw(...draftProps(), [stander('right', 'gg'), 0, 0]),
    draftLoop(0),
  ],
  length: 16,
  loop: draftLoop,
}

export const TORCH_ACTS: Act[] = [torchWall, magnify, sniff, panning, track, draft]
