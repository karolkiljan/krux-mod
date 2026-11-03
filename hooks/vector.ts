// Płótno na Desktopie. Desktop rysuje `Box` jako div, a `Text` jako span, więc półbloki płótna
// dostają przerwy między wierszami, a moduł `Client` ma tam tylko te dwa elementy. Desktop zna
// za to `Svg`: ten sam silnik płótna (`forge.ts`) liczy klatki w module hooków na powierzchni
// bez `Client` (`headless`), a klatkę rysuje jeden `Svg` (`svgOf`). Czyste funkcje: zegar,
// stan i `$` zostają w `register.ts`.

import { terminalText } from './terminal-text'

// Element drzewa płótna: tyle, ile `forge.ts` buduje z `Box` i `Text`.
export type Drawn = { type: string; props: { key?: string; color?: string; backgroundColor?: string; children?: readonly (Drawn | string)[] } }

// Powierzchnia płótna bez `Client`. `written`: rysunek zapisał stan; `tick`: zegar klatek płótna.
export type Headless = {
  state: unknown
  written: boolean
  tick: (() => void) | null
  setState: (next: unknown) => void
  every: (ms: number, fn: () => void) => () => void
  elements: { Box: (props: object) => Drawn; Text: (props: object) => Drawn }
}

export function headless(): Headless {
  const surface: Headless = {
    state: undefined,
    written: false,
    tick: null,
    setState: next => {
      surface.state = next
      surface.written = true
    },
    every: (_ms, fn) => {
      surface.tick = fn
      return () => {
        surface.tick = null
      }
    },
    elements: { Box: props => ({ type: 'Box', props }), Text: props => ({ type: 'Text', props }) },
  }
  return surface
}

// Rysunek do punktu stałego: po zapisie stanu silnik rysuje płótno jeszcze raz, tu tak samo.
// Płótno dochodzi do niego w dwóch zapisach na klatkę (test w `tests/forge.test.ts`).
export function drawHeadless<P>(module: (props: P, surface: never) => unknown, props: P, surface: Headless): Drawn {
  let tree = module(props, surface as never)
  for (let pass = 0; pass < 2 && surface.written; pass += 1) {
    surface.written = false
    tree = module(props, surface as never)
  }
  surface.written = false
  return tree as Drawn
}

const PIXELS = new Set([' ', '▀', '▄', '█'])

// Czcionka dymka: znak o szerokości jednej komórki, czyli jednego piksela płótna.
const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const FONT_SIZE = 1.62

function escape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function cellsOf(text: string): number {
  return terminalText(text, Number.MAX_SAFE_INTEGER).columns
}

type Lettered = { y: number; x: number; text: string; color: string | undefined }

// Dymek z trzech wierszy ramki (`╭─╮`, `│ tekst │`, `╰─┬─╯`): zaokrąglony prostokąt, ogonek nad mówcą.
function bubbleOf(letters: readonly Lettered[]): { svg: string; used: Set<Lettered> } | null {
  const top = letters.find(run => run.text.includes('╭'))
  if (top === undefined) return null
  const body = letters.find(run => run.y === top.y + 1 && run.text.includes('│'))
  const foot = letters.find(run => run.y === top.y + 2 && run.text.includes('┬'))
  if (body === undefined || foot === undefined) return null
  const start = top.x + cellsOf(top.text.slice(0, top.text.indexOf('╭')))
  const width = cellsOf(top.text.slice(top.text.indexOf('╭'), top.text.indexOf('╮') + 1))
  const inner = body.text.slice(body.text.indexOf('│') + 1, body.text.lastIndexOf('│'))
  const words = inner.startsWith(' ') && inner.endsWith(' ') ? inner.slice(1, -1) : inner.trim()
  const tail = foot.x + cellsOf(foot.text.slice(0, foot.text.indexOf('┬'))) + 0.5
  const color = body.color ?? top.color ?? '#999999'
  const y = 2 * top.y + 1
  const svg = [
    `<g shape-rendering="geometricPrecision" fill="${color}" stroke="${color}">`,
    `<rect x="${start + 0.5}" y="${y}" width="${width - 1}" height="4" rx="1.4" fill-opacity="0.14" stroke-width="0.3"/>`,
    `<path d="M${tail - 0.7} ${y + 4}L${tail} ${y + 5.4}L${tail + 0.8} ${y + 4}" fill-opacity="0.14" stroke-width="0.3" stroke-linejoin="round"/>`,
    `<text x="${start + 2}" y="${y + 2}" dominant-baseline="central" font-family="${FONT}" font-size="${FONT_SIZE}" stroke="none">${escape(words)}</text>`,
    '</g>',
  ].join('')
  return { svg, used: new Set([top, body, foot]) }
}

// Klatka płótna jako dokument SVG: każda komórka to dwa kwadratowe piksele, wiersz pikseli
// jednego koloru to jeden odcinek ścieżki tego koloru; dymek i inne napisy jako tekst.
// `cell`: piksele CSS na komórkę, z niej wymiar dokumentu, który Desktop zmniejsza do miejsca.
export function svgOf(tree: Drawn, cell: number): { source: string; columns: number; rows: number } {
  const rows = (tree.props.children ?? []).filter((row): row is Drawn => typeof row !== 'string')
  const paths = new Map<string, string[]>()
  const letters: Lettered[] = []
  let columns = 0
  const pixelRows: (string | undefined)[][] = []
  rows.forEach((row, y) => {
    const top: (string | undefined)[] = []
    const bottom: (string | undefined)[] = []
    let x = 0
    for (const run of row.props.children ?? []) {
      if (typeof run === 'string') continue
      const text = (run.props.children ?? []).filter((part): part is string => typeof part === 'string').join('')
      const { color, backgroundColor } = run.props
      const chars = [...text]
      if (!chars.every(char => PIXELS.has(char))) {
        letters.push({ y, x, text, color })
        x += cellsOf(text)
        continue
      }
      for (const char of chars) {
        top[x] = char === '▀' || char === '█' ? color : char === '▄' ? backgroundColor : undefined
        bottom[x] = char === '▄' || char === '█' ? color : char === '▀' ? backgroundColor : undefined
        x += 1
      }
    }
    columns = Math.max(columns, x)
    pixelRows.push(top, bottom)
  })
  pixelRows.forEach((line, py) => {
    for (let x = 0; x < line.length; ) {
      const color = line[x]
      let end = x + 1
      while (end < line.length && line[end] === color) end += 1
      if (color !== undefined) {
        const list = paths.get(color) ?? []
        list.push(`M${x} ${py}h${end - x}v1h${x - end}z`)
        paths.set(color, list)
      }
      x = end
    }
  })
  const bubble = bubbleOf(letters)
  const rest = letters.filter(run => !bubble?.used.has(run) && run.text.trim() !== '')
  const height = rows.length * 2
  const source = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${columns} ${height}" width="${columns * cell}" height="${height * cell}" shape-rendering="crispEdges">`,
    ...[...paths].map(([color, parts]) => `<path fill="${color}" d="${parts.join('')}"/>`),
    bubble?.svg ?? '',
    ...rest.map(run => `<text x="${run.x}" y="${2 * run.y + 1}" dominant-baseline="central" font-family="${FONT}" font-size="${FONT_SIZE}" xml:space="preserve" fill="${run.color ?? '#999999'}">${escape(run.text)}</text>`),
    '</svg>',
  ].join('')
  return { source, columns, rows: rows.length }
}
