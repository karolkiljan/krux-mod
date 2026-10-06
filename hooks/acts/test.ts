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

export const TEST_ACTS: Act[] = [canary, load, assay]

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
