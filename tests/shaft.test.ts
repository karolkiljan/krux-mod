import { expect, test } from 'claude-code/testing'

import type { KruxTask, KruxUsage } from '../types'
import { EMPTY_BOARD } from '../hooks/board'
import { KRUX_COLOR, shaftDigest, shaftTree } from '../hooks/shaft'
import { EMPTY_THREADS } from '../hooks/threads'
import type { ShaftData, ShaftElements } from '../hooks/shaft'

// Elementy jak z `$.ui.resolve`: zwykłe obiekty z typem i propsami.
type Node = { type: string; props: Record<string, unknown> }
const ELEMENTS = {
  Box: (props: Record<string, unknown>) => ({ type: 'Box', props }),
  Text: (props: Record<string, unknown>) => ({ type: 'Text', props }),
} as unknown as ShaftElements

const EMPTY: ShaftData = { board: EMPTY_BOARD, horde: [], usage: null, git: null, threads: EMPTY_THREADS, now: 0, columns: 46, rows: 0 }

function draw(data: Partial<ShaftData>): Node {
  return shaftTree(ELEMENTS, { ...EMPTY, ...data }) as unknown as Node
}

function children(node: Node): unknown[] {
  return (node.props.children as unknown[] | undefined) ?? []
}

// Teksty w kolejności rysowania, z kolorem.
function texts(node: Node): { text: string; color?: unknown }[] {
  if (node.type === 'Text') return [{ text: children(node).join(''), color: node.props.color }]
  return children(node).flatMap(child => texts(child as Node))
}

// Sekcja po kluczu: robota stoi w `work`, „Kontekst” pod nią.
function section(root: Node, key: string): Node | undefined {
  const top = children(root) as Node[]
  const work = top.find(child => child.props.key === 'work')
  return [...top, ...(work ? (children(work) as Node[]) : [])].find(child => child.props.key === key)
}

// Teksty roboty (bez „Kontekstu”), w kolejności rysowania.
function work(root: Node): Node {
  return section(root, 'work')!
}

const task = (subject: string, status: KruxTask['status']): KruxTask => ({ id: null, subject, status })

test('an empty board says so and draws no section', () => {
  const root = draw({})
  expect(texts(root).map(line => line.text)).toEqual(['Tablica pusta. Wątki, plan, testy i horda pojawią się przy robocie.'])
})

test('usage alone still says the board is empty, above the context section', () => {
  const usage: KruxUsage = { percent: 42, tokens: 84_000, window: 200_000, limits: [], usd: 1.5 }
  const root = draw({ usage })
  expect(texts(root)[0]!.text).toMatch(/^Tablica pusta/)
  expect(section(root, 'usage')).toBeDefined()
  expect(texts(section(root, 'usage')!).map(line => line.text)).toContain('koszt sesji $1.50')
})

test('a long plan drops the oldest done tasks first and counts them as +N wcześniej', () => {
  const tasks = [task('a', 'completed'), task('b', 'completed'), task('c', 'completed'), ...'defghij'.split('').map(s => task(s, 'pending'))]
  const lines = texts(section(draw({ board: { tasks, test: null } }), 'plan')!).map(line => line.text)
  expect(lines[0]).toBe('Plan')
  expect(lines[1]).toBe('3/10')
  expect(lines[2]).toBe('  +2 wcześniej')
  expect(lines.slice(3)).toEqual(['✓ c', '· d', '· e', '· f', '· g', '· h', '· i', '· j'])
})

test('a plan with more open tasks than rows ends with +N dalej and marks the running one', () => {
  const tasks = [task('start', 'in_progress'), ...'bcdefghij'.split('').map(s => task(s, 'pending'))]
  const lines = texts(section(draw({ board: { tasks, test: null } }), 'plan')!)
  expect(lines[2]).toEqual({ text: '▸ start', color: KRUX_COLOR })
  expect(lines.at(-1)!.text).toBe('  +2 dalej')
  expect(lines.filter(line => line.text.startsWith('·'))).toHaveLength(7)
})

test('a failed run shows ✗ in red, the counts and up to its failing names', () => {
  const run = { command: 'npm test', ok: false, passed: 5, failed: 2, failures: ['parser handles empty', 'cli exits 1'], who: 'Młot' as const }
  const lines = texts(section(draw({ board: { tasks: [], test: run } }), 'tests')!)
  expect(lines.map(line => line.text)).toEqual(['Testy', '', '✗', 'npm test', 'Młot', '  2 padły · 5 przeszło', '  └ parser handles empty', '  └ cli exits 1'])
  expect(lines[2]!.color).toBe(lines[6]!.color)
  expect(lines.map(line => line.text)).not.toContain('Tablica pusta. Wątki, plan, testy i horda pojawią się przy robocie.')
})

