import { expect, test } from 'claude-code/testing'

import type { KruxBoard, KruxGit, KruxLore, KruxThreads } from '../types'
import { dayReport } from '../hooks/report'

const board: KruxBoard = { tasks: [], test: null }
const threads: KruxThreads = { next: 1, items: [] }
const lore: KruxLore = {
  testRuns: 0, testFails: 0, builds: 0, buildFails: 0,
  commits: 0, tears: 0, edits: 0, uiEdits: 0,
  last: null, lastMate: null, quietTurns: 0,
}
const git: KruxGit = {
  branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0,
  changed: 0, untracked: 0, conflicted: 0, files: [], commits: [],
}

test('a daily report without reportable data is one neutral Polish line', () => {
  expect(dayReport(null, board, threads, lore)).toBe('Brak danych do raportu dnia.')
  expect(dayReport(git, board, threads, lore)).toBe('Brak danych do raportu dnia.')
  expect(dayReport(null, board, threads, { ...lore, quietTurns: 7, lastMate: 'Grom', edits: 3 }))
    .toBe('Brak danych do raportu dnia.')
})

test('the daily report contains each populated section in neutral Polish', () => {
  const data = {
    git: { ...git, commits: [{ hash: 'a1b2c3d', subject: 'Dodaj raport dnia', pushed: false }] },
    board: {
      tasks: [
        { id: '1', subject: 'Dodać raport', status: 'completed' },
        { id: '2', subject: 'Sprawdzić Żółć', status: 'in_progress' },
        { id: null, subject: 'Wpiąć komendy', status: 'pending' },
      ],
      test: { command: 'npm test', ok: true, passed: 42, failed: 0, failures: [], who: 'Krux' },
    } satisfies KruxBoard,
    threads: { next: 8, items: [
      { id: 5, kind: 'todo', text: 'Uzupełnić opis' },
      { id: 6, kind: 'risk', text: 'Sprawdzić migrację' },
      { id: 7, kind: 'ask', text: 'Wybrać termin wdrożenia' },
    ] } satisfies KruxThreads,
    lore: { ...lore, testRuns: 3, testFails: 1, commits: 2, tears: 1 },
  }
  const before = JSON.stringify(data)
  expect(dayReport(data.git, data.board, data.threads, data.lore)).toBe([
    '## Commity',
    '- a1b2c3d Dodaj raport dnia',
    '',
    '## Ostatni przebieg testów',
    'Komenda: npm test',
    'Wynik: zaliczony',
    'Wykonawca: Krux',
    'Zaliczone: 42',
    'Nieudane: 0',
    '',
    '## Plan',
    'Zrobione: 1/3',
    '- [x] Dodać raport',
    '- [ ] Sprawdzić Żółć (w toku)',
    '- [ ] Wpiąć komendy',
    '',
    '## Otwarte wątki',
    '- #5 [do zrobienia] Uzupełnić opis',
    '- #6 [ryzyko] Sprawdzić migrację',
    '- #7 [czeka na decyzję] Wybrać termin wdrożenia',
    '',
    '## Podsumowanie sesji',
    'Przebiegi testów: 3 (nieudane: 1)',
    'Commity: 2',
    'Rozbiórki: 1',
  ].join('\n'))
  expect(JSON.stringify(data)).toBe(before)
})

test('the commit section preserves hashes, subjects and newest-first order up to ten', () => {
  const commits = Array.from({ length: 12 }, (_, i) => ({ hash: `hash-${i + 1}`, subject: `Zmiana Żółci ${i + 1}`, pushed: i > 0 }))
  const report = dayReport({ ...git, commits }, board, threads, lore)
  expect(report.split('\n')).toHaveLength(11)
  expect(report).toContain('- hash-1 Zmiana Żółci 1\n- hash-2 Zmiana Żółci 2')
  expect(report).toContain('- hash-10 Zmiana Żółci 10')
  expect(report).not.toContain('hash-11')
  expect(report).not.toContain('hash-12')
  expect(report).not.toContain('## Plan')
})

test('failed tests include the command, result, known counts, runner and every failure', () => {
  const testRun = { command: 'claude plugin test .', ok: false, passed: 0, failed: 2, failures: ['pierwszy test', 'test Żółci'], who: 'Młot' as const }
  expect(dayReport(null, { ...board, test: testRun }, threads, lore)).toBe([
    '## Ostatni przebieg testów',
    'Komenda: claude plugin test .',
    'Wynik: nieudany',
    'Wykonawca: Młot',
    'Zaliczone: 0',
    'Nieudane: 2',
    'Nieudane testy:',
    '- pierwszy test',
    '- test Żółci',
  ].join('\n'))
})

test('unknown test counts are omitted instead of reported as zero or null', () => {
  expect(dayReport(null, { ...board, test: {
    command: 'pytest -q', ok: false, passed: null, failed: null, failures: [], who: 'ork',
  } }, threads, lore)).toBe([
    '## Ostatni przebieg testów',
    'Komenda: pytest -q',
    'Wynik: nieudany',
    'Wykonawca: ork',
  ].join('\n'))
})

test('each test count is independently optional', () => {
  const testRun = { command: 'npm test', ok: true, passed: null, failed: 0, failures: [], who: 'Krux' as const }
  const onlyFailed = dayReport(null, { ...board, test: testRun }, threads, lore)
  expect(onlyFailed).toContain('Nieudane: 0')
  expect(onlyFailed).not.toContain('Zaliczone:')
  const onlyPassed = dayReport(null, { ...board, test: { ...testRun, passed: 8, failed: null } }, threads, lore)
  expect(onlyPassed).toContain('Zaliczone: 8')
  expect(onlyPassed).not.toContain('Nieudane:')
})

test('plans report the number completed for both pending and fully completed plans', () => {
  const task = { id: null, subject: 'Wpiąć raport', status: 'pending' as const }
  expect(dayReport(null, { ...board, tasks: [task] }, threads, lore)).toBe('## Plan\nZrobione: 0/1\n- [ ] Wpiąć raport')
  expect(dayReport(null, { ...board, tasks: [{ ...task, status: 'completed' }] }, threads, lore))
    .toBe('## Plan\nZrobione: 1/1\n- [x] Wpiąć raport')
})

test('open threads appear without unrelated empty sections', () => {
  expect(dayReport(null, board, { next: 13, items: [{ id: 12, kind: 'todo', text: 'Sprawdzić API' }] }, lore))
    .toBe('## Otwarte wątki\n- #12 [do zrobienia] Sprawdzić API')
})

test('each reportable lore counter can supply the summary by itself', () => {
  const cases: { lore: KruxLore; tests: number; failed: number; commits: number; tears: number }[] = [
    { lore: { ...lore, testRuns: 1 }, tests: 1, failed: 0, commits: 0, tears: 0 },
    { lore: { ...lore, testFails: 1 }, tests: 0, failed: 1, commits: 0, tears: 0 },
    { lore: { ...lore, commits: 1 }, tests: 0, failed: 0, commits: 1, tears: 0 },
    { lore: { ...lore, tears: 1 }, tests: 0, failed: 0, commits: 0, tears: 1 },
  ]
  for (const entry of cases) {
    expect(dayReport(null, board, threads, entry.lore)).toBe([
      '## Podsumowanie sesji',
      `Przebiegi testów: ${entry.tests} (nieudane: ${entry.failed})`,
      `Commity: ${entry.commits}`,
      `Rozbiórki: ${entry.tears}`,
    ].join('\n'))
  }
})
