import { expect, test } from 'claude-code/testing'

import type { KruxBoard, KruxGit, KruxTask } from '../types'
import { EMPTY_BOARD, boardAfter, limitName, planRows, readiness, replayBoard, returnNote, meter, planCount, resetIn, stuckMinutes, testLine, testsStale, tokens, usageOf } from '../hooks/board'

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
  expect(usageOf({ context: { window: 200_000 }, rateLimits: [] })).toEqual({ percent: null, tokens: null, window: 200_000, limits: [], usd: null })
})

test('the board reads usage in short Polish words', () => {
  expect(meter(50, 10)).toBe('█████░░░░░')
  expect(meter(0, 4)).toBe('░░░░')
  expect(meter(130, 4)).toBe('████')
  expect(meter(5, 10)).toBe('▌░░░░░░░░░')
  expect(tokens(136_000)).toBe('136k')
  expect(tokens(1_000_000)).toBe('1M')
  expect(tokens(950)).toBe('950')
  expect(limitName('five_hour')).toBe('5h')
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
        { tool: 'TaskUpdate', input: { taskId: '1', status: 'completed' }, result: { success: true } },
        { tool: 'Bash', input: { command: 'npm test' }, text: ' 3 pass\n 1 fail', isError: true },
      ],
    },
  ])
  expect(board.tasks).toEqual([{ id: '1', subject: 'Test', status: 'completed' }])
  expect(board.test).toMatchObject({ command: 'npm test', ok: false, passed: 3, failed: 1, who: 'Krux' })
})

test('replay keeps confirmed board state instead of applying in-flight plan and test summaries', () => {
  const board = replayBoard([{ role: 'assistant', text: '', toolUses: [
    { tool_use_id: 'confirmed-task', tool: 'TaskCreate', input: { subject: 'Confirmed task' }, result: { task: { id: '1' } } },
    { tool_use_id: 'pending-update', tool: 'TaskUpdate', input: { taskId: '1', status: 'completed' } },
    { tool_use_id: 'pending-plan', tool: 'TodoWrite', input: { todos: [{ content: 'Unfinished rewrite', status: 'completed' }] } },
    { tool_use_id: 'failed-test', tool: 'Bash', input: { command: 'npm test' }, text: '1 failed' },
    { tool_use_id: 'pending-test', tool: 'Bash', input: { command: 'npm test' } },
    { tool_use_id: 'background-test', tool: 'Bash', input: { command: 'npm test' }, text: 'running', result: { backgroundTaskId: 'job-1' } },
  ] }])
  expect(board).toEqual({
    tasks: [{ id: '1', subject: 'Confirmed task', status: 'pending' }],
    test: { command: 'npm test', ok: false, passed: null, failed: 1, failures: [], who: 'Krux' },
  })
})

test('replay restores a confirmed error without text instead of retaining an older green run', () => {
  const board = replayBoard([{ role: 'assistant', text: '', toolUses: [
    { tool_use_id: 'green-test', tool: 'Bash', input: { command: 'npm test' }, text: '3 passed' },
    { tool_use_id: 'failed-test', tool: 'Bash', input: { command: 'npm test' }, isError: true },
  ] }])
  expect(board.test).toMatchObject({ ok: false, passed: null, failed: null, failures: [] })
})

const run = (command: string, text: string, isError = false, input: Record<string, unknown> = {}) =>
  boardAfter(EMPTY_BOARD, 'Bash', { command, ...input }, undefined, { text, isError, who: 'Krux' }).test

test('failures in the output win over a zero exit, as behind a pipe to tail', () => {
  expect(run('npm test 2>&1 | tail -30', '(fail) auth > login\n 3 pass\n 1 fail')).toMatchObject({ ok: false, failed: 1 })
})

test('unittest errors behind a successful pipe remain failed tests and block readiness', () => {
  const output = 'ERROR: test_import (probe_unittest.Probe.test_import)\nRuntimeError: fixture fails\nRan 1 test in 0.000s\nFAILED (errors=1)'
  const board = boardAfter(EMPTY_BOARD, 'Bash', { command: 'python3 -m unittest probe_unittest 2>&1 | tail -20' }, undefined, { text: output, isError: false, who: 'Krux' })
  expect(board.test).toMatchObject({ ok: false, failed: 1, failures: ['test_import (probe_unittest.Probe.test_import)'] })
  expect(readiness(board, GIT)).toEqual({ ready: false, missing: ['testy padłe'] })
  expect(run('python3 -m unittest', 'FAILED (failures=1, errors=2)')).toMatchObject({ ok: false, failed: 3 })
})