test('a long command gives way, the runner name never wraps', () => {
  const run = { command: 'node --test /private/tmp/a/very/long/path/smrod.test.mjs', ok: false, passed: 1, failed: 2, failures: [], who: 'Krux' as const }
  const row = children(section(draw({ board: { tasks: [], test: run } }), 'tests')!)[1] as Node
  const who = children(row)[2] as Node
  expect(who.props.flexShrink).toBe(0)
  expect(texts(who).map(line => line.text)).toEqual(['Krux'])
})

test('the horde lists each running orc with its time and last tool', () => {
  const horde = [{ agentId: 'a1', name: 'Niuch', mate: 'Niuch' as const, description: 'szukać crasha', time: '1:05', last: 'Grep parser' }]
  const lines = texts(section(draw({ horde }), 'horde')!).map(line => line.text)
  expect(lines).toEqual(['Horda', '', '●', 'Niuch', 'szukać crasha', '1:05', '  └ Grep parser'])
})

test('the band digest has a line per known thing: current task, last run, context', () => {
  const board = {
    tasks: [
      { id: null, subject: 'test', status: 'completed' as const },
      { id: null, subject: 'poprawka', status: 'in_progress' as const },
      { id: null, subject: 'changelog', status: 'pending' as const },
    ],
    test: { command: 'npm test', ok: false, passed: 3, failed: 1, failures: ['a'], who: 'Krux' as const },
  }
  const usage = { percent: 84, tokens: 168_000, window: 200_000, limits: [], usd: null }
  expect(shaftDigest(board, usage).map(line => [line.mark, line.text])).toEqual([
    ['▸', '1/3 poprawka'],
    ['✗', expect.stringContaining('1')],
    ['◔', 'kontekst 84%'],
  ])
  const done = { tasks: [{ id: null, subject: 'x', status: 'completed' as const }], test: null }
  expect(shaftDigest(done, null).map(line => [line.mark, line.text])).toEqual([['✓', 'plan 1/1']])
  expect(shaftDigest({ tasks: [], test: null }, null)).toEqual([])
})

const GIT = { branch: 'main', upstream: 'origin/main', ahead: 6, behind: 0, changed: 2, untracked: 0, conflicted: 0, files: [], commits: [] }

test('open threads show their mark, risks in red, below the repo', () => {
  const threads = { next: 3, items: [{ id: 1, kind: 'todo' as const, text: 'push czeka' }, { id: 2, kind: 'risk' as const, text: 'tsc nie puszczony' }] }
  const root = draw({ threads })
  expect((children(work(root))[0] as Node).props.key).toBe('threads')
  // Repo stoi nad wątkami: góra panelu nie skacze, gdy wątki przychodzą i odchodzą.
  const both = draw({ threads, git: GIT })
  expect((children(work(both)) as Node[]).map(child => child.props.key)).toEqual(['git', 'threads'])
  const lines = texts(section(root, 'threads')!)
  expect(lines.map(line => line.text)).toEqual(['Wątki', '2', '○', 'push czeka', '⚠', 'tsc nie puszczony'])
  const failed = texts(section(draw({ board: { tasks: [], test: { command: 'x', ok: false, passed: 0, failed: 1, failures: [], who: 'Krux' } } }), 'tests')!)
  expect(lines[4]!.color).toBe(failed[2]!.color)
  expect(lines[2]!.color).toBeUndefined()
  expect(texts(root).map(line => line.text)).not.toContain('Tablica pusta. Wątki, plan, testy i horda pojawią się przy robocie.')
})

test('git shows the branch, commits to push and files outside a commit; a clean even repo is one ✓', () => {
  expect(texts(section(draw({ git: GIT }), 'git')!).map(line => line.text)).toEqual(['Git', '', '⎇ main → origin/main', '↑ do wypchnięcia: 6', '● zmienione: 2'])
  const clean = { ...GIT, ahead: 0, changed: 0 }
  expect(texts(section(draw({ git: clean }), 'git')!).map(line => line.text)).toEqual(['Git', '', '⎇ main → origin/main', '✓ czysto, równo z upstreamem'])
  expect(texts(section(draw({ git: { ...clean, upstream: null } }), 'git')!).map(line => line.text).slice(2)).toEqual(['⎇ main · bez upstreamu', '✓ czysto'])
  // Samo repo to nie robota: tablica dalej mówi, że pusta, pod repo.
  expect(texts(draw({ git: clean })).map(line => line.text)).toContain('Tablica pusta. Wątki, plan, testy i horda pojawią się przy robocie.')
})

