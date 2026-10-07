import { SLIDE, STAND, at, croucher, draw, line, noise, pusher, stander } from '../stage'
import type { Act, Frame, Layer, Look, Point } from '../stage'

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

// ——— Podkop Lonta ———
// Lont w przykucu podkopuje głaz małym kilofkiem, wyjmuje z fartucha laskę dynamitu, wsuwa ją
// w dołek, aż z ziemi wystaje sam lont, i kiwa głową. Głaz z ładunkiem zapada się w ziemię,
// na jego miejscu wyrasta nowy, a Lont podnosi kilofek do kolejnego podkopu.
const BOULDER: Frame = ['..kkk.', '.kkqkk', 'kkkkkq', 'kqkkkk']
const BOULDER_AT = 10
// Dołek pod głazem rośnie piksel po pikselu przy każdym uderzeniu.
const HOLE: readonly Point[] = [[10, 5], [11, 5], [12, 5]]

// Głaz `sink` pikseli pod ziemią z wykopanymi `dug` pikselami dołka i ładunkiem `charge`.
function boulder(sink: number, dug = 0, charge: readonly Layer[] = [], dx = 0): Layer[] {
  const hole = HOLE.slice(0, dug)
  // Dołek wycina piksele z głazu; ładunek siedzi w dołku i opada razem z głazem.
  const cut = draw([BOULDER, BOULDER_AT, 2]).map((row, y) =>
    [...row].map((cell, x) => (hole.some(([hx, hy]) => hx === x && hy === y) ? '.' : cell)).join(''))
  return [[cut, dx, sink], ...charge.map(([sprite, x, y]) => [sprite, x + dx, y + sink] as Layer)]
}

// Lont w przykucu; dłoń w punkcie `hand`, ręka od fartucha.
function crouched(look: Look, hand: Point | null): Layer[] {
  return [[croucher(look), 0, 0], ...(hand === null ? [] : line([6, 4], hand, 'g'))]
}

// Kilofek w dłoni: trzonek od dłoni do obucha.
function trowel(hand: Point, head: Point): Layer[] {
  return [...crouched('right', hand), ...line(hand, head, 'h').slice(1), at('S', head[0], head[1])]
}
const RAISED: Layer[] = trowel([7, 3], [8, 1])
const strike = (target: Point): Layer[] => trowel([8, 4], [target[0] - 1, target[1]])
// Kilofek odłożony na ziemię przy kolanie.
const DROPPED: Layer[] = [at('h', 6, 5), at('S', 7, 5)]

// Laska w dołku: czerwień w ziemi, lont sterczy przed głazem.
const PLANTED: Layer[] = [at('d', 11, 5), at('d', 12, 5), at('h', 9, 5), at('h', 9, 4)]

function undermining(t: number): Frame {
  // 0–5: zamach i uderzenie trzy razy, dołek rośnie, odłamki pryskają w górę.
  if (t < 6) {
    const k = Math.floor(t / 2)
    if (t % 2 === 0) return draw(...boulder(0, k), ...RAISED, ...(k > 0 ? [at('q', 9, 2), at('k', 11, 0)] : []))
    return draw(...boulder(0, k + 1), ...strike(HOLE[k]!), at('q', HOLE[k]![0] - 1, 3))
  }
  // 6: odłożyć kilofek; 7: sięgnąć do fartucha; 8: laska w dłoni.
  if (t === 6) return draw(...boulder(0, 3), ...DROPPED, ...crouched('right', [7, 4]))
  if (t === 7) return draw(...boulder(0, 3), ...DROPPED, ...crouched('mid', null), at('g', 5, 4))
  if (t === 8) return draw(...boulder(0, 3), ...DROPPED, ...crouched('right', [6, 4]), [['dd'], 7, 4], at('h', 6, 5))
  // 9–10: wsunąć laskę w dołek; 11: zostaje sam lont, kiwnąć głową.
  if (t === 9) return draw(...boulder(0, 3, [[['dd'], 9, 5]]), ...DROPPED, ...crouched('right', [8, 4]), at('h', 8, 5))
  if (t === 10) return draw(...boulder(0, 3, PLANTED), ...DROPPED, ...crouched('right', [8, 4]))
  if (t === 11) return draw(...boulder(0, 3, PLANTED), ...DROPPED, ...crouched('mid', null))
  // 12–13: głaz z ładunkiem zapada się w ziemię; 14–15: wyrasta nowy, Lont bierze kilofek.
  if (t < 14) return draw(...boulder(t === 12 ? 2 : 4, 3, PLANTED), ...DROPPED, ...crouched('right', t === 13 ? [7, 4] : null))
  return draw(...boulder(t === 14 ? 2 : 1), ...trowel([7, 4], t === 14 ? [8, 5] : [8, 3]))
}