test('ERROR lines from logs or bundlers do not fail a passing run; pytest errors still do', () => {
  expect(run('python -m unittest', 'ERROR:root:connection refused (expected)\n...\nRan 3 tests in 0.010s\n\nOK')).toMatchObject({ ok: true, failures: [] })
  expect(run('npm test', 'ERROR in ./src/x.ts\n  5 passing (20ms)')).toMatchObject({ ok: true, failures: [] })
  expect(run('pytest', 'ERROR tests/test_db.py::test_connect - RuntimeError\n1 passed, 1 error in 0.10s')).toMatchObject({ ok: false, failures: ['tests/test_db.py::test_connect - RuntimeError'] })
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

// `&` w powłoce: narzędzie kończy się od razu z kodem 0, a przebieg trwa dalej bez nas.
// Za `wait` powłoka czeka na zadania z tła, więc wynik jest pełny.
test('a test sent to the background with a shell & keeps the last real run, readiness included', () => {
  const git: KruxGit = { branch: 'main', upstream: null, ahead: 0, behind: 0, changed: 1, untracked: 0, conflicted: 0, whitespace: true, files: [], commits: [] }
  const red = boardAfter(EMPTY_BOARD, 'Bash', { command: 'npm test' }, undefined, { text: '1 failed', isError: true, who: 'Krux' }, 100)
  for (const command of ['npm test > /tmp/t.log 2>&1 &', 'npm test &', 'pytest -x > out.txt 2>&1 & echo started', 'npm test 2>&1 | tee test.log &', 'npm test > log 2>&1 && echo done &']) {
    expect([command, boardAfter(red, 'Bash', { command }, { stdout: '' }, { text: '', isError: false, who: 'Krux' }, 200) === red]).toEqual([command, true])
    expect([command, readiness(boardAfter(EMPTY_BOARD, 'Bash', { command }, { stdout: '' }, { text: '', isError: false, who: 'Krux' }, 200), git).ready]).toEqual([command, false])
  }
  for (const command of ['npm run dev & npm test', 'npm test &> log', 'timeout 300 npm test', 'npm test & wait']) {
    const run = boardAfter(red, 'Bash', { command }, undefined, { text: '2 passed', isError: false, who: 'Krux' }, 200).test
    expect([command, run?.ok, run?.passed, run?.at]).toEqual([command, true, 2, 200])
  }
})

test('a test moved to the background by the engine keeps the completed failing run', () => {
  const before = boardAfter(EMPTY_BOARD, 'Bash', { command: 'npm test' }, undefined, { text: '1 failed', isError: true, who: 'Krux' }, 100)
  const call = { text: 'Command running in background with ID: job-1', isError: false, who: 'Krux' as const }
  for (const result of [
    { backgroundTaskId: 'job-1', backgroundedByUser: true },
    { backgroundTaskId: 'job-2', timedOutAfterMs: 1000 },
  ]) {
    expect(boardAfter(before, 'Bash', { command: 'npm test' }, result, call, 200)).toBe(before)
  }
  expect(boardAfter(before, 'Bash', { command: 'npm test' }, { backgroundTaskId: '' }, { ...call, text: '2 passed' }, 200).test).toMatchObject({ ok: true, passed: 2, at: 200 })
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
    { role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'npm test' } }] },
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

// Wyjścia poniżej to prawdziwe przebiegi (ścieżki skrócone); kod potoku 0, więc kolor daje samo wyjście.
test('a pytest collection error behind a pipe stays red with its module and error count', () => {
  const tail = [
    '    import nie_ma_modulu',
    "E   ModuleNotFoundError: No module named 'nie_ma_modulu'",
    '=========================== short test summary info ============================',
    'ERROR pyimp/test_imp.py',
    '!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!',
    '=============================== 1 error in 0.06s ===============================',
  ].join('\n')
  const board = boardAfter(EMPTY_BOARD, 'Bash', { command: 'python -m pytest pyimp 2>&1 | tail -6' }, undefined, { text: tail, isError: false, who: 'Krux' })
  expect(board.test).toMatchObject({ ok: false, failed: 1, failures: ['pyimp/test_imp.py'] })
  expect(readiness(board, GIT)).toEqual({ ready: false, missing: ['testy padłe'] })
  expect(run('pytest 2>&1 | tail -1', '1 error in 0.05s')).toMatchObject({ ok: false, failed: 1 })
  expect(run('pytest | tail -2', "ERROR tests/test_x.py - ModuleNotFoundError: No module named 'x'\n1 error in 0.05s")?.failures).toEqual(["tests/test_x.py - ModuleNotFoundError: No module named 'x'"])
  // Błędy pytest liczą się z padłymi; ostrzeżenia nie, a log z plikiem i linią to nie test.
  expect(run('pytest | tail -1', '=== 1 failed, 3 passed, 2 warnings, 2 errors in 0.20s ===')).toMatchObject({ ok: false, passed: 3, failed: 3 })
  expect(run('pytest -rA', 'ERROR    sync:test_jobs.py:5 lost connection\n=== 2 passed, 1 warning in 0.01s ===')).toMatchObject({ ok: true, passed: 2, failed: null, failures: [] })
})

test('a cargo build error behind a pipe stays red with the crate that did not compile', () => {
  const tail = [
    'error[E0425]: cannot find function `nie_ma` in this scope',
    ' --> a/src/lib.rs:3:23',
    '  |',
    '3 |     #[test] fn ok() { nie_ma(); }',
    '  |                       ^^^^^^ not found in this scope',
    '',
    'For more information about this error, try `rustc --explain E0425`.',
    'error: could not compile `a` (lib test) due to 1 previous error',
  ].join('\n')
  expect(run('cargo test 2>&1 | tail -8', tail)).toMatchObject({ ok: false, passed: null, failed: null, failures: ['could not compile `a` (lib test) due to 1 previous error'] })
})

test('dotnet and phpunit summaries put the count after the word', () => {
  const dotnet = '  Failed MyTests.FooTests.Bar [12 ms]\n  Error Message:\n   Assert.Equal() Failure\n\nFailed!  - Failed:     1, Passed:     5, Skipped:     0, Total:     6, Duration: 50 ms - MyTests.dll (net8.0)\n'
  expect(run('dotnet test 2>&1 | tail -5', dotnet)).toMatchObject({ ok: false, passed: 5, failed: 1 })
  const projects = 'Passed!  - Failed:     0, Passed:     6, Skipped:     0, Total:     6, Duration: 50 ms - A.dll (net8.0)\nPassed!  - Failed:     0, Passed:     2, Skipped:     0, Total:     2, Duration: 9 ms - B.dll (net8.0)'
  expect(run('dotnet test', projects)).toMatchObject({ ok: true, passed: 8, failed: 0 })
  expect(run('make test | tail -2', 'FAILURES!\nTests: 4, Assertions: 4, Failures: 1.')).toMatchObject({ ok: false, passed: null, failed: 1 })
  expect(run('make test | tail -2', 'ERRORS!\nTests: 4, Assertions: 3, Errors: 1, Failures: 1.')).toMatchObject({ ok: false, failed: 2 })
  expect(run('make test', 'OK, but some tests were skipped!\nTests: 5, Assertions: 5, Skipped: 1.')).toMatchObject({ ok: true, failed: 0 })
})

test('lint warnings before the tests and todo tests do not fail a passing run', () => {
  // `npm test` z `pretest: eslint .`: same ostrzeżenia, kod 0.
  const lint = '\n/repo/lint/a.js\n  1:7  warning  \'unused\' is assigned a value but never used  no-unused-vars\n\n✖ 1 problem (0 errors, 1 warning)\n\nTAP version 13\n# Subtest: works\nok 1 - works\n1..1\n# tests 1\n# pass 1\n# fail 0\n'
  expect(run('npm test', lint)).toMatchObject({ ok: true, passed: 1, failed: 0, failures: [] })
  // Błędy lintera dalej zatrzymują przebieg za potokiem.
  expect(run('npm test 2>&1 | tail -3', '✖ 2 problems (2 errors, 0 warnings)\n')).toMatchObject({ ok: false, failures: ['2 problems (2 errors, 0 warnings)'] })
  const tap = 'TAP version 13\n# Subtest: works\nok 1 - works\n# Subtest: flaky thing\nnot ok 2 - flaky thing # TODO not yet\n  ---\n  error: \'1 == 2\'\n  ...\nnot ok 3 - later # skip\n1..3\n# tests 3\n# pass 1\n# fail 0\n# todo 1\n'
  expect(run('node --test', tap)).toMatchObject({ ok: true, passed: 1, failed: 0, failures: [] })
  const spec = '✔ works (0.587263ms)\n✖ flaky thing (0.560083ms) # not yet\nℹ tests 2\nℹ pass 1\nℹ fail 0\nℹ todo 1\n\n✖ failing tests:\n\ntest at a.test.mjs:4:1\n✖ flaky thing (0.560083ms) # not yet\n  AssertionError [ERR_ASSERTION]: 1 == 2\n'
  expect(run('node --test', spec)).toMatchObject({ ok: true, passed: 1, failed: 0, failures: [] })
  expect(run('node --test', 'not ok 1 - flaky # TODO\n# pass 0\n# fail 1\n', true)).toMatchObject({ ok: false, failed: 1 })
})

test('counts come only from summary lines, not from logs or test names in a green run', () => {
  // `go test -v` z `t.Log`, pytest `-rA` z przechwyconym logiem: prawdziwe zielone przebiegi.
  const go = '=== RUN   TestB\n    b_test.go:3: 3 failed attempts tolerated\n--- PASS: TestB (0.00s)\nPASS\nok  \texample.com/m/b\t(cached)\n'
  expect(run('go test -v ./b', go)).toMatchObject({ ok: true, passed: null, failed: null, failures: [] })
  const pytest = [
    '------------------------------ Captured log call -------------------------------',
    'WARNING  sync:test_jobs.py:5 batch done: 2 failed, 8 ok',
    '=========================== short test summary info ============================',
    'PASSED py/test_jobs.py::test_retries_after_3_failed_attempts',
    'PASSED py/test_jobs.py::test_logs',
    '============================== 2 passed in 0.01s ===============================',
  ].join('\n')
  expect(run('pytest -rA py/test_jobs.py', pytest)).toMatchObject({ ok: true, passed: 2, failed: null })
  const jest = ' PASS  src/jobs.test.js\n    ✓ retries after 3 failed attempts (5 ms)\n    console.log\n      batch done: 2 failed, 8 ok\n\nTest Suites: 1 passed, 1 total\nTests:       2 passed, 2 total\nSnapshots:   0 total\n'
  expect(run('npx jest', jest)).toMatchObject({ ok: true, passed: 2, failed: null })
  expect(run('npx vitest run', ' ✓ src/a.test.ts (3 tests) 2ms\n   ✓ counts 2 failing checks\n\n Test Files  1 passed (1)\n      Tests  3 passed (3)\n')).toMatchObject({ ok: true, passed: 3, failed: null })
  expect(run('npx mocha', '  report\n    ✔ shows 1 failing job\n\n  5 passing (20ms)\n')).toMatchObject({ ok: true, passed: 5, failed: null })
  // Podsumowania z etykietą, czasem i separatorami dalej dają liczby.
  expect(run('pytest', '==== 120 passed, 2 skipped in 65.12s (0:01:05) ====')).toMatchObject({ ok: true, passed: 120 })
  expect(run('deno test', 'ok | 2 passed (4 steps) | 0 failed (1s)')).toMatchObject({ ok: true, passed: 2, failed: 0 })
  expect(run('make test', '     Summary [   0.010s] 3 tests run: 2 passed, 1 failed, 0 skipped', true)).toMatchObject({ passed: 2, failed: 1 })
  expect(run('bundle exec rspec', '5 examples, 1 failure, 1 pending')).toMatchObject({ ok: false, failed: 1 })
})

test('forced colors do not hide counts or failing names', () => {
  const pytest = '\x1b[36m\x1b[1m=========================== short test summary info ============================\x1b[0m\n\x1b[31mFAILED\x1b[0m py/test_bad.py::\x1b[1mtest_x\x1b[0m - assert 1 == 2\n\x1b[31m\x1b[31m\x1b[1m1 failed\x1b[0m, \x1b[32m2 passed\x1b[0m\x1b[31m in 0.03s\x1b[0m\x1b[0m\n'
  expect(run('pytest --color=yes -q py 2>&1 | tail -3', pytest)).toMatchObject({ ok: false, passed: 2, failed: 1, failures: ['py/test_bad.py::test_x - assert 1 == 2'] })
  const jest = '\x1b[1mTests:       \x1b[22m\x1b[1m\x1b[31m1 failed\x1b[39m\x1b[22m, \x1b[1m\x1b[32m12 passed\x1b[39m\x1b[22m, 13 total\n'
  expect(run('npx jest | tail -1', jest)).toMatchObject({ ok: false, passed: 12, failed: 1 })
  const bun = '\x1b[0m\x1b[31m(fail)\x1b[0m a > b \x1b[0m\x1b[2m[0.30ms]\x1b[0m\n\x1b[0m\x1b[32m 3 pass\x1b[0m\n\x1b[0m\x1b[31m 1 fail\x1b[0m\n'
  expect(run('bun test', bun, true)).toMatchObject({ passed: 3, failed: 1, failures: ['a > b'] })
})

test('cargo, deno and nextest name their failing tests; the deno summary is not a test', () => {
  const cargo = 'running 2 tests\ntest tests::ok ... ok\ntest tests::bad ... FAILED\n\nfailures:\n\n---- tests::bad stdout ----\nthread \'tests::bad\' panicked at a/src/lib.rs:4:24:\n\nfailures:\n    tests::bad\n\ntest result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.23s\n'
  expect(run('cargo test', cargo, true)).toMatchObject({ passed: 1, failed: 1, failures: ['tests::bad'] })
  const deno = 'running 2 tests from ./a_test.ts\nworks ... ok (2ms)\nfails ... FAILED (3ms)\n\n ERRORS \n\nfails => ./a_test.ts:5:6\nerror: AssertionError\n\n FAILURES \n\nfails => ./a_test.ts:5:6\n\nFAILED | 1 passed | 1 failed (10ms)\n\nerror: Test failed\n'
  expect(run('deno test', deno, true)).toMatchObject({ passed: 1, failed: 1, failures: ['fails'] })
  expect(run('make test', '        FAIL [   0.003s] crate tests::b\n     Summary [   0.010s] 3 tests run: 2 passed, 1 failed, 0 skipped\n', true)?.failures).toEqual(['crate tests::b'])
})

test('stream prefixes from turbo, pnpm -r and docker compose do not turn a failing run green behind a pipe', () => {
  // `pnpm test` ze skryptem `turbo run test`: każda linia runnera ma prefiks zadania, a `tail` daje kod 0.
  const turbo = [
    'web:test:  FAIL  src/a.test.ts > adds',
    'web:test: AssertionError: expected 2 to be 3',
    'web:test:  Test Files  1 failed (1)',
    'web:test:       Tests  1 failed | 9 passed (10)',
    'web:test:  ELIFECYCLE  Test failed. See above for more details.',
    ' Tasks:    0 successful, 1 total',
    'Failed:    web#test',
  ].join('\n')
  expect(run('pnpm test 2>&1 | tail -20', turbo)).toMatchObject({ ok: false, passed: 9, failed: 1, failures: ['src/a.test.ts > adds'] })
  expect(run('pnpm test 2>&1 | tail -1', '@acme/web:test: Tests:       1 failed, 5 passed, 6 total')).toMatchObject({ ok: false, passed: 5, failed: 1 })
  const recursive = 'packages/web test:  FAIL  src/a.test.ts > adds\npackages/web test:       Tests  1 failed | 9 passed (10)\npackages/web test: Failed\n'
  expect(run('pnpm -r test 2>&1 | tail -5', recursive)).toMatchObject({ ok: false, passed: 9, failed: 1, failures: ['src/a.test.ts > adds'] })
  expect(run('npm test 2>&1 | tail -1', 'app-1  |       Tests  1 failed | 9 passed (10)')).toMatchObject({ ok: false, passed: 9, failed: 1 })
  // Bezpieczny sąsiad: zielony turbo zostaje zielony, a goła linia logu z dwukropkiem dalej nie jest podsumowaniem.
  expect(run('pnpm test 2>&1 | tail -2', 'web:test:       Tests  10 passed (10)\n Tasks:    1 successful, 1 total')).toMatchObject({ ok: true, passed: 10, failed: null })
  expect(run('npm test', 'batch done: 2 failed, 8 ok\n 3 passed')).toMatchObject({ ok: true, passed: 3, failed: null })
})

test('gradle, XCTest and minute timings keep their summary counts', () => {
  const gradle = '> Task :test FAILED\n\nFooTest > adds() FAILED\n    org.opentest4j.AssertionFailedError at FooTest.java:10\n\n2 tests completed, 1 failed\n\nFAILURE: Build failed with an exception.\n'
  expect(run('./gradlew test 2>&1 | tail -15', gradle)).toMatchObject({ ok: false, failed: 1 })
  expect(run('./gradlew test 2>&1 | tail -1', '3 tests completed, 0 failed')).toMatchObject({ ok: true, failed: 0 })
  const xctest = "Test Case '-[FooTests.FooTests testAdd]' failed (0.001 seconds).\n\t Executed 3 tests, with 1 failure (0 unexpected) in 0.002 (0.002) seconds\n"
  expect(run('swift test 2>&1 | tail -5', xctest)).toMatchObject({ ok: false, failed: 1 })
  expect(run('swift test', '\t Executed 3 tests, with 0 failures (0 unexpected) in 0.002 (0.002) seconds')).toMatchObject({ ok: true, failed: 0 })
  expect(run('npx mocha', '  3 passing (2m)\n')).toMatchObject({ ok: true, passed: 3 })
  expect(run('npx playwright test 2>&1 | tail -2', '  1 failed\n  3 passed (1.2m)\n')).toMatchObject({ ok: false, passed: 3, failed: 1 })
})

test('printing a quoted test command cannot record green tests', () => {
  expect(run("printf 'x; npm test'", ' 3 pass\n 0 fail')).toBe(null)
})

test('code or unknown-path edits record the time, including a mate or an error without deny', () => {
  for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
    const before = { ...EMPTY_BOARD, editedAt: 100 }
    const after = boardAfter(before, tool, {}, undefined, { text: '', isError: false, who: 'Młot' }, 200)
    expect(after.editedAt).toBe(200)
    expect(after.tasks).toBe(before.tasks)
    expect(before.editedAt).toBe(100)
    expect(boardAfter(before, tool, {}, undefined, { text: 'Error', isError: true, who: 'Krux' }, 300).editedAt).toBe(300)
    expect(boardAfter(before, tool, {}, { deny: 'blocked' }, undefined, 400)).toBe(before)
  }
  expect(boardAfter(EMPTY_BOARD, 'Edit', {}, undefined, undefined, 0).editedAt).toBe(0)
  expect(boardAfter(EMPTY_BOARD, 'Read', {}, undefined, undefined, 200)).toBe(EMPTY_BOARD)
})

