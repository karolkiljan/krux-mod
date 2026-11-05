import { expect, test } from 'claude-code/testing'

import type { KruxBoard, KruxGit, KruxTestRun } from '../types'
import { factsLine, groundingGate, mismatches } from '../hooks/grounding'
import type { Facts } from '../hooks/grounding'

const RUN: KruxTestRun = { command: 'npm test', ok: true, passed: 52, failed: 0, failures: [], who: 'Krux', at: 1_000 }
const BOARD: KruxBoard = { tasks: [], test: RUN }
const GIT: KruxGit = { branch: 'feat/cache', upstream: 'origin/feat/cache', ahead: 0, behind: 0, changed: 0, untracked: 0, conflicted: 0, files: [], commits: [], whitespace: true } as unknown as KruxGit
const FRESH: Facts = { board: BOARD, stale: false, git: GIT }

test('a green claim stands only on a fresh green run from this session', () => {
  const claim = 'Krux już naprawić walidację. Testy przechodzą.'
  expect(mismatches(claim, FRESH)).toEqual([])
  // Przebieg w tle zna tylko model, więc powód mówi, czego mod nie widział, a nie, że testów nie było.
  expect(mismatches(claim, { ...FRESH, board: { tasks: [], test: null } })[0]).toContain('mod nie widział w tej sesji przebiegu testów z wynikiem (przebiegu w tle nie widzi)')
  expect(mismatches(claim, { ...FRESH, board: { tasks: [], test: { ...RUN, ok: false, passed: 50, failed: 2 } } })[0]).toContain('przebieg na tablicy moda (npm test) padł: padłe 2')
  expect(mismatches(claim, { ...FRESH, stale: true })[0]).toContain('nieświeży')
  // Orkowe „przejść”, kanarek i „wszystko zielone” to też twierdzenie o zielonych testach.
  for (const text of ['Testy przejść.', 'Kanarek śpiewać, testy zielone.', 'Wszystko zielone.', 'All tests pass.']) {
    expect([text, mismatches(text, { ...FRESH, board: { tasks: [], test: null } }).length]).toEqual([text, 1])
  }
})

test('soft, mixed, quoted and coded sentences are no green claims', () => {
  const none = { ...FRESH, board: { tasks: [], test: null } }
  for (const text of [
    'Testy powinny przejść po tej zmianie.',
    'Jeśli testy przejdą, Krux wypchnąć gałąź.',
    'Czy testy przechodzą?',
    'Krux jeszcze nie sprawdzić, czy testy przechodzą.',
    'Krux zaraz puścić testy, potem zielone albo smród.',
    '2 testy nie przejść, 50 przejść.',
    'Morra napisać: „testy przechodzą u mnie".',
    'Wynik: `52 passed`.',
    '> testy przechodzą',
  ]) expect([text, mismatches(text, none)]).toEqual([text, []])
})

// Bramka zatrzymuje turę, więc fałszywy alarm kosztuje rundę modelu i uczy go prostować prawdę:
// kolor, przejście pętli, wersja i ruch przez gałęzie to nie przebieg testów.
test('colours, loop passes, versions and moves through code are no test claims', () => {
  const none = { ...FRESH, board: { tasks: [], test: null } }
  for (const text of [
    'Zestawienie zielonych pól w tabeli.',
    'Testowy przycisk zielony w stopce.',
    'Test sprawdza, że funkcja zwraca zielony kolor.',
    'Test przechodzi przez wszystkie gałęzie warunku.',
  ]) expect([text, mismatches(text, none)]).toEqual([text, []])
  for (const text of [
    'Krux dodać 2 zielone przyciski w panelu.',
    'Pętla kończyć po 1 przejściu.',
    'Wersja 2 przechodzi na fetch.',
    'Test 2 przechodzi na Linuksie.',
    'W 2 przejściach parser czytać plik.',
  ]) expect([text, mismatches(text, FRESH)]).toEqual([text, []])
  // Przebieg w CI i po poprawce to dalej twierdzenie o zielonych testach.
  for (const text of ['Testy przechodzą w CI.', 'Smoke test przeszedł w CI.', 'Testy zielone po poprawce.']) {
    expect([text, mismatches(text, none).length]).toEqual([text, 1])
  }
})

