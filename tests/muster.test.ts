import { expect, test } from 'claude-code/testing'

import { EMPTY_MUSTER, MUSTER_LIMIT, anyRunning, elapsed, musterDone, musterRows, musterSpawn, musterTool } from '../hooks/muster'

test('time reads as m:ss, past an hour as h:mm:ss', () => {
  expect(elapsed(0)).toBe('0:00')
  expect(elapsed(42_900)).toBe('0:42')
  expect(elapsed(185_000)).toBe('3:05')
  expect(elapsed(3_725_000)).toBe('1:02:05')
  expect(elapsed(-5)).toBe('0:00')
})

test('time rolls over at whole minutes and at the hour', () => {
  expect(elapsed(999)).toBe('0:00')
  expect(elapsed(59_999)).toBe('0:59')
  expect(elapsed(60_000)).toBe('1:00')
  expect(elapsed(3_599_999)).toBe('59:59')
  expect(elapsed(3_600_000)).toBe('1:00:00')
})

test('spawning the same agent again replaces its old run', () => {
  let muster = musterSpawn(EMPTY_MUSTER, 'a1', 'Niuch', 'zwiad', 1_000)
  muster = musterSpawn(muster, 'a2', 'Młot', 'testy', 2_000)
  muster = musterTool(muster, 'a1', 'Grep', { pattern: 'auth' })
  muster = musterDone(muster, 'a1', 5_000)
  muster = musterSpawn(muster, 'a1', 'Piryt', 'review', 9_000)
  expect(muster.runs.map(run => run.agentId)).toEqual(['a2', 'a1'])
  expect(muster.runs[1]).toEqual({ agentId: 'a1', mate: 'Piryt', description: 'review', startedAt: 9_000, endedAt: null, last: '' })
})

test('a tool with no target is noted by its name alone', () => {
  const muster = musterTool(musterSpawn(EMPTY_MUSTER, 'a1', null, 'plan', 0), 'a1', 'TodoWrite', { todos: [] })
  expect(muster.runs[0]!.last).toBe('TodoWrite')
})

test('an unknown tool is named once, an MCP tool by its server and name', () => {
  const muster = musterSpawn(EMPTY_MUSTER, 'a1', null, 'zwiad', 0)
  expect(musterTool(muster, 'a1', 'LSP', {}).runs[0]!.last).toBe('LSP')
  expect(musterTool(muster, 'a1', 'mcp__github__get_issue', {}).runs[0]!.last).toBe('github/get_issue')
})

test('the end of a loop the muster does not know changes nothing', () => {
  const muster = musterSpawn(EMPTY_MUSTER, 'a1', null, 'zwiad', 0)
  expect(musterDone(muster, 'zzz', 5_000)).toBe(muster)
})

test('a negative limit lists no runs', () => {
  const muster = musterSpawn(EMPTY_MUSTER, 'a1', null, 'zwiad', 0)
  expect(musterRows(muster, 1_000, null, -1)).toEqual([])
  expect(musterRows(muster, 1_000, null, 0)).toEqual([])
})

test('a run keeps its last tool until it ends', () => {
  let muster = musterSpawn(EMPTY_MUSTER, 'a1', 'Niuch', 'Niuch węszy', 1_000)
  muster = musterTool(muster, 'a1', 'Grep', { pattern: 'auth' })
  muster = musterTool(muster, 'a1', 'Bash', { command: 'npm test' })
  expect(muster.runs[0]).toMatchObject({ last: 'Bash npm test', endedAt: null })
  expect(anyRunning(muster)).toBe(true)
  muster = musterDone(muster, 'a1', 61_000)
  expect(muster.runs[0]!.endedAt).toBe(61_000)
  expect(anyRunning(muster)).toBe(false)
  // Drugi koniec nie przesuwa czasu.
  expect(musterDone(muster, 'a1', 99_000)).toBe(muster)
})

test('a tool from a loop the muster does not know changes nothing', () => {
  const muster = musterSpawn(EMPTY_MUSTER, 'a1', null, 'zwiad', 0)
  expect(musterTool(muster, 'zzz', 'Read', {})).toBe(muster)
})

test('only runs still going are listed, the earliest sent first', () => {
  let muster = EMPTY_MUSTER
  muster = musterSpawn(muster, 'a1', 'Niuch', 'zwiad', 1_000)
  muster = musterSpawn(muster, 'a2', 'Młot', 'testy', 2_000)
  muster = musterSpawn(muster, 'a3', null, 'sprzątanie', 3_000)
  muster = musterSpawn(muster, 'a4', 'Piryt', 'review', 4_000)
  muster = musterDone(muster, 'a1', 10_000)
  // a3 nie skończył w zdarzeniach, ale silnik już go nie widzi w `running`.
  expect(musterRows(muster, 64_000, new Set(['a2', 'a4']), 10).map(row => [row.name, row.time])).toEqual([
    ['Młot', '1:02'],
    ['Piryt', '1:00'],
  ])
  expect(musterRows(muster, 64_000, null, 10).map(row => row.agentId)).toEqual(['a2', 'a3', 'a4'])
  expect(musterRows(muster, 64_000, null, 2)).toHaveLength(2)
})

test('the muster keeps only its newest runs', () => {
  let muster = EMPTY_MUSTER
  for (let i = 0; i < MUSTER_LIMIT + 3; i += 1) muster = musterSpawn(muster, `a${i}`, null, '', i)
  expect(muster.runs).toHaveLength(MUSTER_LIMIT)
  expect(muster.runs[0]!.agentId).toBe('a3')
})

test('a row drops the mate name the description opens with, the name already leads the row', () => {
  let muster = musterSpawn(EMPTY_MUSTER, 'a1', 'Niuch', 'Niuch: zwiad acts', 0)
  muster = musterSpawn(muster, 'a2', 'Młot', 'Młot — testy cache', 0)
  muster = musterSpawn(muster, 'a3', 'Lont', 'Lont', 0)
  muster = musterSpawn(muster, 'a4', null, 'Niuch: bez imienia w apelu', 0)
  expect(musterRows(muster, 0, null, 10).map(row => row.description)).toEqual(['zwiad acts', 'testy cache', 'Lont', 'Niuch: bez imienia w apelu'])
})

test('runs without an agent list expire by age while confirmed running agents remain', () => {
  const muster = musterSpawn(EMPTY_MUSTER, 'a1', 'Niuch', 'zwiad', 1_000)
  expect(musterRows(muster, 60_000, null, 10)).toHaveLength(1)
  expect(musterRows(muster, 1_801_000, null, 10)).toEqual([])
  expect(musterRows(muster, 1_801_000, new Set(['a1']), 10)).toHaveLength(1)
})