test('documentation edits preserve test freshness and the last edit time regardless of extension case', () => {
  const before = { ...EMPTY_BOARD, test: { command: 'npm test', ok: true, passed: 3, failed: 0, failures: [], who: 'Krux' as const, at: 100 }, editedAt: 100 }
  for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
    for (const extension of ['md', 'mdx', 'txt', 'rst', 'adoc', 'MD', 'MdX', 'TXT', 'RsT', 'ADOC']) {
      const input = { [tool === 'NotebookEdit' ? 'notebook_path' : 'file_path']: `/work/docs/read me.${extension}` }
      expect(boardAfter(EMPTY_BOARD, tool, input, undefined, undefined, 200)).toBe(EMPTY_BOARD)
      for (const who of ['Krux', 'Młot'] as const) {
        for (const isError of [false, true]) {
          const after = boardAfter(before, tool, input, undefined, { text: '', isError, who }, 200)
          expect(after).toBe(before)
          expect(testsStale(after)).toBe(false)
        }
      }
    }
  }
})

test('documentation filtering uses the file suffix, while code, notebooks and unknown paths stay conservative', () => {
  for (const file_path of ['/work/docs/app.ts', '/work/readme.md.ts', '/work/.md/app.ts', '/work/notes.ipynb', '/work/README', '', null, 42]) {
    expect(boardAfter(EMPTY_BOARD, 'Edit', { file_path }, undefined, undefined, 200).editedAt).toBe(200)
  }
  expect(boardAfter(EMPTY_BOARD, 'NotebookEdit', { notebook_path: '/work/notes.ipynb' }, undefined, undefined, 200).editedAt).toBe(200)
  const stale = { ...EMPTY_BOARD, editedAt: 200 }
  expect(boardAfter(stale, 'Write', { file_path: '/work/README.md' }, undefined, undefined, 300)).toBe(stale)
})