const undermine: Act = {
  name: 'podkop',
  who: ['Lont'],
  intro: [
    // Głaz z kilofkiem u stóp wjeżdża z prawej.
    ...SLIDE.map(dx => draw(...boulder(0, 0, [], dx), ...DROPPED.map(([s, x, y]) => [s, x + dx, y] as Layer), [STAND, 0, 0])),
    draw(...boulder(0), ...DROPPED, [stander('right'), 0, 0]),
    // Przykucnąć, chwycić kilofek i unieść go.
    draw(...boulder(0), ...DROPPED, ...crouched('right', [7, 4])),
    draw(...boulder(0), ...trowel([7, 4], [8, 5])),
    draw(...boulder(0), ...trowel([7, 4], [8, 3])),
    draw(...boulder(0), ...RAISED),
  ],
  length: 16,
  loop: undermining,
}

// ——— Rozpierak Lonta ———
// Dwie połówki skały ze stalowym rozpierakiem w szczelinie wjeżdżają razem. Lont wykonuje
// trzy próbne ruchy pompką, dopiero za trzecim rozszerza szczelinę; odpuszcza zawór i zbiera siły.
const SPLIT_LEFT: Frame = ['.kq', '.kk', 'qkk', 'kqk']
const SPLIT_RIGHT: Frame = ['qk.', 'kk.', 'kqk', 'qkk']
const PUMP_AT = 9
const PUMP_DOWN = [0, 1, 0, 1, 0, 1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0] as const
const SPLIT_GAP = [0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 1, 1, 0, 0, 0] as const

// Pompa po lewej, przewód przy ziemi, teleskopowa stal między połówkami głazu.
function splitterAt(dx: number, gap = 0, down = 0): Layer[] {
  return [
    [SPLIT_LEFT, 14 + dx - gap, 2], [SPLIT_RIGHT, 17 + dx + gap, 2],
    [['xxx', 'xsx'], PUMP_AT + dx, 4],
    ...line([PUMP_AT + 1 + dx, 5], [17 + dx, 5], 'n'),
    ...line([15 + dx - gap, 4], [18 + dx + gap, 4], 's'),
    ...line([PUMP_AT + 1 + dx, 2 + down], [PUMP_AT + 1 + dx, 4], 's'),
    [['hhh'], PUMP_AT + dx, 1 + down],
  ]
}

function splitting(t: number): Frame {
  const down = PUMP_DOWN[t]!
  const gap = SPLIT_GAP[t]!
  // 0–5: trzy próby pompką; 6–10: mocny nacisk rozsuwa skałę; 11–15: odpuścić zawór.
  const valve = t >= 10 && t < 13
  return draw(...splitterAt(0, gap, down), [stander(valve ? 'mid' : 'right'), 0, 0],
    ...line([6, 3], valve ? [PUMP_AT - 1, 4] : [PUMP_AT - 1, 1 + down], 'g'))
}

const splitter: Act = {
  name: 'rozpieranie skały',
  who: ['Lont'],
  intro: [
    // Głaz z rozpierakiem, przewodem i pompką wjeżdża z prawej.
    ...SLIDE.map(dx => draw(...splitterAt(dx), [STAND, 0, 0])),
    draw(...splitterAt(0), [stander('right', 'g'), 0, 0]),
    draw(...splitterAt(0), [stander('right'), 0, 0], ...line([6, 3], [7, 2], 'g')),
    splitting(0),
  ],
  length: PUMP_DOWN.length,
  loop: splitting,
}

export const PICK_ACTS: Act[] = [rock, shovel, auger, undermine, splitter]
