// Otwarte wątki Sztolni: czego Krux nie domknął, co ryzykowne i co czeka na
// decyzję Morry. Model pisze je narzędziem moda; tu czyste przejścia, raport
// dla modelu i odtworzenie z historii.

import type { KruxThread, KruxThreadKind, KruxThreads } from '../types'
import type { HistoryMessage } from './lore'

export const EMPTY_THREADS: KruxThreads = { next: 1, items: [] }

export const THREAD_TOOL = 'watki'
// Pełna nazwa, pod którą model woła narzędzie moda.
export const THREAD_TOOL_NAME = `mcp__krux-mod__${THREAD_TOOL}`

// Tablica nie rośnie bez końca: najstarsze wątki wypadają pierwsze.
export const THREADS_LIMIT = 12
const TEXT_LIMIT = 100

const KINDS: readonly KruxThreadKind[] = ['todo', 'risk', 'ask']

export const THREAD_SPEC = {
  name: THREAD_TOOL,
  description:
    "Krux's Sztolnia board: open threads the person must not lose between replies. Open one when you leave something undone, deferred, unverified or risky, or waiting on the person's decision (e.g. \"6 commits not pushed\", \"tsc not run: no types laid\"). Close it by id once resolved. Not for routine progress or plans: the task list covers those. Keep each text under 80 characters, in the language of the conversation. Returns the open threads with their ids.",
  inputSchema: {
    type: 'object',
    properties: {
      open: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            kind: { type: 'string', enum: [...KINDS], description: 'todo: left undone; risk: may break or mislead; ask: waits on the person. Default todo.' },
          },
          required: ['text'],
        },
      },
      close: { type: 'array', items: { type: 'integer' }, description: 'Ids of threads now resolved.' },
    },
  },
}

export const THREAD_MARK: Record<KruxThreadKind, string> = { todo: '○', risk: '⚠', ask: '?' }

export function threadsAfter(threads: KruxThreads, input: Record<string, unknown>): KruxThreads {
  const close = new Set((Array.isArray(input.close) ? input.close : []).filter((id): id is number => Number.isInteger(id)))
  let items = threads.items.filter(item => !close.has(item.id))
  let next = threads.next
  for (const raw of Array.isArray(input.open) ? input.open : []) {
    const entry = raw as Record<string, unknown>
    const text = typeof entry?.text === 'string' ? entry.text.replace(/\s+/gu, ' ').trim().slice(0, TEXT_LIMIT) : ''
    if (text === '' || items.some(item => item.text === text)) continue
    const kind = KINDS.includes(entry.kind as KruxThreadKind) ? (entry.kind as KruxThreadKind) : 'todo'
    items = [...items, { id: next, kind, text }]
    next += 1
  }
  return { next, items: items.slice(-THREADS_LIMIT) }
}

// Notatka Morry korzysta z numeracji, deduplikacji i limitów narzędzia `watki`.
export function saveThread(threads: KruxThreads, text: string): KruxThreads {
  if (text.trim() === '') return threads
  return threadsAfter(threads, { open: [{ kind: 'todo', text }] })
}

// Odpowiedź narzędzia: model widzi, co zostało otwarte, i ma id do zamknięcia.
export function threadsReport(threads: KruxThreads): string {
  if (threads.items.length === 0) return 'No open threads.'
  return ['Open threads:', ...threads.items.map((item: KruxThread) => `#${item.id} [${item.kind}] ${item.text}`)].join('\n')
}

// Raport niesie oryginalne id i pełny stan, także gdy początek historii wypadł.
function reportedThreads(text: unknown): KruxThread[] | null {
  if (text === 'No open threads.') return []
  if (typeof text !== 'string' || !text.startsWith('Open threads:\n')) return null
  const items: KruxThread[] = []
  for (const line of text.slice('Open threads:\n'.length).split('\n')) {
    const match = /^#(\d+) \[(todo|risk|ask)\] (.+)$/u.exec(line)
    if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) return null
    items.push({ id: Number(match[1]), kind: match[2] as KruxThreadKind, text: match[3]! })
  }
  return items.slice(-THREADS_LIMIT)
}

// Po wznowieniu raport zachowuje id; starsze wpisy bez wyniku odtwarzają przejścia.
export function replayThreads(messages: readonly HistoryMessage[]): KruxThreads {
  let threads = EMPTY_THREADS
  for (const message of messages) {
    for (const use of message.toolUses) {
      if (use.tool !== THREAD_TOOL_NAME || use.isError === true) continue
      const items = reportedThreads(use.text ?? use.result)
      threads = items === null ? threadsAfter(threads, use.input) : {
        next: Math.max(threads.next, ...items.map(item => item.id + 1)),
        items,
      }
    }
  }
  return threads
}
