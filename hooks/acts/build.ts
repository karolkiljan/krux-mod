import { SLIDE, STAND, at, croucher, draw, flame, head, lerp, line, noise, pusher, stander, stroll } from '../stage'
import type { Act, Frame, Layer, Look } from '../stage'

// Piec przy budowaniu, typach i lincie. Piec z kupką węgla i ceber z koszem żaru wjeżdżają
// z prawej z narzędziem na sobie, Krux sięga po nie i bierze się do roboty; przy zejściu
// odkłada narzędzie i warsztat odjeżdża.

// ——— Piec ———
const FURNACE_AT = 13
// Kamienny piec: kopuła, komin z prawej, paszcza 3 × 2 nad podstawą.
const FURNACE: Frame = [
  '',
  '......qq',
  '..kkkkkk.',
  '.kqqqkkqk',
  'kk...kkkk',
  'kq...qkkk',
]
const MOUTH = 3
const MOUTH_Y = 4
const CHIMNEY = 6

// Ogień w paszczy: 0 tli się, 1 pali się, 2 bucha po wrzuconym węglu.
function mouthFire(x: number, frame: number, heat: number): Layer[] {
  const out: Layer[] = []
  for (let dx = 0; dx < 3; dx += 1) {
    const low = heat === 0 ? (noise(frame, dx, 7) < 0.3 ? 'R' : 'c') : heat === 1 ? flame(frame, dx, 0) : noise(frame, dx, 8) < 0.5 ? 'y' : 'o'
    const high = heat === 0 ? 'c' : heat === 1 ? flame(frame, dx, 1) : noise(frame, dx, 9) < 0.6 ? 'y' : 'o'
    out.push(at(low, x + MOUTH + dx, MOUTH_Y + 1), at(high === '.' ? 'c' : high, x + MOUTH + dx, MOUTH_Y))
  }
  return out
}

function furnace(x: number, frame: number, heat: number): Layer[] {
  return [[FURNACE, x, 0], ...mouthFire(x, frame, heat)]
}

// Kupka węgla: ciemne bryły z sinym połyskiem.
const COAL: Frame = ['.cS.', 'SccS']
const COAL_AT = 8

type Spade = { hand: readonly [number, number]; tip: readonly [number, number]; blade: readonly [number, number]; load: boolean }

// Postawy łopaty: ręka, koniec trzonka, ostrze; `load` to węgiel na ostrzu.
const SPADE = {
  dig: { hand: [7, 3], tip: [8, 4], blade: [9, 5], load: false },
  lift: { hand: [7, 3], tip: [8, 3], blade: [9, 3], load: true },
  raise: { hand: [7, 2], tip: [8, 1], blade: [9, 1], load: true },
  thrown: { hand: [7, 2], tip: [8, 1], blade: [9, 1], load: false },
  mid: { hand: [7, 3], tip: [8, 3], blade: [9, 3], load: false },
  low: { hand: [7, 3], tip: [8, 4], blade: [9, 4], load: false },
} as const satisfies Record<string, Spade>

function spade(s: Spade, look: Look = 'mid'): Layer[] {
  const arm = line([6, 3], s.hand, 'g')
  const handle = line(s.hand, s.tip, 'h').slice(1)
  const blade: Layer = [['ss'], s.blade[0], s.blade[1]]
  return [[[...head(look), ...STAND.slice(3)], 0, 0], ...arm, ...handle, blade, ...(s.load ? [[['Sc'], s.blade[0], s.blade[1] - 1] as Layer] : [])]
}

// Jeden rzut: wbić, podważyć, unieść, rzucić; bryła leci łukiem do paszczy, ogień bucha.
const THROW: readonly (keyof typeof SPADE)[] = ['low', 'dig', 'dig', 'lift', 'raise', 'thrown', 'mid', 'low', 'low', 'low', 'low', 'low']
const FLIGHT: readonly (readonly [number, number] | null)[] = [null, null, null, null, null, [11, 0], [13, 1], [15, 3], null, null, null, null]
// Ogień w każdej klatce rzutu: bucha, gdy bryła wpada.
const BLAZE = [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 1] as const

