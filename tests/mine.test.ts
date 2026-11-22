import { expect, test } from 'claude-code/testing'
import Mine, { mineGrid } from '../hooks/mine'
import type { MineProps } from '../hooks/mine'
import { PALETTE } from '../hooks/palette'

const REST = { heat: 0.3, dust: 0, gold: 0 }
const count = (grid: readonly string[], cells: string) => grid.join('').split('').filter(cell => cells.includes(cell)).length

test('the mine fills its box exactly and uses only palette cells, at every size', () => {
  for (const [width, height] of [[24, 12], [40, 58], [56, 80], [30, 30], [80, 24]] as const) {
    for (const frame of [0, 7, 45, 300]) {
      const grid = mineGrid(width, height, frame, { heat: 1, dust: 1, gold: 1 }, true)
      expect([width, height, grid.length, new Set(grid.map(row => row.length)).size, grid[0]!.length]).toEqual([width, height, height, 1, width])
      const strange = [...new Set(grid.join(''))].filter(cell => cell !== '.' && PALETTE[cell] === undefined)
      expect([width, height, frame, strange]).toEqual([width, height, frame, []])
    }
  }
  // Za wąska albo za niska: puste pole, bez wyjątku.
  expect(count(mineGrid(20, 40, 0, REST, true), 'E')).toBe(0)
  expect(mineGrid(40, 0, 0, REST, true)).toEqual([])
})

test('work raises sparks, red tests shake dust loose and dim the lamp, pride gilds the ore', () => {
  const sum = (values: typeof REST, cells: string) => Array.from({ length: 40 }, (_, frame) => count(mineGrid(48, 60, frame, values, true), cells)).reduce((a, b) => a + b, 0)
  // Iskry: przy robocie wyraźnie gęstsze niż w spoczynku.
  expect(sum({ ...REST, heat: 1 }, 'oyR')).toBeGreaterThan(sum(REST, 'oyR') * 2)
  // Pył tylko przy czerwonych testach.
  expect(sum({ ...REST, dust: 1 }, 'mq')).toBeGreaterThan(sum(REST, 'mq') + 200)
  // Lampa pod stropem przygasa: jasny płomień ustępuje ciemnemu.
  const lamp = (values: typeof REST) => mineGrid(48, 60, 1, values, true)[3]![Math.floor(48 * 0.6)]
  expect([lamp(REST), lamp({ ...REST, dust: 1 })]).toEqual(['Z', 'Q'])
  // Ruda złoci się, gdy Krux dumny.
  expect(sum({ ...REST, gold: 1 }, 'Z')).toBeGreaterThan(sum(REST, 'Z') + 200)
})

test('under reduced motion the mine stands: the same picture in every frame', () => {
  const still = mineGrid(48, 60, 0, { heat: 1, dust: 1, gold: 0 }, false)
  for (const frame of [1, 9, 120]) expect(mineGrid(48, 60, frame, { heat: 1, dust: 1, gold: 0 }, false)).toEqual(still)
})

test('the canvas ticks on its own clock, stops under reduced motion and stays far below the tree limit', () => {
  let tick: (() => void) | null = null
  let starts = 0
  const surface = {
    state: undefined as unknown,
    columns: 0,
    rows: 0,
    setState(next: unknown) { surface.state = next },
    every(_ms: number, fn: () => void) { starts += 1; tick = fn; return () => {} },
    elements: { Box: (props: unknown) => ({ type: 'Box', props }), Text: (props: unknown) => ({ type: 'Text', props }) },
  }
  const props: MineProps = { heat: 1, dust: 1, gold: 1, columns: 56, rows: 40, still: false }
  const tree = Mine(props, surface as never)
  expect(JSON.stringify(tree).length).toBeLessThan(50_000)
  expect((tree as unknown as { props: { children: unknown[] } }).props.children.length).toBe(40)
  tick!()
  tick!()
  Mine(props, surface as never)
  expect((surface.state as { frame: number }).frame).toBe(2)
  // Zegar startuje raz, a bezruch go zatrzymuje.
  expect(starts).toBe(1)
  Mine({ ...props, still: true }, surface as never)
  tick!()
  expect((surface.state as { frame: number; still: boolean })).toEqual({ frame: 2, still: true })
})
