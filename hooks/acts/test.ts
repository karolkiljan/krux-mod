import { SLIDE, STAND, draw, line, pingPong, stander } from '../stage'
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
  intro: [
    ...SLIDE.map(dx => draw(...cage(CAGE_X + dx, 0, false), [STAND, 0, 0])),
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

function loadLoop(t: number): Frame {
  const down = DROP[t]!
  const grip = t < 8 ? 2 + t % 2 : 3 - t % 2
  return draw(...loadRig(RIG_X, down), [stander('right', 'gg'), 0, 0], ...line([8, 3], [10, grip], 'h'), [['S'], 10, 2])
}

const load: Act = {
  name: 'obciążenie',
  intro: [
    ...SLIDE.map(dx => draw(...loadRig(RIG_X + dx, 0), [['hhS'], 8 + dx, 3], [STAND, 0, 0])),
    draw(...loadRig(RIG_X, 0), [['hhS'], 8, 3], [stander('right', 'g'), 0, 0]),
    draw(...loadRig(RIG_X, 0), ...line([8, 3], [10, 2], 'h'), [['S'], 10, 2], [stander('right', 'gg'), 0, 0]),
  ],
  length: DROP.length,
  loop: loadLoop,
}

// ——— Fiolki kontrolne ———
// Pipeta przenosi kroplę między trzema odczynnikami. Pęcherzyki
// wędrują od dna do szyjki i znikają, zamiast migać całą fiolką.
const BENCH: Frame = ['hhhhhhhhhhhhh', '.x.........x.']
const TUBES_X = [10, 14, 18] as const

function tubes(dx: number, t: number): Layer[] {
  const colors = ['W', 'f', 'd'] as const
  return [[BENCH, 8 + dx, 4], ...TUBES_X.flatMap((x, i) => {
    const liquid = colors[i]!
    const bubbleY = 3 - Math.floor(((t + i * 3) % 12) / 4)
    return [[['i.i', `i${liquid}i`, 'iii'], x + dx, 1] as Layer, [['j'], x + dx + 1, bubbleY] as Layer]
  })]
}

function tubeLoop(t: number): Frame {
  const x = 9 + pingPong(t, 10)
  const drop = t % 8 === 4
  return draw(...tubes(0, t), [stander('right', 'gg'), 0, 0], ...line([8, 3], [x, 0], 'h'), [['i'], x + 1, 0], ...(drop ? [[['W'], x + 1, 1] as Layer] : []))
}

const assay: Act = {
  name: 'fiolki',
  intro: [
    ...SLIDE.map(dx => draw(...tubes(dx, 0), [['hi'], 8 + dx, 3], [STAND, 0, 0])),
    draw(...tubes(0, 0), [['hi'], 8, 3], [stander('right', 'g'), 0, 0]),
    draw(...tubes(0, 0), ...line([8, 3], [9, 1], 'h'), [['i'], 10, 1], [stander('right', 'gg'), 0, 0]),
  ],
  length: 20,
  loop: tubeLoop,
}

// ——— Liczydło Młota ———
// Koraliki na dwóch drutach przesuwają się tam i z powrotem.
// Młot powtarza rachunek, prowadząc palcem drugi rząd.
const ABACUS: Frame = ['hhhhhhhhh', 'hsssssssh', 'h.......h', 'hsssssssh', 'hhhhhhhhh']
const ABACUS_X = 12

function abacusAt(dx: number, shift: number): Layer[] {
  return [[ABACUS, ABACUS_X + dx, 1], [['yy'], 14 + dx + shift, 2], [['yy'], 17 + dx - shift, 4]]
}

function abacusLoop(t: number): Frame {
  const shift = Math.floor(pingPong(t, 4) * 3 / 4)
  const handY = t < 7 || t === 15 ? 2 : t === 7 || t === 14 ? 3 : 4
  const handX = handY === 4 ? 16 - shift : 13 + shift
  return draw(...abacusAt(0, shift), [stander('right', 'gg'), 0, 0], ...line([8, 3], [handX, handY], 'g'))
}

const abacus: Act = {
  name: 'liczydło',
  who: ['Młot'],
  intro: [
    ...SLIDE.map(dx => draw(...abacusAt(dx, 0), [STAND, 0, 0])),
    draw(...abacusAt(0, 0), [stander('right', 'g'), 0, 0]),
    draw(...abacusAt(0, 0), [stander('right', 'gg'), 0, 0], ...line([8, 3], [10, 3], 'g')),
    abacusLoop(0),
  ],
  length: 16,
  loop: abacusLoop,
}

// ——— Próba dźwięku dzwonu ———
// Dzwon wjeżdża z pobijakiem zawieszonym na belce, ręka zdejmuje pobijak. Po stuknięciu
// jasna fala odchodzi od odlewu, a ręka wycofuje pobijak do następnej próby.
const BELL: Frame = ['...h...', '..yyy..', '.yy.yy.', 'yyy.yyy', '...S...']
const BELL_STAND: Frame = ['hhhhhhhhh', '........x', '........x', '........x', '........x', '......xxx']
const BELL_TAP = [10, 10, 11, 12, 13, 12, 11, 10, 10, 10, 10, 10] as const
// Pobijak na haku belki: trzonek w górze, obuch w dole.
const HANGING: Frame = ['h', 'S']

function bellAt(dx: number): Layer[] {
  return [[BELL_STAND, 12 + dx, 0], [BELL, 12 + dx, 0]]
}

function bellLoop(t: number): Frame {
  const x = BELL_TAP[t]!
  const wave: Layer[] = t >= 5 && t <= 7 ? [[['j', '.', 'j'], 19 + t - 5, 1]] : []
  return draw(...bellAt(0), [stander('right', 'gg'), 0, 0], ...line([8, 3], [x - 1, 3], 'g'), [['S', 'h'], x, 2], ...wave)
}

const bell: Act = {
  name: 'dzwon',
  intro: [
    ...SLIDE.map(dx => draw(...bellAt(dx), [HANGING, 12 + dx, 1], [STAND, 0, 0])),
    draw(...bellAt(0), [HANGING, 12, 1], [stander('right', 'g'), 0, 0]),
    draw(...bellAt(0), [HANGING, 12, 1], [stander('right', 'gg'), 0, 0], ...line([8, 3], [11, 2], 'g')),
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

function latchAt(dx: number, x: number): Layer[] {
  const tug = x === 8 ? -1 : 0
  return [[LOCKED_CHEST, 12 + dx + tug, 1],
    ...line([x + dx + 2, 3], [15 + dx + tug, 3], 'm'),
    [PULL_RING, x + dx, 2]]
}

function latchLoop(t: number): Frame {
  const x = LATCH_PULL[t]!
  // Przy drugim szarpnięciu zaciska oczy, ale nie wypuszcza kółka.
  return draw(...latchAt(0, x), [stander(t === 11 || t === 12 ? 'shut' : 'right', 'gg'), 0, 0],
    ...line([8, 3], [x, 3], 'g'), [PULL_RING, x, 2])
}

const latch: Act = {
  name: 'próba zatrzasku',
  who: ['Młot'],
  intro: [
    ...SLIDE.map(dx => draw(...latchAt(dx, 10), [STAND, 0, 0])),
    draw(...latchAt(0, 10), [stander('right', 'g'), 0, 0]),
    draw(...latchAt(0, 10), [stander('right', 'gg'), 0, 0], ...line([8, 3], [9, 3], 'g')),
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