// Dym z komina: kłąb rodzi się po buchnięciu i płynie w lewo nad kopułą.
function smoke(t: number, length: number, births: readonly number[]): Layer[] {
  const out: Layer[] = []
  for (const born of births) {
    const age = (t - born + length) % length
    if (age > 9) continue
    const x = FURNACE_AT + CHIMNEY - Math.floor(age / 2)
    out.push([[age < 4 ? 'mm' : 'm'], x, age < 2 ? 1 : 0])
  }
  return out
}

function sparks(k: number, frame: number): Layer[] {
  if (k !== 8 && k !== 9) return []
  const x = FURNACE_AT + CHIMNEY + (noise(frame, 1, 1) < 0.5 ? 0 : 1)
  return [at(k === 8 ? 'y' : 'o', x, 0)]
}

const STOKE = THROW.length * 2

function stokeLoop(t: number, frame: number): Frame {
  // 24 klatki: dwa rzuty węgla do paszczy, po każdym ogień bucha, z komina leci iskra i idzie dym.
  const k = t % THROW.length
  const lump = FLIGHT[k]
  return draw(
    [COAL, COAL_AT, 4],
    ...furnace(FURNACE_AT, frame, BLAZE[k]!),
    ...smoke(t, STOKE, [10, 22]),
    ...sparks(k, frame),
    ...spade(SPADE[THROW[k]!], k >= 5 && k <= 8 ? 'right' : 'mid'),
    ...(lump ? [at('S', lump[0], lump[1])] : []),
  )
}

// Łopata wbita w kupkę, trzonek oparty skośnie.
const leaning = (x: number): Layer[] => [[COAL, x, 4], ...line([x, 1], [x + 1, 3], 'h'), [['s'], x + 1, 4]]

const stoke: Act = {
  name: 'piec',
  intro: [
    // Piec z kupką węgla i wbitą łopatą wjeżdża z prawej, w paszczy ledwie się tli.
    ...SLIDE.map((dx, i) => draw(...furnace(FURNACE_AT + dx, i, 0), ...leaning(COAL_AT + dx), [STAND, 0, 0])),
    // Żar się budzi, Krux chwyta trzonek.
    draw(...furnace(FURNACE_AT, 7, 1), ...leaning(COAL_AT), [STAND, 0, 0], [['g'], 6, 3]),
    draw(...furnace(FURNACE_AT, 8, 1), ...leaning(COAL_AT), [STAND, 0, 0], [['g'], 6, 3], [['g'], 7, 2]),
    draw([COAL, COAL_AT, 4], ...furnace(FURNACE_AT, 9, 1), ...spade(SPADE.low)),
  ],
  length: STOKE,
  loop: stokeLoop,
}

// ——— Hartowanie ———
// Po zanurzeniu Krux podnosi chłodną stal, przesuwa się do paleniska,
// rozgrzewa ją ponownie i wraca nad ceber. Pętla nie zmienia koloru bez przyczyny.
const TUB: Frame = ['sWWWWs', 'sWWWWs', '.ssss.']
const TUB_AT = 11
const TONGS: Frame = ['hhhhhh']
const HEATBED: Frame = ['qRRq', 'qqqq']

function quenchProps(dx: number, frame: number): Layer[] {
  return [[TUB, TUB_AT + dx, 3], [HEATBED, 18 + dx, 4],
    ...[0, 1].map(i => at(flame(frame, i, 1), 19 + dx + i, 3))]
}

function quenchWork(x: number, y: number, hot: boolean, frame: number, steam: number): Frame {
  const out: Layer[] = [...quenchProps(0, frame), [stander('right', 'gg'), x, 0]]
  out.push(...line([x + 7, 3], [x + 8, y], 'g'), [TONGS, x + 8, y], [[hot ? 'RRR' : 'sss'], x + 14, y])
  // Woda zasłania zanurzoną stal poza blikiem na powierzchni.
  if (x === 0 && y === 4) out.push([['Wi'], 14, 4])
  for (let age = 0; age < steam; age += 1) {
    const atX = 12 + age % 3 + (noise(frame, age, 5) < 0.5 ? 0 : 1)
    out.push(at('m', atX, 2 - Math.floor(age / 2)))
  }
  return draw(...out)
}

