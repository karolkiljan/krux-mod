import { STAND, at, croucher, draw, head, noise, stander, walker } from '../stage'
import type { Act, Frame, Layer, Look } from '../stage'

// Rozglądanie się za plikami: ork czai się w krzaku, patrzy przez lunetę i obchodzi teren z włócznią.

// ——— Krzak z robakiem ———
// Krzak rośnie przed orkiem do piersi: zza liści widać głowę i skraj fartucha.
const BUSH: Frame = ['.lllflll', 'llflllfll', 'lfllllflll']
const BUSH_RUSTLE: Frame = ['.llfllfl', 'llflllfll', 'lfllllflll']
const BUSH_X = 2

function bushLoop(t: number, frame: number): Frame {
  // Robak wpełza zza prawej krawędzi i chowa się pod krzakiem; oczy idą za nim.
  const bug = 23 - Math.floor(t / 2)
  const eyes: Look = bug >= 15 ? 'right' : bug >= 12 ? 'mid' : 'left'
  const leaves = noise(frame, 3, 3) < 0.3 ? BUSH_RUSTLE : BUSH
  return draw([stander(eyes), 0, 0], at('R', bug, 5), [leaves, BUSH_X, 3])
}

const bush: Act = {
  name: 'krzak',
  intro: [
    // Krzak wyrasta z ziemi wiersz po wierszu, ork zerka w prawo.
    draw([STAND, 0, 0], [BUSH, BUSH_X, 5]),
    draw([STAND, 0, 0], [BUSH, BUSH_X, 4]),
    draw([stander('right'), 0, 0], [BUSH, BUSH_X, 3]),
    draw([stander('right'), 0, 0], [BUSH_RUSTLE, BUSH_X, 3]),
  ],
  length: 24,
  loop: bushLoop,
}

// ——— Luneta ———
// Rura od oka w prawo: dwa skórzane człony, dwa stalowe, szkło na końcu.
const TUBE = 'hhSSi'

function spyglass(length: number, tilt: -1 | 0 | 1): Layer[] {
  const cells: Layer[] = [at('g', 6, 3), at('g', 7, 2)]
  ;[...TUBE.slice(0, length)].forEach((cell, i) => cells.push(at(cell, 6 + i, i < 2 ? 1 : 1 + tilt)))
  return cells
}

function tiltOf(t: number): -1 | 0 | 1 {
  if (t >= 10 && t < 22) return -1
  if (t >= 26 && t < 30) return 1
  return 0
}

function bird(t: number): Layer[] {
  // Ptak wlatuje z prawej, wznosi się i znika górą; luneta idzie za nim.
  const x = 22 - t
  const y = t < 9 ? 1 : 1 - Math.floor((t - 9) / 2)
  if (t > 15) return []
  return t % 2 === 0 ? [[['w.w', '.w.'], x - 1, y - 1]] : [[['.w.', 'w.w'], x - 1, y]]
}

const spy: Act = {
  name: 'luneta',
  intro: [
    // Unieść rękę do oka i rozsunąć lunetę człon po członie.
    draw([stander('right'), 0, 0], at('g', 6, 3)),
    ...[1, 2, 3, 4].map(n => draw([stander('right'), 0, 0], ...spyglass(n, 0))),
  ],
  length: 32,
  loop: t => draw([stander('right'), 0, 0], ...spyglass(5, tiltOf(t)), ...bird(t)),
}

// ——— Patrol z włócznią ———
const SPEAR: Frame = ['S', 'h', 'h', 'h', 'h', 'h']
const FROM = 3
const TO = 15
const WALK = TO - FROM

// Postój z włócznią w prawej ręce.
const holding = (look: Look): Frame => [...head(look), 'bbbbbg', '.bGGb.', '.G..G.']

function patrolLoop(t: number): Frame {
  // W prawo, rozejrzeć się, w lewo, rozejrzeć się; włócznia zawsze przy prawej dłoni.
  const pause = 6
  let x: number
  let body: Frame
  if (t < WALK) {
    x = FROM + t
    body = walker(t, 'right')
  } else if (t < WALK + pause) {
    x = TO
    body = holding((['right', 'right', 'mid', 'left', 'left', 'mid'] as const)[t - WALK]!)
  } else if (t < 2 * WALK + pause) {
    x = TO - (t - WALK - pause)
    body = walker(t, 'left')
  } else {
    x = FROM
    body = holding((['left', 'left', 'mid', 'right', 'right', 'mid'] as const)[t - 2 * WALK - pause]!)
  }
  return draw([body, x, 0], [SPEAR, x + 6, 0])
}

const patrol: Act = {
  name: 'patrol',
  intro: [
    // Włócznia spada z góry i wbija się w ziemię, ork podchodzi i ją chwyta.
    ...[-5, -3, -1, 0].map(y => draw([stander('right'), 0, 0], [SPEAR, FROM + 6, y])),
    ...[1, 2].map(x => draw([walker(x, 'right'), x, 0], [SPEAR, FROM + 6, 0])),
    draw([holding('right'), FROM, 0], [SPEAR, FROM + 6, 0]),
  ],
  length: 2 * WALK + 12,
  loop: patrolLoop,
}

// ——— Nora ———
// Kopiec z ciemną dziurą; ork leży na brzuchu i zagląda, z nory łypią żółte ślepia.
const MOUND: Frame = ['..aaaa..', '.hcccch.', 'hhcccchh']
const MOUND_X = 12
const PRONE: Frame = ['', '', '......gggg', '.....ggrggr', 'GGGbbbb.tggt', '...bbbb']
const KNEEL: Frame = croucher('right')
// Pochylenie z przykucu: głowa idzie naprzód i w dół.
const DIVE: Frame = ['', '', '...gggg', '..ggrggr', 'bbbbbtggt', 'GG..GG']

function burrowLoop(t: number): Frame {
  // 24 klatki: ślepia mrugają w norze, ork cofa głowę i znowu zagląda.
  const back = t >= 12 && t < 16 ? 1 : 0
  const eyes: Layer[] = t % 12 < 4 ? [] : [[['y.y'], MOUND_X + 3, 4]]
  return draw([MOUND, MOUND_X, 3], ...eyes, [PRONE, 1 - back, 0])
}

const burrow: Act = {
  name: 'nora',
  intro: [
    // Kopiec rośnie z ziemi, ork kładzie się i podczołguje.
    draw([stander('right'), 0, 0], [MOUND, MOUND_X, 5]),
    draw([stander('right'), 0, 0], [MOUND, MOUND_X, 4]),
    draw([KNEEL, 0, 0], [MOUND, MOUND_X, 3]),
    draw([DIVE, 0, 0], [MOUND, MOUND_X, 3]),
    draw([MOUND, MOUND_X, 3], [PRONE, -2, 0]),
    draw([MOUND, MOUND_X, 3], [PRONE, -1, 0]),
    draw([MOUND, MOUND_X, 3], [PRONE, 0, 0]),
  ],
  length: 24,
  loop: burrowLoop,
}

export const SCOUT_ACTS: Act[] = [bush, spy, patrol, burrow]
