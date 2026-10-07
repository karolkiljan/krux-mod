import { expect, test } from 'claude-code/testing'

import type { KruxCrew, KruxHordeMember } from '../types'
import { CAPTION_COLUMNS, bandPlan } from '../hooks/band'
import type { BandInput } from '../hooks/band'
import { EMPTY_CREW, crewAfter } from '../hooks/crew'
import { EMPTY_LORE, recordTool } from '../hooks/lore'
import { CALM, EVENT_HOLD_MS } from '../hooks/mood'
import { describeTool } from '../hooks/voice'

const NIUCH: KruxHordeMember = { agentId: 'a1', mate: 'Niuch', scene: 'hammer', target: '' }
const MLOT: KruxHordeMember = { agentId: 'a2', mate: 'Młot', scene: 'hammer', target: '' }

const AT_WORK: BandInput = {
  working: true,
  activity: describeTool('Read', { file_path: '/repo/app.ts' }, 0),
  strikes: 1,
  total: 1,
  moods: CALM,
  members: [],
  held: null,
  waiting: false,
  still: false,
  now: 10_000,
  columns: 120,
  rows: 10,
  hasClient: true,
}

test('the band takes six rows and a rule when tall, three without the rule when low, one line when tiny', async () => {
  expect(bandPlan(AT_WORK)).toMatchObject({ rule: true, stage: { height: 6 } })
  expect(bandPlan({ ...AT_WORK, rows: 7 })).toMatchObject({ rule: true, stage: { height: 6 } })
  expect(bandPlan({ ...AT_WORK, rows: 6 })).toMatchObject({ rule: true, stage: { height: 3 } })
  expect(bandPlan({ ...AT_WORK, rows: 3 })).toMatchObject({ rule: false, stage: { height: 3 } })
  expect(bandPlan({ ...AT_WORK, rows: 2 })).toMatchObject({ rule: true, stage: null })
  expect(bandPlan({ ...AT_WORK, rows: 1 })).toMatchObject({ rule: false, stage: null })
  expect(bandPlan({ ...AT_WORK, columns: 40 }).stage).toBe(null)
})

test('the caption names the work, the bubble sits over its speaker', async () => {
  const plan = bandPlan(AT_WORK)
  expect(plan.verb).toBe('Krux czytać runy')
  expect(plan.target).toBe('app.ts')
  expect(plan.tally).toBe('')
  expect(plan.stage!.props.bubble).toMatchObject({ key: 'krux', speaker: 'Krux' })
  const low = bandPlan({ ...AT_WORK, rows: 3 })
  expect(low.stage!.props.bubble).toBe(null)
  expect(low.target).toContain('app.ts')
  expect(low.tally).toBe('')
})

test('the resting caption keeps only the title, selected by the work done', async () => {
  for (const [strikes, total, verb] of [
    [0, 0, 'Krux tylko gadać'],
    [7, 64, 'Krux ocierać pot'],
    [21, 65, 'Krux pić z wiadra'],
  ] as const) {
    const plan = bandPlan({ ...AT_WORK, working: false, activity: null, strikes, total })
    expect([plan.verb, plan.target, plan.tally]).toEqual([verb, '', ''])
    expect(plan.stage).toMatchObject({ height: 6 })
  }
  expect(CAPTION_COLUMNS).toBe(28)
})

test('without a canvas the band budgets one text row and keeps the bubble in text', async () => {
  for (const rows of [2, 3, 7]) {
    const plan = bandPlan({ ...AT_WORK, rows, hasClient: false })
    expect(plan).toMatchObject({ rule: true, stage: null })
    expect(plan.target).toContain('app.ts')
    expect(plan.tally).toBe('')
  }
  expect(bandPlan({ ...AT_WORK, rows: 1, hasClient: false })).toMatchObject({ rule: false, stage: null })
})

test('mates beyond the slots are counted, and Krux waits on the sofa while they work', async () => {
  const crowd = [NIUCH, MLOT, { ...NIUCH, agentId: 'a3', mate: 'Lont' as const }, { ...NIUCH, agentId: 'a4', mate: null }]
  // 140 kolumn: podpis 28 + przerwa 2, za nimi cztery prostokąty po 22 z odstępem 2.
  const plan = bandPlan({ ...AT_WORK, columns: 140, members: crowd, waiting: true })
  expect(plan.stage!.props.orcs.map(orc => orc.key)).toEqual(['krux', 'a1', 'a2', 'a3'])
  expect(plan.tally).toBe('+1 z hordy')
  expect(plan.verb).toBe('Krux czekać na hordę')
  expect(plan.stage!.props.orcs[0]!.scene).toBe('lounge')
  const rest = bandPlan({ ...AT_WORK, working: false, activity: null, columns: 140, members: crowd })
  expect([rest.verb, rest.target, rest.tally]).toEqual(['Krux czekać na hordę', '', '+1 z hordy'])
  expect(bandPlan({ ...AT_WORK, members: [NIUCH] }).verb).toBe('Krux czytać runy')
})

