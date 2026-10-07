import { expect, test } from 'claude-code/testing'

import type { KruxJournal, KruxJournalEntry } from '../types'
import { EMPTY_JOURNAL, journalAfter, journalTree, toolLine } from '../hooks/journal'
import type { JournalCall, JournalElements, ToolLineData } from '../hooks/journal'

// Elementy zachowują propsy, więc testujemy drzewo przekazane silnikowi.
type Node = { type: string; props: Record<string, unknown> }
const ELEMENTS = {
  Box: (props: Record<string, unknown>) => ({ type: 'Box', props }),
  Text: (props: Record<string, unknown>) => ({ type: 'Text', props }),
} as unknown as JournalElements

const CALL: JournalCall = { tool: 'Read', input: { file_path: 'hooks/a.ts' }, text: 'treść', isError: false, at: 1000 }
const ENTRY: KruxJournalEntry = { id: 't1', who: 'Krux', agentId: null, tool: 'Read', target: 'a.ts', ok: true, summary: '', at: 1000 }

function entry(call: Partial<JournalCall> = {}): KruxJournalEntry {
  return journalAfter(EMPTY_JOURNAL, { ...CALL, ...call }).entries[0]!
}

function children(node: Node): Node[] {
  return (node.props.children as Node[] | undefined) ?? []
}

function texts(node: Node): { text: string; props: Node['props'] }[] {
  if (node.type === 'Text') return [{ text: (node.props.children as string[]).join(''), props: node.props }]
  return children(node).flatMap(texts)
}

function draw(entries: KruxJournalEntry[], width = 56, now = 0): Node {
  return journalTree(ELEMENTS, { entries }, width, now) as unknown as Node
}

function line(data: ToolLineData | readonly ToolLineData[], width = 80): Node {
  return toolLine(ELEMENTS, data, width) as unknown as Node
}

function lineText(node: Node): string {
  return texts(node).map(row => row.text).join(' ')
}

test('journal appends an immutable entry with call ids, performer and supplied time', () => {
  const journal: KruxJournal = { entries: [ENTRY] }
  const after = journalAfter(journal, { ...CALL, tool_use_id: 't2', agentId: 'a1', who: 'Niuch', at: 0 })
  expect(after.entries).toEqual([ENTRY, { ...ENTRY, id: 't2', agentId: 'a1', who: 'Niuch', at: 0 }])
  expect(journal.entries).toEqual([ENTRY])
  expect(after.entries).not.toBe(journal.entries)
})

test('only the newest 200 entries remain after appending', () => {
  const before = { entries: Array.from({ length: 205 }, (_, at) => ({ ...ENTRY, id: String(at), at })) }
  const after = journalAfter(before, { ...CALL, tool_use_id: 'last', at: 206 })
  expect(after.entries).toHaveLength(200)
  expect(after.entries[0]?.id).toBe('6')
  expect(after.entries.at(-1)?.id).toBe('last')
  expect(before.entries).toHaveLength(205)
})

test('unknown agents default to ork while an Agent call stays with its caller', () => {
  expect(entry().who).toBe('Krux')
  expect(entry({ agentId: 'unknown' }).who).toBe('ork')
  expect(entry({ tool: 'Agent', input: { description: 'Grom: poprawka' } }).who).toBe('Krux')
})

test('journal targets reuse the strip descriptions for files, shell, search and MCP', () => {
  const cases = [
    { tool: 'Read', input: { file_path: '/repo/hooks/a.ts' }, target: 'a.ts' },
    { tool: 'NotebookEdit', input: { notebook_path: '/repo/a.ipynb' }, target: 'a.ipynb' },
    { tool: 'Bash', input: { command: 'cd repo && npm test | tail' }, target: 'cd repo && npm test | tail' },
    { tool: 'Grep', input: { pattern: 'a\n  b' }, target: 'a b' },
    { tool: 'Glob', input: { pattern: '*.ts' }, target: '*.ts' },
    { tool: 'TodoWrite', input: {}, target: '' },
    { tool: 'mcp__server__read', input: {}, target: 'server/read' },
    { tool: 'Unknown', input: {}, target: 'Unknown' },
  ]
  for (const { tool, input, target } of cases) expect(entry({ tool, input }).target).toBe(target)
  expect(entry({ tool: 'Bash', input: { command: 'x'.repeat(60) } }).target).toBe('x'.repeat(39) + '…')
})

test('denied calls never enter the journal', () => {
  for (const result of [{ deny: 'odmowa' }, { deny: false }]) {
    expect(journalAfter(EMPTY_JOURNAL, { ...CALL, result })).toBe(EMPTY_JOURNAL)
  }
  expect(journalAfter(EMPTY_JOURNAL, { ...CALL, deny: 'odmowa' })).toBe(EMPTY_JOURNAL)
})

