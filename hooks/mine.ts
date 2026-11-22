// Kopalnia w Sztolni (karta `kopalnia`): żywy przekrój kopalni w panelu obok rozmowy. To
// terminalowy odpowiednik tła Desktopu (`backdrop.ts`): terminal tła na całe okno nie ma, więc
// scena stoi z boku. Czuje to samo (`BackdropValues`): iskry przy robocie, pył przy czerwonych
// testach, błysk rudy, gdy Krux dumny. Płótno po stronie terminala: rysuje je `Client`, bez `$`.

import type { ClientModule } from 'claude-code'
import type { BackdropValues } from './backdrop'
import { ANNEX_MIN, FRAME_MS, ROOM_ROWS, annexGrid, hearthRows, paint, runsOf } from './sprites'

export type MineProps = BackdropValues & {
  // Miejsce w panelu, w komórkach; piksel to pół komórki w pionie.
  columns: number
  rows: number
  // Ograniczony ruch: scena stoi.
  still: boolean
}

// `still`: ograniczony ruch z ostatniego rysunku; zegar płótna nie widzi propsów, więc czyta go stąd.
type MineState = { frame: number; still: boolean }

// Najmniejsza kopalnia: chodnik z kuźnią nad nim; niższy panel pokazuje sam chodnik.
const HEARTH_TALL = 6
const HEARTH_LEFT = 4
const HEARTH_WIDE = 10
export const MINE_MIN_ROWS = (ROOM_ROWS + HEARTH_TALL + 6) / 2
// W spoczynku scena rusza się co tyle tyknięć: żar tli się wolniej, niż iskrzy robota.
const REST_EVERY = 3

