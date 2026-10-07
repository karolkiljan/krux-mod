// Gesty wiercenia: krótka zmiana pozy z początku pętli, żeby ork przy robocie
// nie grał jak automat. Wspólne gra każdy, gest z `who` tylko orkowie tego fachu.
// Gest rusza oczami, głową albo wolną ręką; rekwizyt i fartuch zostają na miejscu.

import type { Frame, Gesture } from './stage'
import { pad } from './stage'

// Źrenice o `dx` w bok, gdy obok oka jest skóra; inaczej oko stoi.
export function glance(rows: Frame, dx: number): Frame {
  return rows.map(row => {
    const eyes = [...row].flatMap((cell, x) => (cell === 'r' ? [x] : []))
    if (eyes.length !== 2 || dx === 0) return row
    const cells = [...row]
    if (!eyes.every(x => cells[x + dx] === 'g' || cells[x + dx] === 'r')) return row
    for (const x of eyes) cells[x] = 'g'
    for (const x of eyes) cells[x + dx] = 'r'
    return cells.join('')
  })
}

// Rozglądanie: w lewo, w prawo, z powrotem.
const LOOK: Gesture = {
  name: 'rozglądanie',
  length: 13,
  apply: (rows, t) => glance(rows, t < 4 ? -1 : t < 9 ? 1 : 0),
}

// ——— Głowa w dowolnej pozie ———
// Głowa to trzy wiersze: czubek `gggg` od `x`, pod nim wiersz oczu o piksel szerszy
// z każdej strony, pod nim żuchwa z kłami. Znajdują ją oczy 'r' (dwa w jednym wierszu,
// trzy piksele od siebie); przy zamkniętych oczach pierwszy wiersz z 4 pikselami g/G.
export type Head = { top: number; x: number; eyes: readonly [number, number] | null }

const SKIN = 'gG'

function crownAt(grid: readonly (readonly string[])[], y: number, x: number): boolean {
  return x >= 0 && [0, 1, 2, 3].every(dx => SKIN.includes(grid[y]?.[x + dx] ?? '.'))
}

export function headOf(rows: Frame): Head | null {
  const grid = pad(rows).map(row => [...row])
  const eyes = grid.flatMap((row, y) => row.flatMap((cell, x) => (cell === 'r' ? [[x, y] as const] : [])))
  if (eyes.length === 2) {
    const [[a, y], [b, other]] = eyes as [readonly [number, number], readonly [number, number]]
    if (y !== other || b - a !== 3 || y < 1 || y > grid.length - 2) return null
    const x = [a, a + 1, a - 1].find(at => crownAt(grid, y - 1, at))
    return x === undefined ? null : { top: y - 1, x, eyes: [a, b] }
  }
  if (eyes.length !== 0) return null
  const top = grid.findIndex(row => /[gG]{4}/u.test(row.join('')))
  if (top < 0 || top > grid.length - 3) return null
  const x = grid[top]!.join('').search(/[gG]{4}/u)
  // Zamknięte oczy to też skóra: bez niej pod czubkiem to nie głowa, tylko dłoń albo ławka.
  return crownAt(grid, top + 1, x) ? { top, x, eyes: null } : null
}

// Pędzel gestu na siatce pozy. `dot` maluje tylko na tle, `face` tylko na skórze,
// kłach i oczach głowy, `eyes` podmienia oba oczy naraz, `look` przesuwa źrenice,
// `tilt` przesuwa wiersz głowy o piksel, gdy z przodu jest tło. Rekwizytu i fartucha nie rusza.
type Pen = {
  head: Head
  free: (x: number, y: number) => boolean
  dot: (x: number, y: number, cell: string) => boolean
  face: (x: number, y: number, cell: string) => boolean
  eyes: (cell: string) => boolean
  look: (dx: number) => void
  tilt: (y: number, dx: -1 | 1) => boolean
}

