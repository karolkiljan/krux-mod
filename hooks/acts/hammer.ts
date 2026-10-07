import { SLIDE, STAND, at, draw, lerp, line, noise, pingPong, pusher, stander } from '../stage'
import type { Act, Frame, Layer } from '../stage'

// Kuźnia przy Edit i Write. Każdy warsztat wjeżdża z prawej z narzędziem na sobie,
// Krux sięga po nie i bierze się do roboty; przy zejściu odkłada narzędzie i warsztat odjeżdża.

// Stójka z ręką wyciągniętą przed siebie na wysokości fartucha.
const REACH: Frame = stander('mid', 'gg')

// ——— Kowadło ———
const POSES: Record<'up' | 'mid' | 'strike' | 'sparks', Frame> = {
  up: [
    '.gggg..SSS............',
    'grggrg..h.............',
    '.tggt...h.............',
    'bbbbbbgg..............',
    '.bGGb......ssRRRss....',
    '.G..G........sss......',
  ],
  mid: [
    '.gggg.................',
    'grggrg.....SS.........',
    '.tggt...hhhSS.........',
    'bbbbbbgg..............',
    '.bGGb......ssRRRss....',
    '.G..G........sss......',
  ],
  strike: [
    '.gggg........y...o....',
    'grggrg.....o...y......',
    '.tggt.........o.......',
    'bbbbbbgghhhhhSSS......',
    '.bGGb......ssRRRss....',
    '.G..G........sss......',
  ],
  sparks: [
    '.gggg.......o.....y...',
    'grggrg..........o.....',
    '.tggt.....y...........',
    'bbbbbbgghhhhhSSS......',
    '.bGGb......ssooRss....',
    '.G..G........sss......',
  ],
}

const CYCLE = ['up', 'up', 'mid', 'strike', 'sparks', 'mid', 'up', 'up'] as const
const ANVIL: Frame = ['ssRRRss', '..sss..']
const ANVIL_AT = 11

// Kowadło z młotem położonym na rozgrzanej sztabie.
const anvilAt = (x: number): Layer[] => [[ANVIL, x, 4], [['hhhhhSSS'], x - 3, 3]]

// Kowadło: wjeżdża z młotem na grzbiecie, Krux chwyta trzonek i unosi młot; pętla to zamach, uderzenie, iskry.
const anvil: Act = {
  name: 'kowadło',
  who: ['Krux', 'Grom'],
  intro: [
    ...SLIDE.map(dx => draw(...anvilAt(ANVIL_AT + dx), [STAND, 0, 0])),
    draw(...anvilAt(ANVIL_AT), [REACH, 0, 0]),
    POSES.mid,
  ],
  length: CYCLE.length,
  loop: t => POSES[CYCLE[t]!],
}

// ——— Hebel ———
const BENCH: Frame = ['hhhhhhhhhhhh', '.x........x.']
const BENCH_AT = 8
const PLANE: Frame = ['.x', 'xxS']

// Wiór z czoła hebla zwija się w górę i w prawo.
function shavings(t: number, at: (t: number) => number): Layer[] {
  const out: Layer[] = []
  for (let age = 0; age < 3; age += 1) {
    const born = t - age
    if (born < 1 || born > 8) continue
    out.push([[age === 0 ? 'j' : 'p'], at(born) + 11 + age, 2 - age])
  }
  return out
}

function planeLoop(t: number): Frame {
  // 16 klatek: pchnięcie przez 8 klatek z wiórami, powrót bez wiórów.
  const at = (s: number) => lerp(0, 3, pingPong(s, 8) / 8)
  const x = at(t)
  return draw([BENCH, BENCH_AT, 4], [PLANE, x + 8, 2], [pusher(x), x, 0], ...(t <= 8 ? shavings(t, at) : []))
}

const plane: Act = {
  name: 'hebel',
  intro: [
    // Kozioł z deską i heblem wjeżdża, Krux sięga po hebel.
    ...SLIDE.map(dx => draw([BENCH, BENCH_AT + dx, 4], [PLANE, BENCH_AT + dx, 2], [STAND, 0, 0])),
    draw([BENCH, BENCH_AT, 4], [PLANE, BENCH_AT, 2], [stander('mid', 'g'), 0, 0]),
  ],
  length: 16,
  loop: planeLoop,
}

