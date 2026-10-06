// Tablica Sztolni: stan roboty zamiast statystyki. Plan z narzędzi listy zadań
// (`TodoWrite`, `TaskCreate`, `TaskUpdate`) i ostatni przebieg testów. Diff
// i drzewo zmian rysuje silnik (`/diff`), więc tablica ich nie dubluje. Czyste funkcje.

import type { SessionUsage } from 'claude-code'

import type { KruxBoard, KruxTask, KruxTestRun, KruxUsage } from '../types'
import type { HistoryMessage } from './lore'
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

// Co czytamy z wyniku wywołania: tekst, który dostał model, błąd i kto wołał.
export type BoardCall = { text: string; isError: boolean; who: KruxTestRun['who'] }

// Najwyżej tyle nazw padających testów; reszta czeka w transkrypcie.
const FAILURES_LIMIT = 5

// Linia padającego testu w popularnych runnerach: bun, jest, vitest, mocha, TAP,
// reporter `node --test` (`✖`), go (`--- FAIL:`), unittest (`FAIL:`).
const FAILURE_LINE = /^\s*(?:\(fail\)|✗|✕|✖|×|--- FAIL:|FAIL(?:ED)?(?!\p{L}):?|not ok \d+(?: -)?)\s*(.*)$/u

// Czas na końcu nazwy: `[3ms]`, `(5 ms)`, `(0.00s)`, `4ms`.
const TIMING = /\s*(?:\[\d+(?:\.\d+)?\s*m?s\]|\(\d+(?:\.\d+)?\s*m?s\)|\d+(?:\.\d+)?m?s)$/u

// Nazwa bez czasu i bez reszty po tabulatorze (go: pakiet, czas). Pusta albo
// podsumowanie w nawiasie (`FAILED (failures=1)`) i nagłówek z dwukropkiem
// (`✖ failing tests:`) to nie test.
function failureName(line: string): string | null {
  const raw = FAILURE_LINE.exec(line)?.[1]
  if (raw === undefined) return null
  const name = raw.split('\t')[0]!.replace(TIMING, '').trim()
  return name === '' || name.startsWith('(') || name.endsWith(':') ? null : name
}

// Ostatnie trafienie: podsumowanie stoi na końcu, a wcześniejsze liczby to pliki,
// zestawy albo nazwy testów („returns 2 failed items”). `node --test` pisze
// liczbę po słowie: `# pass 4` w TAP, `ℹ pass 4` w domyślnym reporterze, stąd druga grupa.
function lastCount(output: string, pattern: RegExp): number | null {
  let found: number | null = null
  for (const match of output.matchAll(pattern)) found = Number(match[1] ?? match[2])
  return found
}

// Cargo pisze podsumowanie na każdy binarny test: liczby się sumują.
function cargoCounts(output: string): { passed: number; failed: number } | null {
  const lines = [...output.matchAll(/test result: \w+\. (\d+) passed; (\d+) failed/gu)]
  if (lines.length === 0) return null
  return { passed: lines.reduce((sum, line) => sum + Number(line[1]), 0), failed: lines.reduce((sum, line) => sum + Number(line[2]), 0) }
}

// Przebieg testów z wyjścia komendy: liczby, gdy runner je podał, i nazwy padających.
// Padłe testy w wyjściu wygrywają z kodem 0: `npm test | tail` kończy się kodem `tail`.
export function testRunOf(command: string, call: BoardCall): KruxTestRun {
  const output = call.text
  const failures = [...new Set(output.split(/\r?\n/u).flatMap(line => failureName(line) ?? []))]
  const cargo = cargoCounts(output)
  const passed = cargo?.passed ?? lastCount(output, /(?<![\p{L}\d])(\d+) pass(?:ed|ing)?(?!\p{L})|^(?:#|ℹ) pass (\d+)$/gmu)
  const failed = cargo?.failed ?? lastCount(output, /(?<![\p{L}\d])(\d+) fail(?:ed|ing|ures?)?(?!\p{L})|^(?:#|ℹ) fail (\d+)$/gmu)
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

// Tablica po jednym wywołaniu narzędzia. Plan zmienia lista zadań z wątku głównego
// (`result` to rekord narzędzia, z niego id `TaskCreate`); testy zmienia komenda
// testów, gdy znamy jej wynik (`call`). Inne narzędzia zwracają tę samą tablicę.
export function boardAfter(board: KruxBoard, tool: string, input: Record<string, unknown>, result?: unknown, call?: BoardCall): KruxBoard {
  if (call && workOf(tool, input) === 'test') {
    // Test w tle odpowiada od razu, bez wyniku: ostatni prawdziwy przebieg zostaje.
    if (input.run_in_background === true) return board
    return { ...board, test: testRunOf(text(input.command), call) }
  }
  // Nieudane wywołanie listy zadań nie zmienia planu.
  if (call?.isError) return board
  switch (tool) {
    case 'TodoWrite': {
      const todos = Array.isArray(input.todos) ? (input.todos as Record<string, unknown>[]) : []
      const tasks = todos.flatMap(todo => {
        const status = statusOf(todo.status)
        const subject = text(todo.content)
        return status && subject ? [{ id: null, subject, status }] : []
      })
      return { ...board, tasks }
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
        tasks: board.tasks.map(task => (task.id === id ? { ...task, ...(status ? { status } : {}), ...(subject ? { subject } : {}) } : task)),
      }
    }
    default:
      return board
  }
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
export function usageOf(raw: SessionUsage): KruxUsage {
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

const LIMIT_NAMES: Readonly<Record<string, string>> = { five_hour: '5 h', seven_day: '7 dni', spend_limit: 'budżet' }

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
      const call = use.text === undefined ? undefined : { text: use.text, isError: use.isError === true, who: 'Krux' as const }
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