// Gest na kopii pozy. `paint` zwraca false, gdy gest nie ma tu miejsca: wtedy poza bez zmian.
function sketch(rows: Frame, paint: (pen: Pen) => boolean): Frame {
  const head = headOf(rows)
  if (head === null) return rows
  const grid = pad(rows).map(row => [...row])
  const { top, x } = head
  const free = (px: number, py: number) => grid[py]?.[px] === '.'
  const own = (px: number, py: number) => py >= top && py <= top + 2 && px >= x - 1 && px <= x + 4 && 'gGrt'.includes(grid[py]![px]!)
  let eyes = head.eyes
  const pen: Pen = {
    head,
    free,
    dot: (px, py, cell) => {
      if (!free(px, py)) return false
      grid[py]![px] = cell
      return true
    },
    face: (px, py, cell) => {
      if (!own(px, py)) return false
      grid[py]![px] = cell
      return true
    },
    eyes: cell => {
      if (eyes === null) return false
      for (const ex of eyes) grid[top + 1]![ex] = cell
      return true
    },
    look: dx => {
      if (eyes === null || dx === 0) return
      const row = grid[top + 1]!
      if (!eyes.every(ex => ex + dx >= x - 1 && ex + dx <= x + 4 && (row[ex + dx] === 'g' || row[ex + dx] === 'r'))) return
      for (const ex of eyes) row[ex] = 'g'
      for (const ex of eyes) row[ex + dx] = 'r'
      eyes = [eyes[0] + dx, eyes[1] + dx]
    },
    tilt: (py, shift) => {
      // Cztery piksele głowy pod czubkiem (czubek albo żuchwa); dłoń obok zostaje.
      const row = grid[py]!
      if (![0, 1, 2, 3].every(dx => own(x + dx, py)) || !free(shift < 0 ? x - 1 : x + 4, py)) return false
      const part = row.slice(x, x + 4)
      for (let px = x; px < x + 4; px += 1) row[px] = '.'
      part.forEach((cell, i) => (row[x + shift + i] = cell))
      return true
    },
  }
  if (!paint(pen)) return rows
  const out = grid.map(row => row.join(''))
  return keepsRules(rows, out) ? out : rows
}

// Siatka bezpieczeństwa: fartuch jest, oczu 0 albo 2, czubek głowy tam, gdzie szuka go `dress`.
function keepsRules(rows: Frame, out: Frame): boolean {
  const cells = out.join('')
  const eyes = [...cells].filter(cell => cell === 'r').length
  const crown = (frame: Frame) => frame.findIndex(row => /[gG]{4}/u.test(row))
  return cells.includes('b') && (eyes === 0 || eyes === 2) && crown(out) === crown(rows)
}

// Krok `t` w przedziale [from, to].
const within = (t: number, from: number, to: number) => t >= from && t <= to

// ——— Wspólne ———

// Drapanie: wolna dłoń przy czubku głowy, palce mierzwią skórę, oczy przymknięte z ulgą.
const SCRATCH: Gesture = {
  name: 'drapanie',
  length: 13,
  apply: (rows, t) =>
    sketch(rows, ({ head: { top, x }, free, dot, face, eyes }) => {
      if (t === 0 || t === 12) return false
      // Najpierw dłoń z odstępem od czubka; ciemna krawędź odcina ją od skóry.
      const hand = [x - 2, x + 5, x + 4, x - 1].find(at => free(at, top) && (at !== x - 2 || free(x - 1, top)) && (at !== x + 5 || free(x + 4, top)))
      if (hand === undefined) return false
      const left = hand < x
      dot(hand, top, 'G')
      dot(left ? hand - 1 : hand + 1, top + 1, 'g')
      // Palce na zmianę na dwóch pikselach czubka od strony dłoni.
      if (within(t, 2, 10)) face(left ? x + (t % 2) : x + 3 - (t % 2), top, 'G')
      if (within(t, 2, 10)) eyes('G')
      return true
    }),
}

// Przeciąganie: oczy zamknięte, głowa przechyla się w lewo i w prawo, aż strzyknie w karku.
// W lewo czubek idzie w lewo, a żuchwa w prawo; w prawo rusza sam czubek i tylko
// wtedy, gdy lont Lonta ma miejsce przy żuchwie.
const STRETCH: Gesture = {
  name: 'przeciąganie',
  length: 13,
  apply: (rows, t) =>
    sketch(rows, ({ head: { top, x }, eyes, tilt, dot, free }) => {
      if (t === 0 || t === 12) return false
      eyes('G')
      if (within(t, 2, 5) && tilt(top, -1)) tilt(top + 2, 1)
      // W prawo tylko przy wolnym miejscu z lewej od żuchwy: tam tli się lont, gdy czubek odjedzie.
      if (within(t, 7, 10) && free(x - 1, top + 2)) tilt(top, 1)
      // Strzyknięcie w karku: iskierka nad czubkiem z tyłu, gdy jest tam tło.
      if (t === 6) dot(x + 4, top, 'j')
      return true
    }),
}

// Ziewanie: usta się otwierają, oczy zamykają; w połowie dłoń przed paszczą.
const YAWN: Gesture = {
  name: 'ziewanie',
  length: 13,
  apply: (rows, t) =>
    sketch(rows, ({ head: { top, x }, face, eyes, dot }) => {
      if (t === 0 || t === 12) return false
      const wide = within(t, 3, 9)
      // Paszcza między kłami: najpierw szpara, potem ciemna dziura.
      face(x + 1, top + 2, wide ? 'c' : 'G')
      face(x + 2, top + 2, wide ? 'c' : 'G')
      if (wide) eyes('G')
      if (within(t, 5, 7)) dot(x + 4, top + 2, 'g')
      return true
    }),
}