test('test runs record their completion time and preserve the last edit', () => {
  const before = { ...EMPTY_BOARD, editedAt: 100 }
  const call = { text: '3 pass\n0 fail', isError: false, who: 'Krux' as const }
  const after = boardAfter(before, 'Bash', { command: 'npm test' }, undefined, call, 200)
  expect(after.test).toMatchObject({ ok: true, passed: 3, at: 200 })
  expect(after.editedAt).toBe(100)
  expect(boardAfter(after, 'Bash', { command: 'npm test' }, undefined, call, 300).test?.at).toBe(300)
  expect(boardAfter(after, 'Bash', { command: 'npm test' }, undefined, { ...call, isError: true }, 400).test).toMatchObject({ ok: false, at: 400 })
  expect(boardAfter(after, 'Bash', { command: 'npm test', run_in_background: true }, undefined, call, 500)).toBe(after)
  expect(boardAfter(after, 'Bash', { command: 'npm test' }, undefined, undefined, 500)).toBe(after)
  expect(boardAfter(after, 'Bash', { command: 'npm test' }, { deny: 'blocked' }, call, 500)).toBe(after)
})

test('TodoWrite starts running tasks once and preserves their time across list rewrites', () => {
  const first = boardAfter(EMPTY_BOARD, 'TodoWrite', { todos: [{ content: 'A', status: 'in_progress' }, { content: 'B', status: 'pending' }] }, undefined, undefined, 0)
  expect(first.tasks).toEqual([{ id: null, subject: 'A', status: 'in_progress', startedAt: 0 }, { id: null, subject: 'B', status: 'pending' }])
  const reordered = boardAfter(first, 'TodoWrite', { todos: [{ content: 'B', status: 'in_progress' }, { content: ' A ', status: 'in_progress' }] }, undefined, undefined, 100)
  expect(reordered.tasks).toEqual([{ id: null, subject: 'B', status: 'in_progress', startedAt: 100 }, { id: null, subject: 'A', status: 'in_progress', startedAt: 0 }])
  const stopped = boardAfter(reordered, 'TodoWrite', { todos: [{ content: 'A', status: 'completed' }, { content: 'B', status: 'pending' }] }, undefined, undefined, 200)
  expect(stopped.tasks).toEqual([{ id: null, subject: 'A', status: 'completed' }, { id: null, subject: 'B', status: 'pending' }])
  expect(boardAfter(stopped, 'TodoWrite', { todos: [{ content: 'A', status: 'in_progress' }] }, undefined, undefined, 300).tasks[0]?.startedAt).toBe(300)
  expect(first.tasks[0]?.startedAt).toBe(0)
})

