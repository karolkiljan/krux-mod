import { SLIDE, STAND, draw, lerp, noise, pingPong, pusher, stander } from '../stage'
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

// Miech dmucha w palenisko, więc gra w scenie budowania (`build.ts`), nie przy kowadle.
export const HAMMER_ACTS: Act[] = [anvil, plane, grind]
