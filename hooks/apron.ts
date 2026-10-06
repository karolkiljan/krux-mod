// Fartuchy hordy: kumpel w swoim kolorze, Lont z tlącym się lontem przy głowie.
// Czyste funkcje bez katalogu scen, więc arkusz klatek sprawdza nimi jedną czynność.

import type { KruxMate } from '../types'
import { ROSTER } from './roster'

export type Face = 'Krux' | KruxMate | null

// Fartuch orka bez imienia; kumple biorą swój z `ROSTER`.
export const NAMELESS_APRON = 'u'

// Kumpel w swoim fartuchu; Lont nosi tlący się lont przy głowie, przy żuchwie z lewej.
export function dress(rows: readonly string[], face: Face): string[] {
  if (face === 'Krux') return [...rows]
  const apron = face === null ? NAMELESS_APRON : ROSTER[face].apron
  const dressed = rows.map(row => row.replaceAll('b', apron))
  // Drobny znak fachu podąża za głową; nie zasłania narzędzi ani oczu.
  const top = rows.findIndex(row => /[gG]{4}/u.test(row))
  if (top >= 0) {
    const x = rows[top]!.search(/[gG]{4}/u)
    const pixel = (dx: number, dy: number, cell: string, skin = false) => {
      const y = top + dy
      const at = x + dx
      const row = dressed[y]
      if (row === undefined || at < 0 || at >= row.length || !(row[at] === '.' || (skin && row[at] === 'g'))) return
      dressed[y] = `${row.slice(0, at)}${cell}${row.slice(at + 1)}`
    }
    if (face === 'Grom') for (let dx = 0; dx < 4; dx++) pixel(dx, 0, dx === 1 ? 's' : 'S', true)
    if (face === 'Niuch') { pixel(4, 2, 'g'); pixel(5, 2, 'g') }
    if (face === 'Ochra') { pixel(5, 2, 'j'); pixel(5, 3, 'h'); pixel(5, 4, 'h') }
  }
  if (face !== 'Lont') return dressed
  const spot = wickOf(rows)
  if (spot !== null) {
    const [x, y] = spot
    const row = dressed[y]!
    dressed[y] = `${row.slice(0, x)}o${row.slice(x + 1)}`
  }
  return dressed
}

// Piksele orka, na których lont nie może usiąść: skóra, oczy (też złote), kły, fartuch.
const ORC_CELLS = new Set(['g', 'G', 'r', 'y', 't', 'b'])

// Gdzie tli się lont: tuż z lewej od głowy, najpierw przy żuchwie, a gdy tam ciało
// albo dłoń, wyżej przy oczach i przy czubku. Głowę znajdują kły (`tggt`), więc
// lont idzie za nią także w pozach pochylonych i leżących; gdy dłonie zasłaniają
// żuchwę, czubek głowy (`gggg`) dwa wiersze wyżej.
function wickOf(rows: readonly string[]): readonly [number, number] | null {
  const fangs = rows.findIndex(row => /t[gG]{2}t/u.test(row))
  const top = rows.findIndex(row => /[gG]{4}/u.test(row))
  const jawY = fangs >= 0 ? fangs : top >= 0 && top + 2 < rows.length ? top + 2 : -1
  if (jawY < 0) return null
  const jawX = fangs >= 0 ? rows[jawY]!.search(/t[gG]{2}t/u) : rows[top]!.search(/[gG]{4}/u)
  const free = (y: number, x: number) => x >= 0 && !ORC_CELLS.has(rows[y]![x]!)
  if (free(jawY, jawX - 1)) return [jawX - 1, jawY]
  // Wyżej: lewa krawędź głowy w wierszu oczu, potem w wierszu czubka.
  for (const y of [jawY - 1, jawY - 2]) {
    if (y < 0 || !/[gGry]/u.test(rows[y]![jawX] ?? '')) continue
    let x = jawX
    while (x >= 0 && /[gGry]/u.test(rows[y]![x]!)) x -= 1
    if (free(y, x)) return [x, y]
  }
  return null
}