test('TodoWrite preserves a running task start when only its subject changes', () => {
  const before: KruxBoard = { tasks: [{ id: null, subject: 'Old subject', status: 'in_progress', startedAt: 100 }, { id: null, subject: 'Next', status: 'pending' }], test: null }
  const after = boardAfter(before, 'TodoWrite', { todos: [{ content: 'New subject', status: 'in_progress' }, { content: 'Next', status: 'pending' }] }, undefined, undefined, 200)
  expect(after.tasks).toEqual([{ id: null, subject: 'New subject', status: 'in_progress', startedAt: 100 }, { id: null, subject: 'Next', status: 'pending' }])
  expect(before.tasks[0]?.subject).toBe('Old subject')
})

test('TodoWrite preserves distinct running starts when duplicate subjects change order', () => {
  const before: KruxBoard = { tasks: [{ id: null, subject: 'A', status: 'in_progress', startedAt: 100 }, { id: null, subject: 'A', status: 'pending' }, { id: null, subject: 'A', status: 'in_progress', startedAt: 150 }], test: null }
  const after = boardAfter(before, 'TodoWrite', { todos: [{ content: 'A', status: 'pending' }, { content: 'A', status: 'in_progress' }, { content: 'A', status: 'in_progress' }, { content: 'A', status: 'in_progress' }] }, undefined, undefined, 200)
  expect(after.tasks).toEqual([{ id: null, subject: 'A', status: 'pending' }, { id: null, subject: 'A', status: 'in_progress', startedAt: 100 }, { id: null, subject: 'A', status: 'in_progress', startedAt: 150 }, { id: null, subject: 'A', status: 'in_progress', startedAt: 200 }])
})

