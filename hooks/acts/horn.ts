import { STAND, draw, lerp, line, pingPong, stander } from '../stage'
import type { Act, Frame, Layer } from '../stage'

// Wezwanie hordy przy Agent. Krux przynosi rekwizyt ze ściany i daje sygnał;
// prawdziwa horda wstaje potem z pryczy.

// Fala dźwięku: łuk z trzech pikseli wędruje w prawo od `from`.
function wave(from: number, age: number, cell: string): Layer {
  return [[cell, '.' + cell, cell], from + age, 1]
}

// ——— Róg ———
const HORN_ORC: Frame = ['.gggg....', 'grggrg..t', '.tggtttt', 'bbbbbbggt', '.bGGb....', '.G..G....']
const HORN_PROP: Frame = ['...t', 'ttt.', '...t']
const HORN_FRAMES = 24

function hornLoop(t: number): Frame {
  // 24 klatki: co cztery klatki nowa fala, na przemian pomarańczowa i żółta.
  const waves: Layer[] = []
  for (let born = 0; born <= 8; born += 4) if (t >= born) waves.push(wave(10, t - born, born % 8 === 0 ? 'o' : 'y'))
  return draw([HORN_ORC, 0, 0], ...waves)
}

// Krux chwyta róg oburącz i przykłada do ust.
const LOOK: Frame = stander('right')

const horn: Act = {
  name: 'róg',
  kit: draw([HORN_PROP, 8, 1]),
  intro: [
    draw([LOOK, 0, 0], [HORN_PROP, 8, 1]),
    draw([LOOK, 0, 0], [['', '', '', '......gg'], 0, 0], [HORN_PROP, 6, 2]),
    draw([HORN_ORC, 0, 0]),
  ],
  length: HORN_FRAMES,
  loop: hornLoop,
}

// ——— Bęben ———
const DRUM: Frame = ['jjjjjj', 'dxddxd', 'ddxxdd']
const DRUM_AT = 9

type Beat = 'up' | 'mid' | 'down'

// Pałka w dłoni: ręka unosi się do (7, 2), pałka sterczy w górę albo leży na skórze.
const STICK: Record<Beat, readonly (readonly [number, number])[]> = {
  up: [[8, 1], [9, 0]],
  mid: [[8, 1], [9, 1]],
  down: [[8, 2], [9, 2]],
}

function drummer(beat: Beat): Layer[] {
  return [[STAND, 0, 0], ...line([6, 3], [7, 2], 'g'), ...STICK[beat].map(([x, y]) => [['h'], x, y] as Layer)]
}

const DRUM_CYCLE: readonly Beat[] = ['down', 'mid', 'up', 'up', 'mid', 'down', 'mid', 'up', 'up', 'up', 'up', 'mid']
const HITS = [0, 5]

function drumLoop(t: number): Frame {
  // 12 klatek: dwa uderzenia, po każdym skóra błyska, a fala idzie w prawo.
  const n = DRUM_CYCLE.length
  const waves = HITS.map(hit => (t - hit + n) % n)
    .filter(age => age < 6)
    .map(age => wave(DRUM_AT + 7, age, age < 3 ? 'y' : 'o'))
  const flash: Layer[] = HITS.includes(t) ? [[['yy'], DRUM_AT + 1, 3]] : []
  return draw([DRUM, DRUM_AT, 3], ...flash, ...drummer(DRUM_CYCLE[t]!), ...waves)
}

const drum: Act = {
  name: 'bęben',
  kit: draw([DRUM, DRUM_AT, 3], [['hh'], 8, 2]),
  intro: [
    // Krux sięga po pałkę leżącą na skórze.
    draw([DRUM, DRUM_AT, 3], [['hh'], 8, 2], [stander('right'), 0, 0]),
    draw([DRUM, DRUM_AT, 3], [['hh'], 8, 2], [STAND, 0, 0], [['g'], 6, 3]),
  ],
  length: DRUM_CYCLE.length,
  loop: drumLoop,
}

// ——— Flaga ———
const FLAG_X = 8
// Wierzchołki drzewca od pionu do przechyłu w prawo; drzewce zawsze wychodzi z dłoni (8, 3).
const TOPS = [[8, 0], [9, 0], [10, 0], [11, 1], [11, 2]] as const

// Płachta przy wierzchołku łopocze: brzeg faluje co klatkę.
function cloth(x: number, y: number, frame: number): Layer {
  return [Math.floor(frame / 2) % 2 === 0 ? ['ddd', 'dd'] : ['dd', 'ddd'], x + 1, y]
}

function flagLoop(t: number): Frame {
  // 16 klatek: machać flagą od pionu do przechyłu i z powrotem.
  const [x, y] = TOPS[lerp(0, TOPS.length - 1, pingPong(t, 8) / 8)]!
  return draw([stander('mid', 'gg'), 0, 0], ...line([FLAG_X, 3], [x, y], 'h'), cloth(x, y, t))
}

// Flaga w pionie z drzewcem od `top` w dół na `length` pikseli.
const planted = (top: number, length: number, frame: number): Layer[] => [[Array(length).fill('h'), FLAG_X, top], cloth(FLAG_X, top, frame)]

const flag: Act = {
  name: 'flaga',
  kit: draw(...planted(2, 4, 0)),
  intro: [
    // Chwycić drzewce i unieść flagę.
    draw([stander('mid', 'gg'), 0, 0], ...planted(2, 4, 5)),
    draw([stander('mid', 'gg'), 0, 0], ...planted(1, 3, 6)),
  ],
  length: 16,
  loop: flagLoop,
}

export const HORN_ACTS: Act[] = [horn, drum, flag]