const quench: Act = {
  name: 'hartowanie',
  intro: [
    ...SLIDE.map(dx => draw(...quenchProps(dx, 0), [TONGS, 8 + dx, 2], [['RRR'], 14 + dx, 2], [STAND, 0, 0])),
    draw(...quenchProps(0, 0), [TONGS, 8, 2], [['RRR'], 14, 2], [stander('right', 'g'), 0, 0]),
    quenchWork(0, 2, true, 0, 0),
  ],
  length: 28,
  loop: (t, frame) => {
    if (t < 2) return quenchWork(0, 2, true, frame, 0)
    if (t < 4) return quenchWork(0, 3, true, frame, t - 1)
    if (t < 9) return quenchWork(0, 4, t < 6, frame, Math.min(4, t - 1))
    if (t < 11) return quenchWork(0, 3, false, frame, 11 - t)
    if (t < 13) return quenchWork(0, 2, false, frame, 0)
    if (t < 17) return quenchWork(t - 12, 2, false, frame, 0)
    if (t === 17) return quenchWork(4, 3, false, frame, 0)
    if (t < 21) return quenchWork(4, 4, t >= 19, frame, 0)
    if (t === 21) return quenchWork(4, 3, true, frame, 0)
    if (t === 22) return quenchWork(4, 2, true, frame, 0)
    return quenchWork(Math.max(0, 26 - t), 2, true, frame, 0)
  },
}

// ——— Miech ———
const HEARTH: Frame = ['q.....q', 'qqqqqqq']
const HEARTH_AT = 14

// Palenisko z węglem; `size` to wysokość płomienia w wierszach.
function hearth(x: number, frame: number, size: number): Layer[] {
  const out: Layer[] = [[HEARTH, x, 4], [['ccccc'], x + 1, 4]]
  for (let dx = 0; dx < 5; dx += 1) {
    if (size > 0) out.push([[noise(frame, dx, 9) < 0.6 ? 'R' : 'c'], x + 1 + dx, 4])
    for (let up = 0; up < size; up += 1) {
      const cell = flame(frame, dx, up)
      if (cell !== '.') out.push([[cell], x + 1 + dx, 3 - up])
    }
  }
  return out
}

// Miech: dolna deska na ziemi, górna od zawiasu przy dyszy do `top` po lewej, skóra między nimi.
function bellows(x: number, top: number): Layer[] {
  const out: Layer[] = []
  for (let dx = 0; dx < 6; dx += 1) {
    const y = lerp(top, 4, dx / 5)
    for (let fill = y + 1; fill <= 4; fill += 1) out.push([['B'], x + dx, fill])
  }
  return [...out, ...line([x, top], [x + 5, 4], 'h'), [['xxxxxx'], x, 5], [['S'], x + 6, 4]]
}

// Krux trzyma uchwyt miecha: ręka w górę do końca deski.
function pumper(top: number): Layer[] {
  return [[STAND, 0, 0], ...line([6, 3], [6, top - 1], 'g'), [['h'], 7, top - 1]]
}

const PUMP = [2, 2, 3, 4, 4, 4, 3, 3, 3, 2, 2, 2] as const

function bellowsLoop(t: number, frame: number): Frame {
  // 12 klatek: docisnąć deskę, ogień bucha; powoli unieść, miech nabiera powietrza.
  const top = PUMP[t]!
  return draw(...hearth(HEARTH_AT, frame, t >= 3 && t <= 7 ? 3 : 2), ...bellows(7, top), ...pumper(top))
}

const blow: Act = {
  name: 'miech',
  intro: [
    // Palenisko z miechem wjeżdża z zimnym węglem.
    ...SLIDE.map(dx => draw(...hearth(HEARTH_AT + dx, 0, 0), ...bellows(7 + dx, 2), [STAND, 0, 0])),
    // Żar się budzi, płomień rośnie, Krux sięga po uchwyt.
    draw(...hearth(HEARTH_AT, 1, 0), [['R'], HEARTH_AT + 3, 4], ...bellows(7, 2), [STAND, 0, 0]),
    draw(...hearth(HEARTH_AT, 2, 1), ...bellows(7, 2), [stander('mid', 'g'), 0, 0]),
    draw(...hearth(HEARTH_AT, 3, 1), ...bellows(7, 2), [STAND, 0, 0], [['g'], 6, 3], [['g'], 6, 2]),
  ],
  length: PUMP.length,
  loop: bellowsLoop,
}