test('the digest puts the newest thread and a busy repo first, a clean repo says nothing', () => {
  const threads = { next: 3, items: [{ id: 1, kind: 'todo' as const, text: 'push czeka' }, { id: 2, kind: 'ask' as const, text: 'Wyłączyć Sztolnię?' }] }
  const board = { tasks: [{ id: null, subject: 'poprawka', status: 'in_progress' as const }], test: null }
  expect(shaftDigest(board, null, { git: GIT, threads }).map(line => [line.mark, line.text])).toEqual([
    ['?', '2 · Wyłączyć Sztolnię?'],
    ['⎇', 'main → origin/main ↑6 ●2'],
    ['▸', '0/1 poprawka'],
  ])
  expect(shaftDigest(board, null, { git: { ...GIT, ahead: 0, changed: 0 }, threads: EMPTY_THREADS }).map(line => line.key)).toEqual(['plan'])
})

test('the repo lists its files and newest commits, unpushed ones marked ↑, and a tall pane shows more', () => {
  const files = Array.from({ length: 10 }, (_, index) => ({ code: 'M', path: `hooks/file${index}.ts` }))
  const commits = Array.from({ length: 10 }, (_, index) => ({ hash: `c${index}`, subject: `commit ${index}`, pushed: index >= 2 }))
  const git = { ...GIT, changed: 10, ahead: 2, files, commits }
  const short = draw({ git, rows: 20 })
  expect(texts(section(short, 'git')!).map(line => line.text).slice(5)).toEqual(['  M', 'hooks/file0.ts', '  M', 'hooks/file1.ts', '  M', 'hooks/file2.ts', '  M', 'hooks/file3.ts', '  +6 dalej'])
  const log = texts(section(short, 'commits')!)
  expect(log.map(line => line.text)).toEqual(['Commity', '↑2 niewypchnięte', '↑', 'c0', 'commit 0', '↑', 'c1', 'commit 1', '·', 'c2', 'commit 2'])
  expect(log[2]!.color).toBe(KRUX_COLOR)
  const tall = draw({ git, rows: 40 })
  expect(texts(section(tall, 'commits')!).filter(line => line.text === '↑' || line.text === '·')).toHaveLength(10)
})

test('the context sits at the bottom of a pane as tall as its rows, the work above it grows', () => {
  const usage = { percent: 42, tokens: 84_000, window: 200_000, limits: [], usd: null }
  const root = draw({ usage, rows: 30 })
  expect(root.props.minHeight).toBe(30)
  const top = children(root) as Node[]
  expect(top.map(child => child.props.key)).toEqual(['work', 'usage'])
  expect(top[0]!.props.flexGrow).toBe(1)
})

test('a long commit subject gives way, the hash never wraps', () => {
  const git = { ...GIT, commits: [{ hash: 'a6eb0c5', subject: 'feat: the Sztolnia shows the repo and the threads Krux leaves open', pushed: true }] }
  const row = children(section(draw({ git }), 'commits')!)[1] as Node
  expect((children(row) as Node[]).slice(0, 2).map(cell => cell.props.flexShrink)).toEqual([0, 0])
})

test('the digest lines say more: the test command with counts, context with the limit windows', () => {
  const board = { tasks: [], test: { command: 'claude plugin test .', ok: true, passed: 209, failed: 0, failures: [], who: 'Krux' as const } }
  const usage = { percent: 27, tokens: 54_000, window: 200_000, limits: [{ kind: 'five_hour', percentUsed: 40.4, resetsAt: null }, { kind: 'seven_day', percentUsed: 82, resetsAt: null }], usd: null }
  const lines = shaftDigest(board, usage)
  expect(lines.map(line => line.text)).toEqual(['claude plugin test . · 209 przeszło', 'kontekst 27% · 5 h 40% · 7 dni 82%'])
  // Okno limitu blisko końca barwi linię, choć kontekst daleko.
  expect(lines[1]!.color).toBe(texts(draw({ board: { tasks: [], test: { ...board.test, ok: false } } }))[2]!.color)
})