test('errors and nonzero exit codes take precedence over a successful envelope', () => {
  for (const result of [{ isError: true }, { error: 'padło' }, { exitCode: 1 }, { exit_code: 2 }, { exitCode: -1 }]) {
    expect(entry({ result }).ok).toBe(false)
  }
  expect(entry({ isError: true, result: { exitCode: 0 } }).ok).toBe(false)
  expect(entry({ result: { exitCode: 0, error: '' } }).ok).toBe(true)
  expect(entry({ tool: 'Bash', input: { command: 'echo ok' }, text: 'Exit code: 7' }).ok).toBe(false)
  // Cytat kodu wyjścia w przeczytanym pliku nie jest wynikiem komendy.
  expect(entry({ text: 'Exit code: 7' }).ok).toBe(true)
})

test('missing outcomes stay unknown and explicit empty successful output is complete', () => {
  expect(entry({ text: undefined, isError: undefined, result: undefined }).ok).toBe(null)
  expect(entry({ text: '', isError: undefined }).ok).toBe(true)
  expect(entry({ text: undefined, result: { exitCode: 0 } }).ok).toBe(true)
})

test('failed tests in a pipeline stay failed despite exit code zero', () => {
  const run = entry({ tool: 'Bash', input: { command: 'cd repo && npm test | tail' }, result: { exitCode: 0 }, text: '5 passed\n2 failed' })
  expect([run.ok, run.summary]).toEqual([false, '2 padły · 5 przeszło'])
  expect(entry({ tool: 'Bash', input: { command: 'npm test' }, text: '✖ parser handles empty (4ms)' }).ok).toBe(false)
})

test('test summaries use the same counts as the board including cargo binaries', () => {
  const cases = [
    { text: '1 passed\n0 failed', summary: '1 przeszedł', ok: true },
    { text: 'test result: ok. 2 passed; 0 failed\ntest result: ok. 3 passed; 0 failed', summary: '5 przeszło', ok: true },
    { text: 'ℹ pass 4\nℹ fail 1', summary: '1 padł · 4 przeszły', ok: false },
    { text: 'brak liczb', summary: '', ok: true },
  ]
  for (const { text, summary, ok } of cases) {
    expect(entry({ tool: 'Bash', input: { command: 'npm test' }, text })).toMatchObject({ summary, ok })
  }
  expect(entry({ tool: 'Bash', input: { command: 'echo "2 failed"' }, text: '2 failed' }).ok).toBe(true)
})

test('structured and string tool output also supply test counts', () => {
  for (const result of ['3 passed\n0 failed', { stdout: '3 passed\n0 failed', exitCode: 0 }]) {
    expect(entry({ tool: 'Bash', input: { command: 'npm test' }, text: undefined, result }).summary).toBe('3 przeszły')
  }
})

test('background tests remain pending without claiming a finished run', () => {
  const call = { tool: 'Bash', input: { command: 'npm test', run_in_background: true }, text: 'running' }
  expect(entry(call)).toMatchObject({ ok: null, summary: '' })
  expect(entry({ ...call, isError: true }).ok).toBe(false)
})

test('Edit counts replacement lines, empty fragments and a terminal newline', () => {
  const cases = [
    { old_string: 'a\nb', new_string: 'c\nd\ne', summary: '+3 −2' },
    { old_string: '', new_string: 'a\n', summary: '+1 −0' },
    { old_string: 'a\r\nb\r\n', new_string: '', summary: '+0 −2' },
    { old_string: '', new_string: '', summary: '+0 −0' },
  ]
  for (const { summary, ...input } of cases) expect(entry({ tool: 'Edit', input }).summary).toBe(summary)
})

test('MultiEdit totals complete replacements without guessing unknown multiplicity', () => {
  expect(entry({ tool: 'MultiEdit', input: { edits: [{ old_string: 'a', new_string: 'b\nc' }, { old_string: 'd\ne', new_string: '' }] } }).summary).toBe('+2 −3')
  for (const input of [
    { edits: [] },
    { edits: [{ old_string: 'a' }] },
    { edits: [null] },
    { old_string: 'a', new_string: 'b', replace_all: true },
    { new_string: 'b' },
  ]) expect(entry({ tool: input.edits === undefined ? 'Edit' : 'MultiEdit', input }).summary).toBe('')
})

test('notebook insertion has a known delta while overwrites and failed edits do not', () => {
  expect(entry({ tool: 'NotebookEdit', input: { edit_mode: 'insert', new_source: 'a\nb' } }).summary).toBe('+2 −0')
  expect(entry({ tool: 'NotebookEdit', input: { edit_mode: 'replace', new_source: 'a' } }).summary).toBe('')
  expect(entry({ tool: 'Write', input: { content: 'a\nb' } }).summary).toBe('')
  expect(entry({ tool: 'Edit', input: { old_string: 'a', new_string: 'b' }, isError: true }).summary).toBe('')
})