// Los z kolumny i wiersza: skała i ziarna stoją w tym samym miejscu w każdej klatce.
function grain(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

// Siatka pikseli kopalni `width` × `height` w klatce `frame`. Od góry: strop, skała z żyłami rudy
// i kroplą, półka kuźni z paleniskiem, pod nią chodnik z wózkiem (`annexGrid`). Tła nie ma:
// pusta komórka zostaje kolorem terminala, jak w pokoju.
export function mineGrid(width: number, height: number, frame: number, values: BackdropValues, alive: boolean): string[] {
  const empty = Array.from({ length: Math.max(0, height) }, () => '.'.repeat(Math.max(0, width)))
  if (width < ANNEX_MIN || height < ROOM_ROWS) return empty
  const step = alive ? frame : 0
  const gold = values.gold > 0
  const red = values.dust > 0
  const gallery = annexGrid(width, step, { alive, red, feel: gold ? { kind: 'commit', age: step } : null })
  const top = height - ROOM_ROWS
  if (top < HEARTH_TALL + 6) return paint(empty, gallery, 0, top)
  const grid = empty.map(row => [...row])
  const put = (x: number, y: number, cell: string) => { if (grid[y]?.[x] !== undefined) grid[y]![x] = cell }
  // Skała: rzadkie okruchy, zawsze te same.
  for (let y = 2; y < top - 1; y += 1) for (let x = 4; x < width - 1; x += 1) {
    const n = grain(x, y)
    if (n < 0.012) put(x, y, 'V')
    else if (n < 0.018) put(x, y, 'k')
  }
  // Żyły rudy: dwa ukośne pasy ziaren. Dumny Krux złoci je na zmianę, inaczej raz po raz błysk.
  const veins = [[Math.floor(width * 0.35), 4, 1], [Math.floor(width * 0.15), Math.floor(top * 0.45), -1]] as const
  veins.forEach(([left, high, lean], v) => {
    for (let i = 0; i < Math.min(14, Math.floor(width / 3)); i += 1) {
      const x = left + i * 2 + Math.floor(grain(i, v + 3) * 2)
      const y = high + Math.floor(i * 0.7) * lean + Math.floor(grain(i, v + 9) * 3) + (lean < 0 ? 6 : 0)
      if (x >= width - 1 || y < 2 || y >= top - HEARTH_TALL - 1) continue
      put(x, y, gold ? ((i + step) % 2 === 0 ? 'y' : 'Z') : (step + i * 7 + v * 11) % 29 === 0 ? 'j' : i % 3 === 0 ? 'S' : 'q')
    }
  })
  // Strop i stemple: belka u góry, słupy w tych samych kolumnach co stemple chodnika.
  for (let x = 2; x < width; x += 1) put(x, 0, 'E')
  for (let x = 2; x + 2 < width; x += 20) for (let y = 1; y < top; y += 1) put(x, y, 'E')
  // Lampa pod stropem: przy czerwonych testach przygasa.
  const lamp = Math.floor(width * 0.6)
  put(lamp, 1, 'h')
  put(lamp, 2, 'C')
  put(lamp, 3, red ? 'Q' : step % 5 !== 0 ? 'Z' : 'y')
  put(lamp, 4, 'C')
  // Kropla ze stropu spada na półkę kuźni.
  const drip = step % 46
  const spout = Math.floor(width * 0.82)
  if (alive && drip < top - 3) put(spout, 1 + drip, 'i')
  put(spout, top - 1, 'W')
  // Pył ze stropu, póki testy czerwone.
  if (red) for (let i = 0; i < Math.floor(width / 3); i += 1) {
    const x = 3 + Math.floor(grain(i, 51) * (width - 4))
    const y = 1 + ((Math.floor(grain(i, 77) * top) + step * (1 + (i % 2))) % (top - 1))
    put(x, y, i % 3 === 0 ? 'm' : 'q')
  }
  const scene = paint(grid.map(row => row.join('')), gallery, 0, top)
  // Palenisko na półce: pełny ogień przy robocie, dym przy czerwonych testach, inaczej żar.
  const fire = paint(scene, hearthRows(step, values.heat >= 1 ? 'blaze' : red ? 'smoke' : 'ember'), HEARTH_LEFT, top - HEARTH_TALL)
  // Iskry znad paleniska: przy robocie gęste i wysokie, w spoczynku pojedyncze.
  const sparks = fire.map(row => [...row])
  const count = Math.round(1 + 9 * values.heat)
  const reach = Math.max(4, Math.min(top - HEARTH_TALL - 2, Math.round(6 + 22 * values.heat)))
  for (let i = 0; i < count; i += 1) {
    const rise = (step * (1 + (i % 3)) + Math.floor(grain(i, 13) * reach)) % reach
    const x = HEARTH_LEFT + 1 + Math.floor(grain(i, 29) * (HEARTH_WIDE - 2)) + (Math.floor((step + i * 5) / 4) % 3) - 1
    const y = top - HEARTH_TALL - 1 - rise
    if (alive && sparks[y]?.[x] === '.') sparks[y]![x] = rise > reach * 0.7 ? 'R' : rise > reach * 0.35 ? 'o' : 'y'
  }
  return sparks.map(row => row.join(''))
}

const Mine: ClientModule<MineProps, MineState> = (props, surface) => {
  const first = surface.state === undefined
  const state = surface.state ?? { frame: 0, still: props.still }
  if (first) {
    surface.every(FRAME_MS, () => {
      const now = surface.state
      if (now === undefined || now.still) return
      surface.setState({ ...now, frame: now.frame + 1 })
    })
  }
  if (first || state.still !== props.still) surface.setState({ ...state, still: props.still })
  const { Box, Text } = surface.elements
  const columns = surface.columns > 0 ? Math.min(surface.columns, props.columns) : props.columns
  const rows = surface.rows > 0 ? Math.min(surface.rows, props.rows) : props.rows
  // W spoczynku klatka sceny idzie wolniej niż zegar płótna.
  const frame = props.heat >= 1 ? state.frame : Math.floor(state.frame / REST_EVERY)
  const lines = runsOf(mineGrid(columns, rows * 2, frame, props, !props.still), 1)
  return Box({
    flexDirection: 'column',
    children: lines.map((runs, y) => Box({
      key: `row-${y}`,
      flexDirection: 'row',
      children: runs.map(run => Text({ ...(run.color === undefined ? {} : { color: run.color }), ...(run.backgroundColor === undefined ? {} : { backgroundColor: run.backgroundColor }), children: [run.text] })),
    })),
  })
}

export default Mine
