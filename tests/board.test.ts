import { expect, test } from 'claude-code/testing'

import { EMPTY_BOARD, boardAfter, limitName, planRows, replayBoard, meter, planCount, resetIn, testLine, tokens, usageOf } from '../hooks/board'

test('TodoWrite replaces the plan with its whole list', () => {
  const board = boardAfter(EMPTY_BOARD, 'TodoWrite', {
    todos: [
      { content: 'Test odtwarzający błąd', status: 'completed', activeForm: 'Pisać test' },
      { content: 'Poprawka w parser.js', status: 'in_progress', activeForm: 'Kuć poprawkę' },
      { content: 'Changelog', status: 'pending', activeForm: 'Pisać changelog' },
    ],
  })
  expect(board.tasks).toEqual([
    { id: null, subject: 'Test odtwarzający błąd', status: 'completed' },
    { id: null, subject: 'Poprawka w parser.js', status: 'in_progress' },
    { id: null, subject: 'Changelog', status: 'pending' },
  ])
  const shorter = boardAfter(board, 'TodoWrite', { todos: [{ content: 'Changelog', status: 'completed', activeForm: '' }] })
  expect(shorter.tasks).toEqual([{ id: null, subject: 'Changelog', status: 'completed' }])
})

test('TaskCreate adds a pending task under the id from its result, TaskUpdate moves or drops it', () => {
  let board = boardAfter(EMPTY_BOARD, 'TaskCreate', { subject: 'Rozebrać oś', description: '' }, { task: { id: '1', subject: 'Rozebrać oś' } })
  board = boardAfter(board, 'TaskCreate', { subject: 'Nowy panel', description: '' }, { task: { id: '2', subject: 'Nowy panel' } })
  expect(board.tasks).toEqual([
    { id: '1', subject: 'Rozebrać oś', status: 'pending' },
    { id: '2', subject: 'Nowy panel', status: 'pending' },
  ])
  board = boardAfter(board, 'TaskUpdate', { taskId: '1', status: 'in_progress' })
  board = boardAfter(board, 'TaskUpdate', { taskId: '2', subject: 'Panel stanu roboty' })
  expect(board.tasks).toEqual([
    { id: '1', subject: 'Rozebrać oś', status: 'in_progress' },
    { id: '2', subject: 'Panel stanu roboty', status: 'pending' },
  ])
  board = boardAfter(board, 'TaskUpdate', { taskId: '1', status: 'deleted' })
  expect(board.tasks.map(task => task.id)).toEqual(['2'])
  // Obcy id i inne narzędzia nic nie zmieniają.
  expect(boardAfter(board, 'TaskUpdate', { taskId: '9', status: 'completed' })).toBe(board)
  expect(boardAfter(board, 'Read', { file_path: '/a.ts' })).toBe(board)
})

test('a test command lands on the board with counts and failing names from its output', () => {
  const bun = '(pass) parses [1ms]\n(fail) cache > drops stale keys [2ms]\n(fail) auth > login [3ms]\n\n 52 pass\n 2 fail\n'
  const failed = boardAfter(EMPTY_BOARD, 'Bash', { command: 'claude plugin test .' }, undefined, { text: bun, isError: true, who: 'Krux' })
  expect(failed.test).toEqual({ command: 'claude plugin test .', ok: false, passed: 52, failed: 2, failures: ['cache > drops stale keys', 'auth > login'], who: 'Krux' })
  const jest = 'FAIL src/auth.test.js\n  ✕ logs in (5 ms)\nTests:       1 failed, 12 passed, 13 total\n'
  expect(boardAfter(EMPTY_BOARD, 'Bash', { command: 'npx jest' }, undefined, { text: jest, isError: true, who: 'Młot' }).test).toEqual({
    command: 'npx jest',
    ok: false,
    passed: 12,
    failed: 1,
    failures: ['src/auth.test.js', 'logs in'],
    who: 'Młot',
  })
  const pytest = '===== 3 passed in 0.12s ====='
  expect(boardAfter(EMPTY_BOARD, 'Bash', { command: 'pytest -q' }, undefined, { text: pytest, isError: false, who: 'Krux' }).test).toMatchObject({ ok: true, passed: 3, failed: null, failures: [] })
  // Bez liczb w wyjściu zostaje sam wynik; komenda bez testów nie rusza tablicy.
  expect(boardAfter(EMPTY_BOARD, 'Bash', { command: 'npm test' }, undefined, { text: 'ok', isError: false, who: 'Krux' }).test).toMatchObject({ passed: null, failed: null })
  expect(boardAfter(failed, 'Bash', { command: 'git status' }, undefined, { text: '', isError: false, who: 'Krux' })).toBe(failed)
})