// ——— Szlifierka ———
const WHEEL_AT = 13
const RIM: Frame = ['.qqq.', 'qcccq', 'qcScq', 'qcccq', '.qqq.']
// Osiem pól wokół piasty, w kolejności zegara.
const RING = [[1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [1, 2]] as const

// Tarcza z dwiema kreskami naprzeciw siebie: obrót o pole na klatkę.
function wheel(x: number, turn: number): Layer[] {
  const marks = [turn % 8, (turn + 4) % 8].map(i => [['q'], x + RING[i]![0], RING[i]![1]] as Layer)
  return [[RIM, x, 0], ...marks, [['xxxxxxxxxxx'], x - 5, 5]]
}

// Ostrze: rękojeść 'x', klinga do lewej krawędzi tarczy.
const blade = (x: number, y: number): Layer => [['xssss'], x, y]

const pressing = (t: number) => t < 12

function grindSparks(t: number, frame: number): Layer[] {
  const out: Layer[] = []
  for (let age = 0; age < 4; age += 1) {
    const born = (t - age + 16) % 16
    if (!pressing(born)) continue
    const drift = noise(born, 1, 2) < 0.5 ? 0 : 1
    out.push([[noise(frame, age, 3) < 0.5 ? 'y' : 'o'], 12 - age - drift * Math.floor(age / 2), 2 - age])
  }
  return out
}

function grindLoop(t: number, frame: number): Frame {
  // 16 klatek: dociskać klingę do kręcącej się tarczy, iskry lecą w górę; potem odsunąć i obejrzeć.
  const on = pressing(t)
  return draw(...wheel(WHEEL_AT, t), [stander(on ? 'mid' : 'right', on ? 'gg' : 'g'), 0, 0], blade(on ? 8 : 7, 3), ...grindSparks(t, frame))
}

const grind: Act = {
  name: 'szlifierka',
  intro: [
    // Szlifierka z klingą na podstawie wjeżdża, tarcza toczy się po drodze.
    ...SLIDE.map((dx, i) => draw(...wheel(WHEEL_AT + dx, i), blade(8 + dx, 4), [STAND, 0, 0])),
    // Schylić rękę po klingę.
    draw(...wheel(WHEEL_AT, 7), blade(8, 4), [[...STAND.slice(0, 3), 'bbbbbbg', '.bGGb..g', STAND[5]!], 0, 0]),
  ],
  length: 16,
  loop: grindLoop,
}

// ——— Nity ———
const PLATES: Frame = ['sssSssSsss', '..x....x..']
const RIVET_SWING = [[9, 0], [9, 0], [10, 1], [11, 3], [11, 3], [10, 2], [9, 1], [9, 0],
  [10, 0], [11, 1], [12, 2], [14, 3], [14, 3], [13, 2], [11, 1], [10, 0]] as const

function rivetWork(x: number, y: number, strike = false): Frame {
  return draw(
    [PLATES, 9, 4], [STAND, 0, 0],
    ...line([5, 3], [7, 2], 'g'), ...line([6, 3], [8, 3], 'g'),
    ...line([8, 2], [x + 1, y + 1], 'h'), [['SSS'], x, y],
    ...(strike ? [at('y', x + 3, 2), at('o', x + 4, 1)] : []),
  )
}

// Nity: Grom chwyta młot obiema rękami i na zmianę zbija dwa łączenia blach.
const rivets: Act = {
  name: 'nity',
  who: ['Grom'],
  intro: [
    ...SLIDE.map(dx => draw([PLATES, 9 + dx, 4], [['hhhhhSSS'], 8 + dx, 2], [STAND, 0, 0])),
    draw([PLATES, 9, 4], [['hhhhhSSS'], 8, 2], [REACH, 0, 0]),
    rivetWork(11, 2), rivetWork(10, 1), rivetWork(9, 0),
  ],
  length: RIVET_SWING.length,
  loop: t => {
    const [x, y] = RIVET_SWING[t]!
    return rivetWork(x, y, t === 3 || t === 4 || t === 11 || t === 12)
  },
}

// ——— Poziomica ———
const LEVEL: Frame = ['ssiiiss', 'sssssss']
const LEVEL_BUBBLE = [0, 0, 1, 1, 1, 0, -1, -1, 0, 0, 0, 0] as const

function levelWork(t: number): Frame {
  return draw([BENCH, BENCH_AT + 2, 4], [LEVEL, 9, 2], at('y', 12 + LEVEL_BUBBLE[t]!, 2),
    [stander('right', 'ggg'), 0, 0],
    // Wolna dłoń puka w koniec poziomicy, bąbel wychyla się i wraca do środka.
    ...line([6, 3], t === 2 || t === 3 ? [9, 1] : [7, 3], 'g'))
}

// Poziomica: Ochra podnosi przyrząd z ławy, puka w ramkę i obserwuje bąbel.
const level: Act = {
  name: 'poziomica',
  who: ['Ochra'],
  intro: [
    ...SLIDE.map(dx => draw([BENCH, BENCH_AT + 2 + dx, 4], [LEVEL, 9 + dx, 3], at('y', 12 + dx, 3), [STAND, 0, 0])),
    draw([BENCH, BENCH_AT + 2, 4], [LEVEL, 9, 3], at('y', 12, 3), [REACH, 0, 0]),
    levelWork(0),
  ],
  length: LEVEL_BUBBLE.length,
  loop: levelWork,
}

// ——— Pilnik ———
const CLAMP: Frame = ['..s..', '..s..', '.SSS.', 'xxxxx']

function fileTool(dx: number, y: number): Layer[] {
  return [[['hh'], 7 + dx, y], ...line([9 + dx, y], [15 + dx, y + 1], 's')]
}

function fileWork(t: number): Frame {
  const dx = lerp(0, 2, pingPong(t, 8) / 8)
  const chips: Layer[] = []
  // Opiłki rodzą się na krawędzi przy pchnięciu, opadają przez dwie klatki.
  for (let age = 0; age < 2; age++) {
    const born = t - age
    if (born >= 2 && born <= 8) chips.push(at('m', 16 + age, 4 + age))
  }
  return draw([BENCH, BENCH_AT + 2, 4], [CLAMP, 13, 2],
    [stander('right'), 0, 0], ...line([6, 3], [7 + dx, 2], 'g'),
    ...fileTool(dx, 2), ...chips)
}

// Pilnik: ork zdejmuje narzędzie z ławy, wygładza stal w imadle; opiłki spadają.
const filing: Act = {
  name: 'pilnik',
  intro: [
    ...SLIDE.map(dx => draw([BENCH, BENCH_AT + 2 + dx, 4], [CLAMP, 13 + dx, 2], ...fileTool(dx, 3), [STAND, 0, 0])),
    draw([BENCH, BENCH_AT + 2, 4], [CLAMP, 13, 2], ...fileTool(0, 3), [stander('right', 'g'), 0, 0]),
    fileWork(0),
  ],
  length: 16,
  loop: fileWork,
}

// ——— Prasa śrubowa ———
const PRESS: Frame = ['SSSSSSSSS', 'S.......S', 'S.......S', 'S.......S', 'S.......S', 'xxxxxxxxx']
const PRESS_TURN = [2, 2, 1, 1, 2, 3, 3, 2, 2, 1, 1, 2, 3, 3, 2, 2] as const
const PRESS_DIE = [2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2] as const

function screwPress(dx: number, turn: number, die: number): Layer[] {
  return [[PRESS, 12 + dx, 0], [['RRRRR'], 14 + dx, 4],
    ...line([8 + dx, turn], [19 + dx, 4 - turn], 'h'),
    ...line([16 + dx, 1], [16 + dx, die], 'q'), [['sss'], 15 + dx, die]]
}

function pressWork(t: number): Frame {
  const turn = PRESS_TURN[t]!
  return draw(...screwPress(0, turn, PRESS_DIE[t]!), [stander('right'), 0, 0],
    ...line([5, 3], [7, turn], 'g'),
    // Matryca dociska świeżą stal; iskra rodzi się przy zejściu śruby.
    ...(t === 4 ? [at('y', 18, 3)] : t === 5 ? [at('o', 19, 2)] : []))
}

// Prasa śrubowa: Grom zamiast łatać odlew tłoczy nową sztabę, kręcąc poprzeczką prasy.
const pressingSteel: Act = {
  name: 'prasa śrubowa',
  who: ['Grom'],
  intro: [
    ...SLIDE.map(dx => draw(...screwPress(dx, 2, 2), [STAND, 0, 0])),
    draw(...screwPress(0, 2, 2), [REACH, 0, 0]),
    pressWork(0),
  ],
  length: PRESS_TURN.length,
  loop: pressWork,
}

// ——— Złocenie ———
const GILT_PANEL: Frame = ['yyyyy', 'yWWWy', 'yWiWy', 'yyyyy']
const GILT_PATH = [[12, 2], [12, 2], [12, 3], [12, 4], [13, 4], [14, 4], [15, 4], [16, 4],
  [16, 3], [16, 2], [16, 2], [15, 2], [14, 2], [13, 2], [12, 2], [12, 2]] as const

function gildingProps(dx: number): Layer[] {
  return [[GILT_PANEL, 12 + dx, 1], [['.x.x.'], 12 + dx, 5], [['.yy.', 'kyyk'], 18 + dx, 4]]
}

// Drewniany trzonek, biała skuwka i złota farba na czubku pędzla.
function giltBrush(tip: number, y: number): Layer[] {
  return [[['hhhj'], tip - 4, y], at('y', tip, y)]
}

function gildingWork(t: number): Frame {
  const [tip, y] = GILT_PATH[t]!
  const x = tip - 12
  const orc: Frame = [...stander('right').slice(0, 5), pusher(x)[5]!]
  return draw(...gildingProps(0), [orc, x, 0],
    ...line([x + 5, 3], [tip - 5, y], 'g'), ...giltBrush(tip, y))
}

// Złocenie: Ochra prowadzi pędzel po obu brzegach panelu, pilnując jednakowego koloru i szerokości.
const gilding: Act = {
  name: 'złocenie',
  who: ['Ochra'],
  intro: [
    ...SLIDE.map(dx => draw(...gildingProps(dx), ...giltBrush(11 + dx, 3), [STAND, 0, 0])),
    draw(...gildingProps(0), ...giltBrush(11, 3), [stander('right', 'g'), 0, 0]),
    gildingWork(0),
  ],
  length: GILT_PATH.length,
  loop: gildingWork,
}

// Miech dmucha w palenisko, więc gra w scenie budowania (`build.ts`), nie przy kowadle.
export const HAMMER_ACTS: Act[] = [anvil, plane, grind, rivets, level, filing, pressingSteel, gilding]
