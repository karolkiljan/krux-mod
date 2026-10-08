// Dziennik narzędzi i ich zwinięte wiersze. Zapis zdarzenia oraz rysowanie
// przyjmują dane i zegar; odczyt stanu i hooki należą do `register.ts`.

import type { BoxProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import type { KruxJournal, KruxJournalEntry } from '../types'
import { testLine, testPassed, testRunOf } from './board'
import { isBackgroundToolCall } from './outcome'
import { terminalText } from './terminal-text'
import { SPEAKER_COLOR } from './sprites'
import { describeTool, workOf } from './voice'

export const EMPTY_JOURNAL: KruxJournal = { entries: [] }
export const JOURNAL_LIMIT = 200

export type JournalCall = {
  tool: string
  input: Record<string, unknown>
  // Rekord wyniku narzędzia oraz tekst i flaga błędu z odpowiedzi hooka.
  result?: unknown
  text?: string
  isError?: boolean
  deny?: unknown
  tool_use_id?: string
  agentId?: string
  // Imię ustala wywołujący z apelu; obcy agent bez imienia to `ork`.
  who?: KruxJournalEntry['who']
  at: number
}

export type JournalElements = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps> }
export type ToolLineData = Pick<KruxJournalEntry, 'tool' | 'target' | 'ok'>

const OK_COLOR = '#3fb950'
const ERROR_COLOR = '#e0322b'

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function outputOf(call: JournalCall): string {
  if (typeof call.text === 'string') return call.text
  if (typeof call.result === 'string') return call.result
  const result = record(call.result)
  if (typeof result.stdout === 'string' || typeof result.stderr === 'string') {
    return [result.stdout, result.stderr].filter(part => typeof part === 'string' && part !== '').join('\n')
  }
  return typeof result.text === 'string' ? result.text : typeof result.content === 'string' ? result.content : ''
}

// Kod strukturalny ma pierwszeństwo przed tekstem, który komenda mogła cytować.
function exitCode(call: JournalCall, output: string): number | null {
  const result = record(call.result)
  for (const code of [result.exitCode, result.exit_code]) {
    if (typeof code === 'number' && Number.isFinite(code)) return code
  }
  if (call.tool !== 'Bash') return null
  const code = /(?:^|\n)Exit code:?\s*(-?\d+)\b/iu.exec(output)?.[1]
  return code === undefined ? null : Number(code)
}

export function journalAfter(journal: KruxJournal, call: JournalCall): KruxJournal {
  const result = record(call.result)
  if (call.deny !== undefined || result.deny !== undefined) return journal
  const output = outputOf(call)
  const code = exitCode(call, output)
  const error = call.isError === true || result.isError === true || Boolean(result.error) || (code !== null && code !== 0)
  const work = workOf(call.tool, call.input)
  const background = isBackgroundToolCall(call.tool, call.input, call.result)
  const known = call.result !== undefined || call.text !== undefined || call.isError === true
  const ok = error ? false : background || !known ? null : work === 'test' ? testPassed(output, false) : true
  const summary = background ? '' : work === 'test' && ok !== null
    ? testLine(testRunOf(typeof call.input.command === 'string' ? call.input.command : '', { text: output, isError: error, who: call.who ?? 'Krux' }))
    : ok === true ? summaryOf(call, output) : ''
  const entry: KruxJournalEntry = {
    id: call.tool_use_id ?? null,
    who: call.who ?? (call.agentId === undefined ? 'Krux' : 'ork'),
    agentId: call.agentId ?? null,
    tool: call.tool,
    target: describeTool(call.tool, call.input).target,
    ok,
    summary,
    at: call.at,
  }
  return { entries: [...journal.entries, entry].slice(-JOURNAL_LIMIT) }
}

// Liczymy linie przekazanych fragmentów zamiany, nie odczytujemy pliku.
// Końcowy znak nowej linii zamyka ostatnią linię, nie dodaje następnej.
function lineCount(value: string): number {
  return value === '' ? 0 : value.replace(/\r?\n$/u, '').split(/\r?\n/u).length
}

function replacement(input: Record<string, unknown>): { added: number; removed: number } | null {
  if (typeof input.old_string !== 'string' || typeof input.new_string !== 'string' || input.replace_all === true) return null
  return { added: lineCount(input.new_string), removed: lineCount(input.old_string) }
}

