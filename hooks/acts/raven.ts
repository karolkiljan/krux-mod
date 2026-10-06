import { at, bonfire, draw, head, stander, walker } from '../stage'
import type { Act, Frame, Layer, Look } from '../stage'

// Wieści ze świata: kruk-goniec, sygnały dymne i strzała z listem.

// ——— Kruk-goniec ———
// Ręka wyciągnięta w bok, kruk siada na jej końcu.
const ARM: Layer = [['ggg'], 6, 3]
const PERCH = 8

function ravenAt(x: number, y: number, step: number, perched: boolean): Layer[] {
  if (perched) return [[['.wy', 'ww'], x, y - 1]]
  return step % 2 === 0 ? [[['w.w', '.w.'], x - 1, y - 1]] : [[['.w.', 'w.w'], x - 1, y]]
}

function ravenLoop(t: number): Frame {
  // 36 klatek: kruk zrywa się z ręki, znika za prawą krawędzią, wraca ze zwojem,
  // siada, a zwój wędruje do dłoni i za fartuch.
  let x = PERCH
  let back = false
  if (t >= 3 && t < 15) x = PERCH + Math.round((t - 2) * 1.2)
  else if (t >= 15 && t < 18) x = 24
  else if (t >= 18 && t < 30) {
    x = 22 - Math.round((t - 17) * 1.2)
    back = true
  }
  const perched = t < 3 || t >= 30
  const y = perched ? 2 : 1 + (Math.floor(t / 3) % 2)
  const scroll: Layer[] = back ? [at('p', x, y + 2)] : []
  const tuck = [[9, 3], [8, 4], [7, 4], [6, 4], [5, 4], [4, 4]] as const
  const handed: Layer[] = t >= 30 ? [at('p', tuck[t - 30]![0], tuck[t - 30]![1])] : []
  const look: Look = perched ? 'mid' : 'right'
  return draw(...handed, [stander(look), 0, 0], ARM, ...ravenAt(x, y, t, perched), ...scroll)
}

const raven: Act = {
  name: 'kruk',
  intro: [
    // Ręka wysuwa się w bok, kruk nadlatuje z prawej i siada.
    draw([stander('right'), 0, 0], at('g', 6, 3)),
    draw([stander('right'), 0, 0], [['gg'], 6, 3]),
    ...[21, 19, 17, 15, 13, 11, 9].map((x, i) => draw([stander('right'), 0, 0], ARM, ...ravenAt(x, 1 + (i % 2), i, false))),
  ],
  length: 36,
  loop: ravenLoop,
}

// ——— Sygnały dymne ———
const FIRE_X = 14
const SMOKER = 6

// Koc nad ogniem trzymany za róg; `width` to ile go rozwinięte.
function blanket(width: number): Layer[] {
  return [at('g', SMOKER + 6, 2), [['d'.repeat(width)], SMOKER + 6, 1]]
}

const SMOKER_BODY: Frame = [...head('right'), 'bbbbbg', '.bGGb.', '.G..G.']

// Dwa kłęby na pętlę: koc się zwija, kłąb leci w górę i ginie za górną krawędzią.
const OPENINGS = [4, 16]

function smokeLoop(t: number, frame: number): Frame {
  let width = 7
  const puffs: Layer[] = []
  for (const open of OPENINGS) {
    const age = t - open
    if (age >= 0 && age < 6) width = [5, 3, 2, 2, 3, 5][age]!
    if (age >= 2 && age < 9) {
      const y = 2 - Math.floor((age - 2) / 2)
      puffs.push([['mm', 'mm'], FIRE_X + 1 + Math.floor((age - 2) / 3), y - 1])
    }
  }
  return draw(...bonfire(FIRE_X, frame, 2), ...puffs, [SMOKER_BODY, SMOKER, 0], ...blanket(width))
}

const smoke: Act = {
  name: 'dym',
  intro: [
    // Polana układają się i zajmują ogniem, a ork podchodzi ze zwiniętym kocem.
    ...[-1, 0, 0, 1, 2, 2].map((size, i) => {
      const x = i + 1
      const logs: Layer[] = size < 0 ? [at('x', FIRE_X + 1, 4)] : bonfire(FIRE_X, i, size)
      const spark: Layer[] = i === 2 ? [at('y', FIRE_X + 1, 3)] : []
      return draw(...logs, ...spark, [walker(i, 'right'), x, 0], [['dd'], x + 6, 3])
    }),
    // Unieść koc nad ogień i rozwinąć.
    draw(...bonfire(FIRE_X, 6, 2), [SMOKER_BODY, SMOKER, 0], at('g', SMOKER + 6, 2), [['dd'], SMOKER + 6, 1]),
    draw(...bonfire(FIRE_X, 7, 2), [SMOKER_BODY, SMOKER, 0], ...blanket(4)),
  ],
  length: 28,
  loop: smokeLoop,
}

// ——— Strzała z listem ———
// Łuk wygięty w prawo, cięciwa z lewej; strzała z listem przy cięciwie.
const BOW_X = 7

function bow(x: number, pull: number): Layer[] {
  const string: Layer[] = pull === 0 ? [[['j', 'j', 'j'], x, 1]] : [at('j', x, 1), at('j', x - pull, 2), at('j', x, 3)]
  return [[['h', '.h', '.h', '.h', 'h'], x, 0], ...string]
}

function arrow(x: number, y: number): Layer[] {
  return [[['jhhS'], x, y], at('p', x + 2, y + 1)]
}

const ARCHER: Frame = stander('right', 'g')

function bowLoop(t: number): Frame {
  // 32 klatki: naciągnąć, puścić, strzała odlatuje; odpowiedź wraca łukiem i wbija się w ziemię,
  // ork podnosi ją i zakłada na cięciwę.
  let pull = 0
  let shot: Layer[] = []
  if (t < 4) {
    pull = t < 2 ? 1 : 2
    shot = arrow(BOW_X - pull, 2)
  } else if (t < 11) {
    shot = arrow(BOW_X + 3 * (t - 3), 2)
  } else if (t >= 15 && t < 23) {
    const x = 22 - 2 * (t - 15)
    shot = [[['Shhj'], x, t < 19 ? 1 : 2], at('p', x + 1, t < 19 ? 2 : 3)]
  } else if (t >= 23 && t < 27) {
    shot = [[['S', '.h', '..h'], 9, 3], at('p', 10, 3)]
  } else if (t >= 27) {
    const lift = [[10, 4], [9, 3], [8, 3], [8, 2], [7, 2]] as const
    const [ax, ay] = lift[t - 27]!
    shot = arrow(ax, ay)
  }
  return draw([ARCHER, 0, 0], ...bow(BOW_X, pull), ...shot)
}

const archery: Act = {
  name: 'łuk',
  intro: [
    // Łuk wysuwa się zza pleców, potem strzała z listem.
    ...[3, 5, 7].map(x => draw(...bow(x, 0), [x < 7 ? stander('right') : ARCHER, 0, 0])),
    ...[3, 5].map(x => draw(...arrow(x, 2), [ARCHER, 0, 0], ...bow(BOW_X, 0))),
  ],
  length: 32,
  loop: bowLoop,
}

export const RAVEN_ACTS: Act[] = [raven, smoke, archery]
