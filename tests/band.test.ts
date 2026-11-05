import { expect, test } from 'claude-code/testing'

import type { KruxCrew, KruxHordeMember } from '../types'
import { CAPTION_COLUMNS, bandPlan } from '../hooks/band'
import type { BandInput } from '../hooks/band'
import { EMPTY_CREW, crewAfter } from '../hooks/crew'
import { EMPTY_LORE, recordTool } from '../hooks/lore'
import { CALM, EVENT_HOLD_MS, SPAR_EVENTS, kruxAnswer, riposteLine, sparLine } from '../hooks/mood'
import { MATES } from '../hooks/roster'
import { BUBBLE_TEXT, hasHearth } from '../hooks/sprites'
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

test('the hearth beats the last mate slot: Krux keeps his fire on a band beside the Sztolnia', async () => {
  // Pas obok panelu Sztolni ma około 80 kolumn płótna: trzech orków albo dwóch i palenisko.
  for (const [columns, slots] of [[110, 2], [120, 3], [130, 3], [136, 4], [140, 4]] as const) {
    const props = bandPlan({ ...AT_WORK, columns }).stage!.props
    expect([columns, props.slots, hasHearth(props.floor!, props.slots)]).toEqual([columns, slots, true])
  }
  // Węższy pas nie ma miejsca na palenisko nawet przy dwóch: zostaje tyle miejsc, ile się mieści.
  const narrow = bandPlan({ ...AT_WORK, columns: 80 }).stage!.props
  expect([narrow.slots, hasHearth(narrow.floor!, narrow.slots)]).toEqual([2, false])
  // Kumpel, którego nie widać, liczy się w podpisie.
  expect(bandPlan({ ...AT_WORK, columns: 110, members: [NIUCH, MLOT] }).tally).toBe('+1 z hordy')
  // W bezruchu palenisko nie staje, więc miejsca kumplowi nie zabiera.
  expect(bandPlan({ ...AT_WORK, columns: 110, still: true }).stage!.props.slots).toBe(3)
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

// Spór w dymkach: co drugie zdarzenie para odszczekuje, ale kumpel dalej mówi tylko na scenie.
test('the sparring partner answers the event: on stage himself, off stage through Krux', async () => {
  const offStage = crewAfter(EMPTY_CREW, { kind: 'own-tool', event: 'test-fail', lore: failed, seed: 0 }, 1_000)
  expect(crewAfter(offStage, { kind: 'expire' }, 2_000)).toBe(offStage)
  const relayed = crewAfter(offStage, { kind: 'expire' }, 1_000 + EVENT_HOLD_MS)
  expect(relayed.bubble).toMatchObject({ kind: 'event', key: 'krux', speaker: 'Krux', text: expect.stringMatching(/^Niuch z chodnika: /u), until: 1_000 + 2 * EVENT_HOLD_MS })
  expect(crewAfter(relayed, { kind: 'expire' }, 1_000 + 2 * EVENT_HOLD_MS).bubble).toBe(null)
  const niuch = { ...MLOT, agentId: 'a3', mate: 'Niuch' as const }
  const both = crewAfter(crewAfter(crewAfter(EMPTY_CREW, { kind: 'spawn', member: MLOT }, 0), { kind: 'spawn', member: niuch }, 0), { kind: 'own-tool', event: 'test-fail', lore: failed, seed: 0 }, 1_000)
  const answered = crewAfter(both, { kind: 'expire' }, 1_000 + EVENT_HOLD_MS)
  expect(answered.bubble).toMatchObject({ key: 'a3', speaker: 'Niuch' })
  expect((answered.bubble as { text: string }).text).not.toContain('z chodnika')
  const quiet = crewAfter(EMPTY_CREW, { kind: 'own-tool', event: 'test-fail', lore: failed, seed: 1 }, 1_000)
  expect(crewAfter(quiet, { kind: 'expire' }, 1_000 + EVENT_HOLD_MS).bubble).toBe(null)
})

test('a partner who left before its turn answers through Krux, and a gone mate never talks from the caption', () => {
  const niuch = { ...MLOT, agentId: 'a3', mate: 'Niuch' as const }
  const both = crewAfter(crewAfter(EMPTY_CREW, { kind: 'spawn', member: niuch }, 0), { kind: 'own-tool', event: 'test-fail', lore: failed, seed: 0 }, 1_000)
  const left = crewAfter(both, { kind: 'mate-done', agentId: 'a3' }, 1_500)
  expect(crewAfter(left, { kind: 'expire' }, 1_000 + EVENT_HOLD_MS).bubble).toMatchObject({ key: 'krux', speaker: 'Krux', text: expect.stringMatching(/^Niuch z chodnika: /u) })
  for (const mate of MATES) {
    for (const event of SPAR_EVENTS) {
      for (const seed of [0, 2]) expect(`${mate} z chodnika: ${sparLine(event, seed)}`.length).toBeLessThanOrEqual(BUBBLE_TEXT)
    }
  }
})

test('a speaker who leaves takes the partner’s answer along', () => {
  const stage = crewAfter(EMPTY_CREW, { kind: 'spawn', member: MLOT }, 0)
  const spoken = crewAfter(stage, { kind: 'own-tool', event: 'test-fail', lore: failed, seed: 0 }, 1_000)
  const gone = crewAfter(spoken, { kind: 'mate-done', agentId: 'a2' }, 1_500)
  expect(crewAfter(gone, { kind: 'expire' }, 1_000 + EVENT_HOLD_MS).bubble).toBe(null)
  const pruned = crewAfter(spoken, { kind: 'running', ids: new Set<string>() }, 1_500)
  expect(crewAfter(pruned, { kind: 'expire' }, 1_000 + EVENT_HOLD_MS).bubble).toBe(null)
})

test('a mate step takes the bubble, a fresh event holds it until it expires', async () => {
  let crew: KruxCrew = crewAfter(EMPTY_CREW, { kind: 'spawn', member: MLOT }, 0)
  crew = crewAfter(crew, { kind: 'mate-tool', agentId: 'a2', doing: describeTool('Bash', { command: 'npm test' }, 0) }, 0)
  expect(crew.bubble).toEqual({ kind: 'step', key: 'a2', speaker: 'Młot', text: 'bić próbę stali npm test' })
  expect(crew.members[0]!.scene).toBe('test')
  crew = crewAfter(crew, { kind: 'own-tool', event: 'test-fail', lore: failed, seed: 1 }, 1_000)
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
  expect(said.bubble).toEqual({ kind: 'event', key: 'a2', speaker: 'Młot', text: 'Smród! 1 na 1 padać.', until: 500 + EVENT_HOLD_MS, reply: { key: 'krux', speaker: 'Krux', text: kruxAnswer('test-fail', 0) } })
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

// Dyskusja w trzech kwestiach: co czwarte zdarzenie mówca wtrętu, gdy sam stoi na scenie,
// odpowiada na odszczekanie pary. Krux nie opowiada sporu dwóch nieobecnych.
test('a mate on stage answers the partner back every fourth event, and Krux never relays a debate of two absent mates', () => {
  const niuch = { ...MLOT, agentId: 'a3', mate: 'Niuch' as const }
  const both = crewAfter(crewAfter(EMPTY_CREW, { kind: 'spawn', member: MLOT }, 0), { kind: 'spawn', member: niuch }, 0)
  const said = crewAfter(both, { kind: 'own-tool', event: 'test-fail', lore: failed, seed: 0 }, 1_000)
  expect(said.bubble).toMatchObject({ key: 'a2', speaker: 'Młot' })
  const answered = crewAfter(said, { kind: 'expire' }, 1_000 + EVENT_HOLD_MS)
  expect(answered.bubble).toMatchObject({ key: 'a3', speaker: 'Niuch', text: sparLine('test-fail', 0) })
  const back = crewAfter(answered, { kind: 'expire' }, 1_000 + 2 * EVENT_HOLD_MS)
  expect(back.bubble).toMatchObject({ key: 'a2', speaker: 'Młot', text: riposteLine('test-fail', 0), until: 1_000 + 3 * EVENT_HOLD_MS })
  expect(crewAfter(back, { kind: 'expire' }, 1_000 + 3 * EVENT_HOLD_MS).bubble).toBe(null)
  // Drugie parzyste zdarzenie: odszczekanie bez riposty.
  const second = crewAfter(crewAfter(both, { kind: 'own-tool', event: 'test-fail', lore: failed, seed: 2 }, 1_000), { kind: 'expire' }, 1_000 + EVENT_HOLD_MS)
  expect(second.bubble).toMatchObject({ key: 'a3' })
  expect(crewAfter(second, { kind: 'expire' }, 1_000 + 2 * EVENT_HOLD_MS).bubble).toBe(null)
  // Mówcy fachu nie ma na scenie, wtręt mówi Krux: odszczekanie z chodnika, ale bez riposty.
  const relayed = crewAfter(crewAfter(EMPTY_CREW, { kind: 'own-tool', event: 'test-fail', lore: failed, seed: 0 }, 1_000), { kind: 'expire' }, 1_000 + EVENT_HOLD_MS)
  expect(relayed.bubble).toMatchObject({ key: 'krux', text: expect.stringMatching(/^Niuch z chodnika: /u) })
  expect(crewAfter(relayed, { kind: 'expire' }, 1_000 + 2 * EVENT_HOLD_MS).bubble).toBe(null)
  // Mówca zszedł przed swoją ripostą: mówi przez Kruxa, jak para nieobecna.
  const gone = crewAfter(answered, { kind: 'mate-done', agentId: 'a2' }, 1_000 + EVENT_HOLD_MS + 100)
  expect(crewAfter(gone, { kind: 'expire' }, 1_000 + 2 * EVENT_HOLD_MS).bubble).toMatchObject({ key: 'krux', text: `Młot z chodnika: ${riposteLine('test-fail', 0)}` })
  for (const mate of MATES) {
    for (const event of SPAR_EVENTS) {
      for (const seed of [0, 4]) expect(`${mate} z chodnika: ${riposteLine(event, seed)}`.length).toBeLessThanOrEqual(BUBBLE_TEXT)
    }
  }
})

test('a mate’s own result gets an answer: the partner on stage when it is the trade of the event, otherwise a word from Krux', () => {
  const single = recordTool(EMPTY_LORE, 'Bash', { command: 'npm test' }, true)
  const niuch = { ...MLOT, agentId: 'a3', mate: 'Niuch' as const }
  const both = crewAfter(crewAfter(EMPTY_CREW, { kind: 'spawn', member: MLOT }, 0), { kind: 'spawn', member: niuch }, 0)
  const answered = crewAfter(crewAfter(both, { kind: 'mate-event', agentId: 'a2', event: 'test-fail', lore: single, seed: 0 }, 500), { kind: 'expire' }, 500 + EVENT_HOLD_MS)
  expect(answered.bubble).toMatchObject({ key: 'a3', speaker: 'Niuch', text: sparLine('test-fail', 0) })
  expect(crewAfter(answered, { kind: 'expire' }, 500 + 2 * EVENT_HOLD_MS).bubble).toMatchObject({ key: 'a2', speaker: 'Młot', text: riposteLine('test-fail', 0) })
  // Bez pary na scenie mówi Krux, krótko i bez riposty; nieparzysty los to cisza.
  const alone = crewAfter(EMPTY_CREW, { kind: 'spawn', member: MLOT }, 0)
  const krux = crewAfter(crewAfter(alone, { kind: 'mate-event', agentId: 'a2', event: 'test-fail', lore: single, seed: 0 }, 500), { kind: 'expire' }, 500 + EVENT_HOLD_MS)
  expect(krux.bubble).toMatchObject({ key: 'krux', speaker: 'Krux', text: kruxAnswer('test-fail', 0) })
  expect(crewAfter(krux, { kind: 'expire' }, 500 + 2 * EVENT_HOLD_MS).bubble).toBe(null)
  expect(crewAfter(crewAfter(alone, { kind: 'mate-event', agentId: 'a2', event: 'test-fail', lore: single, seed: 1 }, 500), { kind: 'expire' }, 500 + EVENT_HOLD_MS).bubble).toBe(null)
  // Testy Groma to nie fach Groma: odszczekanie Piryta mówiłoby głosem Niucha, więc mówi Krux.
  const grom = { ...MLOT, agentId: 'a4', mate: 'Grom' as const }
  const piryt = { ...MLOT, agentId: 'a5', mate: 'Piryt' as const }
  const forge = crewAfter(crewAfter(EMPTY_CREW, { kind: 'spawn', member: grom }, 0), { kind: 'spawn', member: piryt }, 0)
  expect(crewAfter(crewAfter(forge, { kind: 'mate-event', agentId: 'a4', event: 'test-fail', lore: single, seed: 0 }, 500), { kind: 'expire' }, 500 + EVENT_HOLD_MS).bubble).toMatchObject({ key: 'krux', speaker: 'Krux' })
  // Kumpel, który zszedł, nie dostaje odpowiedzi.
  const left = crewAfter(crewAfter(alone, { kind: 'mate-event', agentId: 'a2', event: 'test-pass', lore: single, seed: 0 }, 500), { kind: 'mate-done', agentId: 'a2' }, 600)
  expect(crewAfter(left, { kind: 'expire' }, 500 + EVENT_HOLD_MS).bubble).toBe(null)
  for (const event of SPAR_EVENTS) for (const seed of [0, 2, 4]) expect(kruxAnswer(event, seed).length).toBeLessThanOrEqual(BUBBLE_TEXT)
})