function editSummary(tool: string, input: Record<string, unknown>): string {
  if (tool === 'NotebookEdit' && input.edit_mode === 'insert' && typeof input.new_source === 'string') return `+${lineCount(input.new_source)} −0`
  const changes = tool === 'Edit' ? [replacement(input)]
    : tool === 'MultiEdit' && Array.isArray(input.edits) ? input.edits.map(edit => replacement(record(edit))) : []
  if (changes.length === 0 || changes.some(change => change === null)) return ''
  const total = changes.reduce<{ added: number; removed: number }>((sum, change) => ({ added: sum.added + change!.added, removed: sum.removed + change!.removed }), { added: 0, removed: 0 })
  // Write i podmiana komórki nie znają starej treści. replace_all nie zna liczby
  // trafień. W tych przypadkach pusty opis zamiast zmyślonych usunięć.
  return `+${total.added} −${total.removed}`
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function arrayCount(value: unknown): number | null {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value.length : null
}

function searchCount(call: JournalCall, output: string): number | null {
  const result = record(call.result)
  const mode = call.tool === 'Grep' ? call.input.output_mode : 'files_with_matches'
  const structured = mode === 'count' ? count(result.numMatches) : mode === 'content' ? count(result.numLines) : count(result.numFiles) ?? arrayCount(result.filenames) ?? arrayCount(call.result)
  if (structured !== null) return structured
  const text = typeof result.content === 'string' ? result.content : output
  const hasText = call.text !== undefined || typeof call.result === 'string' || typeof result.content === 'string' || typeof result.text === 'string'
  if (!hasText) return null
  const rows = text.split(/\r?\n/u).map(row => row.trim()).filter(Boolean)
  if (rows.length === 0 || /^(?:No (?:matches|files) found|No results)(?:\.|$)/iu.test(text.trim())) return 0
  if (mode === 'count') {
    const counts = rows.map(row => /:(\d+)$/u.exec(row)?.[1])
    return counts.every(value => value !== undefined) ? counts.reduce((sum, value) => sum + Number(value), 0) : null
  }
  return rows.length
}

function summaryOf(call: JournalCall, output: string): string {
  if (workOf(call.tool, call.input) === 'edit') return editSummary(call.tool, call.input)
  if (call.tool === 'Grep' || call.tool === 'Glob') {
    const found = searchCount(call, output)
    return found === null ? '' : `wyniki: ${found}`
  }
  return ''
}

function markOf(ok: boolean | null): string {
  return ok === true ? '✓' : ok === false ? '✗' : '·'
}

function outcomeColor(ok: boolean | null): { color?: string; dimColor?: boolean } {
  return ok === null ? { dimColor: true } : { color: ok ? OK_COLOR : ERROR_COLOR }
}

function oneLine(text: string): string {
  return text.replace(/\s+/gu, ' ').trim()
}

const TOOL_NAME_MAX = 16

function columns(width: number): number {
  return Math.max(1, Number.isFinite(width) ? Math.floor(width) : 1)
}

function clock(at: number, now: number): string {
  const time = new Date(Number.isFinite(at) ? at : now)
  return [time.getHours(), time.getMinutes(), time.getSeconds()].map(value => String(value).padStart(2, '0')).join(':')
}

// Grupy są kolejnymi odcinkami tego samego wykonawcy: scalanie odległych
// odcinków przestawiłoby zdarzenia. agentId rozdziela również orków bez imienia.
export function journalTree({ Box, Text }: JournalElements, journal: KruxJournal, width: number, now: number): RenderElement {
  const groups: KruxJournalEntry[][] = []
  for (const entry of [...journal.entries].reverse()) {
    const previous = groups.at(-1)?.[0]
    if (previous?.who === entry.who && previous.agentId === entry.agentId) groups.at(-1)!.push(entry)
    else groups.push([entry])
  }
  return Box({
    width: columns(width),
    flexDirection: 'column',
    children: groups.length === 0 ? [Text({ dimColor: true, children: ['Dziennik pusty'] })] : groups.map((group, groupIndex) => Box({
      key: `journal-group-${groupIndex}`,
      flexDirection: 'column',
      children: [
        Text({ bold: true, color: SPEAKER_COLOR[group[0]!.who], wrap: 'truncate-end', children: [group[0]!.who] }),
        ...group.map((entry, index) => Box({
          key: `journal-${groupIndex}-${index}-${entry.id ?? 'entry'}`,
          flexDirection: 'row',
          height: 1,
          columnGap: 1,
          children: [
            Box({ flexShrink: 0, children: [Text({ ...outcomeColor(entry.ok), children: [markOf(entry.ok)] })] }),
            // Nazwa narzędzia nie ustępuje długiemu celowi („Bash”, nie „Ba…”); długą nazwę MCP ucina limit.
            Box({ flexShrink: 0, children: [Text({ wrap: 'truncate-end', children: [terminalText(oneLine(entry.tool), TOOL_NAME_MAX).text] })] }),
            Box({ flexGrow: 1, flexShrink: 1, minWidth: 0, children: [Text({ wrap: 'truncate-end', children: [oneLine(entry.target)] })] }),
            ...(entry.summary ? [Box({ flexShrink: 0, children: [Text({ dimColor: true, wrap: 'truncate-end', children: [oneLine(entry.summary)] })] })] : []),
            Box({ flexShrink: 0, children: [Text({ dimColor: true, children: [clock(entry.at, now)] })] }),
          ],
        })),
      ],
    })),
  })
}

// Silnik ucina opis w komórkach terminala. Osobny znak wyniku nie ustępuje
// miejsca długiej ścieżce, również z szerokimi znakami Unicode.
export function toolLine({ Box, Text }: JournalElements, data: ToolLineData | readonly ToolLineData[], width: number): RenderElement {
  const calls: readonly ToolLineData[] = Array.isArray(data) ? data : [data as ToolLineData]
  const ok = calls.some(call => call.ok === false) ? false : calls.length === 0 || calls.some(call => call.ok === null) ? null : true
  const single = calls.length === 1 ? calls[0]! : null
  const n = calls.length
  const noun = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'narzędzia' : 'narzędzi'
  const label = single === null ? `⚒ ${n} ${noun}` : `⚒ ${oneLine(single.tool)}${single.target ? ` ${oneLine(single.target)}` : ''}`
  const room = columns(width)
  // Czerwień niesie tylko znak: cały czerwony wiersz krzyczał jak awaria,
  // a ✗ to często zwykły niezerowy kod wyjścia (grep bez trafień).
  const style = { dimColor: true }
  const mark = Text(ok === false ? { color: ERROR_COLOR, children: [markOf(ok)] } : { ...style, children: [markOf(ok)] })
  return Box({
    width: room,
    height: 1,
    flexDirection: 'row',
    columnGap: 1,
    children: room <= 2 ? [mark] : [
      // Znak wyniku stoi tuż za opisem, nie przy dalekiej krawędzi.
      Box({ flexShrink: 1, minWidth: 0, children: [Text({ ...style, wrap: 'truncate-end', children: [label] })] }),
      Box({ flexShrink: 0, children: [mark] }),
    ],
  })
}
