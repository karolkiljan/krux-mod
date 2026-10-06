import { dots, draw, head, line, pingPong, stander, walker } from '../stage'
import type { Act, Frame, Layer, Look, Point } from '../stage'

// Pytanie do Morry: drapanie się po głowie, tabliczka z „?”, dumanie z chmurką, wzruszenie ramion i nasłuch.
// Znak zapytania rysuje się kreska po kresce, tabliczka wynurza się od dołu, chmurka rośnie z bąbelków.

// ——— Drapanie po głowie ———
// Ork drapie się po głowie, nad nim pulsuje znak zapytania.
const SCRATCH: Record<'up' | 'down', Frame> = {
  up: ['.gggggg', 'grggrgg', '.tggt.g', 'bbbbbb', '.bGGb.', '.G..G.'],
  down: ['.gggg.', 'grggrg', '.tggt.', 'bbbbbbgg', '.bGGb.', '.G..G.'],
}
// Znak zapytania w kolejności kreślenia: łuk, szyja, kropka.
const QUESTION: readonly Point[] = [[9, 0], [10, 0], [11, 0], [12, 1], [11, 2], [11, 3], [11, 5]]

function scratchLoop(t: number): Frame {
  // 8 klatek: ręka w górę i w dół, znak zapytania przygasa na dwie klatki.
  const pose = SCRATCH[t % 4 < 2 ? 'up' : 'down']
  return draw([pose, 0, 0], ...dots(QUESTION, t >= 6 ? 'o' : 'y'))
}

const scratch: Act = {
  name: 'drapanie',
  intro: [
    // Znak zapytania kreśli się nad głową, ręka idzie w bok, potem do głowy.
    draw([stander('right'), 0, 0], ...dots(QUESTION.slice(0, 2), 'y')),
    draw([stander('right'), 0, 0], ...dots(QUESTION.slice(0, 4), 'y')),
    draw([stander('mid', 'g'), 0, 0], ...dots(QUESTION.slice(0, 6), 'y')),
    draw([SCRATCH.down, 0, 0], ...dots(QUESTION, 'y')),
  ],
  length: 8,
  loop: scratchLoop,
}

// ——— Tabliczka z pytajnikiem ———
const SIGN: Frame = ['pnnnp', 'pppnp', 'ppnpp', 'ppppp', 'ppnpp', '..h..']
const SIGN_X = 9
const HOLDER = 1

// Ork z ręką wzniesioną do lewego brzegu tabliczki.
function holding(look: Look, sx: number, sy: number): Frame {
  const hand: Point = [sx - 1, Math.min(3, sy + 2)]
  return draw([SIGN, sx, sy], [stander(look), HOLDER, 0], ...line([HOLDER + 6, 3], hand, 'g'))
}

function signLoop(t: number): Frame {
  // 16 klatek: tabliczka kiwa się piksel w prawo i z powrotem, wzrok raz na Morrę, raz prosto.
  const sway = pingPong(Math.floor(t / 2), 2) === 2 ? 1 : 0
  const bob = t % 8 >= 6 ? 1 : 0
  return holding(t < 8 ? 'right' : 'mid', SIGN_X + sway, bob)
}

const sign: Act = {
  name: 'tabliczka',
  intro: [
    // Krux robi krok, tabliczka wynurza się od dołu w jego ręce aż nad głowę.
    draw([walker(0, 'right'), HOLDER, 0]),
    ...[5, 4, 3, 2, 1].map(y => holding('right', SIGN_X, y)),
  ],
  length: 16,
  loop: signLoop,
}

// ——— Dumanie z chmurką ———
const THINK: Frame = ['.gggg.', 'grggrg', '.tggtg', 'bbbbbbg', '.bGGb.', '.G..G.']
const CLOUDS: readonly Layer[] = [
  [['jjj', 'jjj'], 14, 1],
  [['.jjjjj.', 'jjjjjjj', 'jjjjjjj', '.jjjjj.'], 12, 0],
  [['.jjjjjjj.', 'jjjjjjjjj', 'jjjjjjjjj', '.jjjjjjj.'], 11, 0],
]
const BUBBLES: readonly Point[] = [[7, 2], [9, 1]]
const DOTS = [13, 15, 17]