test('the board keeps at most five failing names', () => {
  const output = Array.from({ length: 8 }, (_, index) => `(fail) case ${index}`).join('\n')
  expect(boardAfter(EMPTY_BOARD, 'Bash', { command: 'bun test' }, undefined, { text: output, isError: true, who: 'Krux' }).test?.failures).toHaveLength(5)
})

test('usage keeps the context fill, the limit windows and the cost', () => {
  const raw = {
    startedAt: 0,
    context: { tokens: 136_000, window: 200_000, percent: 68 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-05T15:00:00Z' }, { kind: 'seven_day', percentUsed: 7 }],
    cost: { usd: 1.234 },
  }
  expect(usageOf(raw)).toEqual({
    percent: 68,
    tokens: 136_000,
    window: 200_000,
    limits: [
      { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-05T15:00:00Z' },
      { kind: 'seven_day', percentUsed: 7, resetsAt: null },
    ],
    usd: 1.234,
  })
  // Świeża sesja: okno znane, zapełnienia jeszcze nie ma; bez subskrypcji brak limitów.
  expect(usageOf({ startedAt: 0, context: { window: 200_000 }, rateLimits: [] })).toEqual({ percent: null, tokens: null, window: 200_000, limits: [], usd: null })
})

test('the board reads usage in short Polish words', () => {
  expect(meter(50, 10)).toBe('█████░░░░░')
  expect(meter(0, 4)).toBe('░░░░')
  expect(meter(130, 4)).toBe('████')
  expect(meter(5, 10)).toBe('▌░░░░░░░░░')
  expect(tokens(136_000)).toBe('136k')
  expect(tokens(1_000_000)).toBe('1M')
  expect(tokens(950)).toBe('950')
  expect(limitName('five_hour')).toBe('5 h')
  expect(limitName('seven_day')).toBe('7 dni')
  expect(limitName('spend_limit')).toBe('budżet')
  expect(limitName('other_window')).toBe('other_window')
  const now = Date.parse('2026-10-05T12:50:00Z')
  expect(resetIn('2026-10-05T15:00:00Z', now)).toBe('reset za 2 h 10 min')
  expect(resetIn('2026-10-05T13:00:00Z', now)).toBe('reset za 10 min')
  expect(resetIn('2026-10-08T13:00:00Z', now)).toBe('reset za 3 dni')
  expect(resetIn('2026-10-05T12:00:00Z', now)).toBe('')
  expect(resetIn(null, now)).toBe('')
  expect(planCount([{ id: null, subject: 'a', status: 'completed' }, { id: null, subject: 'b', status: 'pending' }])).toBe('1/2')
})

test('a resumed session rebuilds its plan and last test run from history', () => {
  const board = replayBoard([
    { role: 'user', text: 'napraw', toolUses: [] },
    {
      role: 'assistant',
      text: '',
      toolUses: [
        { tool: 'TaskCreate', input: { subject: 'Test', description: '' }, result: { task: { id: '1', subject: 'Test' } } },
        { tool: 'TaskUpdate', input: { taskId: '1', status: 'completed' } },
        { tool: 'Bash', input: { command: 'npm test' }, text: ' 3 pass\n 1 fail', isError: true },
      ],
    },
  ])
  expect(board.tasks).toEqual([{ id: '1', subject: 'Test', status: 'completed' }])
  expect(board.test).toMatchObject({ command: 'npm test', ok: false, passed: 3, failed: 1, who: 'Krux' })
})

const run = (command: string, text: string, isError = false, input: Record<string, unknown> = {}) =>
  boardAfter(EMPTY_BOARD, 'Bash', { command, ...input }, undefined, { text, isError, who: 'Krux' }).test

test('failures in the output win over a zero exit, as behind a pipe to tail', () => {
  expect(run('npm test 2>&1 | tail -30', '(fail) auth > login\n 3 pass\n 1 fail')).toMatchObject({ ok: false, failed: 1 })
})

test('counts come from the summary, not from the first number in the output', () => {
  const jest = 'FAIL src/a.test.js\n  ✕ returns 2 failed items (5 ms)\nTest Suites: 1 failed, 3 passed, 4 total\nTests:       1 failed, 39 passed, 40 total\n'
  expect(run('npx jest', jest, true)).toMatchObject({ passed: 39, failed: 1, failures: ['src/a.test.js', 'returns 2 failed items'] })
  const vitest = ' ❯ src/a.test.ts (2 tests | 1 failed) 4ms\n Test Files  1 failed | 2 passed (3)\n      Tests  1 failed | 10 passed (11)\n'
  expect(run('npx vitest run', vitest, true)).toMatchObject({ passed: 10, failed: 1 })
  const cargo = 'test result: ok. 4 passed; 0 failed; 0 ignored\ntest result: FAILED. 2 passed; 1 failed; 0 ignored\n'
  expect(run('cargo test', cargo, true)).toMatchObject({ passed: 6, failed: 1 })
})

test('failing names lose timings, packages and summary lines', () => {
  const go = '--- FAIL: TestLogin (0.00s)\nFAIL\nFAIL\tgithub.com/a/b\t0.012s\n'
  expect(run('go test ./...', go, true)?.failures).toEqual(['TestLogin', 'github.com/a/b'])
  expect(run('python -m unittest', 'FAIL: test_login (tests.AuthTest)\nFAILED (failures=1)', true)?.failures).toEqual(['test_login (tests.AuthTest)'])
})

test('a test run sent to the background leaves the last real run in place', () => {
  const before = boardAfter(EMPTY_BOARD, 'Bash', { command: 'npm test' }, undefined, { text: ' 3 pass', isError: false, who: 'Krux' })
  expect(boardAfter(before, 'Bash', { command: 'npm test', run_in_background: true }, undefined, { text: 'running', isError: false, who: 'Krux' })).toBe(before)
})

test('a failed task call leaves the plan alone', () => {
  const failed = { text: 'Error', isError: true, who: 'Krux' as const }
  expect(boardAfter(EMPTY_BOARD, 'TaskCreate', { subject: 'X', description: '' }, 'Error', failed)).toBe(EMPTY_BOARD)
  expect(boardAfter(EMPTY_BOARD, 'TodoWrite', { todos: [{ content: 'X', status: 'pending', activeForm: '' }] }, 'Error', failed)).toBe(EMPTY_BOARD)
  const board = boardAfter(EMPTY_BOARD, 'TaskCreate', { subject: 'X', description: '' }, { task: { id: '1', subject: 'X' } })
  expect(boardAfter(board, 'TaskUpdate', { taskId: '1', status: 'completed' }, { success: false, taskId: '1', updatedFields: [] })).toBe(board)
})

test('a long plan drops its oldest done tasks first and says how many', () => {
  const tasks = Array.from({ length: 12 }, (_, index) => ({ id: null, subject: `t${index}`, status: index < 9 ? ('completed' as const) : ('pending' as const) }))
  const rows = planRows(tasks, 8)
  expect(rows).toMatchObject({ earlier: 4, later: 0 })
  expect(rows.shown.map(task => task.subject)).toEqual(['t4', 't5', 't6', 't7', 't8', 't9', 't10', 't11'])
  expect(planRows(tasks.slice(0, 3), 8)).toEqual({ shown: tasks.slice(0, 3), earlier: 0, later: 0 })
})

test('a plan with too few done tasks cuts its tail and counts it as later, not earlier', () => {
  const pending = Array.from({ length: 10 }, (_, index) => ({ id: null, subject: `t${index}`, status: 'pending' as const }))
  expect(planRows(pending, 8)).toMatchObject({ earlier: 0, later: 2 })
  expect(planRows(pending, 8).shown.map(task => task.subject)).toEqual(['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'])
  const mixed = [{ id: null, subject: 'done', status: 'completed' as const }, ...pending]
  expect(planRows(mixed, 8)).toMatchObject({ earlier: 1, later: 2 })
})

test('tokens round up into the next unit instead of showing 1000k', () => {
  expect(tokens(999_499)).toBe('999k')
  expect(tokens(999_500)).toBe('1M')
  expect(tokens(1_500_000)).toBe('1.5M')
})

test('the test line counts in Polish plural forms and skips zero failures', () => {
  const line = (passed: number | null, failed: number | null) => testLine({ command: 'npm test', ok: failed === null || failed === 0, passed, failed, failures: [], who: 'Krux' })
  expect(line(0, null)).toBe('0 przeszło')
  expect(line(1, 1)).toBe('1 padł · 1 przeszedł')
  expect(line(3, 2)).toBe('2 padły · 3 przeszły')
  expect(line(5, 5)).toBe('5 padło · 5 przeszło')
  expect(line(13, 12)).toBe('12 padło · 13 przeszło')
  expect(line(24, 22)).toBe('22 padły · 24 przeszły')
  expect(line(7, 0)).toBe('7 przeszło')
  expect(line(null, null)).toBe('')
})

test('a failed count alone marks the run as failing even with a zero exit and no names', () => {
  const mocha = '  ✓ parses\n\n  10 passing (12ms)\n  2 failing\n\n  1) auth\n       logs in:\n'
  expect(run('npm test', mocha)).toMatchObject({ ok: false, passed: 10, failed: 2 })
})

test('a test command without a known result leaves the board alone', () => {
  const before = boardAfter(EMPTY_BOARD, 'Bash', { command: 'npm test' }, undefined, { text: ' 3 pass', isError: false, who: 'Krux' })
  expect(boardAfter(before, 'Bash', { command: 'npm test' })).toBe(before)
  const replayed = replayBoard([
    { role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'npm test' }, text: ' 3 pass' }] },
    { role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'npm test' }, isError: true }] },
  ])
  expect(replayed.test).toMatchObject({ ok: true, passed: 3 })
})

