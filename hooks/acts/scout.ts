import { STAND, at, croucher, draw, head, line, noise, pingPong, stander, walker } from '../stage'
import type { Act, Frame, Layer, Look } from '../stage'

// Rozglądanie się za plikami: ork czai się w krzaku, patrzy przez lunetę i obchodzi teren z włócznią.

// ——— Krzak z robakiem ———
// Krzak rośnie przed orkiem do piersi: zza liści widać głowę i skraj fartucha.
const BUSH: Frame = ['.lllflll', 'llflllfll', 'lfllllflll']
const BUSH_RUSTLE: Frame = ['.llfllfl', 'llflllfll', 'lfllllflll']
const BUSH_X = 2
// Krzak przyniesiony z zewnątrz stoi obok orka, zanim ten się za nim schowa.
const BUSH_AT = 8

function bushLoop(t: number, frame: number): Frame {
  // Robak wpełza zza prawej krawędzi i chowa się pod krzakiem; oczy idą za nim.
  const bug = 23 - Math.floor(t / 2)
  const eyes: Look = bug >= 15 ? 'right' : bug >= 12 ? 'mid' : 'left'
  const leaves = noise(frame, 3, 3) < 0.3 ? BUSH_RUSTLE : BUSH
  return draw([stander(eyes), 0, 0], at('R', bug, 5), [leaves, BUSH_X, 3])
}

const bush: Act = {
  name: 'krzak',
  kit: draw([BUSH, BUSH_AT, 3]),
  intro: [
    // Ork przyciąga krzak przed siebie i chowa się za liśćmi.
    ...[BUSH_AT - 2, BUSH_AT - 4, BUSH_X].map(x => draw([stander('right'), 0, 0], [BUSH, x, 3])),
    draw([stander('right'), 0, 0], [BUSH_RUSTLE, BUSH_X, 3]),
  ],
  length: 24,
  loop: bushLoop,
}

// ——— Luneta ———
// Rura od oka w prawo: dwa skórzane człony, dwa stalowe, szkło na końcu.
const TUBE = 'hhSSi'
const CLOSED_GLASS: Layer = [['hS'], 7, 3]
// Złożona luneta leży na ziemi, zanim ork ją podniesie.
const LAID_GLASS: Layer = [['hS'], 7, 5]

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
  kit: draw(LAID_GLASS),
  intro: [
    // Podnieść lunetę z ziemi, unieść rękę do oka i rozsunąć lunetę człon po członie.
    draw([stander('right'), 0, 0], at('g', 6, 4), LAID_GLASS),
    draw([stander('right'), 0, 0], at('g', 6, 4), [['hS'], 7, 4]),
    draw([stander('right'), 0, 0], at('g', 6, 3), CLOSED_GLASS),
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
  kit: draw([SPEAR, FROM + 6, 0]),
  intro: [
    // Ork podchodzi do wbitej włóczni i ją chwyta.
    ...[1, 2].map(x => draw([walker(x, 'right'), x, 0], [SPEAR, FROM + 6, 0])),
    draw([holding('right'), FROM, 0], [SPEAR, FROM + 6, 0]),
  ],
  length: 2 * WALK + 12,
  loop: patrolLoop,
}

// ——— Nora ———
// Ork rozkopuje kopiec łopatką, kładzie się na brzuchu i zagląda, z nory łypią żółte ślepia.
const MOUND: Frame = ['..aaaa..', '.hcccch.', 'hhcccchh']
const MOUND_X = 12
const TROWEL: Layer = [['hS'], 7, 5]
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
  kit: draw(TROWEL),
  intro: [
    // Ork klęka z łopatką, ziemia rośnie pod jego ręką, potem kładzie się i podczołguje.
    draw([KNEEL, 0, 0], TROWEL, at('g', 6, 4)),
    draw([KNEEL, 0, 0], [MOUND, MOUND_X, 5], at('g', 6, 4), at('g', 7, 4), [['hS'], 8, 4]),
    draw([KNEEL, 0, 0], [MOUND, MOUND_X, 4], at('g', 6, 4), at('g', 7, 4), [['hS'], 9, 4]),
    draw([KNEEL, 0, 0], [MOUND, MOUND_X, 3], at('g', 6, 4), at('g', 7, 4), [['hS'], 10, 4]),
    draw([DIVE, 0, 0], [MOUND, MOUND_X, 3]),
    draw([MOUND, MOUND_X, 3], [PRONE, -2, 0]),
    draw([MOUND, MOUND_X, 3], [PRONE, -1, 0]),
    draw([MOUND, MOUND_X, 3], [PRONE, 0, 0]),
  ],
  length: 24,
  loop: burrowLoop,
}

// ——— Niuch: badanie wiatru ———
// Zwilżony palec w górze; liść wlatuje z prawej i przemyka za orkiem.
const WIND_LEAF: Frame = ['.f', 'lh']

function windHand(tip: number): Layer[] {
  return [...line([5, 3], [7, 2], 'g'), ...line([7, 2], [7, tip], 'g'), at('i', 7, tip)]
}

function windLoop(t: number): Frame {
  const x = 22 - 2 * t
  const y = t < 4 ? 1 : t < 8 ? 2 : 3
  return draw([WIND_LEAF, x, y], [stander(t < 8 ? 'right' : 'mid'), 0, 0], ...windHand(0))
}

const wind: Act = {
  name: 'wiatr',
  who: ['Niuch'],
  intro: [
    // Palec do ust, potem nad głowę; liść na starcie dopiero za krawędzią.
    draw([stander('right', 'g'), 0, 0]),
    draw([stander('right'), 0, 0], at('g', 6, 2)),
    draw([stander('right'), 0, 0], at('i', 6, 2), at('g', 6, 3)),
    draw([stander('right'), 0, 0], ...windHand(2)),
    draw([stander('right'), 0, 0], ...windHand(1)),
    windLoop(0),
  ],
  length: 16,
  loop: windLoop,
}

// ——— Niuch: nić zwiadowcy ———
// Kłębek toczy się przed dłonią; biała nić znaczy drogę powrotną, potem się zwija.
const THREAD_BALL: Frame = ['.jj.', 'jhhj', '.jj.']
const THREAD_MARK = [[1, 0], [3, 1], [2, 2], [0, 1]] as const

function threadBall(x: number, turn: number): Layer[] {
  const [dx, dy] = THREAD_MARK[turn % 4]!
  return [[THREAD_BALL, x, 3], at('n', x + dx, 3 + dy)]
}

function threadLoop(t: number): Frame {
  const x = pingPong(t, 8)
  return draw(
    ...line([7, 5], [x + 8, 5], 'j'),
    ...threadBall(x + 8, x),
    [walker(t, t < 8 ? 'right' : 'left'), x, 0],
    ...line([x + 5, 3], [x + 7, 4], 'g'),
  )
}

const thread: Act = {
  name: 'nić zwiadowcy',
  who: ['Niuch'],
  kit: draw(...threadBall(8, 0)),
  intro: [
    // Niuch schyla dłoń i wyciąga początek nici.
    draw(...threadBall(8, 0), [stander('right', 'g'), 0, 0], at('j', 7, 5)),
    threadLoop(0),
  ],
  length: 16,
  loop: threadLoop,
}

export const SCOUT_ACTS: Act[] = [bush, spy, patrol, burrow, wind, thread]