// ——— Kęs ———
const BENDING_ANVIL: Frame = ['ssssss', '..ss..']
const SMALL_FORGE: Frame = ['.kkk', 'kRRk', 'koRk', 'kkkk']
const BILLET_PATH = [18, 18, 17, 16, 15, 14, 13, 13, 13, 13, 14, 15, 16, 17, 18, 18] as const

function billetProps(dx: number): Layer[] {
  return [[BENDING_ANVIL, 11 + dx, 4], [SMALL_FORGE, 17 + dx, 2]]
}

// Dwie szczęki obejmują rozgrzany koniec; uchwyt pozostaje w dłoni podczas gięcia.
function billetTongs(tip: number, bent: boolean, dx = 0): Layer[] {
  return [...line([tip - 5 + dx, 3], [tip - 1 + dx, 3], 'h'), at('S', tip - 1 + dx, 2),
    at('S', tip - 1 + dx, 4), [[bent ? 'RR' : 'RRR', bent ? '..R' : ''], tip + dx, 3]]
}

function billetWork(t: number): Frame {
  const tip = BILLET_PATH[t]!
  return draw(...billetProps(0), [[...head('right'), ...pusher(t).slice(3)], tip - 13, 0],
    ...billetTongs(tip, t >= 8 && t <= 13),
    // Kęs naciska na róg kowadła; po powrocie do pieca ponownie się prostuje.
    ...(t === 8 || t === 9 ? [at('y', 16, 2), at('o', 17, 1)] : []))
}

// Kęs: Grom wyciąga stal szczypcami, zagina ją na rogu i wraca do pieca.
const billet: Act = {
  name: 'kęs',
  who: ['Grom'],
  intro: [
    ...SLIDE.map(dx => draw(...billetProps(dx), ...billetTongs(18, false, dx), [STAND, 0, 0])),
    ...stroll(5, [...billetProps(0), ...billetTongs(18, false)]),
    billetWork(0),
  ],
  length: BILLET_PATH.length,
  loop: billetWork,
}

// ——— Próba twardości ———
const TEST_BENCH: Frame = ['hhhhhhhhhhh', '.x.......x.']
const HARD_STEEL: Frame = ['snnnnnss']
const SCRATCH_PATH = [11, 11, 12, 13, 14, 15, 16, 16, 16, 15, 14, 13, 12, 11] as const

function scriber(tip: number, y: number, dx = 0): Layer[] {
  return [[['hhSS'], tip - 4 + dx, y], at('j', tip + dx, y + 1)]
}

function hardnessWork(t: number): Frame {
  const tip = SCRATCH_PATH[t]!
  const lifted = t >= 8 && t <= 12
  const y = lifted ? 1 : 2
  const nod = t === 10 || t === 11
  return draw([TEST_BENCH, 9, 4], [HARD_STEEL, 11, 3],
    [nod ? croucher('right') : stander('right'), 0, 0],
    ...line([6, nod ? 4 : 3], [tip - 5, y], 'g'), ...scriber(tip, y),
    ...(t === 4 || t === 5 ? [at('y', tip + 1, 2), at('o', tip + 2, 1)] : []))
}

// Próba twardości: Młot prowadzi rysik po stali, podnosi go i kiwa głową nad rysą.
const hardness: Act = {
  name: 'próba twardości',
  who: ['Młot'],
  intro: [
    ...SLIDE.map(dx => draw([TEST_BENCH, 9 + dx, 4], [HARD_STEEL, 11 + dx, 3], ...scriber(11, 2, dx), [STAND, 0, 0])),
    draw([TEST_BENCH, 9, 4], [HARD_STEEL, 11, 3], ...scriber(11, 2), [stander('right', 'g'), 0, 0]),
    hardnessWork(0),
  ],
  length: SCRATCH_PATH.length,
  loop: hardnessWork,
}

export const BUILD_ACTS: Act[] = [stoke, quench, blow, billet, hardness]
