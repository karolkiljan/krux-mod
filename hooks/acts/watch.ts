import { STAND, draw, head, line, stander, walker } from '../stage'
import type { Act, Frame, Layer, Look } from '../stage'

// Czuwanie w spoczynku przy palenisku, które płonie na lewo od stanowiska kuźni. Same ruchy
// ciała, bez rekwizytu: kucnąć i grzać dłonie, rozglądać się po pokoju, przeciągnąć się.
// Ork stoi o piksel albo dwa w prawo, żeby dłonie ku ogniu zmieściły się w jego prostokącie.

// Przykuc twarzą do ognia: głowa wiersz niżej, dłonie w wierszu `hands` przed kolanami.
function warming(look: Look, hands: number): Frame {
  return draw([head(look), 2, 1], [['bbbbbb', 'GG..GG'], 2, 4], [['gg'], 0, hands])
}

const WARM_LOOKS: readonly Look[] = ['left', 'left', 'left', 'left', 'left', 'shut', 'left', 'left', 'left', 'left', 'mid', 'mid', 'right', 'right', 'mid', 'left']

// Grzanie rąk: dłonie ku żarowi, co jakiś czas pociera jedną o drugą, czasem spojrzy na pokój.
const warm: Act = {
  name: 'grzanie rąk',
  intro: [
    // Dwa kroki ku ogniu, przykucnąć.
    draw([walker(0, 'left'), 1, 0]),
    draw([walker(1, 'left'), 2, 0]),
    draw([['', ...head('left'), 'bbbbbb', 'GG..GG'], 2, 0]),
  ],
  length: WARM_LOOKS.length,
  loop: t => warming(WARM_LOOKS[t]!, t === 6 || t === 7 ? 3 : 4),
}

// Rozglądanie się: ork stoi na straży, wodzi wzrokiem po pokoju i mruga.
const GUARD_LOOKS: readonly Look[] = ['left', 'left', 'left', 'left', 'mid', 'mid', 'right', 'right', 'right', 'right', 'mid', 'mid', 'shut', 'mid', 'left', 'left']

const guard: Act = {
  name: 'rozglądanie',
  intro: [draw([stander('mid'), 1, 0])],
  length: GUARD_LOOKS.length,
  loop: t => draw([stander(GUARD_LOOKS[t]!), 1, 0]),
}

// Przeciąganie: ręce w górę, oczy przymknięte w ziewnięciu, ręce wracają przy bokach.
function stretched(reach: number, look: Look): Frame {
  const arms: Layer[] = reach === 0 ? [] : [...line([0, 3], [0, 3 - reach], 'g'), ...line([7, 3], [7, 3 - reach], 'g')]
  return draw([stander(look), 1, 0], ...arms)
}

const STRETCH: readonly (readonly [number, Look])[] = [
  [0, 'mid'], [0, 'mid'], [0, 'left'], [0, 'left'], [0, 'mid'], [1, 'mid'], [2, 'shut'], [3, 'shut'], [3, 'shut'], [3, 'shut'],
  [2, 'shut'], [1, 'mid'], [0, 'mid'], [0, 'right'], [0, 'right'], [0, 'mid'], [0, 'mid'], [0, 'left'], [0, 'left'], [0, 'mid'],
]

const stretch: Act = {
  name: 'przeciąganie',
  intro: [draw([STAND, 1, 0])],
  length: STRETCH.length,
  loop: t => stretched(...STRETCH[t]!),
}

export const WATCH_ACTS: Act[] = [warm, guard, stretch]