test('low and text-only captions keep mate speech and only count hidden mates', async () => {
  const held = { kind: 'step' as const, key: 'a1', speaker: 'Niuch' as const, text: 'węszyć lore' }
  for (const working of [true, false]) {
    const input = { ...AT_WORK, working, activity: working ? AT_WORK.activity : null, members: [NIUCH, MLOT], held, columns: 60 }
    const low = bandPlan({ ...input, rows: 3 })
    expect([low.target, low.tally]).toEqual(['Niuch: węszyć lore', '+2 z hordy'])
    expect(low.stage).toMatchObject({ height: 3 })
    const tiny = bandPlan({ ...input, rows: 2 })
    expect([tiny.target, tiny.tally]).toEqual(['Niuch: węszyć lore', '+2 z hordy'])
    expect(tiny.stage).toBe(null)
  }
})

test('a step bubble of a mate gone from the list hangs over nobody', async () => {
  const held = { kind: 'step' as const, key: 'a1', speaker: 'Niuch' as const, text: 'węszyć lore' }
  expect(bandPlan({ ...AT_WORK, members: [NIUCH], held }).stage!.props.bubble).toMatchObject({ key: 'a1', text: 'węszyć lore' })
  expect(bandPlan({ ...AT_WORK, members: [], held }).stage!.props.bubble).toMatchObject({ key: 'krux' })
})

test('each start of work becomes the effort clock on the canvas, never on the sofa', async () => {
  const reading = { ...AT_WORK, activity: { ...describeTool('Read', { file_path: 'a.ts' }, 0), startedAt: 9_000 } }
  expect(bandPlan(reading).stage!.props.orcs[0]!.workAt).toBe(9_000)
  const waiting = bandPlan({ ...reading, members: [{ ...NIUCH, startedAt: 8_000 }], waiting: true })
  expect(waiting.stage!.props.orcs[0]!.scene).toBe('lounge')
  expect(waiting.stage!.props.orcs[0]!.workAt).toBe(undefined)
  expect(waiting.stage!.props.orcs[1]!.workAt).toBe(8_000)
  expect(bandPlan({ ...reading, members: [NIUCH], waiting: true }).stage!.props.orcs[1]!.workAt).toBe(undefined)
})

test('only fresh cues reach the canvas', async () => {
  const cues = [{ key: 'krux', kind: 'commit' as const, until: 9_000 }, { key: 'krux', kind: 'test-pass' as const, until: 11_000 }]
  expect(bandPlan({ ...AT_WORK, cues }).stage!.props.cues).toEqual([cues[1]])
})

test('once a mate hands the scroll back, Krux takes it where he waited, not with the horn', async () => {
  const horn = { ...AT_WORK, activity: describeTool('Agent', { description: 'zwiad' }, 0) }
  const handoff = { key: 'a1', kind: 'handoff' as const, until: 12_000 }
  expect(bandPlan({ ...horn, cues: [handoff] }).stage!.props.orcs[0]!.scene).toBe('lounge')
  expect(bandPlan({ ...horn, cues: [{ ...handoff, until: 9_000 }] }).stage!.props.orcs[0]!.scene).toBe('horn')
  // Kumpel w tle oddaje zwój, a Krux robi swoje: zostaje przy swojej robocie.
  expect(bandPlan({ ...AT_WORK, cues: [handoff] }).stage!.props.orcs[0]!.scene).toBe('read')
})

test('at rest the stage stands still unless a background mate is on it', async () => {
  const rest = { ...AT_WORK, working: false, activity: null }
  expect(bandPlan(rest).stage!.props).toMatchObject({ rest: true, still: false })
  expect(bandPlan({ ...rest, members: [NIUCH] }).stage!.props.rest).toBe(false)
  expect(bandPlan({ ...AT_WORK, still: true }).stage!.props).toMatchObject({ rest: false, still: true })
})

const failed = recordTool(EMPTY_LORE, 'Bash', { command: 'npm test' }, true)

