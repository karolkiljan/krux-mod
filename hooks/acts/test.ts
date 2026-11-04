import { STAND, at, draw, lerp, line, pingPong, stander } from '../stage'
import type { Act, Frame, Layer } from '../stage'

// Próby bez rozstrzygania wyniku: kanarek nadal żyje, ciężar wraca,
// odczynniki krążą. Zielone i padłe testy pokazuje reakcja zdarzenia.

// ——— Kanarek w klatce ———
const CAGE: Frame = ['..sssss..', '.s.....s.', 's.s.s.s.s', 's.......s', 's.s.s.s.s', 'sssssssss']
const CAGE_X = 12

function cage(x: number, hop: number, wing: boolean): Layer[] {
  // Pręty są tłem; żółty ptak i pomarańczowy dziób pozostają widoczne.
  const bird: Frame = wing ? ['.y.', 'yyyo', '.h.'] : ['.y.', '.yyo', '.h.']
  return [[CAGE, x, 0], [['hhhhhhh'], x + 1, 4], [bird, x + 2 + hop, 1]]
}

function canaryLoop(t: number): Frame {
  const hop = Math.floor(pingPong(t, 8) / 3)
  const feeding = t >= 10 && t < 14
  return draw(...cage(CAGE_X, hop, t % 8 === 3 || t % 8 === 4), [stander(feeding ? 'right' : 'mid', 'gg'), 0, 0], [['p'], 8, 3], ...(feeding ? [[['p'], 10, 3] as Layer] : []))
}

const canary: Act = {
  name: 'kanarek',
  who: ['Krux', 'Młot'],
  kit: draw(...cage(CAGE_X, 0, false)),
  intro: [
    draw(...cage(CAGE_X, 0, false), [stander('right', 'g'), 0, 0]),
    draw(...cage(CAGE_X, 0, false), [stander('right', 'gg'), 0, 0], [['p'], 8, 3]),
  ],
  length: 16,
  loop: canaryLoop,
}

// ——— Próba obciążenia ———
// Belka pod ciężarem ugina się o piksel i wraca; Krux opuszcza ciężar
// korbą, więc nie pojawia się on znikąd nad badanym elementem.
const RIG_X = 11
const RIG: Frame = ['sssssssss', 's.......s', 's.......s', 's.......s', 's.......s', 'xxxxxxxxx']
const LOAD: Frame = ['.h.', 'qqq', 'qqq']
const DROP = [0, 0, 1, 1, 2, 2, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0] as const

function loadRig(x: number, down: number): Layer[] {
  const bend = down === 2
  return [[RIG, x, 0], [LOAD, x + 3, down], ...(bend ? [[['hh...hh', '..hhh..'], x + 1, 4] as Layer] : [[['hhhhhhh'], x + 1, 4] as Layer])]
}

// Korba na piaście (10, 2): uchwyt obiega ją co dwie klatki (dół, środek, góra, środek),
// a dłoń idzie za uchwytem.
const CRANK_Y = [3, 2, 1, 2] as const

function crank(grip: number): Layer[] {
  return [at('h', 9, grip), at('S', 10, 2)]
}

function loadLoop(t: number): Frame {
  const grip = CRANK_Y[Math.floor(t / 2) % CRANK_Y.length]!
  return draw(...loadRig(RIG_X, DROP[t]!), ...crank(grip), [stander('right', 'g'), 0, 0], ...line([6, 3], [8, grip], 'g'))
}

const load: Act = {
  name: 'obciążenie',
  kit: draw(...loadRig(RIG_X, 0), ...crank(3)),
  intro: [
    draw(...loadRig(RIG_X, 0), ...crank(3), [stander('right', 'g'), 0, 0]),
    loadLoop(0),
  ],
  length: DROP.length,
  loop: loadLoop,
}

// ——— Fiolki kontrolne ———
// Pipeta nabiera z niebieskiej fiolki i wpuszcza kroplę do zielonej. Pęcherzyki
// wędrują od dna do szyjki i znikają, zamiast migać całą fiolką.
const BENCH: Frame = ['hhhhhhhhhhhhh', '.x.........x.']
const TUBES_X = [9, 13, 17] as const

function tubes(t: number): Layer[] {
  const colors = ['W', 'f', 'd'] as const
  return [[BENCH, 8, 4], ...TUBES_X.flatMap((x, i) => {
    const liquid = colors[i]!
    const bubbleY = 3 - Math.floor(((t + i * 3) % 12) / 4)
    return [[['i.i', `i${liquid}i`, 'iii'], x, 1] as Layer, [['j'], x + 1, bubbleY] as Layer]
  })]
}