test('TaskUpdate keeps startedAt while running, clears it on status change and restarts it on reentry', () => {
  const pending = boardAfter(EMPTY_BOARD, 'TaskCreate', { subject: 'A' }, { task: { id: '1' } }, undefined, 10)
  const running = boardAfter(pending, 'TaskUpdate', { taskId: '1', status: 'in_progress' }, undefined, undefined, 100)
  expect(running.tasks[0]).toEqual({ id: '1', subject: 'A', status: 'in_progress', startedAt: 100 })
  expect(boardAfter(running, 'TaskUpdate', { taskId: '1', subject: 'B', status: 'in_progress' }, undefined, undefined, 200).tasks[0]).toEqual({ id: '1', subject: 'B', status: 'in_progress', startedAt: 100 })
  expect(boardAfter(running, 'TaskUpdate', { taskId: '1', subject: 'B', status: 'blocked' }, undefined, undefined, 200).tasks[0]?.startedAt).toBe(100)
  for (const status of ['completed', 'pending']) {
    const stopped = boardAfter(running, 'TaskUpdate', { taskId: '1', status }, undefined, undefined, 300)
    expect(stopped.tasks[0]).toEqual({ id: '1', subject: 'A', status })
    expect(boardAfter(stopped, 'TaskUpdate', { taskId: '1', status: 'in_progress' }, undefined, undefined, 400).tasks[0]?.startedAt).toBe(400)
  }
  expect(boardAfter(running, 'TaskUpdate', { taskId: '1', status: 'completed' }, { success: false }, undefined, 300)).toBe(running)
  expect(boardAfter(running, 'TaskUpdate', { taskId: '1', status: 'completed' }, undefined, { text: 'Error', isError: true, who: 'Krux' }, 300)).toBe(running)
})