test('a mate step takes the bubble, a fresh event holds it until it expires', async () => {
  let crew: KruxCrew = crewAfter(EMPTY_CREW, { kind: 'spawn', member: MLOT }, 0)
  crew = crewAfter(crew, { kind: 'mate-tool', agentId: 'a2', doing: describeTool('Bash', { command: 'npm test' }, 0) }, 0)
  expect(crew.bubble).toEqual({ kind: 'step', key: 'a2', speaker: 'Młot', text: 'bić próbę stali npm test' })
  expect(crew.members[0]!.scene).toBe('test')
  crew = crewAfter(crew, { kind: 'own-tool', event: 'test-fail', lore: failed, seed: 0 }, 1_000)
  expect(crew.bubble).toMatchObject({ kind: 'event', key: 'a2', speaker: 'Młot', until: 1_000 + EVENT_HOLD_MS })
  const held = crewAfter(crew, { kind: 'mate-tool', agentId: 'a2', doing: describeTool('Read', { file_path: 'a.ts' }, 0) }, 2_000)
  expect(held.bubble).toBe(crew.bubble)
  expect(crewAfter(crew, { kind: 'expire' }, 2_000)).toBe(crew)
  expect(crewAfter(crew, { kind: 'expire' }, 1_000 + EVENT_HOLD_MS).bubble).toBe(null)
})

test('a mate’s own result takes the bubble over the mate, off stage nobody says it', async () => {
  const single = recordTool(EMPTY_LORE, 'Bash', { command: 'npm test' }, true)
  let crew: KruxCrew = crewAfter(EMPTY_CREW, { kind: 'spawn', member: MLOT }, 0)
  crew = crewAfter(crew, { kind: 'mate-tool', agentId: 'a2', doing: describeTool('Bash', { command: 'npm test' }, 0) }, 0)
  const said = crewAfter(crew, { kind: 'mate-event', agentId: 'a2', event: 'test-fail', lore: single, seed: 0 }, 500)
  expect(said.bubble).toEqual({ kind: 'event', key: 'a2', speaker: 'Młot', text: 'Smród! 1 na 1 padać.', until: 500 + EVENT_HOLD_MS })
  expect(crewAfter(crew, { kind: 'mate-event', agentId: 'a9', event: 'test-fail', lore: single, seed: 0 }, 500)).toBe(crew)
})

test('a mate handing back the report says so, not the engine tool name', async () => {
  let crew: KruxCrew = crewAfter(EMPTY_CREW, { kind: 'spawn', member: NIUCH }, 0)
  crew = crewAfter(crew, { kind: 'mate-tool', agentId: 'a1', doing: describeTool('SubagentHandback', {}, 0) }, 0)
  expect(crew.bubble).toEqual({ kind: 'step', key: 'a1', speaker: 'Niuch', text: 'oddawać meldunek' })
  expect(crew.members[0]!.scene).toBe('read')
})

test('an event without its mate on stage is Krux’s to say', async () => {
  const crew = crewAfter(EMPTY_CREW, { kind: 'own-tool', event: 'test-fail', lore: failed, seed: 0 }, 0)
  expect(crew.bubble).toMatchObject({ kind: 'event', key: 'krux', speaker: 'Krux' })
})

test('one nameless orc leaving does not take the other one’s step', async () => {
  const first = { agentId: 'a1', mate: null, scene: 'hammer' as const, target: '' }
  const second = { ...first, agentId: 'a2' }
  let crew = crewAfter(crewAfter(EMPTY_CREW, { kind: 'spawn', member: first }, 0), { kind: 'spawn', member: second }, 0)
  crew = crewAfter(crew, { kind: 'mate-tool', agentId: 'a2', doing: describeTool('Read', { file_path: 'b.ts' }, 0) }, 0)
  const left = crewAfter(crew, { kind: 'mate-done', agentId: 'a1' }, 0)
  expect(left.members.map(member => member.agentId)).toEqual(['a2'])
  expect(left.bubble).toMatchObject({ key: 'a2' })
  const done = crewAfter(left, { kind: 'mate-done', agentId: 'a2' }, 0)
  expect(done.members).toEqual([])
  expect(done.bubble).toBe(null)
  expect(done.cues.map(cue => cue.key)).toEqual(['a1', 'a2'])
  expect(crewAfter(done, { kind: 'expire' }, EVENT_HOLD_MS)).toEqual(EMPTY_CREW)
})

test('the running list prunes the stage, and Krux’s own tool ends a mate step', async () => {
  let crew = crewAfter(crewAfter(EMPTY_CREW, { kind: 'spawn', member: NIUCH }, 0), { kind: 'spawn', member: MLOT }, 0)
  crew = crewAfter(crew, { kind: 'mate-tool', agentId: 'a1', doing: describeTool('Grep', { pattern: 'x' }, 0) }, 0)
  expect(crewAfter(crew, { kind: 'running', ids: new Set(['a1', 'a2']) }, 0)).toBe(crew)
  expect(crewAfter(crew, { kind: 'running', ids: new Set(['a2']) }, 0)).toEqual({ members: [MLOT], bubble: null, cues: [] })
  expect(crewAfter(crew, { kind: 'own-tool', event: null, lore: EMPTY_LORE, seed: 0 }, 0).bubble).toBe(null)
})