// Pipeta ma zawsze trzy piksele: bańkę 'hh' w dłoni i szklany czubek 'i' nad szyjką fiolki
// albo w niej (`dip`); ręka idzie za pipetą, pipeta się nie wydłuża.
function pipette(tip: number, dip: boolean): Layer[] {
  const y = dip ? 1 : 0
  return [at('h', tip - 2, y + 2), at('h', tip - 1, y + 1), at('i', tip, y)]
}

function hold(tip: number, dip: boolean): Layer[] {
  return [...line([6, 3], [tip - 3, (dip ? 1 : 0) + 2], 'g'), ...pipette(tip, dip)]
}

const DROP_AT = TUBES_X[1] + 1

function tubeLoop(t: number): Frame {
  // 16 klatek: nabrać z niebieskiej, przenieść nad zieloną, wpuścić kroplę, wrócić.
  const p = pingPong(t, 8)
  const tip = lerp(TUBES_X[0] + 1, DROP_AT, p / 8)
  const dip = p === 0 || p === 8
  return draw(...tubes(t), [stander('right', 'g'), 0, 0], ...hold(tip, dip), ...(p === 8 ? [at('W', DROP_AT, 2)] : []))
}

const assay: Act = {
  name: 'fiolki',
  // Pipeta stoi oparta w niebieskiej fiolce.
  kit: draw(...tubes(0), ...pipette(TUBES_X[0] + 1, true)),
  intro: [
    draw(...tubes(0), ...pipette(TUBES_X[0] + 1, true), [stander('right', 'g'), 0, 0]),
  ],
  length: 16,
  loop: tubeLoop,
}

// ——— Liczydło Młota ———
// Koraliki na dwóch drutach przesuwają się tam i z powrotem.
// Młot powtarza rachunek, prowadząc palcem drugi rząd. Liczydło stoi tuż przy nim,
// więc palec sięga koralików bez wyciągania ręki przez pół warsztatu.
const ABACUS: Frame = ['hhhhhhh', 'hsssssh', 'h.....h', 'hsssssh', 'hhhhhhh']
const ABACUS_X = 8

function abacusAt(shift: number): Layer[] {
  return [[ABACUS, ABACUS_X, 1], [['yy'], ABACUS_X + 1 + shift, 2], [['yy'], ABACUS_X + 4 - shift, 4]]
}

function abacusLoop(t: number): Frame {
  const shift = Math.floor(pingPong(t, 4) * 3 / 4)
  const handY = t < 7 || t === 15 ? 2 : t === 7 || t === 14 ? 3 : 4
  const handX = handY === 4 ? ABACUS_X + 3 - shift : ABACUS_X + shift
  return draw(...abacusAt(shift), [stander('right', 'g'), 0, 0], ...line([6, 3], [handX, handY], 'g'))
}

const abacus: Act = {
  name: 'liczydło',
  who: ['Młot'],
  kit: draw(...abacusAt(0)),
  intro: [
    draw(...abacusAt(0), [stander('right', 'g'), 0, 0]),
    draw(...abacusAt(0), [stander('right', 'gg'), 0, 0]),
    abacusLoop(0),
  ],
  length: 16,
  loop: abacusLoop,
}

// ——— Próba dźwięku dzwonu ———
// Dzwon stoi z pobijakiem zawieszonym na belce, ręka zdejmuje pobijak. Po stuknięciu
// jasna fala odchodzi od odlewu, a ręka wycofuje pobijak do następnej próby.
const BELL: Frame = ['...h...', '..yyy..', '.yy.yy.', 'yyy.yyy', '...S...']
const BELL_STAND: Frame = ['hhhhhhhhh', '........x', '........x', '........x', '........x', '......xxx']
const BELL_X = 9
const BELL_TAP = [7, 7, 8, 9, 10, 9, 8, 7, 7, 7, 7, 7] as const
// Pobijak na haku belki: trzonek w górze, obuch w dole.
const HANGING: Frame = ['h', 'S']

function bellAt(): Layer[] {
  return [[BELL_STAND, BELL_X, 0], [BELL, BELL_X, 0]]
}

function bellLoop(t: number): Frame {
  const x = BELL_TAP[t]!
  const wave: Layer[] = t >= 5 && t <= 7 ? [[['j', '.', 'j'], BELL_X + 7 + t - 5, 1]] : []
  return draw(...bellAt(), [stander('right', 'g'), 0, 0], ...line([6, 3], [x - 1, 3], 'g'), [['S', 'h'], x, 2], ...wave)
}