test('Grep respects its output mode instead of counting files as matching lines', () => {
  const cases = [
    { input: { output_mode: 'files_with_matches' }, result: { numFiles: 2, filenames: ['a', 'b'], numLines: 8 }, summary: 'wyniki: 2' },
    { input: { output_mode: 'content' }, result: { numFiles: 2, numLines: 8 }, summary: 'wyniki: 8' },
    { input: { output_mode: 'count' }, result: { numFiles: 2, numMatches: 9 }, summary: 'wyniki: 9' },
    { input: { output_mode: 'count' }, result: { content: 'a.ts:3\nb.ts:6' }, summary: 'wyniki: 9' },
    { input: {}, result: { filenames: [] }, summary: 'wyniki: 0' },
    { input: {}, result: { filenames: ['a'] }, summary: 'wyniki: 1' },
  ]
  for (const { input, result, summary } of cases) expect(entry({ tool: 'Grep', input, result }).summary).toBe(summary)
})

test('Glob reads a structured count or the returned filenames', () => {
  for (const result of [{ numFiles: 3 }, { filenames: ['a', 'b', 'c'] }, ['a', 'b', 'c']]) {
    expect(entry({ tool: 'Glob', input: { pattern: '*.ts' }, result }).summary).toBe('wyniki: 3')
  }
})

test('search text counts nonempty rows and no-match output without inventing failures', () => {
  for (const tool of ['Grep', 'Glob']) {
    expect(entry({ tool, text: 'a.ts\n\nb.ts\n' }).summary).toBe('wyniki: 2')
    expect(entry({ tool, text: 'No matches found' }).summary).toBe('wyniki: 0')
    expect(entry({ tool, text: '' }).summary).toBe('wyniki: 0')
    expect(entry({ tool, text: 'error', isError: true }).summary).toBe('')
    expect(entry({ tool, text: undefined, isError: undefined }).summary).toBe('')
    expect(entry({ tool, text: undefined, result: { numFiles: -1 } }).summary).toBe('')
  }
})

test('unrelated tools never treat numbers in their output as a summary', () => {
  expect(entry({ text: '12 passed\n3 matches' }).summary).toBe('')
})

test('an empty journal draws just the empty line', () => {
  expect(texts(draw([])).map(row => row.text)).toEqual(['Dziennik pusty'])
})

test('journal groups consecutive performers newest first without reordering history', () => {
  const entries = [
    { ...ENTRY, id: 'old', target: 'old.ts' },
    { ...ENTRY, id: 'mate1', who: 'Grom' as const, agentId: 'a1', target: 'one.ts' },
    { ...ENTRY, id: 'mate2', who: 'Grom' as const, agentId: 'a1', target: 'two.ts' },
    { ...ENTRY, id: 'new', target: 'new.ts' },
  ]
  const root = draw(entries)
  expect(children(root)).toHaveLength(3)
  expect(texts(root).filter(row => ['Krux', 'Grom'].includes(row.text)).map(row => row.text)).toEqual(['Krux', 'Grom', 'Krux'])
  expect(texts(root).filter(row => row.text.endsWith('.ts')).map(row => row.text)).toEqual(['new.ts', 'two.ts', 'one.ts', 'old.ts'])
  expect(entries.map(row => row.id)).toEqual(['old', 'mate1', 'mate2', 'new'])
})

test('different agent ids split groups even for two nameless or same-named orcs', () => {
  for (const who of ['ork', 'Niuch'] as const) {
    expect(children(draw([{ ...ENTRY, who, agentId: 'a1' }, { ...ENTRY, who, agentId: 'a2' }]))).toHaveLength(2)
  }
})

test('group names use apron colors, Krux spark and nameless grey', () => {
  const cases = [
    ['Krux', '#ff8a1c'], ['Niuch', '#3f6f6a'], ['Grom', '#a33a2a'], ['Piryt', '#c9a227'],
    ['Ochra', '#cc7722'], ['Młot', '#6b7580'], ['Lont', '#887088'], ['ork', '#555555'],
  ] as const
  for (const [who, color] of cases) {
    const name = texts(draw([{ ...ENTRY, who }]))[0]!
    expect([name.text, name.props.color, name.props.bold]).toEqual([who, color, true])
  }
})