test('history without timestamps never invents edit, test or task times', () => {
  const board = replayBoard([{ role: 'assistant', text: '', toolUses: [
    { tool: 'Edit', input: {} },
    { tool: 'TodoWrite', input: { todos: [{ content: 'A', status: 'in_progress' }] }, result: {} },
    { tool: 'Bash', input: { command: 'npm test' }, text: '3 pass' },
  ] }])
  expect(board.editedAt).toBeUndefined()
  expect(board.test?.at).toBeUndefined()
  expect(board.tasks[0]?.startedAt).toBeUndefined()
})

const GREEN: KruxBoard = { tasks: [], test: { command: 'npm test', ok: true, passed: 301, failed: 0, failures: [], who: 'Krux', at: 100 }, editedAt: 100 }
const GIT: KruxGit = { branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0, changed: 1, untracked: 0, conflicted: 0, files: [], commits: [], whitespace: true }

test('testsStale needs a run and a strictly later edit, including a zero timestamp', () => {
  const cases: { board: KruxBoard; stale: boolean }[] = [
    { board: EMPTY_BOARD, stale: false },
    { board: { ...EMPTY_BOARD, editedAt: 200 }, stale: false },
    { board: { tasks: [], test: GREEN.test }, stale: false },
    { board: { ...GREEN, editedAt: null }, stale: false },
    { board: { ...GREEN, editedAt: 0 }, stale: false },
    { board: GREEN, stale: false },
    { board: { ...GREEN, editedAt: 101 }, stale: true },
    { board: { ...GREEN, test: { ...GREEN.test!, at: undefined }, editedAt: 200 }, stale: false },
    { board: { ...GREEN, test: { ...GREEN.test!, at: 0 }, editedAt: 1 }, stale: true },
    { board: { ...GREEN, test: { ...GREEN.test!, ok: false }, editedAt: 101 }, stale: true },
  ]
  for (const item of cases) expect(testsStale(item.board)).toBe(item.stale)
})

