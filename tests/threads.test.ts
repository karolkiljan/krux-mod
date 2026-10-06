import { expect, test } from 'claude-code/testing'

import { EMPTY_THREADS, THREADS_LIMIT, THREAD_TOOL_NAME, replayThreads, threadsAfter, threadsReport } from '../hooks/threads'

test('threads open with ids and a default kind, close by id, and the same text never opens twice', () => {
  let threads = threadsAfter(EMPTY_THREADS, { open: [{ text: '6 commitów niewypchniętych' }, { text: 'tsc nie puszczony', kind: 'risk' }, { text: '  ' }] })
  expect(threads).toEqual({ next: 3, items: [{ id: 1, kind: 'todo', text: '6 commitów niewypchniętych' }, { id: 2, kind: 'risk', text: 'tsc nie puszczony' }] })
  threads = threadsAfter(threads, { open: [{ text: 'tsc nie puszczony' }, { text: 'Wyłączyć Sztolnię?', kind: 'ask' }], close: [1] })
  expect(threads.items.map(item => [item.id, item.kind, item.text])).toEqual([[2, 'risk', 'tsc nie puszczony'], [3, 'ask', 'Wyłączyć Sztolnię?']])
  expect(threadsReport(threads)).toBe('Open threads:\n#2 [risk] tsc nie puszczony\n#3 [ask] Wyłączyć Sztolnię?')
  expect(threadsReport(threadsAfter(threads, { close: [2, 3] }))).toBe('No open threads.')
})

test('a junk input changes nothing, long texts are cut, the board keeps the newest threads', () => {
  expect(threadsAfter(EMPTY_THREADS, { open: 'x', close: 'y' })).toEqual(EMPTY_THREADS)
  expect(threadsAfter(EMPTY_THREADS, { open: [{ text: 'a'.repeat(300), kind: 'nope' }] }).items[0]).toEqual({ id: 1, kind: 'todo', text: 'a'.repeat(100) })
  const many = threadsAfter(EMPTY_THREADS, { open: Array.from({ length: THREADS_LIMIT + 3 }, (_, index) => ({ text: `wątek ${index + 1}` })) })
  expect(many.items).toHaveLength(THREADS_LIMIT)
  expect(many.items[0]!.text).toBe('wątek 4')
  expect(many.next).toBe(THREADS_LIMIT + 4)
})

test('after a resume the threads come back from the tool calls in history, failed calls skipped', () => {
  const use = (input: Record<string, unknown>, isError?: true) => ({ tool: THREAD_TOOL_NAME, input, ...(isError ? { isError } : {}) })
  const history = [
    { role: 'assistant' as const, text: '', toolUses: [use({ open: [{ text: 'push czeka' }, { text: 'tsc' }] }), { tool: 'Read', input: {} }] },
    { role: 'assistant' as const, text: '', toolUses: [use({ close: [2] }), use({ open: [{ text: 'zepsute' }] }, true)] },
  ]
  expect(replayThreads(history)).toEqual({ next: 3, items: [{ id: 1, kind: 'todo', text: 'push czeka' }] })
})

test('truncated history replays recorded thread ids and unknown closes cannot hit another thread', () => {
  const use = (input: Record<string, unknown>, text?: string) => ({ tool: THREAD_TOOL_NAME, input, text })
  const history = [
    { role: 'assistant' as const, text: '', toolUses: [use({ open: [{ text: 'nowy' }] }, 'Open threads:\n#99 [risk] stary\n#100 [todo] nowy')] },
    { role: 'assistant' as const, text: '', toolUses: [use({ close: [1, 100, 999] })] },
  ]
  const threads = replayThreads(history)
  expect(threads.items).toEqual([{ id: 99, kind: 'risk', text: 'stary' }])
  expect(threads.next).toBe(101)
  expect(threadsAfter(threads, { open: [{ text: 'dalej' }] }).items[1]!.id).toBe(101)
})

test('a recorded empty report retains the highest replayed id', () => {
  expect(replayThreads([{ role: 'assistant', text: '', toolUses: [
    { tool: THREAD_TOOL_NAME, input: { open: [{ text: 'test' }] }, result: 'Open threads:\n#100 [todo] test' },
    { tool: THREAD_TOOL_NAME, input: { close: [100] }, text: 'No open threads.' },
  ] }])).toEqual({ next: 101, items: [] })
})