// ——— Z fachu ———

// Krux, broda: dłoń pod brodą, palec gładzi kieł, oczy w bok, jakby ważył decyzję.
const BEARD: Gesture = {
  name: 'broda',
  who: ['Krux'],
  length: 13,
  apply: (rows, t) =>
    sketch(rows, ({ head: { top, x }, dot, face, look }) => {
      if (t === 0 || t === 12) return false
      if (!dot(x + 4, top + 2, 'g')) return false
      if (within(t, 3, 9) && t % 2 === 1) face(x + 3, top + 2, 'g')
      if (within(t, 2, 10)) look(1)
      return true
    }),
}

// Niuch, węszenie: zapach płynie ku nosowi, Niuch zamyka oczy, wciąga go i zerka w tamtą stronę.
const SNIFF: Gesture = {
  name: 'węszenie',
  who: ['Niuch'],
  length: 13,
  apply: (rows, t) =>
    sketch(rows, ({ head: { top, x }, dot, eyes, look }) => {
      if (t === 0 || t === 12) return false
      // Smuga zapachu: od prawej do nosa w wierszu oczu, potem znika we wdechu.
      if (t <= 5) dot(x + 10 - t, top + 1, 'm')
      if (t <= 3) dot(x + 12 - t, top + 1, 'm')
      if (within(t, 6, 8)) eyes('G')
      if (within(t, 9, 11)) look(1)
      return true
    }),
}

// Młot, liczenie na palcach: dłoń w górę przed twarzą, palce wychodzą po jednym, potem drugi raz.
const COUNT: Gesture = {
  name: 'liczenie na palcach',
  who: ['Młot'],
  length: 13,
  apply: (rows, t) =>
    sketch(rows, ({ head: { top, x }, free, dot, look, eyes }) => {
      if (t === 0 || t === 12) return false
      // Wszystkie trzy palce muszą mieć tło. Rekwizyt z prawej: druga strona albo wyżej.
      const upright = (palm: number, y: number, dx: number) => ({
        palm: [palm, y] as const,
        fingers: [palm - 1, palm, palm + 1].map(at => [at, y - 1] as const),
        dx,
      })
      const hands = [
        ...[x + 7, x + 6, x + 8, x + 9].map(at => upright(at, top + 2, 1)),
        ...[x - 4, x - 3, x - 5].map(at => upright(at, top + 2, -1)),
        ...[x + 7, x + 6, x + 8, x + 5].map(at => upright(at, top + 1, 1)),
        ...[x - 4, x - 3, x - 5].map(at => upright(at, top + 1, -1)),
        upright(x + 1, top - 1, 0),
        // W ciasnym miejscu dwa palce nad dłonią, trzeci (kciuk) z boku.
        {
          palm: [x - 2, top + 1] as const,
          fingers: [[x - 2, top], [x - 3, top], [x - 3, top + 1]] as const,
          dx: -1,
        },
        {
          palm: [x + 5, top + 1] as const,
          fingers: [[x + 5, top], [x + 4, top], [x + 6, top + 1]] as const,
          dx: 1,
        },
        // Przy górnej krawędzi i zajętych bokach palce rozkładają się obok czubka.
        ...[x + 5, x + 6, x + 7].map(at => ({
          palm: [at, top] as const,
          fingers: [1, 2, 3].map(dx => [at + dx, top] as const),
          dx: 1,
        })),
      ]
      const hand = hands.find(({ palm, fingers }) => free(...palm) && fingers.every(([px, py]) => free(px, py)))
      if (hand === undefined) return false
      look(hand.dx)
      dot(...hand.palm, 'G')
      // Raz: 1, 2, 3. Pięść i mrugnięcie, potem pełne drugie 1, 2, 3.
      const shown = t < 7 ? Math.floor(t / 2) : t === 7 ? 0 : Math.min(3, t - 7)
      hand.fingers.slice(0, shown).forEach(([px, py]) => dot(px, py, 'g'))
      if (t === 7) eyes('G')
      return true
    }),
}

