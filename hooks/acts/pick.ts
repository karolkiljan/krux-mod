import { SLIDE, STAND, draw, line, noise, pusher, stander } from '../stage'
import type { Act, Frame, Layer } from '../stage'

// Kopalnia przy Bash. Skała wyrasta z ziemi albo przesuwa się z prawej z narzędziem w sobie,
// Krux chwyta trzonek i bierze się do roboty; przy zejściu wbija narzędzie z powrotem i skała odchodzi.

// Stójka z ręką do połowy wyciągniętą: tak Krux sięga po trzonek.
const HALF: Frame = stander('mid', 'g')

// ——— Kilof ———
const PICK: readonly Frame[] = [
  [
    '.gggg.SSS.............',
    'grggrg.h........kkk...',
    '.tggt..h.......kkkkk..',
    'bbbbbbgg.......kkkkkk.',
    '.bGGb..........kkkkkkk',
    '.G..G.........kkkkkkkk',
  ],
  [
    '.gggg.................',
    'grggrg.....S....kkk...',
    '.tggt...hhhS...kkkkk..',
    'bbbbbbgg...S...kkkkkk.',
    '.bGGb..........kkkkkkk',
    '.G..G.........kkkkkkkk',
  ],
  [
    '.gggg........k..y.....',
    'grggrg......o...kkk...',
    '.tggt.........Skkkkk..',
    'bbbbbbgghhhhhhSkkkkkk.',
    '.bGGb.........Skkkkkkk',
    '.G..G.........kkkkkkkk',
  ],
  [
    '.gggg.....k.......o...',
    'grggrg.........ykkk...',
    '.tggt.......k.okkkkk..',
    'bbbbbbgghhhhhhSkkkkkk.',
    '.bGGb.........Skkkkkkk',
    '.G..G.........kkkkkkkk',
  ],
]

const PICK_CYCLE = [0, 0, 1, 2, 3, 1, 0, 0] as const
const ROCK: Frame = ['..kkk...', '.kkkkk..', '.kkkkkk.', '.kkkkkkk', 'kkkkkkkk']
// Kilof wbity w skałę: trzonek wystaje w stronę Kruxa.
const STUCK: Frame = ['......S', 'hhhhhhS', '......S']

// Skała wyrasta z ziemi o `sink` pikseli niżej, z kilofem w środku.
const rockAt = (sink: number): Layer[] => [[ROCK, 14, 1 + sink], [STUCK, 8, 2 + sink]]

// Kilof: skała wyrasta z ziemi z wbitym kilofem, Krux wyrywa go; pętla to zamach, uderzenie, odłamki.
const rock: Act = {
  name: 'kilof',
  intro: [
    ...[4, 3, 2, 1, 0].map(sink => draw(...rockAt(sink), [STAND, 0, 0])),
    draw(...rockAt(0), [HALF, 0, 0]),
    draw(...rockAt(0), [stander('mid', 'gg'), 0, 0]),
    PICK[1]!,
  ],
  length: PICK_CYCLE.length,
  loop: t => PICK[PICK_CYCLE[t]!]!,
}

// ——— Łopata i wózek ———
const HEAP: Frame = ['.qq.', 'qyqq']
const HEAP_AT = 8
const CART: Frame = ['s....s', 'ssssss', '.c..c.']
const CART_AT = 14
const RAILS = 13
// Urobek w wózku po każdym rzucie.
const LOADS: readonly Frame[] = [[], ['', '..qq'], ['', '.qqqq'], ['..y', '.qqqq', '']]

type Spade = { hand: readonly [number, number]; tip: readonly [number, number]; blade: readonly [number, number]; load: boolean }

// Postawy łopaty: ręka, koniec trzonka, ostrze; `load` to grudka na ostrzu.
const SPADE = {
  dig: { hand: [7, 3], tip: [8, 4], blade: [9, 5], load: false },
  lift: { hand: [7, 3], tip: [8, 3], blade: [9, 3], load: true },
  raise: { hand: [7, 2], tip: [8, 1], blade: [9, 1], load: true },
  thrown: { hand: [7, 2], tip: [8, 1], blade: [9, 1], load: false },
  mid: { hand: [7, 3], tip: [8, 3], blade: [9, 3], load: false },
  low: { hand: [7, 3], tip: [8, 4], blade: [9, 4], load: false },
} as const satisfies Record<string, Spade>

function spade(s: Spade): Layer[] {
  const arm = line([6, 3], s.hand, 'g')
  const handle = line(s.hand, s.tip, 'h').slice(1)
  const blade: Layer = [['SS'], s.blade[0], s.blade[1]]
  return [[STAND, 0, 0], ...arm, ...handle, blade, ...(s.load ? [[['qq'], s.blade[0], s.blade[1] - 1] as Layer] : [])]
}