test('TodoWrite drops entries with an unknown status or empty content', () => {
  const board = boardAfter(EMPTY_BOARD, 'TodoWrite', {
    todos: [
      { content: 'Dobre', status: 'pending', activeForm: '' },
      { content: 'Zły status', status: 'blocked', activeForm: '' },
      { content: '   ', status: 'completed', activeForm: '' },
      { status: 'in_progress', activeForm: '' },
    ],
  })
  expect(board.tasks).toEqual([{ id: null, subject: 'Dobre', status: 'pending' }])
  expect(boardAfter(board, 'TodoWrite', { todos: [] }).tasks).toEqual([])
})

test('TaskCreate without a subject leaves the plan alone', () => {
  expect(boardAfter(EMPTY_BOARD, 'TaskCreate', { subject: '', description: '' }, { task: { id: '1' } })).toBe(EMPTY_BOARD)
  expect(boardAfter(EMPTY_BOARD, 'TaskCreate', { subject: '  ', description: '' }, { task: { id: '1' } })).toBe(EMPTY_BOARD)
})

test('TaskUpdate keeps the old status on an unknown one and applies status and subject together', () => {
  const board = boardAfter(EMPTY_BOARD, 'TaskCreate', { subject: 'Oś', description: '' }, { task: { id: '1', subject: 'Oś' } })
  expect(boardAfter(board, 'TaskUpdate', { taskId: '1', status: 'blocked' }).tasks).toEqual([{ id: '1', subject: 'Oś', status: 'pending' }])
  expect(boardAfter(board, 'TaskUpdate', { taskId: '1', status: 'completed', subject: 'Oś rozebrana' }).tasks).toEqual([
    { id: '1', subject: 'Oś rozebrana', status: 'completed' },
  ])
})

