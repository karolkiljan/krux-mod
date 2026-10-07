import { expect, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

import { avatarRows, speakerColor } from '../hooks/avatar'
import type { AvatarSpeaker } from '../hooks/avatar'
import { chatTree } from '../hooks/chat'
import type { ChatData, ChatElements } from '../hooks/chat'
import { PALETTE } from '../hooks/palette'

// Elementy jak z `ui.resolve`: drzewo danych, bez renderera terminala.
type Node = { type: string; props: Record<string, unknown> }
const ELEMENTS = {
  Box: (props: Record<string, unknown>) => ({ type: 'Box', props }),
  Text: (props: Record<string, unknown>) => ({ type: 'Text', props }),
} as unknown as ChatElements

// Wynik `next(e)` może być nieprzezroczysty; nie wolno go wkładać do `Text`.
const CONTENT: RenderElement = Object.freeze({ type: 'engine', ref: 17 })
const DATA: ChatData = { speaker: 'Krux', time: '09:07', columns: 120, content: CONTENT }

function draw(data: Partial<ChatData> = {}): Node {
  return chatTree(ELEMENTS, { ...DATA, ...data }) as unknown as Node
}

function children(node: Node): unknown[] {
  return (node.props?.children as unknown[] | undefined) ?? []
}

function nodes(node: Node): Node[] {
  return [node, ...children(node).flatMap(child => typeof child === 'object' && child !== null ? nodes(child as Node) : [])]
}

function part(root: Node, key: string): Node {
  return nodes(root).find(node => node.props?.key === key)!
}

function text(node: Node): string {
  return children(node).map(child => typeof child === 'string' ? child : text(child as Node)).join('')
}

// Odczyt półbloków do pikseli: oczekiwane głowy poniżej zapisane ręcznie,
// bez `head`, `dress` ani `runsOf`, żeby złe przycięcie nie sprawdzało samo siebie.
function pixels(rows: ReturnType<typeof avatarRows>): (string | null)[][] {
  return rows.flatMap(runs => {
    const top: (string | null)[] = []
    const bottom: (string | null)[] = []
    for (const run of runs) {
      for (const cell of run.text) {
        top.push(cell === '▀' || cell === '█' ? run.color ?? null : cell === '▄' ? run.backgroundColor ?? null : null)
        bottom.push(cell === '▄' || cell === '█' ? run.color ?? null : cell === '▀' ? run.backgroundColor ?? null : null)
      }
    }
    return [top, bottom]
  })
}

const ORCS: { speaker: AvatarSpeaker; color: string; grid: string[] }[] = [
  { speaker: 'Krux', color: '#ff8a1c', grid: ['.gggg.', 'grggrg', '.tggt.', 'bbbbbb'] },
  { speaker: 'Niuch', color: '#3f6f6a', grid: ['gggg..', 'rggrg.', 'tggtgg', 'NNNNN.'] },
  { speaker: 'Grom', color: '#a33a2a', grid: ['.SsSS.', 'grggrg', '.tggt.', 'MMMMMM'] },
  { speaker: 'Piryt', color: '#c9a227', grid: ['.gggg.', 'grggrg', '.tggt.', 'PPPPPP'] },
  { speaker: 'Ochra', color: '#cc7722', grid: ['gggg..', 'rggrg.', 'tggt.j', 'OOOOOh'] },
  { speaker: 'Młot', color: '#6b7580', grid: ['.gggg.', 'grggrg', '.tggt.', 'LLLLLL'] },
  { speaker: 'Lont', color: '#887088', grid: ['.gggg.', 'grggrg', 'otggt.', 'TTTTTT'] },
  { speaker: null, color: '#555555', grid: ['.gggg.', 'grggrg', '.tggt.', 'uuuuuu'] },
]

for (const { speaker, color, grid } of ORCS) {
  test(`avatar ${speaker ?? 'ork'} keeps its face, apron and trade in 6 by 2 cells`, () => {
    const rows = avatarRows(speaker)
    expect(rows).toHaveLength(2)
    expect(rows.map(row => row.reduce((width, run) => width + [...run.text].length, 0))).toEqual([6, 6])
    expect(pixels(rows)).toEqual(grid.map(row => [...row].map(cell => PALETTE[cell] ?? null)))
    expect(speakerColor(speaker)).toBe(color)
  })

  test(`chat ${speaker ?? 'ork'} stands left with its avatar and speaker-colored frame`, () => {
    const root = draw({ speaker })
    const avatar = part(root, 'chat-avatar')
    const message = part(root, 'chat-message')
    const header = part(root, 'chat-header')
    const body = part(root, 'chat-body')
    expect(root.props.justifyContent).toBe('flex-start')
    expect(children(root)).toEqual([avatar, message])
    expect(root.props.paddingLeft).toBe(0)
    expect(message.props.flexGrow).toBe(1)
    expect(text(header)).toBe(`${speaker ?? 'ork'} · 09:07`)
    const label = children(header)[0] as Node
    expect(label.props.bold).toBe(true)
    expect(label.props.color).toBe(color)
    expect(body.props.borderStyle).toBe('quote')
    expect(body.props.borderColor).toBe(color)
    expect(children(avatar)).toHaveLength(2)
    expect(children(avatar).map(row => text(row as Node).length)).toEqual([6, 6])
    expect((children(avatar)[0] as Node).props.color).toBe(color)
  })
}

test('Morra has a simple human head in blue, without tusks or an orc apron', () => {
  const rows = avatarRows('Morra')
  expect(rows).toHaveLength(2)
  expect(rows.map(row => row.reduce((width, run) => width + [...run.text].length, 0))).toEqual([6, 6])
  expect(pixels(rows)).toEqual(['.hhhh.', '.h..h.', '.hhhh.', '..hh..'].map(row => [...row].map(cell => cell === 'h' ? '#5b9bd5' : null)))
  expect(speakerColor('Morra')).toBe('#5b9bd5')
})

test('Morra stands right, with the avatar at the edge and a bubble no wider than 70 percent', () => {
  const root = draw({ speaker: 'Morra' })
  const avatar = part(root, 'chat-avatar')
  const message = part(root, 'chat-message')
  const header = part(root, 'chat-header')
  expect(root.props.justifyContent).toBe('flex-end')
  expect(children(root)).toEqual([message, avatar])
  // 120 kolumn: awatar 6 i odstęp 1 zostawiają 113, dymek do 84, reszta to odsunięcie.
  expect(root.props.paddingLeft).toBe(29)
  expect(root.props.columnGap).toBe(1)
  expect(text(header)).toBe('Morra · 09:07')
  const label = children(header)[0] as Node
  expect(label.props.bold).toBe(true)
  expect(label.props.color).toBe('#5b9bd5')
  expect(part(root, 'chat-body').props.borderColor).toBe('#5b9bd5')
  expect((children(avatar)[0] as Node).props.color).toBe('#5b9bd5')
})

test('the original engine content stays once inside a Box, with no inherited text color', () => {
  for (const speaker of ['Krux', 'Morra', null] as const) {
    const root = draw({ speaker })
    const body = part(root, 'chat-body')
    const holder = part(root, 'chat-content')
    expect(holder.type).toBe('Box')
    expect(children(holder)[0]).toBe(CONTENT)
    expect(nodes(root).filter(node => node === CONTENT as unknown as Node)).toHaveLength(1)
    expect(body.props.color).toBeUndefined()
    expect(holder.props.color).toBeUndefined()
    expect(part(root, 'chat-message').props.color).toBeUndefined()
    expect(nodes(root).filter(node => node.type === 'Text' && children(node).includes(CONTENT))).toEqual([])
  }
})

test('a structured content tree retains its own styles and children', () => {
  const styled: RenderElement = Object.freeze({ type: 'Text', props: Object.freeze({ color: '#abcdef', bold: false, children: ['kod i markdown silnika'] }) })
  const root = draw({ speaker: 'Morra', content: styled })
  expect(children(part(root, 'chat-content'))).toEqual([styled])
  expect(children(part(root, 'chat-content'))[0]).toBe(styled)
  expect(styled).toEqual({ type: 'Text', props: { color: '#abcdef', bold: false, children: ['kod i markdown silnika'] } })
})

test('at 60 columns every speaker keeps a fixed avatar and a single complete header', () => {
  for (const speaker of [...ORCS.map(orc => orc.speaker), 'Morra' as const]) {
    const root = draw({ speaker, columns: 60 })
    const avatar = part(root, 'chat-avatar')
    const message = part(root, 'chat-message')
    const header = part(root, 'chat-header')
    expect(root.props.flexDirection).toBe('row')
    expect(root.props.flexWrap).toBe('nowrap')
    expect(root.props.alignItems).toBe('flex-start')
    expect(avatar.props.width).toBe(6)
    expect(avatar.props.minWidth).toBe(6)
    expect(avatar.props.height).toBe(2)
    expect(avatar.props.flexShrink).toBe(0)
    expect(root.props.paddingLeft).toBe(speaker === 'Morra' ? 11 : 0)
    expect(message.props.flexGrow).toBe(1)
    expect(header.props.height).toBe(1)
    expect(header.props.position).toBe('absolute')
    expect(header.props.top).toBe(0)
    const label = children(header)[0] as Node
    expect(label.props.wrap).toBe('truncate-end')
    expect(text(label)).toBe(`${speaker ?? 'ork'} · 09:07`)
    const bubble = 60 - (root.props.paddingLeft as number) - (avatar.props.width as number) - (root.props.columnGap as number)
    expect(bubble >= text(label).length).toBe(true)
  }
})

test('fractional widths round down and keep the bubble within the available columns', () => {
  const root = draw({ speaker: 'Morra', columns: 61.9 })
  // 61 kolumn: 54 na dymek, Morra do 42, więc 12 odsunięcia.
  expect(root.props.paddingLeft).toBe(12)
})

test('very narrow rows reserve the avatar and gap before granting the bubble width', () => {
  const root = draw({ speaker: 'Morra', columns: 12 })
  expect(root.props.paddingLeft).toBe(0)
  expect(part(root, 'chat-avatar').props.width).toBe(6)
  expect(part(root, 'chat-message').props.flexGrow).toBe(1)
})

// Silnik odrzuca całe drzewo (i rysuje swoje), gdy treść `engine` leży pod Boxem z `width`.
test('no ancestor of the engine content carries a width', () => {
  for (const speaker of ['Krux', 'Morra', null] as const) {
    for (const columns of [12, 60, 120]) {
      const root = draw({ speaker, columns })
      const path = (node: Node): Node[] | undefined => {
        if (children(node).includes(CONTENT)) return [node]
        for (const child of children(node)) {
          if (typeof child !== 'object' || child === null) continue
          const found = path(child as Node)
          if (found !== undefined) return [node, ...found]
        }
        return undefined
      }
      const ancestors = path(root)!
      expect(ancestors.map(node => node.props.key)).toEqual(['chat', 'chat-message', 'chat-body', 'chat-content'])
      expect(ancestors.filter(node => node.props.width !== undefined)).toEqual([])
    }
  }
})