test('a count of passed tests has to match the last run', () => {
  expect(mismatches('52 testy przechodzą.', FRESH)).toEqual([])
  expect(mismatches('Krux puścić npm test: 52 na 52 przejść.', FRESH)).toEqual([])
  const fifty = { ...FRESH, board: { tasks: [], test: { ...RUN, ok: false, passed: 50, failed: 2 } } }
  expect(mismatches('50 przejść, 2 padać w cache.test.js.', fifty)).toEqual([])
  expect(mismatches('52 testy przechodzą.', fifty).some(line => line.includes('podał przeszłe: 50'))).toBe(true)
  // Mieszane zdanie z porażką nie jest „zielono”, ale liczba w nim dalej musi się zgadzać.
  expect(mismatches('51 przejść, 1 padać.', fifty)).toEqual([expect.stringContaining('podał przeszłe: 50')])
  // Podsumowanie dwóch zestawów: liczba ostatniego przebiegu stoi obok, więc druga to inny zestaw.
  const scripts = { ...FRESH, board: { tasks: [], test: { ...RUN, command: 'node --test tests/scripts-regression.mjs', passed: 46 } } }
  expect(mismatches('721 testów zielonych, skrypty 46/46.', scripts)).toEqual([])
  expect(mismatches('721 testów zielonych.', scripts)[0]).toContain('podał przeszłe: 46')
})

test('pushed and clean claims stand on the git read', () => {
  const ahead = { ...FRESH, git: { ...GIT, ahead: 2 } }
  expect(mismatches('Krux już wypchnąć gałąź.', ahead)[0]).toContain('niewypchnięte commity: 2')
  expect(mismatches('Krux już wypchnąć gałąź.', FRESH)).toEqual([])
  expect(mismatches('Push padać: token nieważny.', ahead)).toEqual([])
  expect(mismatches('Krux nie wypchnąć gałęzi.', ahead)).toEqual([])
  expect(mismatches('Gałąź wypchnięta.', ahead)[0]).toContain('niewypchnięte commity: 2')
  // Propozycja wypchnięcia pada właśnie wtedy, gdy commity czekają: to nie twierdzenie.
  for (const text of [
    'Commit gotowy. Do wypchnięcia: 2 commity.',
    'Wypchnąć teraz czy po review — Morra wybiera.',
    'Następny krok: wypchnąć gałąź i otworzyć PR.',
    'The branch is not pushed yet.',
  ]) expect([text, mismatches(text, ahead)]).toEqual([text, []])
  // Bez upstreamu liczą się commity spoza zdalnych.
  const local = { ...FRESH, git: { ...GIT, upstream: null, commits: [{ hash: 'a', subject: 'x', pushed: false }, { hash: 'b', subject: 'y', pushed: true }] } }
  expect(mismatches('Commit wypchnięty.', local)[0]).toContain('niewypchnięte commity: 1')
  const dirty = { ...FRESH, git: { ...GIT, changed: 3, untracked: 1 } }
  expect(mismatches('Drzewo czyste, wszystko zacommitowane.', dirty)[0]).toContain('zmienione pliki: 3, nowe: 1')
  expect(mismatches('Brak zmian w API.', dirty)).toEqual([])
  // Bez odczytu gita nic nie wiadomo, więc nic nie blokuje.
  expect(mismatches('Krux już wypchnąć gałąź.', { ...FRESH, git: null })).toEqual([])
})

test('the gate tells the model what to fix, without apologies and with ASCII-closed quotes', () => {
  expect(groundingGate('Krux już naprawić walidację. Testy przechodzą.', FRESH)).toBe(null)
  const reason = groundingGate('Testy przechodzą. Krux już wypchnąć gałąź.', { board: { tasks: [], test: null }, stale: false, git: { ...GIT, ahead: 1 } })!
  expect(reason).toContain('Bramka faktów')
  expect(reason).toContain('sprawdź to narzędziem albo dopisz krótką poprawkę')
  expect(reason).toContain('Bez przeprosin')
  expect(reason.split('„').length - 1).toBe(2)
  expect(reason).not.toMatch(/[”“«»]/u)
})

test('the facts line states the last run and the repo, and says nothing without either', () => {
  expect(factsLine({ board: { tasks: [], test: null }, stale: false, git: null })).toBe(null)
  const line = factsLine({ board: { tasks: [], test: { ...RUN, ok: false, passed: 50, failed: 2 } }, stale: true, git: { ...GIT, changed: 3, untracked: 1, ahead: 2 } })!
  expect(line).toContain('przebieg na tablicy npm test czerwony (przeszło 50, padło 2), nieświeży: po nim edycja kodu')
  expect(line).toContain('repo: gałąź feat/cache, zmienione 3, nowe 1, niewypchnięte commity 2')
  expect(factsLine({ board: { tasks: [], test: null }, stale: false, git: GIT })).toContain('testy: mod nie widział w tej sesji przebiegu z wynikiem (przebiegu w tle nie widzi)')
  expect(line).not.toMatch(/[”“«»]/u)
  // Komenda z heredoca nie łamie linii: model dostaje ją w jednym wierszu.
  const heredoc = factsLine({ board: { tasks: [], test: { ...RUN, command: "python3 - <<'EOF'\nimport pathlib\nEOF\nclaude plugin test ." } }, stale: false, git: null })!
  expect(heredoc).toContain("przebieg na tablicy python3 - <<'EOF' import pathlib EOF")
  expect(heredoc).not.toContain('\n')
})