// Piryt, mrużenie: powieki opadają na oba oczy naraz, czerwone ślepia patrzą spod nich.
// Przygaszona czerwień 'R' to nie oko 'r': humor nie dorysuje drugiej pary brwi nad powiekami.
const SQUINT: Gesture = {
  name: 'mrużenie',
  who: ['Piryt'],
  length: 13,
  apply: (rows, t) =>
    sketch(rows, ({ head: { top, x, eyes: lids }, face, eyes }) => {
      if (t === 0 || t === 12 || lids === null) return false
      eyes('R')
      for (const ex of lids) {
        const inward = ex === lids[0] ? 1 : -1
        const spot = [ex, ex + inward].find(at => at >= x && at <= x + 3)
        if (spot !== undefined) face(spot, top, 'G')
      }
      // W środku mocniej: oczy na chwilę całkiem zamknięte.
      if (within(t, 6, 7)) eyes('G')
      return true
    }),
}

// Grom, strzepywanie iskier: iskry siadają przy hełmie, tlą się, dłoń je strzepuje, jedna odlatuje.
const SPARKS: Gesture = {
  name: 'strzepywanie iskier',
  who: ['Grom'],
  length: 13,
  apply: (rows, t) =>
    sketch(rows, ({ head: { top, x }, free, dot, eyes, look }) => {
      if (t === 0 || t === 12) return false
      const left = free(x - 1, top)
      const right = free(x + 4, top)
      if (!left && !right) return false
      const glow = t === 1 ? 'y' : t % 2 === 0 ? 'o' : 'R'
      if (t <= 4) {
        if (left) dot(x - 1, top, glow)
        if (right) dot(x + 4, top, glow)
        look(right ? 1 : -1)
        return true
      }
      // Strzepnięcie: dłoń w miejscu lewej iskry, prawa odlatuje łukiem i gaśnie.
      if (t <= 7) {
        if (left) dot(x - 1, top, 'g')
        if (t <= 6) eyes('G')
      }
      const flight: readonly (readonly [number, number, string])[] = [
        [5, 0, 'o'],
        [6, 0, 'y'],
        [7, 1, 'y'],
        [8, 2, 'o'],
      ]
      const spark = flight[t - 5]
      if (right && spark !== undefined) dot(x + spark[0], top + spark[1], spark[2])
      return true
    }),
}

// Ochra, poprawianie fartucha: dłonie łapią rąbek z obu stron, ciągną w dół i wygładzają.
const APRON: Gesture = {
  name: 'poprawianie fartucha',
  who: ['Ochra'],
  length: 13,
  apply: (rows, t) =>
    sketch(rows, ({ head: { top, x }, dot, look, free }) => {
      if (t === 0 || t === 12) return false
      // Rąbek: najniższy wiersz fartucha pod głową; dłonie tuż za jego krańcami.
      const grid = pad(rows)
      const hem = [...grid.keys()].filter(y => y > top + 2 && grid[y]!.slice(Math.max(0, x - 1), x + 5).includes('b')).at(-1)
      if (hem === undefined) return false
      const row = grid[hem]!
      const cells = [...row].flatMap((cell, at) => (cell === 'b' && at >= x - 1 && at <= x + 4 ? [at] : []))
      const sides = [Math.min(...cells) - 1, Math.max(...cells) + 1].filter(at => free(at, hem))
      if (sides.length === 0) return false
      // Pociągnięcie: dłonie piksel niżej, gdy pod nimi jest tło.
      const tug = within(t, 4, 7) && sides.every(at => free(at, hem + 1))
      for (const at of sides) dot(at, tug ? hem + 1 : hem, 'g')
      look(within(t, 8, 11) ? (t % 4 < 2 ? -1 : 1) : 0)
      return true
    }),
}

// Lont, mierzenie lontu: sznur lontu z zębów, kciuk odmierza go piksel po pikselu, potem zwija.
const FUSE: Gesture = {
  name: 'mierzenie lontu',
  who: ['Lont'],
  length: 13,
  apply: (rows, t) =>
    sketch(rows, ({ head: { top, x }, free, dot, look }) => {
      if (t === 0 || t === 12) return false
      // Sznur rośnie od kła w prawo tak daleko, jak puszcza tło, najwyżej 5 pikseli.
      let room = 0
      while (room < 5 && free(x + 4 + room, top + 2)) room += 1
      if (room < 2) return false
      const out = Math.min(room, t <= 4 ? t + 1 : t <= 9 ? 5 : 15 - t)
      for (let i = 0; i < out; i += 1) dot(x + 4 + i, top + 2, i === out - 1 && t <= 4 ? 'o' : 'x')
      // Kciuk wędruje po sznurze: raz, dwa, trzy.
      if (within(t, 5, 9)) {
        const thumb = x + 4 + Math.min(out - 1, 1 + Math.floor((t - 5) / 2))
        dot(thumb, top + 1, 'g')
        look(1)
      }
      return true
    }),
}

export const GESTURES: readonly Gesture[] = [LOOK, SCRATCH, STRETCH, YAWN, BEARD, SNIFF, COUNT, SQUINT, SPARKS, APRON, FUSE]
