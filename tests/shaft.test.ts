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
  expect(texts(section(draw({ git: GIT }), 'git')!).map(line => line.text)).toEqual(['Git', '', '⎇ main → origin/main', '↑ do wypchnięcia: 6', '● zmienione: 2', '· do commita: brak testów'])
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
    ['·', 'do commita: brak testów'],
    ['▸', '0/1 poprawka'],
  ])
  expect(shaftDigest(board, null, { git: { ...GIT, ahead: 0, changed: 0 }, threads: EMPTY_THREADS }).map(line => line.key)).toEqual(['plan'])
})

test('the repo lists its files and newest commits, unpushed ones marked ↑, and a tall pane shows more', () => {
  const files = Array.from({ length: 10 }, (_, index) => ({ code: 'M', path: `hooks/file${index}.ts` }))
  const commits = Array.from({ length: 10 }, (_, index) => ({ hash: `c${index}`, subject: `commit ${index}`, pushed: index >= 2 }))
  const git = { ...GIT, changed: 10, ahead: 2, files, commits }
  const short = draw({ git, rows: 20 })
  expect(texts(section(short, 'git')!).map(line => line.text).slice(6)).toEqual(['  M', 'hooks/file0.ts', '  M', 'hooks/file1.ts', '  M', 'hooks/file2.ts', '  M', 'hooks/file3.ts', '  +6 dalej'])
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

test('the digest shows test counts and context alone even with a high plan limit', () => {
  const board = { tasks: [], test: { command: 'claude plugin test .', ok: true, passed: 209, failed: 0, failures: [], who: 'Krux' as const } }
  const usage = { percent: 27, tokens: 54_000, window: 200_000, limits: [{ kind: 'five_hour', percentUsed: 40.4, resetsAt: null }, { kind: 'seven_day', percentUsed: 82, resetsAt: null }], usd: null }
  const lines = shaftDigest(board, usage)
  expect(lines.map(line => line.text)).toEqual(['claude plugin test . · 209 przeszło', 'kontekst 27%'])
  expect(lines[1]!.mark).toBe('◔')
  expect(lines[1]!.color).toBeUndefined()
})

test('the digest context turns red at 80 percent regardless of plan limits', () => {
  for (const limits of [[], [{ kind: 'seven_day', percentUsed: 100, resetsAt: null }]]) {
    for (const percent of [79, 80, 100]) {
      const usage = { percent, tokens: null, window: 200_000, limits, usd: null }
      const line = shaftDigest(EMPTY_BOARD, usage)[0]!
      expect([line.mark, line.text]).toEqual(['◔', `kontekst ${percent}%`])
      expect(line.color).toBe(percent >= 80 ? '#e0322b' : undefined)
    }
  }
})

test('the digest omits unknown context even when plan limits are known', () => {
  const usage = { percent: null, tokens: null, window: 200_000, limits: [{ kind: 'seven_day', percentUsed: 82, resetsAt: null }], usd: null }
  expect(shaftDigest(EMPTY_BOARD, usage)).toEqual([])
  expect(shaftDigest(EMPTY_BOARD, null)).toEqual([])
})

test('the pane keeps plan limits and their alarms outside the digest', () => {
  const usage = { percent: 27, tokens: 54_000, window: 200_000, limits: [{ kind: 'seven_day', percentUsed: 82, resetsAt: null }], usd: null }
  const lines = texts(section(draw({ usage }), 'usage')!)
  expect(lines.map(line => line.text)).toContain('7 dni 82%')
  expect(lines.find(line => line.text === '27% · 54k / 200k')?.color).toBeUndefined()
  const limit = (children(section(draw({ usage }), 'usage')!) as Node[]).find(node => node.props.key === 'limit-0')!
  expect(texts(limit)[0]?.color).toBe('#e0322b')
})

const FRESH_RUN = { command: 'npm test', ok: true, passed: 3, failed: 0, failures: [], who: 'Krux' as const, at: 100 }

test('the digest marks commit readiness for modified and new files with fresh green tests', () => {
  for (const whitespace of [true, null, undefined]) {
    for (const changes of [{ changed: 1, untracked: 0 }, { changed: 0, untracked: 1 }]) {
      const lines = shaftDigest({ tasks: [], test: FRESH_RUN, editedAt: 100 }, null, { git: { ...GIT, ...changes, whitespace }, threads: EMPTY_THREADS })
      expect(lines.find(line => line.key === 'readiness')).toEqual({ key: 'readiness', mark: '✓', text: 'do commita', color: '#3fb950' })
    }
  }
})

test('the digest lists each commit blocker behind a visible pending sign', () => {
  const fresh = { tasks: [], test: FRESH_RUN, editedAt: 100 }
  const cases = [
    { board: EMPTY_BOARD, git: GIT, missing: 'brak testów' },
    { board: { ...fresh, test: { ...FRESH_RUN, ok: false } }, git: GIT, missing: 'testy padłe' },
    { board: { ...fresh, editedAt: 101 }, git: GIT, missing: 'testy nieświeże' },
    { board: fresh, git: { ...GIT, whitespace: false }, missing: 'białe znaki' },
    { board: fresh, git: { ...GIT, conflicted: 2 }, missing: 'konflikty: 2' },
    { board: { ...fresh, test: { ...FRESH_RUN, ok: false }, editedAt: 101 }, git: { ...GIT, whitespace: false, conflicted: 2 }, missing: 'testy padłe, testy nieświeże, białe znaki, konflikty: 2' },
  ]
  for (const { board, git, missing } of cases) {
    const line = shaftDigest(board, null, { git, threads: EMPTY_THREADS }).find(line => line.key === 'readiness')
    expect(line).toEqual({ key: 'readiness', mark: '·', text: `do commita: ${missing}` })
  }
})

test('the digest hides commit readiness outside a repo and without modified or new files', () => {
  for (const git of [null, { ...GIT, changed: 0 }, { ...GIT, changed: 0, ahead: 0, behind: 2 }, { ...GIT, changed: 0, conflicted: 1 }, { ...GIT, changed: 0, ahead: 0 }]) {
    for (const test of [null, FRESH_RUN]) {
      const lines = shaftDigest({ tasks: [], test }, null, { git, threads: EMPTY_THREADS })
      expect(lines.some(line => line.text.includes('do commita'))).toBe(false)
    }
  }
})

test('digest priority keeps commit readiness beside the repo when lower rows are clipped', () => {
  const board = { tasks: [task('poprawka', 'in_progress')], test: FRESH_RUN }
  const usage = { percent: 27, tokens: 54_000, window: 200_000, limits: [], usd: null }
  const threads = { next: 2, items: [{ id: 1, kind: 'risk' as const, text: 'push czeka' }] }
  const lines = shaftDigest(board, usage, { git: GIT, threads })
  expect(lines.map(line => line.key)).toEqual(['threads', 'git', 'readiness', 'plan', 'tests', 'usage'])
  expect(lines.map(line => line.mark)).toEqual(['⚠', '⎇', '✓', '▸', '✓', '◔'])
  // Pas bierze od góry najwyżej tyle linii, ile wierszy płótna.
  expect(lines.slice(0, 3).map(line => line.key)).toEqual(['threads', 'git', 'readiness'])
  expect(lines.slice(0, 6)).toHaveLength(6)
})

test('a running digest task gains full minutes at the 15-minute threshold', () => {
  const board = { tasks: [task('gotowe', 'completed'), { ...task('poprawka', 'in_progress'), startedAt: 30_000 }, task('potem', 'pending')], test: null }
  const extra = { git: null, threads: EMPTY_THREADS }
  const cases = [
    { now: 30_000 + 15 * 60_000 - 1, text: '1/3 poprawka' },
    { now: 30_000 + 15 * 60_000, text: '1/3 ⧗ 15 min poprawka' },
    { now: 30_000 + 16 * 60_000 - 1, text: '1/3 ⧗ 15 min poprawka' },
    { now: 30_000 + 16 * 60_000, text: '1/3 ⧗ 16 min poprawka' },
  ]
  for (const { now, text } of cases) {
    expect(shaftDigest(board, null, { ...extra, now })).toEqual([{ key: 'plan', mark: '▸', text, color: KRUX_COLOR }])
  }
})

test('the digest keeps stuck-task age before a long subject can be truncated', () => {
  const subject = 'A very long task subject that exceeds the narrow band digest'
  const board = { tasks: [{ ...task(subject, 'in_progress'), startedAt: 0 }], test: null }
  expect(shaftDigest(board, null, { git: null, threads: EMPTY_THREADS, now: 15 * 60_000 })[0]?.text).toBe(`0/1 ⧗ 15 min ${subject}`)
})

test('the digest never claims stuck time without a running task and both timestamps', () => {
  const extra = { git: null, threads: EMPTY_THREADS, now: 60 * 60_000 }
  const cases = [
    { tasks: [{ ...task('czeka', 'pending'), startedAt: 0 }], text: '0/1 czeka', mark: '·' },
    { tasks: [{ ...task('gotowe', 'completed'), startedAt: 0 }], text: 'plan 1/1', mark: '✓' },
    { tasks: [task('historia', 'in_progress')], text: '0/1 historia', mark: '▸' },
    { tasks: [{ ...task('przyszłość', 'in_progress'), startedAt: extra.now + 1 }], text: '0/1 przyszłość', mark: '▸' },
  ]
  for (const { tasks, text, mark } of cases) {
    expect(shaftDigest({ tasks, test: null }, null, extra).map(line => [line.mark, line.text])).toEqual([[mark, text]])
  }
  const board = { tasks: [{ ...task('bez zegara', 'in_progress'), startedAt: 0 }], test: null }
  expect(shaftDigest(board, null, { git: null, threads: EMPTY_THREADS })[0]?.text).toBe('0/1 bez zegara')
})

test('the tests section marks stale green and failed runs with a dim sign and word', () => {
  for (const ok of [true, false]) {
    const tests = section(draw({ board: { tasks: [], test: { ...FRESH_RUN, ok }, editedAt: 101 } }), 'tests')!
    const lines = texts(tests).map(line => line.text)
    expect(lines).toContain('  ◌ nieświeże')
    expect(lines).toContain(ok ? '✓' : '✗')
    expect(lines).toContain('npm test')
    expect(lines).toContain('Krux')
    const stale = (children(tests) as Node[]).find(node => node.type === 'Text' && children(node).join('') === '  ◌ nieświeże')!
    expect(stale.props.dimColor).toBe(true)
  }
})

test('the tests section omits the stale sign for fresh runs and legacy timestamps', () => {
  for (const board of [
    { tasks: [], test: FRESH_RUN, editedAt: 100 },
    { tasks: [], test: FRESH_RUN, editedAt: 99 },
    { tasks: [], test: FRESH_RUN },
    { tasks: [], test: { ...FRESH_RUN, at: undefined }, editedAt: 101 },
  ]) expect(texts(section(draw({ board }), 'tests')!).map(line => line.text)).not.toContain('  ◌ nieświeże')
  expect(section(draw({ board: { tasks: [], test: null, editedAt: 101 } }), 'tests')).toBeUndefined()
})

test('the digest marks stale tests while preserving the command, counts and outcome sign', () => {
  const green = shaftDigest({ tasks: [], test: FRESH_RUN, editedAt: 101 }, null)
  expect(green.map(line => [line.mark, line.text])).toEqual([['✓', '◌ nieświeże · npm test · 3 przeszły']])
  const failed = shaftDigest({ tasks: [], test: { ...FRESH_RUN, ok: false, failed: 1 }, editedAt: 101 }, null)
  expect(failed.map(line => [line.mark, line.text])).toEqual([['✗', '◌ nieświeże · npm test · 1 padł · 3 przeszły']])
  expect(shaftDigest({ tasks: [], test: { ...FRESH_RUN, passed: null, failed: null }, editedAt: 101 }, null)[0]?.text).toBe('◌ nieświeże · npm test')
  expect(shaftDigest({ tasks: [], test: FRESH_RUN, editedAt: 100 }, null)[0]?.text).toBe('npm test · 3 przeszły')
  expect(shaftDigest({ tasks: [], test: { ...FRESH_RUN, at: undefined }, editedAt: 101 }, null)[0]?.text).toBe('npm test · 3 przeszły')
})

test('git shows signed commit readiness for fresh green tests and modified or new files', () => {
  for (const whitespace of [true, null, undefined]) {
    for (const changes of [{ changed: 1, untracked: 0 }, { changed: 0, untracked: 1 }]) {
      const lines = texts(section(draw({ board: { tasks: [], test: FRESH_RUN, editedAt: 100 }, git: { ...GIT, ...changes, whitespace } }), 'git')!)
      expect(lines.map(line => line.text)).toContain('✓ do commita')
      expect(lines.find(line => line.text === '✓ do commita')?.color).toBe(texts(section(draw({ board: { tasks: [], test: FRESH_RUN } }), 'tests')!)[2]?.color)
    }
  }
})

test('git lists every commit blocker behind a visible pending sign', () => {
  const root = draw({ board: { tasks: [], test: { ...FRESH_RUN, ok: false }, editedAt: 101 }, git: { ...GIT, whitespace: false, conflicted: 2 } })
  expect(texts(section(root, 'git')!).map(line => line.text)).toContain('· do commita: testy padłe, testy nieświeże, białe znaki, konflikty: 2')
  expect(texts(section(draw({ git: GIT }), 'git')!).map(line => line.text)).toContain('· do commita: brak testów')
})

test('commit readiness stays hidden without modified or new files and outside a repo', () => {
  for (const git of [null, { ...GIT, changed: 0 }, { ...GIT, changed: 0, ahead: 0, behind: 2 }, { ...GIT, changed: 0, conflicted: 1 }]) {
    expect(texts(draw({ git })).some(line => line.text.includes('do commita'))).toBe(false)
  }
})

test('a running plan task gains a signed age at 15 minutes using the supplied clock', () => {
  const tasks = [{ ...task('Poprawka', 'in_progress'), startedAt: 0 }]
  expect(texts(section(draw({ board: { tasks, test: null }, now: 15 * 60_000 - 1 }), 'plan')!).map(line => line.text)).toContain('▸ Poprawka')
  const aged = texts(section(draw({ board: { tasks, test: null }, now: 16 * 60_000 - 1 }), 'plan')!)
  expect(aged).toContainEqual({ text: '▸ Poprawka', color: KRUX_COLOR })
  expect(aged).toContainEqual({ text: '⧗ 15 min', color: KRUX_COLOR })
  expect(texts(section(draw({ board: { tasks, test: null }, now: 16 * 60_000 }), 'plan')!).map(line => line.text)).toContain('⧗ 16 min')
})

test('a long task subject gives way while the stuck-task suffix keeps its space', () => {
  const tasks = [{ ...task('A very long task subject that exceeds the narrow pane', 'in_progress'), startedAt: 0 }]
  const plan = section(draw({ board: { tasks, test: null }, now: 15 * 60_000, columns: 18 }), 'plan')!
  const row = children(plan)[1] as Node
  const [subject, suffix] = children(row) as Node[]
  expect(subject!.props.flexShrink).toBe(1)
  expect(suffix!.props.flexShrink).toBe(0)
  expect(texts(suffix!).map(line => line.text)).toEqual(['⧗ 15 min'])
})

test('pending, completed and undated tasks never get a stuck-task suffix', () => {
  const tasks = [{ ...task('Czeka', 'pending'), startedAt: 0 }, { ...task('Gotowe', 'completed'), startedAt: 0 }, task('Historia', 'in_progress')]
  expect(texts(section(draw({ board: { tasks, test: null }, now: 60 * 60_000 }), 'plan')!).map(line => line.text)).toEqual(['Plan', '1/3', '· Czeka', '✓ Gotowe', '▸ Historia'])
})