test('stuckMinutes starts at 15 minutes, rounds down and only measures running tasks with a start', () => {
  const running: KruxTask = { id: null, subject: 'A', status: 'in_progress', startedAt: 0 }
  expect(stuckMinutes(running, 15 * 60_000 - 1)).toBe(null)
  expect(stuckMinutes(running, 15 * 60_000)).toBe(15)
  expect(stuckMinutes(running, 16 * 60_000 - 1)).toBe(15)
  expect(stuckMinutes(running, 16 * 60_000)).toBe(16)
  expect(stuckMinutes({ ...running, startedAt: 100 }, 0)).toBe(null)
  expect(stuckMinutes({ ...running, startedAt: undefined }, 20 * 60_000)).toBe(null)
  expect(stuckMinutes({ ...running, status: 'pending' }, 20 * 60_000)).toBe(null)
  expect(stuckMinutes({ ...running, status: 'completed' }, 20 * 60_000)).toBe(null)
})

test('readiness accepts green fresh tests, no conflicts and unknown or clean whitespace', () => {
  for (const whitespace of [true, null, undefined]) expect(readiness(GREEN, { ...GIT, whitespace })).toEqual({ ready: true, missing: [] })
  expect(readiness(GREEN, { ...GIT, changed: 0, untracked: 1, ahead: 2, behind: 3 })).toEqual({ ready: true, missing: [] })
  expect(readiness(GREEN, null)).toEqual({ ready: false, missing: ['brak repo'] })
})

test('readiness lists every blocker, including stale failing tests', () => {
  expect(readiness(EMPTY_BOARD, GIT)).toEqual({ ready: false, missing: ['brak testów'] })
  expect(readiness({ ...GREEN, editedAt: 101 }, GIT)).toEqual({ ready: false, missing: ['testy nieświeże'] })
  expect(readiness({ ...GREEN, test: { ...GREEN.test!, ok: false } }, GIT)).toEqual({ ready: false, missing: ['testy padłe'] })
  expect(readiness(GREEN, { ...GIT, whitespace: false })).toEqual({ ready: false, missing: ['białe znaki'] })
  expect(readiness(GREEN, { ...GIT, conflicted: 2 })).toEqual({ ready: false, missing: ['konflikty: 2'] })
  expect(readiness({ ...GREEN, test: { ...GREEN.test!, ok: false }, editedAt: 101 }, { ...GIT, whitespace: false, conflicted: 2 })).toEqual({ ready: false, missing: ['testy padłe', 'testy nieświeże', 'białe znaki', 'konflikty: 2'] })
})

test('returnNote joins only known board, thread and repo state into one line', () => {
  const threads = { next: 3, items: [{ id: 1, kind: 'todo' as const, text: 'A' }, { id: 2, kind: 'risk' as const, text: 'B' }] }
  const board: KruxBoard = { ...GREEN, tasks: [{ id: null, subject: 'A', status: 'completed' }, { id: null, subject: 'B', status: 'pending' }] }
  const empty = { next: 1, items: [] }
  expect(returnNote(EMPTY_BOARD, empty, null)).toBe('')
  expect(returnNote(board, threads, null)).toBe('Plan 1/2 · testy ✓ 301 · wątki 2')
  expect(returnNote({ ...EMPTY_BOARD, tasks: board.tasks }, empty, null)).toBe('Plan 1/2')
  expect(returnNote(EMPTY_BOARD, threads, null)).toBe('wątki 2')
  expect(returnNote(EMPTY_BOARD, empty, { ...GIT, changed: 0 })).toBe('git ✓ main')
  expect(returnNote(EMPTY_BOARD, empty, { ...GIT, branch: 'topic\nbranch', ahead: 2, behind: 1, untracked: 3, conflicted: 1 })).toBe('git topic branch ↑2 ↓1 ●1 +3 ✗1')
})

test('returnNote preserves failed and stale run signs and omits unknown counts', () => {
  const empty = { next: 1, items: [] }
  expect(returnNote({ ...GREEN, editedAt: 101 }, empty, null)).toBe('testy ✓ 301 ◌ nieświeże')
  expect(returnNote({ ...GREEN, test: { ...GREEN.test!, ok: false, failed: 2 } }, empty, null)).toBe('testy ✗ 2 padły · 301 przeszło')
  expect(returnNote({ ...GREEN, test: { ...GREEN.test!, passed: null, failed: null } }, empty, null)).toBe('testy ✓')
  expect(returnNote({ ...GREEN, test: { ...GREEN.test!, ok: false, passed: null, failed: null }, editedAt: 101 }, empty, null)).toBe('testy ✗ ◌ nieświeże')
})
