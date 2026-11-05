// Tablica Sztolni: stan roboty zamiast statystyki. Plan z narzędzi listy zadań
// (`TodoWrite`, `TaskCreate`, `TaskUpdate`), czasy edycji i przebiegów testów. Diff
// i drzewo zmian rysuje silnik (`/diff`), więc tablica ich nie dubluje. Czyste funkcje.

import type { SessionUsage } from 'claude-code'

import type { KruxBoard, KruxGit, KruxTask, KruxTestRun, KruxThreads, KruxUsage } from '../types'
import { gitBusy, gitShort } from './git'
import type { HistoryMessage } from './lore'
import { isBackgroundToolCall } from './outcome'
import { workOf } from './voice'

export const EMPTY_BOARD: KruxBoard = { tasks: [], test: null }

type TaskStatus = KruxTask['status']

const STATUSES: ReadonlySet<string> = new Set(['pending', 'in_progress', 'completed'])

function statusOf(value: unknown): TaskStatus | null {
  return typeof value === 'string' && STATUSES.has(value) ? (value as TaskStatus) : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// Czas startu należy do jednego statusu: powtórzenie go nie resetuje zegara.
function taskStatus(task: KruxTask, status: TaskStatus, now?: number): KruxTask {
  if (task.status === status) return task
  const { startedAt: _startedAt, ...rest } = task
  return { ...rest, status, ...(status === 'in_progress' && now !== undefined ? { startedAt: now } : {}) }
}

// Co czytamy z wyniku wywołania: tekst, który dostał model, błąd i kto wołał.
export type BoardCall = { text: string; isError: boolean; who: KruxTestRun['who'] }

// Najwyżej tyle nazw padających testów; reszta czeka w transkrypcie.
const FAILURES_LIMIT = 5

// Linia padającego testu w popularnych runnerach: bun, jest, vitest, mocha, TAP,
// reporter `node --test` (`✖`), go (`--- FAIL:`), unittest (`FAIL:`, `ERROR: test (moduł…)`),
// pytest (`ERROR plik::test`, błąd kolekcji `ERROR plik.py`), cargo bez kompilacji
// (`error: could not compile`). Gołe `ERROR` to log albo bundler, nie test.
const FAILURE_LINE = /^\s*(?:\(fail\)|✗|✕|✖|×|--- FAIL:|FAIL(?:ED)?(?!\p{L}):?|ERROR:(?=\s+\S+\s+\()|ERROR(?=\s+\S+::|\s+\S+\.py(?:\s+-\s|\s*$))|error:(?=\s+could not compile\b)|not ok \d+(?: -)?)\s*(.*)$/u

// Nazwa przed wynikiem: cargo (`test tests::bad ... FAILED`), deno (`fails ... FAILED (3ms)`).
const FAILED_AFTER = [/^test (\S+) \.\.\. FAILED$/u, /^\s*(.+?) \.\.\. FAILED \(\d+(?:\.\d+)?m?s\)$/u]

// Czas na końcu nazwy: `[3ms]`, `(5 ms)`, `(0.00s)`, `4ms`.
const TIMING = /\s*(?:\[\d+(?:\.\d+)?\s*m?s\]|\(\d+(?:\.\d+)?\s*m?s\)|\d+(?:\.\d+)?m?s)$/u

// Test `todo` albo `skip` nie pada: dyrektywa TAP (`not ok 2 - x # TODO`) i reporter
// `node --test`, który po czasie pisze samą wiadomość dyrektywy (`✖ x (0.5ms) # not yet`).
const DIRECTIVE = /(?:^|\s)#\s*(?:todo|skip)\b|\(\d+(?:\.\d+)?ms\) # /iu

// Nazwa bez czasu, bez reszty po tabulatorze (go: pakiet, czas) i bez czasu nextest
// na początku (`FAIL [   0.003s] crate tests::b`). Pusta, podsumowanie w nawiasie
// (`FAILED (failures=1)`), nagłówek z dwukropkiem (`✖ failing tests:`), podsumowanie
// deno (`FAILED | 1 passed | 1 failed`) i ESLint bez błędów (`✖ 1 problem (0 errors, …)`) to nie test.
function failureName(line: string): string | null {
  const raw = FAILURE_LINE.exec(line)?.[1] ?? FAILED_AFTER.map(pattern => pattern.exec(line)?.[1]).find(name => name !== undefined)
  if (raw === undefined || DIRECTIVE.test(raw)) return null
  const name = raw.split('\t')[0]!.replace(TIMING, '').replace(/^\[\s*\d+(?:\.\d+)?s\]\s*/u, '').trim()
  return name === '' || name.startsWith('(') || name.startsWith('|') || name.endsWith(':') || /^\d+ problems? \(0 errors?,/u.test(name) ? null : name
}

// Linia podsumowania to same frazy `liczba słowo`, etykiety runnerów, czasy i separatory
// (`Tests:  1 failed, 12 passed, 13 total`, `=== 2 passed in 0.12s ===`, ` 3 pass`,
// `ok | 2 passed | 0 failed (10ms)`). Log, nazwa testu i komunikat zostawiają inne słowa
// („b_test.go:3: 3 failed attempts”, „batch done: 2 failed, 8 ok”), więc liczb nie dają.
const SUMMARY_LABELS: ReadonlySet<string> = new Set(['test', 'tests', 'files', 'suites', 'summary', 'run', 'ok', 'failed'])

// Prefiks strumienia przed linią runnera: turbo (`web:test: `), `pnpm -r` (`packages/web test: `),
// docker compose (`app-1  | `). Tylko od pierwszej kolumny i z nazwą zadania, więc wcięty log
// (`    b_test.go:3: …`) i goła linia („batch done: 2 failed, 8 ok”) zostają logiem.
const STREAM_PREFIX = /^(?:[\w@./-]+:[\w:.-]+: |[\w@.-]*\/[\w@./-]+ [\w:.-]+: |[\w.-]+ +\| )/u

// Gradle (`2 tests completed, 1 failed`) i XCTest (`Executed 3 tests, with 1 failure (0 unexpected)
// in 0.002 (0.002) seconds`) mają w podsumowaniu własne słowa; czas mocha i playwright bywa w minutach (`(2m)`).
function isSummary(line: string): boolean {
  const rest = line
    .replace(/^\d+ tests? completed,/u, ' ')
    .replace(/\bExecuted \d+ tests?, with \d+ failures? \(\d+ unexpected\) in [\d.]+ \([\d.]+\) seconds$/u, ' ')
    .replace(/\bin \d+(?:\.\d+)?s\b(?:\s*\(\d+:\d{2}:\d{2}\))?/gu, ' ')
    .replace(/[[(]\s*\d+(?:\.\d+)?\s*(?:m?s|m)\s*[\])]/gu, ' ')
    .replace(/\(\d+\)/gu, ' ')
    .replace(/(?<![\p{L}\d])\d+ \p{L}+/gu, ' ')
    .replace(/[=,|:;#!.()\-\s]+/gu, ' ')
    .trim()
  return rest === '' || rest.split(' ').every(word => SUMMARY_LABELS.has(word.toLowerCase()))
}

// `node --test` pisze liczbę po słowie: `# pass 4` w TAP, `ℹ pass 4` w domyślnym reporterze.
const TAP_COUNT = /^(?:#|ℹ) (pass|fail) (\d+)$/u
const PASSED = /(?<![\p{L}\d])(\d+) pass(?:ed|ing)?(?!\p{L})/gu
// Błędy pytest (`1 failed, 2 errors in 0.20s`, błąd kolekcji `1 error in 0.06s`) psują przebieg jak padłe testy.
const FAILED = /(?<![\p{L}\d])(\d+) (?:fail(?:ed|ing|ures?)?(?!\p{L})|errors?(?= in \d))/gu

// Ostatnia linia podsumowania z tą liczbą: podsumowanie stoi na końcu, a wcześniejsze
// to pliki albo zestawy. Frazy w jednej linii się sumują (padłe i błędy pytest).
function lastCount(lines: readonly string[], word: 'pass' | 'fail', pattern: RegExp): number | null {
  let found: number | null = null
  for (const line of lines) {
    const tap = TAP_COUNT.exec(line)
    if (tap !== null) {
      if (tap[1] === word) found = Number(tap[2])
      continue
    }
    if (!isSummary(line)) continue
    const counts = [...line.matchAll(pattern)]
    if (counts.length > 0) found = counts.reduce((sum, count) => sum + Number(count[1]), 0)
  }
  return found
}

// Liczba po słowie, linia na projekt albo przebieg: dotnet (`Failed!  - Failed:     1, Passed:     5, …`)
// i phpunit (`Tests: 4, Assertions: 4, Errors: 1, Failures: 1.`, bez liczby zaliczonych).
function labeledCounts(lines: readonly string[]): { passed: number | null; failed: number | null } {
  let passed: number | null = null
  let failed: number | null = null
  for (const line of lines) {
    const dotnet = /^\s*(?:Failed|Passed)!\s+-\s+Failed:\s+(\d+),\s+Passed:\s+(\d+),/u.exec(line)
    if (dotnet !== null) {
      passed = (passed ?? 0) + Number(dotnet[2])
      failed = (failed ?? 0) + Number(dotnet[1])
    }
    const phpunit = /^Tests: \d+, Assertions: \d+((?:, [\w ]+: \d+)*)\.$/u.exec(line)
    if (phpunit !== null) failed = [...phpunit[1]!.matchAll(/\b(?:Errors|Failures): (\d+)/gu)].reduce((sum, count) => sum + Number(count[1]), failed ?? 0)
  }
  return { passed, failed }
}

// Cargo pisze podsumowanie na każdy binarny test: liczby się sumują.
function cargoCounts(output: string): { passed: number; failed: number } | null {
  const lines = [...output.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed/gu)]
  if (lines.length === 0) return null
  return { passed: lines.reduce((sum, line) => sum + Number(line[1]), 0), failed: lines.reduce((sum, line) => sum + Number(line[2]), 0) }
}

// Unittest rozdziela nieudane asercje i błędy testów; oba psują przebieg.
function unittestFailures(output: string): number | null {
  let failed: number | null = null
  for (const summary of output.matchAll(/^FAILED\s*\(([^)]*)\)\s*$/gmu)) {
    const counts = [...summary[1]!.matchAll(/\b(?:failures|errors)=(\d+)\b/gu)]
    if (counts.length > 0) failed = counts.reduce((sum, count) => sum + Number(count[1]), 0)
  }
  return failed
}

// Sekwencje CSI (kolory): przy wymuszonych kolorach (`--color=yes`, `FORCE_COLOR`)
// stoją przed liczbami i znacznikami, więc parser czyta tekst bez nich.
const ANSI = /\x1b\[[0-?]*[ -\/]*[@-~]/gu

// Przebieg testów z wyjścia komendy: liczby, gdy runner je podał, i nazwy padających.
// Padłe testy w wyjściu wygrywają z kodem 0: `npm test | tail` kończy się kodem `tail`.
export function testRunOf(command: string, call: BoardCall): KruxTestRun {
  const output = call.text.replace(ANSI, '')
  const lines = output.split(/\r?\n/u).map(line => line.replace(STREAM_PREFIX, ''))
  const failures = [...new Set(lines.flatMap(line => failureName(line) ?? []))]
  const cargo = cargoCounts(output)
  const labeled = labeledCounts(lines)
  const passed = cargo?.passed ?? labeled.passed ?? lastCount(lines, 'pass', PASSED)
  const failed = cargo?.failed ?? unittestFailures(output) ?? labeled.failed ?? lastCount(lines, 'fail', FAILED)
  return {
    command,
    ok: !call.isError && !(failed !== null && failed > 0) && failures.length === 0,
    passed,
    failed,
    failures: failures.slice(0, FAILURES_LIMIT),
    who: call.who,
  }
}

// Czy przebieg przeszedł, z tej samej oceny co tablica: kronika i Sztolnia
// nie mogą się różnić co do koloru testów.
export function testPassed(output: string, isError: boolean): boolean {
  return testRunOf('', { text: output, isError, who: 'Krux' }).ok
}

// Zielony przebieg, który obejmuje mniej testów niż czerwony przed nim i idzie inną komendą, to jego
// wycinek (`pytest --lf`, `npm test -- a.test.ts`, inny mniejszy zestaw), nie cały zestaw. Ta sama
// komenda to ten sam zestaw, choćby testów ubyło; bez liczby przeszłych zakresu nie znamy.
function narrower(run: KruxTestRun, before: KruxTestRun | null): boolean {
  if (before === null || before.ok || !run.ok) return false
  if (oneLine(run.command) === oneLine(before.command)) return false
  const total = (one: KruxTestRun) => (one.passed === null ? null : one.passed + (one.failed ?? 0))
  const now = total(run)
  const then = total(before)
  return now !== null && then !== null && now < then
}

function oneLine(command: string): string {
  return command.replace(/\s+/gu, ' ').trim()
}

// Tablica po jednym wywołaniu narzędzia. Plan zmienia lista zadań z wątku głównego
// (`result` to rekord narzędzia, z niego id `TaskCreate`); testy zmienia komenda
// testów, gdy znamy jej wynik (`call`). `now` to czas zdarzenia w ms od epoki;
// historia bez czasu go pomija. Edycja poza dokumentacją zapisuje czas także
// przy błędzie, bez `deny`; nieznana ścieżka nie potwierdza dokumentacji.
export function boardAfter(board: KruxBoard, tool: string, input: Record<string, unknown>, result?: unknown, call?: BoardCall, now?: number): KruxBoard {
  if ((result as { deny?: unknown } | undefined)?.deny !== undefined) return board
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const path = text(input.file_path) || text(input.notebook_path)
    if (/\.(?:md|mdx|txt|rst|adoc)$/iu.test(path)) return board
    return now === undefined ? board : { ...board, editedAt: now }
  }
  if (call && workOf(tool, input) === 'test') {
    // Test w tle odpowiada od razu, bez wyniku: ostatni prawdziwy przebieg zostaje.
    if (isBackgroundToolCall(tool, input, result)) return board
    const run: KruxTestRun = { ...testRunOf(text(input.command), call), ...(now === undefined ? {} : { at: now }) }
    // Zielona powtórka padłych, jeden plik albo filtr nazw nie zielenieje szerszego czerwonego
    // przebiegu: zestaw dalej padł, a gotowość do commita i bramka faktów czytają tablicę.
    if (narrower(run, board.test)) return board
    return { ...board, test: run }
  }
  // Nieudane wywołanie listy zadań nie zmienia planu.
  if (call?.isError) return board
  switch (tool) {
    case 'TodoWrite': {
      const todos = Array.isArray(input.todos) ? (input.todos as Record<string, unknown>[]) : []
      const previous = board.tasks.filter(task => task.id === null)
      const tasks: KruxTask[] = todos.flatMap(todo => {
        const status = statusOf(todo.status)
        const subject = text(todo.content)
        return status && subject ? [{ id: null, subject, status }] : []
      })
      const unused: (KruxTask | undefined)[] = [...previous]
      const matches: (KruxTask | undefined)[] = tasks.map(() => undefined)
      // TodoWrite nie ma id: najpierw rezerwujemy niezmienione tematy i statusy,
      // żeby wcześniejszy duplikat ze zmianą statusu nie zabrał ich zegara.
      for (const sameStatus of [true, false]) {
        tasks.forEach((task, index) => {
          if (matches[index] !== undefined) return
          const found = unused.findIndex(old => old?.subject === task.subject && (!sameStatus || old.status === task.status))
          if (found < 0) return
          matches[index] = unused[found]
          unused[found] = undefined
        })
      }
      return {
        ...board,
        tasks: tasks.map((task, index) => {
          let old = matches[index]
          const atPosition = unused[index]
          // Przemianowanie w tej samej pozycji: stary temat zniknął, nowy nie
          // należał do poprzedniej listy. Każdy poprzednik trafia tylko raz.
          if (old === undefined && atPosition !== undefined && !tasks.some(next => next.subject === atPosition.subject) && !previous.some(before => before.subject === task.subject)) {
            old = atPosition
            unused[index] = undefined
          }
          return { ...taskStatus(old ?? { ...task, status: 'pending' }, task.status, now), subject: task.subject }
        }),
      }
    }
    case 'TaskCreate': {
      const subject = text(input.subject)
      if (!subject) return board
      const task = (result as { task?: { id?: unknown } } | undefined)?.task
      const id = typeof task?.id === 'string' ? task.id : null
      return { ...board, tasks: [...board.tasks, { id, subject, status: 'pending' }] }
    }
    case 'TaskUpdate': {
      const id = text(input.taskId)
      if (!board.tasks.some(task => task.id === id)) return board
      if ((result as { success?: unknown } | undefined)?.success === false) return board
      if (input.status === 'deleted') return { ...board, tasks: board.tasks.filter(task => task.id !== id) }
      const status = statusOf(input.status)
      const subject = text(input.subject)
      return {
        ...board,
        tasks: board.tasks.map(task => (task.id === id ? { ...(status ? taskStatus(task, status, now) : task), ...(subject ? { subject } : {}) } : task)),
      }
    }
    default:
      return board
  }
}

// Starsze sesje nie mają czasów: bez obu nie potwierdzamy nieświeżości.
export function testsStale(board: KruxBoard): boolean {
  return board.test !== null && board.test.at !== undefined && board.editedAt != null && board.editedAt > board.test.at
}

// Pełne minuty pracy, od progu 15 min; bez startu albo poza pracą — nic.
export function stuckMinutes(task: KruxTask, now: number): number | null {
  if (task.status !== 'in_progress' || task.startedAt === undefined) return null
  const minutes = Math.floor((now - task.startedAt) / 60_000)
  return minutes >= 15 ? minutes : null
}

// Warunki commita, niezależnie od tego, czy panel ma zmiany do pokazania.
// Nieznany odczyt białych znaków nie blokuje, zgodnie z kontraktem.
export function readiness(board: KruxBoard, git: KruxGit | null): { ready: boolean; missing: string[] } {
  if (git === null) return { ready: false, missing: ['brak repo'] }
  const missing: string[] = []
  if (board.test === null) missing.push('brak testów')
  else {
    if (!board.test.ok) missing.push('testy padłe')
    if (testsStale(board)) missing.push('testy nieświeże')
  }
  if (git.whitespace === false) missing.push('białe znaki')
  if (git.conflicted > 0) missing.push(`konflikty: ${git.conflicted}`)
  return { ready: missing.length === 0, missing }
}

// Jedna linia toastu po przerwie: tylko części obecne na tablicy.
export function returnNote(board: KruxBoard, threads: KruxThreads, git: KruxGit | null): string {
  const parts: string[] = []
  if (board.tasks.length > 0) parts.push(`Plan ${planCount(board.tasks)}`)
  const run = board.test
  if (run !== null) {
    const counts = run.ok ? (run.passed === null ? '' : String(run.passed)) : testLine(run)
    parts.push(`testy ${run.ok ? '✓' : '✗'}${counts ? ` ${counts}` : ''}${testsStale(board) ? ' ◌ nieświeże' : ''}`)
  }
  if (threads.items.length > 0) parts.push(`wątki ${threads.items.length}`)
  if (git !== null) parts.push(`git ${gitBusy(git) ? '' : '✓ '}${gitShort(git)}`)
  return parts.join(' · ').replace(/\s+/gu, ' ').trim()
}

// Plan w `limit` wierszach: najpierw wypadają najstarsze zrobione (`earlier`),
// potem ogon (`later`).
export function planRows(tasks: readonly KruxTask[], limit: number): { shown: KruxTask[]; earlier: number; later: number } {
  let extra = tasks.length - limit
  const shown = tasks.filter(task => {
    if (extra > 0 && task.status === 'completed') {
      extra -= 1
      return false
    }
    return true
  })
  const cut = shown.slice(0, limit)
  return { shown: cut, earlier: tasks.length - shown.length, later: shown.length - cut.length }
}

// Ile planu zrobione: `zrobione/wszystkie`.
export function planCount(tasks: readonly KruxTask[]): string {
  return `${tasks.filter(task => task.status === 'completed').length}/${tasks.length}`
}

// Odczyt `$.session.usage()` w kształcie, który da się trzymać w `$.state`.
export function usageOf(raw: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>): KruxUsage {
  return {
    percent: raw.context.percent ?? null,
    tokens: raw.context.tokens ?? null,
    window: raw.context.window,
    limits: raw.rateLimits.map(limit => ({ kind: limit.kind, percentUsed: limit.percentUsed, resetsAt: limit.resetsAt ?? null })),
    usd: raw.cost?.usd ?? null,
  }
}

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

// Pasek procentu w ósemkach komórki; tło z `░`, żeby było widać, ile zostało.
export function meter(percent: number, width: number): string {
  const eighths = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width * 8)
  const full = Math.floor(eighths / 8)
  const part = EIGHTHS[eighths % 8]!
  return '█'.repeat(full) + part + '░'.repeat(Math.max(0, width - full - (part ? 1 : 0)))
}

// Tokeny po ludzku: 950, 136k, 1M.
export function tokens(value: number): string {
  // Próg po zaokrągleniu: 999 500 to już „1M”, nie „1000k”.
  if (Math.round(value / 1000) >= 1000) return `${Math.round(value / 100_000) / 10}M`
  if (value >= 1000) return `${Math.round(value / 1000)}k`
  return String(value)
}

const LIMIT_NAMES: Readonly<Record<string, string>> = { five_hour: '5h', seven_day: '7 dni', spend_limit: 'budżet' }

export function limitName(kind: string): string {
  return LIMIT_NAMES[kind] ?? kind
}

// Ile do odnowienia okna limitu; minione albo nieznane — nic.
export function resetIn(resetsAt: string | null, now: number): string {
  const at = resetsAt === null ? Number.NaN : Date.parse(resetsAt)
  if (!Number.isFinite(at) || at <= now) return ''
  const minutes = Math.ceil((at - now) / 60_000)
  if (minutes >= 48 * 60) return `reset za ${Math.round(minutes / (24 * 60))} dni`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `reset za ${hours > 0 ? `${hours} h ` : ''}${hours > 0 && rest === 0 ? '' : `${rest} min`}`.trimEnd()
}

// Po wznowieniu tablica wraca z historii: plan i ostatni przebieg testów. Historia
// nie mówi, który ork wołał, więc przebieg idzie na Kruxa.
export function replayBoard(messages: readonly HistoryMessage[]): KruxBoard {
  let board = EMPTY_BOARD
  for (const message of messages) {
    for (const use of message.toolUses) {
      if (use.text === undefined && use.result === undefined && use.isError !== true) continue
      const call = use.text === undefined && use.isError !== true ? undefined : { text: use.text ?? '', isError: use.isError === true, who: 'Krux' as const }
      board = boardAfter(board, use.tool, use.input, use.result, call)
    }
  }
  return board
}

// Polska liczba mnoga: 1 padł, 2 padły, 5 padło (12–14 też „padło”).
function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one
  const tens = count % 100
  return count % 10 >= 2 && count % 10 <= 4 && (tens < 12 || tens > 14) ? few : many
}

// Liczby przebiegu w jednej linii; bez liczb w wyjściu — nic.
export function testLine(run: KruxTestRun): string {
  const parts: string[] = []
  if (run.failed !== null && run.failed > 0) parts.push(`${run.failed} ${plural(run.failed, 'padł', 'padły', 'padło')}`)
  if (run.passed !== null) parts.push(`${run.passed} ${plural(run.passed, 'przeszedł', 'przeszły', 'przeszło')}`)
  return parts.join(' · ')
}