const bell: Act = {
  name: 'dzwon',
  kit: draw(...bellAt(), [HANGING, BELL_X, 1]),
  intro: [
    draw(...bellAt(), [HANGING, BELL_X, 1], [stander('right', 'g'), 0, 0]),
    draw(...bellAt(), [HANGING, BELL_X, 1], [stander('right', 'g'), 0, 0], ...line([6, 3], [8, 2], 'g')),
    bellLoop(0),
  ],
  length: BELL_TAP.length,
  loop: bellLoop,
}

// ——— Próba zatrzasku Młota ———
// Młot szarpie za kółko dwa razy: nie wierzy pierwszej próbie.
// Sznur ciągnie zamkniętą skrzynię; wieko i zatrzask nie puszczają.
const LOCKED_CHEST: Frame = ['.xxxxxxxx.', 'xhhhhhhhhx', 'xxxxssxxxx', 'xhhhhhhhhx', 'xxxxxxxxxx']
const PULL_RING: Frame = ['.s.', 's.s', '.s.']
const LATCH_PULL = [10, 10, 9, 8, 8, 9, 10, 10, 10, 10, 9, 8, 8, 9, 10, 10] as const

function latchAt(x: number): Layer[] {
  const tug = x === 8 ? -1 : 0
  return [[LOCKED_CHEST, 12 + tug, 1],
    ...line([x + 2, 3], [15 + tug, 3], 'm'),
    [PULL_RING, x, 2]]
}

function latchLoop(t: number): Frame {
  const x = LATCH_PULL[t]!
  // Przy drugim szarpnięciu zaciska oczy, ale nie wypuszcza kółka.
  return draw(...latchAt(x), [stander(t === 11 || t === 12 ? 'shut' : 'right', 'gg'), 0, 0],
    ...line([8, 3], [x, 3], 'g'), [PULL_RING, x, 2])
}

const latch: Act = {
  name: 'próba zatrzasku',
  who: ['Młot'],
  kit: draw(...latchAt(10)),
  intro: [
    draw(...latchAt(10), [stander('right', 'g'), 0, 0]),
    draw(...latchAt(10), [stander('right', 'gg'), 0, 0], ...line([8, 3], [9, 3], 'g')),
    latchLoop(0),
  ],
  length: LATCH_PULL.length,
  loop: latchLoop,
}

export const TEST_ACTS: Act[] = [canary, load, assay, abacus, bell, latch]

// Wynik narzędzia dostaje osobną reakcję. Rozpoznajemy pełną klatkę po
// obrysie, więc wynik nie zamienia fiolki ani próby obciążenia w kanarka.
export function canaryResult(rows: readonly string[], passed: boolean, t: number): Frame | null {
  if (t < 0 || t >= 14 || rows.length !== 6) return null
  const x = rows[5]!.indexOf('sssssssss')
  if (x < 0 || x + 9 > 22 || rows[0]!.slice(x + 2, x + 7) !== 'sssss') return null
  if (rows[1]![x + 1] !== 's' || rows[1]![x + 7] !== 's') return null
  if (![2, 3, 4].every(y => rows[y]![x] === 's' && rows[y]![x + 8] === 's')) return null
  const crown = rows[1]!.slice(x + 1, x + 8).indexOf('y')
  if (crown < 0) return null
  const birdX = x + crown
  const grid = rows.map(row => [...row])
  // Usunąć tylko stary ptak, przywracając pręty za jego sylwetką.
  for (let y = 1; y <= 3; y += 1) {
    for (let dx = 1; dx < 8; dx += 1) {
      if ('yoh'.includes(grid[y]![x + dx] ?? '.')) grid[y]![x + dx] = CAGE[y]![dx]!
    }
  }
  const clean = grid.map(row => row.join(''))
  if (passed) {
    const wing = t % 6 === 1 || t % 6 === 2
    const bird: Frame = wing ? ['.y.', 'yyyo', '.h.'] : ['.y.', '.yyo', '.h.']
    // Jasne nuty mieszczą się obok klatki, nie zasłaniają jej stropu.
    const song: Layer[] = t % 6 < 3 && x + 9 < 22 ? [[['j'], x + 9, 2 - t % 3]] : []
    return draw([clean, 0, 0], [bird, birdX, 1], ...song)
  }
  // Najpierw opadnięcie, potem ptak leży na żerdzi z zamkniętym okiem.
  const fallenX = x + 3
  if (t < 3) return draw([clean, 0, 0], [['.y.', '.yyo', '.h.'], t < 2 ? birdX : fallenX, 1 + Math.floor(t / 2)])
  if (t === 3) return draw([clean, 0, 0], [['.yo', 'yyG'], fallenX, 2])
  return draw([clean, 0, 0], [['yGyo'], fallenX, 3])
}