test('failing names come from every runner marker, once each, across CRLF lines', () => {
  const output = '× adds\r\n✗ subtracts\r\nnot ok 3 - divides\r\nnot ok 4 multiplies\r\n× adds\r\n'
  expect(run('npm test', output, true)?.failures).toEqual(['adds', 'subtracts', 'divides', 'multiplies'])
  const jest = 'FAIL src/a.test.js\n  ✕ logs in (5 ms)\n\nSummary of all failing tests\nFAIL src/a.test.js\n  ✕ logs in (5 ms)\nTests:       1 failed, 2 passed, 3 total\r\n'
  expect(run('npx jest', jest, true)).toMatchObject({ passed: 2, failed: 1, failures: ['src/a.test.js', 'logs in'] })
})

test('reset time drops zero minutes on full hours and switches to days at 48 hours', () => {
  const now = Date.parse('2026-10-05T12:00:00Z')
  expect(resetIn('2026-10-05T14:00:00Z', now)).toBe('reset za 2 h')
  expect(resetIn('2026-10-05T12:00:30Z', now)).toBe('reset za 1 min')
  expect(resetIn('2026-10-07T11:59:00Z', now)).toBe('reset za 47 h 59 min')
  expect(resetIn('2026-10-07T12:00:00Z', now)).toBe('reset za 2 dni')
  expect(resetIn('2026-10-05T12:00:00Z', now)).toBe('')
  expect(resetIn('nie data', now)).toBe('')
})

test('node --test reads its TAP summary, where the count follows the word', () => {
  const tap = 'not ok 2 - logs in\n# tests 5\n# suites 0\n# pass 4\n# fail 1\n# cancelled 0\n'
  expect(run('node --test', tap, true)).toMatchObject({ ok: false, passed: 4, failed: 1, failures: ['logs in'] })
  expect(run('node --test', '# tests 2\n# pass 2\n# fail 0\n')).toMatchObject({ ok: true, passed: 2, failed: 0 })
})

test('node --test reads its default reporter: ✖ names, ℹ counts, the failing-tests header is not a test', () => {
  const spec = [
    '✔ kowadło trzyma (0.38ms)',
    '✖ cache przy drugim żądaniu (0.38ms)',
    '✖ walidacja brzegów (0.13ms)',
    'ℹ tests 3',
    'ℹ pass 1',
    'ℹ fail 2',
    'ℹ duration_ms 119.6',
    '',
    '✖ failing tests:',
    '',
    '✖ cache przy drugim żądaniu (0.38ms)',
  ].join('\n')
  expect(run('node --test a.mjs', spec, true)).toMatchObject({ ok: false, passed: 1, failed: 2, failures: ['cache przy drugim żądaniu', 'walidacja brzegów'] })
})

test('printing a quoted test command cannot record green tests', () => {
  expect(run("printf 'x; npm test'", ' 3 pass\n 0 fail')).toBe(null)
})