function musing(look: Look, bubbles: number, cloud: number, shown: number, t = -1): Frame {
  const cloudLayer = cloud >= 0 ? [CLOUDS[cloud]!] : []
  const dotLayers = DOTS.slice(0, shown).map((x, i) => [['n'], x, t >= 0 && (t - 3 * i + 12) % 12 < 2 ? 1 : 2] as Layer)
  return draw([THINK, 0, 0], [head(look), 0, 0], ...dots(BUBBLES.slice(0, bubbles), 'j'), ...cloudLayer, ...dotLayers)
}

function musingLoop(t: number): Frame {
  // 12 klatek: trzy kropki podskakują po kolei, oczy raz mrugną.
  return musing(t === 9 ? 'shut' : 'right', 2, 2, 3, t)
}

const musingAct: Act = {
  name: 'dumanie',
  intro: [
    // Ręka pod brodę, bąbelki wzlatują, chmurka rośnie, kropki wskakują po jednej.
    musing('mid', 0, -1, 0),
    musing('right', 1, -1, 0),
    musing('right', 2, -1, 0),
    musing('right', 2, 0, 0),
    musing('right', 2, 1, 0),
    musing('right', 2, 2, 0),
    musing('right', 2, 2, 1),
    musing('right', 2, 2, 2),
  ],
  length: 12,
  loop: musingLoop,
}

// ——— Wzruszenie ramion i nasłuch ———
const LX = 2
const SHRUG: Frame = ['.gggg.', 'grggrg', 'gtggtg', 'gbbbbg', '.bGGb.', '.G..G.']
const SHRUG_UP: Frame = ['', '.gggg.', 'grggrg', 'gbbbbg', '.bGGb.', '.G..G.']

// Ręka przy uchu, głowa przechylona o piksel w prawo, w stronę Morry.
function listening(lean: number, hand: number): Frame {
  const body: Frame = ['', '', '', 'gbbbbb', '.bGGb.', '.G..G.']
  const arm = hand === 0 ? [[['g'], LX + 5, 3] as Layer] : line([LX + 6, 3], [LX + 6 + lean, 3 - hand], 'g')
  return draw([body, LX, 0], [head('right'), LX + lean, 0], ...arm)
}

function listenLoop(t: number): Frame {
  // 24 klatki: dwa wzruszenia ramion, ręka do ucha, z prawej nadlatują dwie kropki dźwięku, ręka wraca.
  if (t < 8) return draw([t % 4 === 1 || t % 4 === 2 ? (t % 4 === 1 ? SHRUG : SHRUG_UP) : walker(0, 'mid'), LX, 0])
  if (t === 8) return listening(0, 1)
  if (t === 9) return listening(1, 2)
  if (t < 20) {
    const k = t - 10
    const sound = [0, 4].map(d => 20 - k + d).filter(x => x > LX + 8 && x < 22)
    return draw([listening(1, 2), 0, 0], ...sound.map(x => [['m'], x, 1] as Layer))
  }
  if (t === 20) return listening(1, 2)
  if (t === 21) return listening(0, 1)
  return draw([walker(0, t === 22 ? 'right' : 'mid'), LX, 0])
}

const listen: Act = {
  name: 'nasłuch',
  intro: [
    // Dwa kroki w prawo, rozejrzeć się w lewo i w prawo.
    draw([walker(0, 'right'), 1, 0]),
    draw([walker(1, 'right'), LX, 0]),
    draw([walker(0, 'left'), LX, 0]),
    draw([walker(0, 'right'), LX, 0]),
  ],
  length: 24,
  loop: listenLoop,
}

export const ASK_ACTS: Act[] = [scratch, sign, musingAct, listen]