// Jeden rzut: wbić, podważyć, unieść, rzucić; grudka leci łukiem do wózka.
const THROW: readonly (keyof typeof SPADE)[] = ['dig', 'dig', 'lift', 'raise', 'thrown', 'mid', 'low', 'low']
const FLIGHT: readonly (readonly [number, number] | null)[] = [null, null, null, null, [12, 0], [14, 1], [16, 2], null]

const railsAt = (x: number): Layer => [['S'.repeat(22 - RAILS)], x, 5]
const cartAt = (x: number, load: number): Layer[] => [[CART, x, 3], [LOADS[load]!, x, 2]]

function shovelLoop(t: number): Frame {
  // 40 klatek: trzy rzuty do wózka, pełny wózek odjeżdża w prawo i wraca pusty.
  if (t < 24) {
    const k = t % 8
    const load = Math.floor(t / 8) + (k === 7 ? 1 : 0)
    const lump = FLIGHT[k]
    return draw([HEAP, HEAP_AT, 4], railsAt(RAILS), ...cartAt(CART_AT, load), ...spade(SPADE[THROW[k]!]), ...(lump ? [[['q'], lump[0], lump[1]] as Layer] : []))
  }
  const away = t < 32 ? t - 23 : 40 - t
  return draw([HEAP, HEAP_AT, 4], railsAt(RAILS), ...cartAt(CART_AT + away, t < 32 ? 3 : 0), ...spade(SPADE.low))
}

// Łopata wbita w kopczyk, trzonek oparty skośnie.
const leaning = (sink: number): Layer[] => [[HEAP, HEAP_AT, 4 + sink], ...line([8, 1 + sink], [9, 3 + sink], 'h'), [['S'], 9, 4 + sink]]

const shovel: Act = {
  name: 'łopata',
  intro: [
    // Kopczyk rudy wyrasta z ziemi z łopatą w środku.
    ...[2, 1, 0].map(sink => draw(...leaning(sink), [STAND, 0, 0])),
    // Szyny z pustym wózkiem wjeżdżają z prawej.
    ...SLIDE.map(dx => draw(...leaning(0), railsAt(RAILS + dx), ...cartAt(CART_AT + dx, 0), [STAND, 0, 0])),
    // Chwycić trzonek.
    draw(...leaning(0), railsAt(RAILS), ...cartAt(CART_AT, 0), [STAND, 0, 0], [['g'], 6, 3], [['g'], 7, 2]),
    draw([HEAP, HEAP_AT, 4], railsAt(RAILS), ...cartAt(CART_AT, 0), ...spade(SPADE.low)),
  ],
  length: 40,
  loop: shovelLoop,
}

// ——— Świder ———
const WALL: Frame = ['..kkqkk', '.kkkkkq', 'kkqkkkk', 'kkkkkyk', 'kkkkqkk', 'kkkkkkk']
const WALL_AT = 15
const RUBBLE: Layer = [['qq'], WALL_AT - 2, 5]

// Świder: oprawa przy dłoni, trzon do ściany (dalej chowa go skała), korba w czterech położeniach:
// w górze, z przodu, w dole, z tyłu.
const CRANK: readonly Frame[] = [['h', 'h'], ['', '', 'x'], ['', '', '', 'h', 'h'], ['', '', 'x']]

function drill(x: number, turn: number): Layer[] {
  return [[['xssssss'], x, 3], [CRANK[turn % 4]!, x + 2, 1]]
}

// Pył sypie się spod wiertła, kiedy kręci się korba.
function dust(t: number): Layer[] {
  const out: Layer[] = []
  for (let age = 0; age < 2; age += 1) {
    const born = t - age
    if (born < 0 || born >= 16 || born % 2 === 1) continue
    out.push([[noise(born, 2, 5) < 0.5 ? 'q' : 'm'], WALL_AT - 1, 4 + age])
  }
  return out
}

function drillLoop(t: number): Frame {
  // 20 klatek: kręcić korbą i wchodzić w skałę piksel co pięć klatek, potem wyciągnąć świder.
  const x = t < 16 ? Math.floor(t / 5) : 19 - t
  const turn = t < 16 ? t : 0
  return draw(RUBBLE, ...drill(x + 8, turn), [WALL, WALL_AT, 0], [pusher(x), x, 0], ...dust(t))
}

const auger: Act = {
  name: 'świder',
  intro: [
    // Ściana z wbitym świdrem przesuwa się z prawej, Krux sięga po oprawę.
    ...SLIDE.map(dx => draw([RUBBLE[0], WALL_AT - 2 + dx, 5], ...drill(8 + dx, 0), [WALL, WALL_AT + dx, 0], [STAND, 0, 0])),
    draw(RUBBLE, ...drill(8, 0), [WALL, WALL_AT, 0], [HALF, 0, 0]),
  ],
  length: 20,
  loop: drillLoop,
}

export const PICK_ACTS: Act[] = [rock, shovel, auger]