test('journal rows carry outcome, tool, summary and local HH:MM:SS from the entry', () => {
  const at = new Date(2026, 9, 7, 12, 34, 56).getTime()
  for (const [ok, mark, color] of [[true, '✓', '#3fb950'], [false, '✗', '#e0322b'], [null, '·', undefined]] as const) {
    const rows = texts(draw([{ ...ENTRY, tool: 'Edit', ok, summary: '+3 −2', at }]))
    expect(rows.map(row => row.text)).toEqual(['Krux', mark, 'Edit', 'a.ts', '+3 −2', '12:34:56'])
    expect(rows[1]?.props.color).toBe(color)
  }
})

test('long targets truncate and cannot push the clock or wrap a journal row', () => {
  const root = draw([{ ...ENTRY, target: 'a'.repeat(200), summary: '+3 −2' }], 30)
  const row = children(children(root)[0]!)[1]!
  const target = texts(row).find(item => item.text === 'a'.repeat(200))!
  const clock = children(row).at(-1)!
  expect(root.props.width).toBe(30)
  expect(row.props.height).toBe(1)
  expect(target.props.wrap).toBe('truncate-end')
  expect(clock.props.flexShrink).toBe(0)
  expect(texts(row).some(item => item.text === '+3 −2')).toBe(true)
})

test('journal uses the supplied fallback clock only for invalid stored timestamps', () => {
  const now = new Date(2026, 9, 7, 8, 9, 10).getTime()
  expect(texts(draw([{ ...ENTRY, at: Number.NaN }], 56, now)).at(-1)?.text).toBe('08:09:10')
  const midnight = new Date(2026, 9, 7, 0, 0, 0).getTime()
  expect(texts(draw([{ ...ENTRY, at: midnight }], 56, now)).at(-1)?.text).toBe('00:00:00')
  expect(draw([], 0).props.width).toBe(1)
})

test('a collapsed tool is one dim line with a visible outcome', () => {
  for (const [ok, mark] of [[true, '✓'], [null, '·']] as const) {
    const root = line({ tool: 'Read', target: 'hooks/a.ts', ok })
    expect(lineText(root)).toBe(`⚒ Read hooks/a.ts ${mark}`)
    expect(root.props.height).toBe(1)
    expect(texts(root).every(row => row.props.dimColor === true)).toBe(true)
    expect(texts(root)[0]?.props.wrap).toBe('truncate-end')
  }
})

test('a collapsed group fails if any call failed and stays pending if any is unknown', () => {
  const green = { tool: 'Read', target: 'a.ts', ok: true }
  expect(lineText(line([green, green, green, green]))).toBe('⚒ 4 narzędzia ✓')
  expect(lineText(line([green, { ...green, ok: null }]))).toBe('⚒ 2 narzędzia ·')
  const failed = line([green, { ...green, ok: null }, { ...green, ok: false }])
  expect(lineText(failed)).toBe('⚒ 3 narzędzia ✗')
  // Na czerwono tylko znak; opis zostaje przygaszony jak przy sukcesie.
  expect(texts(failed).at(-1)?.props.color).toBe('#e0322b')
  expect(texts(failed)[0]?.props.dimColor).toBe(true)
  expect(texts(failed)[0]?.props.color).toBeUndefined()
  expect(lineText(line([]))).toBe('⚒ 0 narzędzi ·')
  expect(lineText(line([green]))).toBe('⚒ Read a.ts ✓')
  expect(lineText(line(Array.from({ length: 12 }, () => green)))).toBe('⚒ 12 narzędzi ✓')
  expect(lineText(line(Array.from({ length: 22 }, () => green)))).toBe('⚒ 22 narzędzia ✓')
})

test('single errors have a red mark and empty or multiline targets keep a single line', () => {
  const failed = line({ tool: 'Bash', target: 'npm test', ok: false })
  expect(lineText(failed)).toBe('⚒ Bash npm test ✗')
  expect(texts(failed).at(-1)?.props.color).toBe('#e0322b')
  expect(texts(failed)[0]?.props.dimColor).toBe(true)
  expect(lineText(line({ tool: 'TodoWrite', target: '', ok: true }))).toBe('⚒ TodoWrite ✓')
  expect(lineText(line({ tool: 'Bash', target: 'echo\n  ok', ok: null }))).toBe('⚒ Bash echo ok ·')
})

test('collapsed long targets leave room for the final status', () => {
  for (const target of ['x'.repeat(100), '漢字'.repeat(40), '😀'.repeat(40)]) {
    const root = line({ tool: 'Read', target, ok: false }, 20)
    const [label, status] = children(root)
    expect(root.props.width).toBe(20)
    expect(label?.props.flexShrink).toBe(1)
    expect(label?.props.minWidth).toBe(0)
    expect(texts(label!)[0]?.props.wrap).toBe('truncate-end')
    expect(status?.props.flexShrink).toBe(0)
    expect(texts(status!)[0]?.text).toBe('✗')
  }
  expect(lineText(line({ tool: 'Read', target: 'a.ts', ok: false }, 1))).toBe('✗')
})
