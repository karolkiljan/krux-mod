import { expect, mock, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'
import type { AgentStatus, CommandSpec, SessionUsage, TurnStepChunk, TurnStepResult } from 'claude-code'

import type { KruxCrew, KruxJournal, KruxLore } from '../types'
import { PALETTE, SPEAKER_COLOR, actsFor } from '../hooks/sprites'
import type { StageScene } from '../hooks/sprites'
import { replay } from '../hooks/lore'
import { COMPACT_NOTE, FORMAT_HINT, LENGTH_HINT, RISK_HINT, VOICE_ANCHOR, VOICE_SHORT } from '../hooks/voice'

type On = Parameters<TestBody>[1]

// Fartuchy kumpli z palety: kolor na płótnie mówi, kto stoi na scenie.
const NIUCH = SPEAKER_COLOR.Niuch
const MLOT = SPEAKER_COLOR.Młot
const LONT = SPEAKER_COLOR.Lont
const NAMELESS = SPEAKER_COLOR.ork

const TEXTS: Record<string, string> = {
  persona: '---\nname: krux\n---\n\n## Kim jest Krux\n\nOrk z Górniczej Doliny.',
  konkret: '## Tryb konkret\n\nTylko proszone.',
  flow: '## Tryb flow\n\nJeden ruch na raz.',
}

const BASE = [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' as const }]

const COMPOSE = {
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  surfaces: ['terminal' as const],
  tools: ['Read'],
  outputStyle: null,
  traits: [],
}

const ORIGIN = { kind: 'composer' as const }

// Wszystko, co Claude Code odpowiedziałby modowi, z magazynem w Mapie.
type History = { role: 'user' | 'assistant'; text: string; toolUses: { tool_use_id: string; tool: string; input: Record<string, unknown>; isError?: true; text?: string }[] }[]

type ProcessReply = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
type Extras = { beforePaneList?: () => Promise<void>; paneClosed?: boolean; invalidations?: string[]; journalWrites?: KruxJournal[]; beforeStoreGet?: () => void; logs?: string[]; onPrompt?: () => void; toasts?: string[]; settings?: Record<string, unknown>; plugins?: string[]; toolError?: string; toolDenied?: boolean; toolReply?: { result: unknown; text?: string; isError?: true }; agentGate?: Promise<void>; history?: History; agents?: { id: string; status: AgentStatus; description?: string; type?: string }[]; opened?: string[]; closed?: string[]; usage?: SessionUsage; usageRead?: () => SessionUsage | Promise<SessionUsage>; beforeAgentList?: () => Promise<void>; beforeStoreSet?: () => Promise<void>; paneWaits?: boolean; paneHidden?: boolean; git?: { stdout: string }; tools?: string[]; commands?: CommandSpec[]; processRun?: (argv: readonly string[], timeoutMs: number | undefined) => ProcessReply | Promise<ProcessReply> }

function engine(on: On, saved: Map<string, unknown>, extras: Extras = {}) {
  const toasts = extras.toasts ?? []
  on('store.get', ($, e) => { extras.beforeStoreGet?.(); return { value: saved.get(e.key) } })
  on('store.set', async ($, e) => {
    await extras.beforeStoreSet?.()
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('fs.read', ($, e) => {
    const name = /voice\/(\w+)\.md$/.exec(String(e.path))?.[1] ?? ''
    return { value: TEXTS[name] ?? '' }
  })
  if (extras.journalWrites !== undefined) on('state.set', ($, e, next) => {
    if (e.plugin === 'krux-mod' && e.key === 'journal') extras.journalWrites!.push(e.value as KruxJournal)
    return next(e)
  })
  on('settings.read', () => ({ value: extras.settings ?? {} }))
  on('command.list', () => ({
    value: (extras.plugins ?? []).map(plugin => ({ name: `${plugin}:${plugin}`, description: '', source: 'plugin' as const, plugin })),
  }))
  on('command.register', (_$, e) => { extras.commands?.push(e); return { value: { command: e.name } } })
  on('ui.log', ($, e) => { extras.logs?.push(String(e.text)); return { value: undefined } })
  on('ui.toast', ($, e) => {
    toasts.push(String(e.text))
    return { value: undefined }
  })
  // Otwarte panele: stoją, chyba że test każe im czekać na szerszy terminal.
  const panes = new Set<string>()
  on('ui.open', ($, e) => {
    extras.opened?.push(String(e.id))
    panes.add(String(e.id))
    return { value: extras.paneWaits ? { isPlaced: false, reason: 'test' } : { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    extras.closed?.push(String(e.id))
    panes.delete(String(e.id))
    return { value: undefined }
  })
  // Git odpowiada tym, co test trzyma w `git.stdout` (test może to zmienić w trakcie); bez niego repo brak.
  on('process.run', async ($, e) => ({
    value: extras.processRun ? await extras.processRun(e.argv, e.init?.timeoutMs) : { ...(extras.git && e.argv[0] === 'git' ? { exitCode: 0, stdout: extras.git.stdout, stderr: '' } : { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }), isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('tool.register', ($, e) => {
    extras.tools?.push(String(e.name))
    return { value: { tool: `mcp__krux-mod__${String(e.name)}` } }
  })
  if (extras.invalidations !== undefined) on('ui.invalidate', ($, e, next) => { extras.invalidations!.push(e.event); return next(e) })
  on('ui.panes', async () => {
    await extras.beforePaneList?.()
    return { value: [...panes].filter(id => !(id === 'sztolnia' && extras.paneClosed)).map(id => ({ id, title: id, isShown: !extras.paneHidden, isFocused: false, isPlaced: !extras.paneWaits })) }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('session.messages', () => ({ value: extras.history ?? [] }))
  on('session.usage', async () => ({ value: extras.usageRead ? await extras.usageRead() : extras.usage ?? { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  const clock = mock.clock(on)
  let spawned = 0
  on('agent.spawn', () => {
    spawned += 1
    return { model: 'claude-opus-5-5', agentId: `a${spawned}` }
  })
  on('agent.list', async () => {
    await extras.beforeAgentList?.()
    return { value: (extras.agents ?? []).map(agent => ({ description: '', type: 'general-purpose', ...agent })) }
  })
  on('prompt.compose', () => ({ sections: BASE }))
  on('prompt.submit', ($, e) => { extras.onPrompt?.(); return { text: e.text, context: e.context } })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', async ($, e) => {
    if ((String(e.tool) === 'Agent' || String(e.tool) === 'Task') && extras.agentGate) await extras.agentGate
    if (extras.toolDenied) return { deny: 'blocked' } as never
    if (extras.toolReply) return extras.toolReply
    return extras.toolError ? { isError: true as const, result: extras.toolError, text: extras.toolError } : { result: 'ok' }
  })
  on('ui.render', ($, e) => {
    const { word, text } = e.props as { word?: string; text?: unknown }
    const body = word ?? (typeof text === 'string' && text !== '' ? text : 'engine')
    return { type: 'Text', props: {}, children: [String(body)] }
  })
  return clock
}

// Harness dopełnia resztę pól spawnu i pętlę narzędzia; typy chcą pełnego wejścia silnika.
function spawnOf(input: { prompt: string; description: string; parentAgentId?: string; run_in_background?: boolean; subagentType?: string }) {
  return input as unknown as Parameters<Engine['agent']['spawn']>[0]
}

function inLoop(agentId: string, input: Record<string, unknown>) {
  return { ...input, agentId } as unknown as Parameters<Engine['tool']['call']>[0]
}

async function start($: Engine) {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
}

async function sectionIds($: Engine): Promise<string[]> {
  const composed = await $.prompt.compose(COMPOSE)
  return composed.sections.map(section => section.id)
}

test('the persona rides in the system prompt, after the engine sections', async ($, on) => {
  engine(on, new Map())
  await start($)
  const composed = await $.prompt.compose(COMPOSE)
  expect(composed.sections.map(section => section.id)).toEqual(['intro', 'krux-mod:persona'])
  expect(composed.sections[1]!.text).toBe('## Kim jest Krux\n\nOrk z Górniczej Doliny.')
})

test('each prompt carries the voice anchor while the persona is on', async ($, on) => {
  engine(on, new Map())
  await start($)
  const entered = await $.prompt.submit({ text: 'napraw testy', wait: false, origin: ORIGIN })
  expect(entered.context).toEqual([VOICE_ANCHOR, LENGTH_HINT])
})

test('a subagent report keeps the voice but gets no format line or horde note', async ($, on) => {
  engine(on, new Map(), { toolError: '1 failed' })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  for (const turnId of ['t1', 't2']) {
    await $.turn.complete({ answer: 'Krux szukać dalej.', durationMs: 10, isAborted: false, turnId, reason: 'answer' })
  }
  const report = await $.prompt.submit({ text: 'Review: build failed, 3 errors.', wait: false, origin: { kind: 'task-notification' } })
  expect(report.context).toEqual([VOICE_ANCHOR])
  const peer = await $.prompt.submit({ text: 'Plan gotowy?', wait: false, origin: { kind: 'peer' } })
  expect(peer.context).toEqual([VOICE_SHORT])
  const own = await $.prompt.submit({ text: 'i?', wait: false, origin: ORIGIN })
  expect((own.context ?? []).some(entry => entry.startsWith('Życie hordy'))).toBe(true)
})

test('the phrase "wyłącz krux" persists, tells the model, and drops persona and anchor', async ($, on) => {
  const saved = new Map<string, unknown>()
  engine(on, saved)
  await start($)
  const entered = await $.prompt.submit({ text: 'wyłącz krux', wait: false, origin: ORIGIN })
  expect(entered.context).toEqual(['Tryb Krux wyłączony. Odpowiadaj neutralnie, bez głosu orka.'])
  expect(saved.get('mode.persona')).toBe(false)
  expect(await sectionIds($)).toEqual(['intro'])
  const later = await $.prompt.submit({ text: 'a teraz?', wait: false, origin: ORIGIN })
  expect(later.context).toBeUndefined()
})

test('a quoted toggle from a subagent cannot change modes', async ($, on) => {
  const saved = new Map<string, unknown>()
  engine(on, saved)
  await start($)
  const report = await $.prompt.submit({ text: 'wyłącz krux', wait: false, origin: { kind: 'task-notification' } })
  expect(report.context).toEqual([VOICE_ANCHOR])
  expect(saved.has('modes')).toBe(false)
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:persona'])
})

test('a plugin relaying the person’s own words can format and toggle modes', async ($, on) => {
  const saved = new Map<string, unknown>()
  engine(on, saved)
  await start($)
  const origin = { kind: 'plugin' as const, name: 'relay', asUser: true as const }
  const request = await $.prompt.submit({ text: 'napraw testy', wait: false, origin })
  expect(request.context).toEqual([VOICE_ANCHOR, LENGTH_HINT])
  await $.prompt.submit({ text: 'wyłącz krux', wait: false, origin: { kind: 'plugin', name: 'relay' } })
  expect(saved.has('modes')).toBe(false)
  await $.prompt.submit({ text: 'wyłącz krux', wait: false, origin })
  expect(saved.get('mode.persona')).toBe(false)
})

test('modes saved by an earlier session come back at start', async ($, on) => {
  engine(on, new Map<string, unknown>([['modes', { persona: false, konkret: true, flow: true, animacje: true }]]))
  await start($)
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:konkret', 'krux-mod:flow'])
})

test('/krux konkret flips the mode and leaves the model a note', async ($, on) => {
  engine(on, new Map())
  await start($)
  const answer = await $.command.run({ command: 'krux', args: 'konkret', origin: ORIGIN, presentation: { isFullscreen: false, columns: 120 } })
  expect(answer.text).toContain('Konkret włączony')
  expect(answer.context).toEqual(['Konkret włączony. Kontrakt zakresu stoi w prompcie systemowym.'])
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:persona', 'krux-mod:konkret'])
})

test('/krux status and an unknown argument answer as text', async ($, on) => {
  engine(on, new Map())
  await start($)
  const presentation = { isFullscreen: false, columns: 120 }
  const status = await $.command.run({ command: 'krux', args: 'status', origin: ORIGIN, presentation })
  expect(status.text).toBe('persona: on · konkret: off · flow: off · animacje: on · kowal: on · sztolnia: on · czat: off')
  const help = await $.command.run({ command: 'krux', args: 'kopać', origin: ORIGIN, presentation })
  expect(help.text).toContain('/krux status')
})

test('/krux without a pane to place prints status and help', async ($, on) => {
  engine(on, new Map(), { paneWaits: true })
  await start($)
  const answer = await $.command.run({ command: 'krux', args: '', origin: ORIGIN, presentation: { isFullscreen: false, columns: 120 } })
  expect(answer.text).toContain('persona: on')
  expect(answer.text).toContain('/krux status')
})

test('/clear, /resume and a fork read the modes from the store again', async ($, on) => {
  const saved = new Map<string, unknown>()
  on('classic.SessionStart', () => ({}))
  engine(on, saved)
  await start($)
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:persona'])
  // Inna sesja zapisała flow; /clear tej sesji ma to podjąć.
  saved.set('modes', { persona: true, konkret: false, flow: true, animacje: true })
  await $.classic.SessionStart({ source: 'clear' })
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:persona', 'krux-mod:flow'])
  saved.set('modes', { persona: true, konkret: true, flow: false, animacje: true })
  await $.classic.SessionStart({ source: 'resume' })
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:persona', 'krux-mod:konkret'])
  saved.set('modes', { persona: false, konkret: false, flow: true, animacje: true })
  await $.classic.SessionStart({ source: 'fork' })
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:flow'])
})

test('the footer shows the krux, konkret and flow labels beside the engine’s', async ($, on) => {
  // Silnik rysuje etykiety, które dostał: ten hook stoi przed ogólnym z `engine`.
  on('ui.render', { component: 'SessionMode' }, ($, e) => ({ type: 'Text', props: {}, children: [e.props.modes.join(',')] }))
  engine(on, new Map<string, unknown>([['modes', { persona: true, konkret: false, flow: true, animacje: true, kowal: true }]]))
  await start($)
  const ui = await $.ui.mount({ plugin: 'krux-mod', surface: 'terminal', component: 'SessionMode', requestId: 'mode', props: { modes: ['plan'] } } as unknown as Parameters<Engine['ui']['mount']>[0])
  expect(await ui.find({ type: 'Text', text: 'plan,krux,flow' })).toBeDefined()
})

test('the spinner says an orkish word and keeps the engine drawing', async ($, on) => {
  engine(on, new Map())
  await start($)
  const ui = await $.ui.mount({
    plugin: 'krux-mod',
    surface: 'terminal',
    component: 'Spinner',
    requestId: 'main',
    props: { word: 'Sauteing', message: null, suffix: '…', mode: 'tool-use' },
  })
  expect(await ui.find({ type: 'Text', text: /^(Harować|Robić swoje|Pracować|Mozolić się)$/ })).toBeDefined()
})

const BAND = {
  plugin: 'krux-mod',
  component: 'AbovePrompt',
  requestId: 'band',
  viewport: { columns: 120, rows: 40 },
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('while Claude works, the smith hammers above the prompt and names the tool', async ($, on) => {
  engine(on, new Map())
  await start($)
  await $.turn.start({ text: 'czytaj', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Krux czytać runy' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'app.ts' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /uderzeń/ })).toBeUndefined()
  expect(await ui.find({ key: 'forge' })).toBeDefined()
})

test('the desktop draws no band, nameplates or reply rule: they count terminal cells', async ($, on) => {
  engine(on, new Map())
  await start($)
  await $.turn.start({ text: 'czytaj', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'forge' })).toBeUndefined()
  expect(await band.find({ type: 'Text', text: 'Krux czytać runy' })).toBeUndefined()
  const reply = await $.ui.mount({ ...REPLY, surface: 'desktop', props: { text: 'Build pad.', isFirstOfReply: true } })
  expect(await reply.find({ type: 'Text', text: '⚒ Krux' })).toBeUndefined()
  expect(await reply.find({ type: 'Box', borderStyle: 'quote' } as never)).toBeUndefined()
  const own = await $.ui.mount({ plugin: 'krux-mod', surface: 'desktop', component: 'UserMessage', requestId: 'u1', props: { text: 'siema', origin: { kind: 'composer' }, isExpanded: false } })
  expect(await own.find({ type: 'Text', text: 'Morra' })).toBeUndefined()
})

const digestBand = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], sztolnia: boolean, paneWaits = false) => {
  engine(on, new Map<string, unknown>([['modes', { persona: true, konkret: false, flow: false, animacje: true, kowal: true, sztolnia }]]), { paneWaits })
  await start($)
  await $.turn.start({ text: 'plan', turnId: 't1' })
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Kuć poprawkę', status: 'in_progress', activeForm: 'Kuć' }] })
  return $.ui.mount({ ...BAND, surface: 'terminal' })
}

test('with the Sztolnia pane shut, its digest stands beside the stage', async ($, on) => {
  const ui = await digestBand($, on, false)
  expect(await ui.find({ key: 'digest' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '0/1 Kuć poprawkę' })).toBeDefined()
})

test('with the Sztolnia pane open, the band leaves the board to the pane', async ($, on) => {
  const ui = await digestBand($, on, true)
  expect(await ui.find({ key: 'forge' })).toBeDefined()
  expect(await ui.find({ key: 'digest' })).toBeUndefined()
})

test('with the Sztolnia on but its pane waiting for a wider terminal, the digest stands in for it', async ($, on) => {
  const ui = await digestBand($, on, true, true)
  expect(await ui.find({ key: 'digest' })).toBeDefined()
})

test('the digest never lifts the band: no more lines than canvas rows, the most important first', async ($, on) => {
  const git = { stdout: '# branch.oid a\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +3 -0\n1 .M N... a b c d e f.ts\n' }
  engine(on, new Map<string, unknown>([['modes', { persona: true, konkret: false, flow: false, animacje: true, kowal: true, sztolnia: false }]]), { git })
  await start($)
  await $.turn.start({ text: 'plan', turnId: 't1' })
  await $.tool.call({ tool: 'mcp__krux-mod__watki', open: [{ text: 'push czeka' }] } as never)
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Kuć poprawkę', status: 'in_progress', activeForm: 'Kuć' }] })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const low = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 160, maxRows: 4 } })
  const shown = []
  for (const key of ['threads', 'git', 'readiness', 'plan', 'tests']) if ((await low.find({ key })) !== undefined) shown.push(key)
  expect(shown).toEqual(['threads', 'git', 'readiness'])
})

test('on a narrow terminal the digest takes an empty mate slot instead of falling off', async ($, on) => {
  engine(on, new Map<string, unknown>([['modes', { persona: true, konkret: false, flow: false, animacje: true, kowal: true, sztolnia: false }]]))
  await start($)
  await $.turn.start({ text: 'plan', turnId: 't1' })
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Kuć poprawkę', status: 'in_progress', activeForm: 'Kuć' }] })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 115 } })
  expect(await ui.find({ key: 'digest' })).toBeDefined()
  expect(((await ui.find({ key: 'forge' }))!.props.props as { slots: number }).slots).toBe(2)
})

test('a dim rule across the band separates it from the reply above', async ($, on) => {
  engine(on, new Map())
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const rule = await ui.find({ type: 'Text', text: '─'.repeat(BAND.props.bodyColumns) })
  expect(rule).toBeDefined()
  expect(rule!.props.dimColor).toBe(true)
})

test('the smith moves: frames change on the frame clock', async ($, on) => {
  engine(on, new Map())
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const before = (await ui.findAll({ type: 'Text', in: 'forge' })).map(element => JSON.stringify(element.children)).join('')
  await ui.advance(450)
  const after = (await ui.findAll({ type: 'Text', in: 'forge' })).map(element => JSON.stringify(element.children)).join('')
  expect(before.length > 0).toBe(true)
  expect(after).not.toBe(before)
})

// Kolory rekwizytów sceny Kruxa, których nie ma w porównywanych scenach ani na samym orku.
// Czynności innego fachu Krux nie gra, więc ich kolory nie świadczą o scenie.
function propColors(scene: StageScene, ...others: StageScene[]): Set<string> {
  const cells = (of: StageScene) =>
    new Set(actsFor(of, 'Krux').flatMap(act => [...act.intro, ...Array.from({ length: act.length }, (_, t) => act.loop(t, t))]).join('').split(''))
  const taken = new Set([...'.gGrtb', ...others.flatMap(other => [...cells(other)])])
  // Pomarańcz dymka Kruxa to ten sam kolor co iskra: dymek nie świadczy o scenie.
  return new Set([...cells(scene)].filter(cell => !taken.has(cell)).map(cell => PALETTE[cell]!).filter(color => color !== SPEAKER_COLOR.Krux))
}

async function showsScene(ui: Parameters<typeof forgeColors>[0], scene: StageScene, ...others: StageScene[]) {
  const props = propColors(scene, ...others)
  return (await forgeColors(ui)).some(color => typeof color === 'string' && props.has(color))
}

async function forgeColors(ui: { findAll: (query: { type: string; in: string }) => Promise<{ props: Record<string, unknown> }[]> }) {
  return (await ui.findAll({ type: 'Text', in: 'forge' })).map(element => element.props.color)
}

test('a Bash test uses the testing scene instead of mining', async ($, on) => {
  engine(on, new Map())
  await start($)
  await $.turn.start({ text: 'odpal', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Krux bić próbę stali' })).toBeDefined()
  expect(((await ui.find({ key: 'forge' }))!.props.props as { orcs: { scene: string }[] }).orcs[0]!.scene).toBe('test')
})

test('model chunks change the phase live and pass through with their result intact', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }] })
  const chunks: TurnStepChunk[] = [{ kind: 'thinking', index: 0, text: 'Hmm', ref: 1 }, { kind: 'text', index: 1, text: 'Odpowiedź', ref: 2 }]
  const result: TurnStepResult = {
    turnId: 't1',
    index: 0,
    answer: 'Odpowiedź',
    toolUses: [{ name: 'Bash', input: { command: 'npm test' } }],
    stopReason: 'tool_use',
    usage: { input_tokens: 12, output_tokens: 34, cache_read_input_tokens: 56, cache_creation_input_tokens: 78, model: 'claude-opus-5-5' },
  }
  let closed = 0
  on('turn.step', async function* (_$, e) {
    try {
      for (const chunk of chunks) yield chunk
      return { ...result, turnId: e.turnId, index: e.index }
    } finally { closed += 1 }
  })
  await start($)
  await $.turn.start({ text: 'pisz', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' })
  await $.agent.spawn(spawnOf({ description: 'Niuch: zwiad', prompt: 'Niuch szukać.' }))
  for (const agentId of [undefined, 'a1']) {
    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1, ...(agentId === undefined ? {} : { agentId }) })
    const received = []
    let returned: unknown
    for (;;) {
      const item = await stream.next()
      if (item.done) { returned = item.value; break }
      const chunk = item.value
      received.push(chunk)
      const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
      const orcs = ((await ui.find({ key: 'forge' }))!.props.props as { orcs: { key: string; scene: string }[] }).orcs
      expect(orcs.find(orc => orc.key === (agentId ?? 'krux'))!.scene).toBe(chunk.kind === 'thinking' ? 'think' : 'write')
      if (agentId !== undefined) expect(orcs[0]!.scene).toBe('write')
      await ui.unmount()
    }
    expect(received).toEqual(chunks)
    expect(returned).toEqual(result)
  }
  const cancelled = $.turn.step({ turnId: 't1', index: 1, model: 'claude-opus-5-5', messageCount: 1 })
  await cancelled.next()
  await cancelled.return(undefined as never)
  expect(closed).toBe(3)
})

test('a tool chunk names the tool, but Bash keeps the scene until its command is known', async ($, on) => {
  engine(on, new Map())
  // Kawałki narzędzi bez `ref`: harness bierze je takie, jakie przyszły, i nie czeka na blok silnika.
  const chunks: TurnStepChunk[] = [
    { kind: 'text', index: 0, text: 'Puszczam.', ref: 1 },
    { kind: 'tool', index: 1, id: 'toolu_1', name: 'Bash' },
    { kind: 'input', index: 1, json: '{"command":"npm test"}' },
    { kind: 'tool', index: 2, id: 'toolu_2', name: 'Read' },
    { kind: 'input', index: 2, json: '{"file_path":"a.ts"}' },
  ]
  on('turn.step', async function* (_$, e) {
    for (const chunk of chunks) yield chunk
    return { turnId: e.turnId, index: e.index, answer: 'Puszczam.', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  const written: string[] = []
  on('state.set', ($, e, next) => {
    if (e.plugin === 'krux-mod' && e.key === 'activity') written.push(String((e.value as { scene?: string } | null)?.scene))
    return next(e)
  })
  await start($)
  await $.turn.start({ text: 'puść', turnId: 't1' })
  written.length = 0
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  while (!(await stream.next()).done);
  // Pisanie, potem od razu zwój: kawałek `Bash` nie zapisał zgadniętego kilofa.
  expect(written).toEqual(['write', 'read'])
})

test('chunks of one phase keep its start: one write per change of phase', async ($, on) => {
  engine(on, new Map())
  const chunks: TurnStepChunk[] = [
    { kind: 'thinking', index: 0, text: 'Hmm', ref: 1 },
    { kind: 'thinking', index: 0, text: ' dalej', ref: 2 },
    { kind: 'text', index: 1, text: 'Raz', ref: 3 },
    { kind: 'text', index: 1, text: ' dwa', ref: 4 },
  ]
  on('turn.step', async function* (_$, e) {
    for (const chunk of chunks) yield chunk
    return { turnId: e.turnId, index: e.index, answer: 'Raz dwa', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  const written: string[] = []
  on('state.set', ($, e, next) => {
    if (e.plugin === 'krux-mod' && e.key === 'activity') written.push(String((e.value as { scene?: string } | null)?.scene))
    return next(e)
  })
  await start($)
  await $.turn.start({ text: 'pisz', turnId: 't1' })
  written.length = 0
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  while (!(await stream.next()).done);
  expect(written).toEqual(['think', 'write'])
})

test('a new scene waits out a second and a half, so quick tools do not flicker', async ($, on) => {
  engine(on, new Map())
  await start($)
  await $.turn.start({ text: 'czytaj', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await showsScene(ui, 'pick', 'read')).toBe(false)
  await ui.advance(600)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await ui.advance(300)
  expect(await showsScene(ui, 'pick', 'read')).toBe(false)
  // Po przytrzymaniu zwój schodzi, ork staje i bierze się do kopania.
  let digging = false
  for (let tick = 0; tick < 20 && !digging; tick += 1) {
    await ui.advance(150)
    digging = await showsScene(ui, 'pick', 'read')
  }
  expect(digging).toBe(true)
})

test('a dispatched Niuch runs onto the stage in his apron and takes the bubble', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.turn.start({ text: 'szukaj', turnId: 't1' })
  await $.agent.spawn(spawnOf({ prompt: 'Jesteś Niuch, zwiad. Znajdź wywołania.', description: 'Niuch: zwiad' }))
  await $.tool.call(inLoop('a1', { tool: 'Grep', pattern: 'lore' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await forgeColors(ui)).toContain(NIUCH)
  await ui.advance(600)
  expect(await ui.find({ type: 'Text', in: 'forge', text: /│ węszyć lore │/ })).toBeDefined()
})

test('a horde agent type puts its mate on stage and in the muster even when the task does not name him', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.turn.start({ text: 'szukaj', turnId: 't1' })
  await $.agent.spawn(spawnOf({ prompt: 'Znajdź wywołania endpointu.', description: 'zwiad endpointu', subagentType: 'krux-mod:niuch' }))
  await $.tool.call(inLoop('a1', { tool: 'Grep', pattern: 'lore' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await forgeColors(ui)).toContain(NIUCH)
  const shaft = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  expect((await shaft.find({ key: 'mate-0' }))?.text).toContain('Niuch')
})

test('the band keeps six rows when nobody talks, so nothing jumps', async ($, on) => {
  engine(on, new Map())
  await start($)
  await $.turn.start({ text: 'myśl', turnId: 't1' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'bubble-0', in: 'forge' })).toBeDefined()
  expect(await ui.find({ type: 'Text', in: 'forge', text: /│/ })).toBeUndefined()
})

test('a spawned mate walks in from the right edge to his own rectangle', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.turn.start({ text: 'szukaj', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await $.agent.spawn(spawnOf({ prompt: 'Niuch, zwiad.', description: 'Niuch: zwiad' }))
  expect(await forgeColors(ui)).not.toContain(NIUCH)
  await ui.advance(300)
  expect(await forgeColors(ui)).toContain(NIUCH)
  await ui.advance(3000)
  expect(await forgeColors(ui)).toContain(NIUCH)
})

test('a mate done with his loop walks off to the right, then the stage is Krux alone', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.turn.start({ text: 'szukaj', turnId: 't1' })
  await $.agent.spawn(spawnOf({ prompt: 'Niuch, zwiad.', description: 'Niuch: zwiad' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await forgeColors(ui)).toContain(NIUCH)
  await $.turn.complete({ answer: 'jest', durationMs: 10, isAborted: false, turnId: 'sub', reason: 'answer', agentId: 'a1' })
  expect(await forgeColors(ui)).toContain(NIUCH)
  await ui.advance(6000)
  expect(await forgeColors(ui)).not.toContain(NIUCH)
})

test('waiting on a foreground Agent, Krux puts his feet up', async ($, on) => {
  let release = () => {}
  const agentGate = new Promise<void>(resolve => (release = resolve))
  engine(on, new Map(), { agentGate, agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.turn.start({ text: 'szukaj', turnId: 't1' })
  const call = $.tool.call({ tool: 'Agent', description: 'Niuch: zwiad', prompt: 'Niuch, zwiad.' } as unknown as Parameters<Engine['tool']['call']>[0])
  // Hook wywołania biegnie dalej, aż silnik zawiśnie na bramce `Agent`.
  for (let tick = 0; tick < 50; tick += 1) await Promise.resolve()
  await $.agent.spawn(spawnOf({ prompt: 'Niuch, zwiad.', description: 'Niuch: zwiad' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Krux czekać na hordę' })).toBeDefined()
  await ui.advance(4000)
  expect(await showsScene(ui, 'lounge', 'horn', 'hammer')).toBe(true)
  release()
  await call
})

test('a mate done hands his scroll over the band, and Krux takes it on the sofa, not with the horn', async ($, on) => {
  let release = () => {}
  const agentGate = new Promise<void>(resolve => (release = resolve))
  engine(on, new Map(), { agentGate, agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.turn.start({ text: 'szukaj', turnId: 't1' })
  const call = $.tool.call({ tool: 'Agent', description: 'Niuch: zwiad', prompt: 'Niuch, zwiad.' } as unknown as Parameters<Engine['tool']['call']>[0])
  for (let tick = 0; tick < 50; tick += 1) await Promise.resolve()
  await $.agent.spawn(spawnOf({ prompt: 'Niuch, zwiad.', description: 'Niuch: zwiad' }))
  await $.turn.complete({ answer: 'jest', durationMs: 10, isAborted: false, turnId: 'sub', reason: 'answer', agentId: 'a1' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const props = (await ui.find({ key: 'forge' }))!.props.props as { orcs: { scene: string }[]; cues: { key: string; kind: string }[] }
  expect(props.cues.some(cue => cue.key === 'a1' && cue.kind === 'handoff')).toBe(true)
  expect(props.orcs[0]!.scene).toBe('lounge')
  release()
  await call
})

test('the old Task tool name puts Krux on the sofa too', async ($, on) => {
  let release = () => {}
  const agentGate = new Promise<void>(resolve => (release = resolve))
  engine(on, new Map(), { agentGate, agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.turn.start({ text: 'szukaj', turnId: 't1' })
  const call = $.tool.call({ tool: 'Task', description: 'Niuch: zwiad', prompt: 'Niuch, zwiad.' } as unknown as Parameters<Engine['tool']['call']>[0])
  for (let tick = 0; tick < 50; tick += 1) await Promise.resolve()
  await $.agent.spawn(spawnOf({ prompt: 'Niuch, zwiad.', description: 'Niuch: zwiad' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Krux czekać na hordę' })).toBeDefined()
  release()
  await call
})

test('at rest with a background mate still working, Krux lounges instead of hammering', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.agent.spawn(spawnOf({ prompt: 'Lont, rozbiórka.', description: 'Lont: rozbiórka', run_in_background: true }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: false } })
  expect(await showsScene(ui, 'lounge', 'hammer')).toBe(true)
  expect(await ui.find({ type: 'Text', text: 'Krux czekać na hordę' })).toBeDefined()
})

test('an unnamed agent runs on grey and nobody gets credit for its work', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.turn.start({ text: 'szukaj', turnId: 't1' })
  await $.agent.spawn(spawnOf({ prompt: 'Przeszukaj kod pod kątem endpointu.', description: 'zwiad po kodzie' }))
  await $.tool.call(inLoop('a1', { tool: 'Read', file_path: '/repo/api.ts' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await forgeColors(ui)).toContain(NAMELESS)
  const texts = (await ui.findAll({ type: 'Text', in: 'forge' })).map(element => JSON.stringify(element.children)).join('')
  expect(/Niuch|Grom|Piryt|Ochr|Młot|Lont/u.test(texts)).toBe(false)
})

test('a nested spawn stays off the stage', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }, { id: 'a2', status: 'running' }] })
  await start($)
  await $.agent.spawn(spawnOf({ prompt: 'Młot, testy.', description: 'Młot', parentAgentId: 'outer' }))
  const nested = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await forgeColors(nested)).not.toContain(MLOT)
  await nested.unmount()
  // Ten sam Młot z pętli głównej staje na scenie: płótno go rysuje.
  await $.agent.spawn(spawnOf({ prompt: 'Młot, testy.', description: 'Młot' }))
  const top = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await forgeColors(top)).toContain(MLOT)
})

test('the orc leaves the stage when its loop completes', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.agent.spawn(spawnOf({ prompt: 'Młot, puść testy.', description: 'Młot: testy' }))
  const working = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await forgeColors(working)).toContain(MLOT)
  await working.unmount()
  await $.turn.complete({ answer: 'zielono', durationMs: 10, isAborted: false, turnId: 'sub', reason: 'answer', agentId: 'a1' })
  const done = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await forgeColors(done)).not.toContain(MLOT)
})

test('failing tests make Krux frown and say how many failed, for four seconds', async ($, on) => {
  const clock = engine(on, new Map(), { toolError: 'FAIL' })
  await start($)
  await $.turn.start({ text: 'testy', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const bubble = (await ui.findAll({ type: 'Text', in: 'forge', text: /│ .* │/ })).map(element => JSON.stringify(element.children)).join('')
  expect(bubble.length > 0).toBe(true)
  expect(bubble).not.toContain('npm test')
  await ui.unmount()
  await clock.advance(4100)
  const again = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await again.advance(2100)
  const later = (await again.findAll({ type: 'Text', in: 'forge', text: /│ .* │/ })).map(element => JSON.stringify(element.children)).join('')
  expect(later).toContain('npm test')
})

test('the event bubble fades after four seconds without a remount', async ($, on) => {
  const clock = engine(on, new Map(), { toolError: 'FAIL' })
  await start($)
  await $.turn.start({ text: 'testy', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 3 } })
  expect(await ui.find({ type: 'Text', text: /^(Smród!|Czerwono\.|Test padać\.)/ })).toBeDefined()
  await clock.advance(4100)
  expect(await ui.find({ type: 'Text', text: /^(Smród!|Czerwono\.|Test padać\.)/ })).toBeUndefined()
})

test('a slow engine answer before the event bubble lands does not strand its expiry timer', async ($, on) => {
  // Silnik zwleka z listą agentów, o którą mod pyta tuż przed wtrętem: dymek ląduje 10 ms później.
  let delayed = false
  const beforeAgentList = async () => {
    if (delayed) return
    delayed = true
    await clock.advance(10)
  }
  const clock = engine(on, new Map(), { toolError: 'FAIL', beforeAgentList })
  await start($)
  await $.turn.start({ text: 'testy', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(clock.now()).toBe(10)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 3 } })
  expect(await ui.find({ type: 'Text', text: /^(Smród!|Czerwono\.|Test padać\.)/ })).toBeDefined()
  await clock.advance(4000)
  expect(await ui.find({ type: 'Text', text: /^(Smród!|Czerwono\.|Test padać\.)/ })).toBeUndefined()
})

test('a low band drops the bubble into the caption with the speaker’s name', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.turn.start({ text: 'szukaj', turnId: 't1' })
  await $.agent.spawn(spawnOf({ prompt: 'Niuch, zwiad.', description: 'Niuch: zwiad' }))
  await $.tool.call(inLoop('a1', { tool: 'Grep', pattern: 'lore' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 3 } })
  expect(await ui.find({ type: 'Text', text: 'Niuch: węszyć lore' })).toBeDefined()
  expect(await ui.find({ type: 'Text', in: 'forge', text: /│/ })).toBeUndefined()
})

test('a band three rows high drops the rule; two rows leave one line of text', async ($, on) => {
  engine(on, new Map())
  await start($)
  await $.turn.start({ text: 'czytaj', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })
  const rule = { type: 'Text', text: '─'.repeat(BAND.props.bodyColumns) }
  const low = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 3 } })
  expect(await low.find({ key: 'forge' })).toBeDefined()
  expect(await low.find(rule)).toBeUndefined()
  await low.unmount()
  const four = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 4 } })
  expect(await four.find(rule)).toBeDefined()
  await four.unmount()
  const tiny = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 2 } })
  expect(await tiny.find({ key: 'forge' })).toBeUndefined()
  const line = await tiny.find({ type: 'Text', text: /^⚒ Krux czytać runy .*app\.ts$/ })
  expect(line?.props.wrap).toBe('truncate-end')
  expect(await tiny.find(rule)).toBeDefined()
})

test('a surface without terminal cells gets no band, not even a text line', async ($, on) => {
  engine(on, new Map())
  await start($)
  await $.turn.start({ text: 'czytaj', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/app.ts' })
  for (const surface of ['vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface, props: { ...BAND.props, maxRows: 3 } })
    expect(await ui.find({ type: 'Text', text: '─'.repeat(BAND.props.bodyColumns) })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^⚒ .*app\.ts/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('on a narrow terminal mates leave before Krux and the caption counts them', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }, { id: 'a2', status: 'running' }] })
  await start($)
  await $.turn.start({ text: 'szukaj', turnId: 't1' })
  await $.agent.spawn(spawnOf({ prompt: 'Niuch, zwiad.', description: 'Niuch: zwiad' }))
  await $.agent.spawn(spawnOf({ prompt: 'Młot, testy.', description: 'Młot: testy' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 60 } })
  expect(await ui.find({ key: 'forge' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\+2 z hordy/ })).toBeDefined()
  expect(await forgeColors(ui)).not.toContain(NIUCH)
})

test('when the stage narrows, a mate past the last slot walks back into a free one', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }, { id: 'a2', status: 'running' }, { id: 'a3', status: 'running' }] })
  await start($)
  await $.turn.start({ text: 'szukaj', turnId: 't1' })
  const wide = { ...BAND.props, bodyColumns: 140 }
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: wide })
  await $.agent.spawn(spawnOf({ prompt: 'Niuch, zwiad.', description: 'Niuch: zwiad' }))
  await $.agent.spawn(spawnOf({ prompt: 'Młot, testy.', description: 'Młot: testy' }))
  await $.agent.spawn(spawnOf({ prompt: 'Lont, rozbiórka.', description: 'Lont: rozbiórka' }))
  await ui.advance(4000)
  expect(await forgeColors(ui)).toContain(LONT)
  await $.turn.complete({ answer: 'jest', durationMs: 10, isAborted: false, turnId: 'sub', reason: 'answer', agentId: 'a1' })
  await ui.redraw({ ...wide, bodyColumns: 120 })
  await ui.advance(4000)
  expect(await forgeColors(ui)).toContain(LONT)
  expect(await ui.find({ type: 'Text', text: /z hordy/ })).toBeUndefined()
})

test('a background agent stays on stage while listed as running, idle or not', async ($, on) => {
  engine(on, new Map(), { agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.agent.spawn(spawnOf({ prompt: 'Lont, rozbiórka.', description: 'Lont: rozbiórka', run_in_background: true }))
  await $.tool.call(inLoop('a1', { tool: 'Read', file_path: '/repo/api.ts' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: false } })
  expect(await forgeColors(ui)).toContain(LONT)
  await ui.advance(1200)
  expect(await ui.find({ type: 'Text', in: 'forge', text: /│ czytać runy api\.ts │/ })).toBeDefined()
})

test('an agent no longer running drops off the stage even without its completion', async ($, on) => {
  const agents: { id: string; status: AgentStatus }[] = [{ id: 'a1', status: 'running' }]
  engine(on, new Map(), { agents })
  await start($)
  await $.agent.spawn(spawnOf({ prompt: 'Lont, rozbiórka.', description: 'Lont: rozbiórka' }))
  const running = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await forgeColors(running)).toContain(LONT)
  await running.unmount()
  agents[0]!.status = 'completed'
  const gone = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await forgeColors(gone)).not.toContain(LONT)
})

test('a mate gone from the agent list does not take the event bubble', async ($, on) => {
  engine(on, new Map(), { toolError: 'FAIL', agents: [{ id: 'a1', status: 'killed' }] })
  await start($)
  await $.agent.spawn(spawnOf({ prompt: 'Młot, puść testy.', description: 'Młot: testy' }))
  await $.turn.start({ text: 'testy', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 3 } })
  expect(await ui.find({ type: 'Text', text: /^(Smród!|Czerwono\.|Test padać\.)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Młot:/ })).toBeUndefined()
})

test('the band stays empty with the animations off, working or idle', async ($, on) => {
  engine(on, new Map<string, unknown>([['modes', { persona: true, konkret: false, flow: false, animacje: false, kowal: true }]]))
  await start($)
  for (const isWorking of [true, false]) {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking } })
    expect(await ui.find({ key: 'forge' })).toBeUndefined()
    await ui.unmount()
  }
})

test('idle, the smith stands still with only the rest title, keeping strike counts in state', async ($, on) => {
  const counts = { strikes: 0, sessionStrikes: 0 }
  on('state.set', ($, e, next) => {
    if (e.plugin === 'krux-mod' && (e.key === 'strikes' || e.key === 'sessionStrikes')) counts[e.key] = Number(e.value)
    return next(e)
  })
  engine(on, new Map())
  await start($)
  for (const turnId of ['t1', 't2']) {
    await $.turn.start({ text: 'kop', turnId })
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    if (turnId === 't2') await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' })
  }
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: false } })
  expect(await ui.find({ type: 'Text', text: 'Krux odpoczywać przy kowadle' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /uderzeń/ })).toBeUndefined()
  expect(counts).toEqual({ strikes: 2, sessionStrikes: 3 })
  expect(await ui.find({ key: 'forge' })).toBeDefined()
  await ui.advance(2100)
  const before = (await ui.findAll({ type: 'Text', in: 'forge' })).map(element => JSON.stringify(element.children)).join('')
  await ui.advance(600)
  const after = (await ui.findAll({ type: 'Text', in: 'forge' })).map(element => JSON.stringify(element.children)).join('')
  expect(after).toBe(before)
})

test('with kowal off, the band leaves when Claude stops working', async ($, on) => {
  engine(on, new Map<string, unknown>([['modes', { persona: true, konkret: false, flow: false, animacje: true, kowal: false }]]))
  await start($)
  const idle = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: false } })
  expect(await idle.find({ key: 'forge' })).toBeUndefined()
  await idle.unmount()
  const working = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await working.find({ key: 'forge' })).toBeDefined()
})

const PANE = {
  plugin: 'krux-mod',
  component: 'Pane',
  requestId: 'krux',
  viewport: { columns: 120, rows: 40 },
  props: { title: 'Kuźnia Kruxa', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('the pane toggles a mode by hotkey button, saves it and queues a note', async ($, on) => {
  const saved = new Map<string, unknown>()
  const toasts: string[] = []
  engine(on, saved, { toasts })
  await start($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'Niuch ' })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'toggle-flow' })
  expect(saved.get('mode.flow')).toBe(true)
  expect(toasts).toEqual(['Flow włączony: jeden ruch na raz, zgoda przed każdym.'])
  const entered = await $.prompt.submit({ text: 'dalej', wait: false, origin: ORIGIN })
  expect(entered.context).toEqual(['Flow włączony. Kontrakt rytmu stoi w prompcie systemowym.', VOICE_ANCHOR, LENGTH_HINT])
})

test('all seven mode buttons sit in equal cells that wrap to the pane width', async ($, on) => {
  engine(on, new Map())
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const widths = []
  for (const mode of ['persona', 'konkret', 'flow', 'animacje', 'kowal', 'sztolnia', 'czat']) {
    expect(await ui.find({ key: `toggle-${mode}` })).toBeDefined()
    widths.push((await ui.find({ type: 'Box', key: `cell-${mode}` }))?.props.width)
  }
  expect(new Set(widths).size).toBe(1)
  expect(widths[0]).toBeGreaterThan(0)
  // Komórki niesie Box bez klucza: widać go po dziecku, a zawija je do szerokości panelu.
  type Drawn = { props?: Record<string, unknown>; children?: unknown[] }
  const wrap = (function holder(node: Drawn): Drawn | undefined {
    const kids = node.children ?? []
    if (kids.some(child => typeof child === 'object' && child !== null && (child as Drawn).props?.key === 'cell-persona')) return node
    for (const child of kids) {
      if (typeof child !== 'object' || child === null) continue
      const found = holder(child as Drawn)
      if (found !== undefined) return found
    }
    return undefined
  })((await ui.drawn()) as unknown as Drawn)
  expect(wrap?.props?.flexWrap).toBe('wrap')
})

test('reduced motion keeps the smith still', async ($, on) => {
  engine(on, new Map(), { settings: { prefersReducedMotion: true } })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'forge' })).toBeDefined()
  const before = (await ui.findAll({ type: 'Text', in: 'forge' })).map(element => JSON.stringify(element.children)).join('')
  await ui.advance(600)
  const after = (await ui.findAll({ type: 'Text', in: 'forge' })).map(element => JSON.stringify(element.children)).join('')
  expect(after).toBe(before)
})

test('a live Krux plugin beside the mod gets a warning toast', async ($, on) => {
  const toasts: string[] = []
  engine(on, new Map(), { toasts, plugins: ['krux'] })
  await start($)
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('claude plugin disable krux@krux-marketplace')
})

test('no warning without the plugin', async ($, on) => {
  const toasts: string[] = []
  engine(on, new Map(), { toasts, plugins: ['superpowers'] })
  await start($)
  expect(toasts).toEqual([])
})

test('session start registers the /krux command under its own name', async ($, on) => {
  const commands: CommandSpec[] = []
  engine(on, new Map(), { commands })
  await start($)
  expect(commands.map(command => command.name)).toEqual(['krux'])
})

const REPLY = { plugin: 'krux-mod', component: 'AssistantMessage', requestId: 'm1' } as const

test('a reply opens under the Krux nameplate, only on its first block', async ($, on) => {
  engine(on, new Map())
  await start($)
  const first = await $.ui.mount({ ...REPLY, surface: 'terminal', props: { text: 'Build pad.', isFirstOfReply: true } })
  expect(await first.find({ type: 'Text', text: '⚒ Krux' })).toBeDefined()
  await first.unmount()
  const rest = await $.ui.mount({ ...REPLY, surface: 'terminal', props: { text: 'Dalej.', isFirstOfReply: false } })
  expect(await rest.find({ type: 'Text', text: '⚒ Krux' })).toBeUndefined()
})

test('the person’s own prompt carries Morra, a task notification does not', async ($, on) => {
  engine(on, new Map())
  await start($)
  const own = await $.ui.mount({
    plugin: 'krux-mod',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'u1',
    props: { text: 'siema', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect(await own.find({ type: 'Text', text: 'Morra' })).toBeDefined()
  const morra = await own.find({ type: 'Text', text: 'Morra' })
  expect(morra?.props.dimColor).toBeUndefined()
  expect(morra?.props.color).toBeDefined()
  const task = await $.ui.mount({
    plugin: 'krux-mod',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'u2',
    props: { text: 'done', origin: { kind: 'task-notification' }, isExpanded: false },
  })
  expect(await task.find({ type: 'Text', text: 'Morra' })).toBeUndefined()
})

test('a nameplate lies on the engine’s blank row instead of adding its own', async ($, on) => {
  engine(on, new Map())
  await start($)
  const reply = await $.ui.mount({ ...REPLY, surface: 'terminal', props: { text: 'Build pad.', isFirstOfReply: true } })
  expect((await reply.find({ key: 'nameplate' }))?.props).toMatchObject({ position: 'absolute', top: 0, left: 0 })
  const own = await $.ui.mount({
    plugin: 'krux-mod',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'u1',
    props: { text: 'siema', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect((await own.find({ key: 'nameplate' }))?.props).toMatchObject({ position: 'absolute', top: 0, left: 0 })
})

test('every block of a reply stands by a left edge in Krux’s colour', async ($, on) => {
  engine(on, new Map())
  await start($)
  for (const isFirstOfReply of [true, false]) {
    const ui = await $.ui.mount({ ...REPLY, surface: 'terminal', props: { text: 'Build pad.', isFirstOfReply } })
    const edges = (await ui.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'quote')
    expect(edges.map(box => box.props.borderColor)).toEqual([SPEAKER_COLOR.Krux])
    await ui.unmount()
  }
})

test('with the persona off, no nameplates and no edge', async ($, on) => {
  engine(on, new Map<string, unknown>([['modes', { persona: false, konkret: false, flow: false, animacje: true, kowal: true }]]))
  await start($)
  const ui = await $.ui.mount({ ...REPLY, surface: 'terminal', props: { text: 'x', isFirstOfReply: true } })
  expect(await ui.find({ type: 'Text', text: '⚒ Krux' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Box' })).some(box => box.props.borderStyle === 'quote')).toBe(false)
})

const SMOOTH_ANSWER =
  'Przejrzałem plik i znalazłem problem, który powodował, że funkcja zwracała wynik już po pierwszej iteracji pętli. ' +
  'Naprawiłem to, przenosząc instrukcję poza pętlę, a następnie uruchomiłem testy, które teraz przechodzą poprawnie.'

test('after a smooth answer the next prompt carries the full anchor with the fix', async ($, on) => {
  engine(on, new Map())
  await start($)
  const first = await $.prompt.submit({ text: 'napraw', wait: false, origin: ORIGIN })
  expect(first.context).toContain(VOICE_ANCHOR)
  const second = await $.prompt.submit({ text: 'dalej', wait: false, origin: ORIGIN })
  expect(second.context).toContain(VOICE_SHORT)
  await $.turn.complete({ answer: SMOOTH_ANSWER, durationMs: 10, isAborted: false, turnId: 't2', reason: 'answer' })
  const third = await $.prompt.submit({ text: 'i co?', wait: false, origin: ORIGIN })
  const anchor = (third.context ?? []).find(entry => entry.startsWith(VOICE_ANCHOR))
  expect(anchor).toContain('„Przejrzałem”')
})

test('a short answer after the fix lets the stale drift go', async ($, on) => {
  engine(on, new Map())
  await start($)
  await $.prompt.submit({ text: 'napraw', wait: false, origin: ORIGIN })
  await $.turn.complete({ answer: SMOOTH_ANSWER, durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.prompt.submit({ text: 'dalej', wait: false, origin: ORIGIN })
  await $.turn.complete({ answer: 'Krux zrobić.', durationMs: 10, isAborted: false, turnId: 't2', reason: 'answer' })
  const later = await $.prompt.submit({ text: 'i co?', wait: false, origin: ORIGIN })
  expect(later.context).toContain(VOICE_SHORT)
})

test('turning the persona back on brings the full anchor', async ($, on) => {
  engine(on, new Map())
  await start($)
  await $.prompt.submit({ text: 'raz', wait: false, origin: ORIGIN })
  await $.prompt.submit({ text: 'dwa', wait: false, origin: ORIGIN })
  await $.prompt.submit({ text: 'wyłącz krux', wait: false, origin: ORIGIN })
  await $.prompt.submit({ text: 'włącz krux', wait: false, origin: ORIGIN })
  const back = await $.prompt.submit({ text: 'trzy', wait: false, origin: ORIGIN })
  expect(back.context).toContain(VOICE_ANCHOR)
})

test('failing tests make Młot the topic a few turns later', async ($, on) => {
  engine(on, new Map(), { toolError: '1 failed' })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  for (const turnId of ['t1', 't2']) {
    await $.turn.complete({ answer: 'Krux szukać dalej.', durationMs: 10, isAborted: false, turnId, reason: 'answer' })
  }
  const entered = await $.prompt.submit({ text: 'i?', wait: false, origin: ORIGIN })
  expect((entered.context ?? []).some(entry => entry.includes('Młocie') && entry.includes('padłe: 1'))).toBe(true)
})

test('the mood of a fresh chronicle event reaches the model once, and never on a release question', async ($, on) => {
  engine(on, new Map(), { toolError: '1 failed' })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const first = await $.prompt.submit({ text: 'co z tym?', wait: false, origin: ORIGIN })
  expect((first.context ?? []).filter(entry => entry.startsWith('Nastrój Kruxa: zadziorny'))).toHaveLength(1)
  const again = await $.prompt.submit({ text: 'i?', wait: false, origin: ORIGIN })
  expect((again.context ?? []).some(entry => entry.startsWith('Nastrój Kruxa'))).toBe(false)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const release = await $.prompt.submit({ text: 'Wypuszczamy to dziś na produkcję?', wait: false, origin: ORIGIN })
  expect((release.context ?? []).some(entry => entry.startsWith('Nastrój Kruxa'))).toBe(false)
  // Zdarzenie przepada razem z decyzją: następna tura nie wraca do niego.
  const after = await $.prompt.submit({ text: 'i?', wait: false, origin: ORIGIN })
  expect((after.context ?? []).some(entry => entry.startsWith('Nastrój Kruxa'))).toBe(false)
  const report = await $.prompt.submit({ text: 'Review: build failed.', wait: false, origin: { kind: 'task-notification' } })
  expect((report.context ?? []).some(entry => entry.startsWith('Nastrój Kruxa'))).toBe(false)
})

test('a request for an irreversible move gets the warning line instead of a horde aside', async ($, on) => {
  engine(on, new Map(), { toolError: '1 failed' })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  for (const turnId of ['t1', 't2']) {
    await $.turn.complete({ answer: 'Krux szukać dalej.', durationMs: 10, isAborted: false, turnId, reason: 'answer' })
  }
  const risky = await $.prompt.submit({ text: 'usuń tabelę users', wait: false, origin: ORIGIN })
  expect(risky.context?.at(-1)).toBe(RISK_HINT)
  expect((risky.context ?? []).some(entry => entry.startsWith('Życie hordy'))).toBe(false)
  // Wstawka nie przepada, tylko czeka na zwykłą turę.
  const next = await $.prompt.submit({ text: 'i?', wait: false, origin: ORIGIN })
  expect((next.context ?? []).some(entry => entry.startsWith('Życie hordy'))).toBe(true)
})

test('a dispatched Młot whose tests fail says so himself, and Krux’s chronicle stays clean', async ($, on) => {
  engine(on, new Map(), { toolError: '1 failed', agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.turn.start({ text: 'testy', turnId: 't1' })
  await $.agent.spawn(spawnOf({ prompt: 'Jesteś Młot, puść testy.', description: 'Młot: testy' }))
  await $.tool.call(inLoop('a1', { tool: 'Bash', command: 'npm test' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 3 } })
  expect(await ui.find({ type: 'Text', text: /^Młot: (Smród!|Czerwono\.|Test padać\.)/ })).toBeDefined()
  for (const turnId of ['t1', 't2']) {
    await $.turn.complete({ answer: 'Krux czekać.', durationMs: 10, isAborted: false, turnId, reason: 'answer' })
  }
  // Wstawka przychodzi, ale bez faktu o testach: przebieg należał do Młota, nie do Kruxa.
  const note = ((await $.prompt.submit({ text: 'i?', wait: false, origin: ORIGIN })).context ?? []).find(entry => entry.startsWith('Życie hordy'))
  expect(note).toBeDefined()
  expect(note).not.toContain('przebiegi testów')
})

test('a debug prompt carries its format line beside the anchor', async ($, on) => {
  engine(on, new Map())
  await start($)
  const entered = await $.prompt.submit({ text: 'build pada z TypeError', wait: false, origin: ORIGIN })
  expect(entered.context).toContain(FORMAT_HINT.debug)
  const plain = await $.prompt.submit({ text: 'dodaj kolumnę email', wait: false, origin: ORIGIN })
  expect(plain.context).toContain(LENGTH_HINT)
})

test('compaction asks for a plain summary and brings the full anchor back', async ($, on) => {
  const seen: (string | undefined)[] = []
  engine(on, new Map())
  on('session.compact', ($, e) => {
    seen.push(e.instructions)
    return { messages: [{ role: 'user' as const, text: 'streszczenie', toolUses: [] }] }
  })
  await start($)
  await $.prompt.submit({ text: 'raz', wait: false, origin: ORIGIN })
  const before = await $.prompt.submit({ text: 'dwa', wait: false, origin: ORIGIN })
  expect(before.context).toContain(VOICE_SHORT)
  await $.session.compact({ trigger: 'manual', instructions: 'zostaw plan', messages: [{ role: 'user', text: 'raz', toolUses: [] }] })
  expect(seen[0]).toBe(`zostaw plan\n\n${COMPACT_NOTE}`)
  const after = await $.prompt.submit({ text: 'trzy', wait: false, origin: ORIGIN })
  expect(after.context).toContain(VOICE_ANCHOR)
})

test('a subagent compaction keeps its own instructions, a precompute keeps the turn count', async ($, on) => {
  const seen: (string | undefined)[] = []
  engine(on, new Map())
  on('session.compact', ($, e) => {
    seen.push(e.instructions)
    return { messages: [{ role: 'user' as const, text: 'streszczenie', toolUses: [] }] }
  })
  await start($)
  await $.prompt.submit({ text: 'raz', wait: false, origin: ORIGIN })
  await $.session.compact({ trigger: 'auto', instructions: 'agent', agentId: 'a1', messages: [{ role: 'user', text: 'raz', toolUses: [] }] } as unknown as Parameters<Engine['session']['compact']>[0])
  expect(seen[0]).toBe('agent')
  await $.session.compact({ trigger: 'precompute', instructions: 'zapas', messages: [{ role: 'user', text: 'raz', toolUses: [] }] } as unknown as Parameters<Engine['session']['compact']>[0])
  expect(seen[1]).toBe(`zapas\n\n${COMPACT_NOTE}`)
  const after = await $.prompt.submit({ text: 'dwa', wait: false, origin: ORIGIN })
  expect(after.context).toContain(VOICE_SHORT)
})

// Historia sesji wznowionej: 3 prompty, padły test, gładka ostatnia odpowiedź.
const RESUMED: History = [
  { role: 'user', text: 'raz', toolUses: [] },
  { role: 'assistant', text: 'Krux sprawdzić.', toolUses: [{ tool_use_id: 'a', tool: 'Bash', input: { command: 'npm test' }, isError: true }] },
  { role: 'user', text: 'dwa', toolUses: [] },
  { role: 'assistant', text: 'Krux szukać.', toolUses: [] },
  { role: 'user', text: 'trzy', toolUses: [] },
  { role: 'assistant', text: SMOOTH_ANSWER, toolUses: [] },
]

test('a resumed session picks up turns, lore and drift from its history', async ($, on) => {
  engine(on, new Map(), { history: RESUMED })
  await start($)
  const entered = await $.prompt.submit({ text: 'cztery', wait: false, origin: ORIGIN })
  const context = entered.context ?? []
  expect(context.find(entry => entry.startsWith(VOICE_ANCHOR))).toContain('„Przejrzałem”')
  expect(context.some(entry => entry.includes('Młocie') && entry.includes('padłe: 1'))).toBe(true)
})

test('a resumed session without drift goes on with the short anchor', async ($, on) => {
  engine(on, new Map(), { history: RESUMED.slice(0, 4) })
  await start($)
  const entered = await $.prompt.submit({ text: 'trzy', wait: false, origin: ORIGIN })
  expect(entered.context).toContain(VOICE_SHORT)
})

const SHAFT_PANE = { plugin: 'krux-mod', component: 'Pane', requestId: 'sztolnia' } as const
const SHAFT_PROPS = { title: 'Sztolnia', isFocused: false, bodyColumns: 40, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} }
const PERSONA_OFF = { persona: false, konkret: false, flow: false, animacje: true, kowal: true, sztolnia: true }

const USAGE = {
  startedAt: 0,
  context: { tokens: 136_000, window: 200_000, percent: 68 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 23.5, resetsAt: '1970-01-01T02:10:00Z' }],
  cost: { usd: 1.234 },
}

const TODOS = {
  tool: 'TodoWrite',
  todos: [
    { content: 'Test odtwarzający błąd', status: 'completed', activeForm: '' },
    { content: 'Poprawka w parser.js', status: 'in_progress', activeForm: '' },
    { content: 'Changelog', status: 'pending', activeForm: '' },
  ],
}

test('the shaft pane opens at start while its mode is on', async ($, on) => {
  const opened: string[] = []
  engine(on, new Map(), { opened })
  await start($)
  expect(opened).toContain('sztolnia')
})

test('with sztolnia off, no pane at start', async ($, on) => {
  const opened: string[] = []
  engine(on, new Map<string, unknown>([['modes', { ...PERSONA_OFF, persona: true, sztolnia: false }]]), { opened })
  await start($)
  expect(opened).not.toContain('sztolnia')
})

test('/krux sztolnia closes the shaft pane and opens it again', async ($, on) => {
  const saved = new Map<string, unknown>()
  const opened: string[] = []
  const closed: string[] = []
  engine(on, saved, { opened, closed })
  await start($)
  opened.length = 0
  const presentation = { isFullscreen: false, columns: 120 }
  await $.command.run({ command: 'krux', args: 'sztolnia', origin: ORIGIN, presentation })
  expect(saved.get('mode.sztolnia')).toBe(false)
  expect(closed).toEqual(['sztolnia'])
  expect(opened).toEqual([])
  await $.command.run({ command: 'krux', args: 'sztolnia', origin: ORIGIN, presentation })
  expect(saved.get('mode.sztolnia')).toBe(true)
  expect(opened).toEqual(['sztolnia'])
})

test('the threads tool is registered at start, keeps the threads and the Sztolnia leads with them', async ($, on) => {
  const tools: string[] = []
  engine(on, new Map(), { tools })
  await start($)
  expect(tools).toEqual(['watki'])
  const opened = await $.tool.call({ tool: 'mcp__krux-mod__watki', open: [{ text: '6 commitów niewypchniętych' }, { text: 'tsc nie puszczony', kind: 'risk' }] } as never)
  expect(opened.text).toBe('Open threads:\n#1 [todo] 6 commitów niewypchniętych\n#2 [risk] tsc nie puszczony')
  // Silnik przyjmuje od narzędzia moda wynik tekstem, nie obiektem.
  expect(opened.result).toBe(opened.text)
  const closed = await $.tool.call({ tool: 'mcp__krux-mod__watki', close: [1] } as never)
  expect(closed.text).toBe('Open threads:\n#2 [risk] tsc nie puszczony')
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  expect(await ui.find({ key: 'threads' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'tsc nie puszczony' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '6 commitów niewypchniętych' })).toBeUndefined()
})

test('the Sztolnia reads git at start and again after a tool that can change the repo', async ($, on) => {
  const git = { stdout: '# branch.oid a\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n' }
  engine(on, new Map(), { git })
  await start($)
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  expect(await ui.find({ type: 'Text', text: '✓ czysto, równo z upstreamem' })).toBeDefined()
  git.stdout = git.stdout.replace('+0 -0', '+2 -0')
  await $.turn.start({ text: 'commit', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  expect(await ui.find({ type: 'Text', text: '↑ do wypchnięcia: 2' })).toBeDefined()
})

test('outside a repo the Sztolnia has no git section', async ($, on) => {
  engine(on, new Map())
  await start($)
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  expect(await ui.find({ key: 'git' })).toBeUndefined()
})

test('an empty board says so in one line', async ($, on) => {
  engine(on, new Map())
  await start($)
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  expect(await ui.find({ type: 'Text', text: /Tablica pusta/ })).toBeDefined()
  expect(await ui.find({ key: 'plan' })).toBeUndefined()
})

test('the plan shows what is done, what is in hand and what waits', async ($, on) => {
  engine(on, new Map())
  await start($)
  await $.tool.call(TODOS as unknown as Parameters<Engine['tool']['call']>[0])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...SHAFT_PANE, surface, props: SHAFT_PROPS })
    expect((await ui.find({ key: 'plan' }))?.text).toMatch(/^Plan1\/3/)
    expect((await ui.find({ key: 'task-0' }))?.text).toBe('✓ Test odtwarzający błąd')
    expect((await ui.find({ key: 'task-1' }))?.text).toBe('▸ Poprawka w parser.js')
    expect((await ui.find({ key: 'task-2' }))?.text).toBe('· Changelog')
    await ui.unmount()
  }
})

test('the last test run shows its result, counts, runner and failing names', async ($, on) => {
  engine(on, new Map(), { toolError: '(fail) auth > login [3ms]\n 51 pass\n 1 fail', agents: [{ id: 'a1', status: 'running' }] })
  await start($)
  await $.agent.spawn(spawnOf({ prompt: 'Młot: puść testy', description: 'Młot testuje' }))
  await $.tool.call(inLoop('a1', { tool: 'Bash', command: 'npm test' }))
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  const tests = (await ui.find({ key: 'tests' }))?.text ?? ''
  expect(tests).toContain('✗npm test')
  expect(tests).toContain('1 padł · 51 przeszło')
  expect(tests).toContain('Młot')
  expect((await ui.find({ key: 'failure-0' }))?.text).toContain('auth > login')
})

test('the horde lists only mates still running, with their task, time and last tool', async ($, on) => {
  const agents: { id: string; status: AgentStatus }[] = [{ id: 'a1', status: 'running' }, { id: 'a2', status: 'running' }]
  const clock = engine(on, new Map(), { agents })
  await start($)
  await $.agent.spawn(spawnOf({ prompt: 'Niuch: znajdź wywołania', description: 'Niuch węszy' }))
  await $.agent.spawn(spawnOf({ prompt: 'Młot: puść testy', description: 'Młot testuje' }))
  await $.tool.call(inLoop('a1', { tool: 'Grep', pattern: 'auth' }))
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  expect((await ui.find({ key: 'mate-0' }))?.text).toContain('Niuch')
  expect((await ui.find({ key: 'mate-0' }))?.text).toContain('Grep auth')
  expect((await ui.find({ key: 'mate-1' }))?.text).toContain('Młot')
  // Młot kończy turą, choć silnik wciąż go listuje: schodzi z tablicy, Niuch zostaje.
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a2' } as Parameters<Engine['turn']['complete']>[0])
  expect((await ui.find({ key: 'mate-0' }))?.text).toContain('Niuch')
  expect(await ui.find({ key: 'mate-1' })).toBeUndefined()
  // Niuch znika z listy silnika bez `turn.complete`: zegar apelu zdejmuje i jego.
  agents.length = 0
  await clock.advance(1100)
  expect(await ui.find({ key: 'horde' })).toBeUndefined()
})

test('the context fill, the limit windows and the cost come from the session usage', async ($, on) => {
  engine(on, new Map(), { usage: USAGE })
  await start($)
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  expect((await ui.find({ key: 'context' }))?.text).toContain('68% · 136k / 200k')
  const limit = (await ui.find({ key: 'limit-0' }))?.text ?? ''
  expect(limit).toContain('5h')
  expect(limit).toContain('24%')
  expect(limit).toContain('reset za 2 h 10 min')
  expect((await ui.find({ key: 'cost' }))?.text).toContain('$1.23')
})

test('a session resumed with the persona off gets its plan and last test run back', async ($, on) => {
  const history: History = [
    { role: 'user', text: 'napraw', toolUses: [] },
    {
      role: 'assistant',
      text: 'Krux sprawdzić.',
      toolUses: [
        { tool_use_id: 'a', tool: 'TodoWrite', input: { todos: TODOS.todos }, text: 'ok' },
        { tool_use_id: 'b', tool: 'Bash', input: { command: 'npm test' }, isError: true, text: ' 3 pass\n 1 fail' },
      ],
    },
  ]
  engine(on, new Map<string, unknown>([['modes', PERSONA_OFF]]), { history })
  await start($)
  await $.prompt.submit({ text: 'dalej', wait: false, origin: ORIGIN })
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  expect((await ui.find({ key: 'plan' }))?.text).toMatch(/^Plan1\/3/)
  expect((await ui.find({ key: 'tests' }))?.text).toContain('1 padł · 3 przeszły')
})

test('concurrent mode writes preserve different toggles across a session reload', async ($, on) => {
  const saved = new Map<string, unknown>([['modes', { persona: true, konkret: false, flow: false }]])
  let writes = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  engine(on, saved, { beforeStoreSet: async () => {
    writes += 1
    if (writes === 2) release()
    await gate
  } })
  on('classic.SessionStart', () => ({}))
  await start($)
  await Promise.all([
    $.prompt.submit({ text: 'włącz konkret', wait: false, origin: ORIGIN }),
    $.prompt.submit({ text: 'włącz flow', wait: false, origin: ORIGIN }),
  ])
  await $.classic.SessionStart({ source: 'resume' })
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:persona', 'krux-mod:konkret', 'krux-mod:flow'])
})

test('per-mode settings override legacy values without losing other saved modes', async ($, on) => {
  const saved = new Map<string, unknown>([['modes', { persona: true, konkret: true, flow: true }], ['mode.persona', false]])
  engine(on, saved)
  on('classic.SessionStart', () => ({}))
  await start($)
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:konkret', 'krux-mod:flow'])
  await $.prompt.submit({ text: 'wyłącz flow', wait: false, origin: ORIGIN })
  await $.classic.SessionStart({ source: 'resume' })
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:konkret'])
})

test('a failed agent list stops the muster clock instead of writing every second', async ($, on) => {
  let calls = 0
  const clock = engine(on, new Map(), { beforeAgentList: async () => {
    calls += 1
    throw new Error('agent list unavailable')
  } })
  await start($)
  await $.agent.spawn(spawnOf({ prompt: 'Niuch: zwiad', description: 'Niuch węszy' }))
  await clock.advance(1_100)
  const stopped = calls
  await clock.advance(10_000)
  expect(calls).toBe(stopped)
})

test('resume from a capped history preserves thread ids for later live closes and opens', async ($, on) => {
  const history: History = [{ role: 'assistant', text: '', toolUses: [
    { tool_use_id: 'a', tool: 'mcp__krux-mod__watki', input: { open: [{ text: 'nowy' }] }, text: 'Open threads:\n#99 [risk] stary\n#100 [todo] nowy' },
  ] }]
  history.push(...Array.from({ length: 4095 }, () => ({ role: 'user' as const, text: 'dalej', toolUses: [] })))
  engine(on, new Map(), { history })
  await start($)
  await $.prompt.submit({ text: 'dalej', wait: false, origin: ORIGIN })
  const closed = await $.tool.call({ tool: 'mcp__krux-mod__watki', close: [100, 1] } as never)
  expect(closed.text).toBe('Open threads:\n#99 [risk] stary')
  const opened = await $.tool.call({ tool: 'mcp__krux-mod__watki', open: [{ text: 'kolejny' }] } as never)
  expect(opened.text).toContain('#101 [todo] kolejny')
})


test('gating hook failures pass the original session, prompt and compaction events onward', async ($, on) => {
  let failStore = false
  let failCompact = false
  let notices = 0
  let prompts = 0
  let compactions = 0
  const logs: string[] = []
  engine(on, new Map(), { logs, onPrompt: () => { prompts += 1 }, beforeStoreGet: () => {
    if (failStore) throw new Error('store unavailable')
  } })
  on('state.get', ($, e, next) => {
    // Uszkodzony stan w poprawnej kopercie SDK, nie pomijany błąd hooka odczytu.
    if (failCompact && e.key === 'modes') return { value: { value: null, version: 0 } }
    return next(e)
  })
  on('classic.SessionStart', () => { notices += 1; return {} })
  on('session.compact', ($, e) => {
    expect(e.instructions).toBe('original instructions')
    compactions += 1
    return { messages: [{ role: 'user' as const, text: 'kept summary', toolUses: [] }] }
  })
  await start($)
  failStore = true
  for (const source of ['clear', 'resume', 'fork'] as const) await $.classic.SessionStart({ source })
  const entered = await $.prompt.submit({ text: 'włącz flow', context: ['prior'], wait: false, origin: ORIGIN })
  expect(entered).toMatchObject({ text: 'włącz flow', context: ['prior'] })
  failStore = false
  failCompact = true
  const result = await $.session.compact({ trigger: 'manual', instructions: 'original instructions', messages: [{ role: 'user', text: 'before summary', toolUses: [] }] })
  expect(result.messages?.[0]?.text).toBe('kept summary')
  expect([notices, prompts, compactions]).toEqual([3, 1, 1])
  expect(logs.filter(line => /classic.SessionStart|prompt.submit|session.compact/u.test(line)).length).toBe(5)
})

test('replay and live counting agree through toggles, disabled persona, empty text and subagent reports', async ($, on) => {
  engine(on, new Map())
  let liveCount = 0
  on('state.set', ($, e, next) => {
    if (e.plugin === 'krux-mod' && e.key === 'turns') liveCount = Number(e.value)
    return next(e)
  })
  await start($)
  const history: History = []
  const sequence = [
    ['pierwszy', ORIGIN, 1], ['włącz flow', ORIGIN, 1], ['wyłącz krux', ORIGIN, 1],
    ['bez persony', ORIGIN, 2], ['raport', { kind: 'task-notification' as const }, 3],
    ['włącz krux', ORIGIN, 0], [' ', ORIGIN, 0], ['raz', ORIGIN, 1],
    ['dwa', ORIGIN, 2], ['trzy', ORIGIN, 3], ['cztery', ORIGIN, 4],
    ['pięć', ORIGIN, 5], ['sześć', ORIGIN, 6],
  ] as const
  for (const [text, origin, count] of sequence) {
    await $.prompt.submit({ text, origin, wait: false })
    history.push({ role: 'user', text, toolUses: [] })
    expect(liveCount).toBe(count)
    expect(replay(history).turns).toBe(count)
  }
  const live = await $.prompt.submit({ text: 'siedem', origin: ORIGIN, wait: false })
  expect(live.context).toContain(VOICE_ANCHOR)
})

test('the nameplate opens once per turn, survives redraw and forgets older turns', async ($, on) => {
  engine(on, new Map())
  await start($)
  const plate = async (requestId: string) => {
    const ui = await $.ui.mount({ ...REPLY, requestId, surface: 'terminal', props: { text: 'Krux kuć.', isFirstOfReply: true } })
    const found = (await ui.find({ type: 'Text', text: '⚒ Krux' })) !== undefined
    await ui.unmount()
    return found
  }
  for (let turn = 0; turn < 40; turn += 1) {
    await $.turn.start({ text: 'kuj', turnId: `bounded-${turn}` })
    expect(await plate(`bounded-${turn}`)).toBe(true)
    if (turn === 0) {
      expect(await plate('second-block')).toBe(false)
      expect(await plate('bounded-0')).toBe(true)
    }
  }
  expect(await plate('bounded-39')).toBe(true)
  expect(await plate('bounded-38')).toBe(true)
  expect(await plate('bounded-0')).toBe(false)
  expect(await plate('new-block')).toBe(false)
})

test('a long turn reopens the nameplate with the prompt echo, once per turn and steady on redraw', async ($, on) => {
  engine(on, new Map())
  await start($)
  const ECHO = ' · do prośby: „Poukładaj hooki pod sceny”'
  const reply = (requestId: string) => $.ui.mount({ ...REPLY, requestId, surface: 'terminal', props: { text: 'Gotowe.', isFirstOfReply: true } })
  await $.prompt.submit({ text: 'Poukładaj  hooki\npod sceny', wait: false, origin: ORIGIN })
  await $.turn.start({ text: 'Poukładaj hooki pod sceny', turnId: 'echo-turn' })
  const early = await reply('echo-early')
  expect(await early.find({ type: 'Text', text: '⚒ Krux' })).toBeDefined()
  expect(await early.find({ type: 'Text', text: ECHO })).toBeUndefined()
  await early.unmount()
  for (let call = 0; call < 4; call += 1) await $.tool.call({ tool: 'Read', file_path: `/repo/hooks/${call}.ts` })
  const late = await reply('echo-late')
  expect(await late.find({ type: 'Text', text: ECHO })).toBeDefined()
  await late.unmount()
  const redraw = await reply('echo-late')
  expect(await redraw.find({ type: 'Text', text: ECHO })).toBeDefined()
  await redraw.unmount()
  const other = await reply('echo-other')
  expect(await other.find({ type: 'Text', text: ECHO })).toBeUndefined()
  expect(await other.find({ type: 'Text', text: '⚒ Krux' })).toBeUndefined()
  await other.unmount()
  await $.prompt.submit({ text: 'kolejna', wait: false, origin: { kind: 'task-notification' } })
  await $.turn.start({ text: 'raport', turnId: 'echo-report' })
  for (let call = 0; call < 4; call += 1) await $.tool.call({ tool: 'Read', file_path: `/repo/docs/${call}.md` })
  const quiet = await reply('echo-report')
  expect(await quiet.find({ type: 'Text', text: ECHO })).toBeUndefined()
  await quiet.unmount()
})

test('panel notes keep only the newest 16 and expire after five minutes', async ($, on) => {
  const clock = engine(on, new Map())
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (let toggle = 0; toggle < 20; toggle += 1) await ui.press({ key: 'toggle-flow' })
  const entered = await $.prompt.submit({ text: 'dalej', origin: ORIGIN, wait: false })
  expect((entered.context ?? []).filter(note => note.startsWith('Flow ')).length).toBe(16)
  expect(entered.context?.[0]).toContain('Flow włączony')
  const once = await $.prompt.submit({ text: 'dalej', origin: ORIGIN, wait: false })
  expect((once.context ?? []).filter(note => note.startsWith('Flow '))).toEqual([])
  await ui.press({ key: 'toggle-flow' })
  await clock.advance(300_001)
  await ui.press({ key: 'toggle-konkret' })
  const fresh = await $.prompt.submit({ text: 'dalej', origin: ORIGIN, wait: false })
  expect((fresh.context ?? []).filter(note => note.startsWith('Flow '))).toEqual([])
  expect((fresh.context ?? []).some(note => note.startsWith('Konkret włączony'))).toBe(true)
  await ui.press({ key: 'toggle-flow' })
  await clock.advance(300_000)
  const edge = await $.prompt.submit({ text: 'dalej', origin: ORIGIN, wait: false })
  expect((edge.context ?? []).some(note => note.startsWith('Flow '))).toBe(true)
  await ui.press({ key: 'toggle-flow' })
  await clock.advance(300_001)
  const stale = await $.prompt.submit({ text: 'dalej', origin: ORIGIN, wait: false })
  expect((stale.context ?? []).filter(note => note.startsWith('Flow '))).toEqual([])
})


test('a resumed toggle history keeps the live six-turn anchor rhythm', async ($, on) => {
  const history: History = ['pierwszy', 'włącz flow', 'wyłącz krux', 'bez persony', 'włącz krux', 'raz', 'dwa', 'trzy', 'cztery', 'pięć', 'raport']
    .map(text => ({ role: 'user', text, toolUses: [] }))
  engine(on, new Map(), { history })
  await start($)
  const resumed = await $.prompt.submit({ text: 'siedem', origin: ORIGIN, wait: false })
  expect(resumed.context).toContain(VOICE_ANCHOR)
  const next = await $.prompt.submit({ text: 'osiem', origin: ORIGIN, wait: false })
  expect(next.context).toContain(VOICE_SHORT)
})

test('history ending with persona enable restores lore even when its turn count is zero', async ($, on) => {
  const history: History = [
    { role: 'user', text: 'testy', toolUses: [] },
    { role: 'assistant', text: 'Krux sprawdzić.', toolUses: [{ tool_use_id: 'test', tool: 'Bash', input: { command: 'npm test' }, isError: true }] },
    { role: 'user', text: 'włącz krux', toolUses: [] },
  ]
  let runs = 0
  engine(on, new Map(), { history })
  on('state.set', ($, e, next) => {
    if (e.plugin === 'krux-mod' && e.key === 'lore') runs = (e.value as { testRuns: number }).testRuns
    return next(e)
  })
  await start($)
  const entered = await $.prompt.submit({ text: 'dalej', origin: ORIGIN, wait: false })
  expect(entered.context).toContain(VOICE_ANCHOR)
  expect(runs).toBe(1)
})

test('every main or mate code edit makes a completed test run stale, and a new run clears it', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ok', text: '3 pass\n0 fail' }))
  const clock = engine(on, new Map())
  await start($)
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  for (const agentId of [undefined, 'a1']) {
    for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
      await $.tool.call({ tool: 'Bash', command: 'npm test' })
      expect((await ui.find({ key: 'tests' }))?.text).not.toContain('◌ nieświeże')
      await clock.advance(1)
      await $.tool.call({ tool, file_path: '/work/a.ts', notebook_path: '/work/a.ipynb', agentId } as never)
      expect((await ui.find({ key: 'tests' }))?.text).toContain('◌ nieświeże')
    }
  }
  await $.tool.call(inLoop('a1', { tool: 'Bash', command: 'npm test' }))
  expect((await ui.find({ key: 'tests' }))?.text).not.toContain('◌ nieświeże')
})

test('main and mate documentation edits keep a completed test run fresh without rewriting the board', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ok', text: '3 pass\n0 fail' }))
  let writes = 0
  on('state.set', ($, e, next) => {
    if (e.plugin === 'krux-mod' && e.key === 'board') writes += 1
    return next(e)
  })
  const clock = engine(on, new Map())
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: '/work/a.ts' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const before = writes
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  await clock.advance(1)
  for (const agentId of [undefined, 'a1']) {
    for (const tool of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) {
      for (const extension of ['MD', 'mdx', 'txt', 'rst', 'adoc']) {
        const input = { [tool === 'NotebookEdit' ? 'notebook_path' : 'file_path']: `/work/docs/readme.${extension}` }
        await $.tool.call({ tool, ...input, agentId } as never)
        expect((await ui.find({ key: 'tests' }))?.text).not.toContain('◌ nieświeże')
      }
    }
  }
  expect(writes).toBe(before)
})

test('denied edits and tests leave the board intact, and mate tasks cannot replace the main plan', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => extras.toolDenied ? { deny: 'blocked' } as never : { result: 'ok', text: '3 pass\n0 fail' })
  const extras: Extras = {}
  const clock = engine(on, new Map(), extras)
  await start($)
  await $.tool.call(TODOS as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  const before = (await ui.find({ key: 'plan' }))?.text
  await clock.advance(1)
  extras.toolDenied = true
  for (const agentId of [undefined, 'a1']) {
    await $.tool.call({ tool: 'Edit', file_path: '/work/a.ts', agentId } as never)
    await $.tool.call({ tool: 'Bash', command: 'npm test', agentId } as never)
  }
  expect((await ui.find({ key: 'tests' }))?.text).not.toContain('◌ nieświeże')
  extras.toolDenied = false
  await $.tool.call(inLoop('a1', { tool: 'TodoWrite', todos: [{ content: 'Plan kumpla', status: 'in_progress' }] }))
  expect((await ui.find({ key: 'plan' }))?.text).toBe(before)
})

test('host-backgrounded main and mate tests preserve the failed run without celebrating', async ($, on) => {
  const journalWrites: KruxJournal[] = []
  const extras: Extras = {
    git: { stdout: '# branch.head main\n? a.ts\n' },
    agents: [{ id: 'a1', status: 'running' }],
    toolReply: { result: { exitCode: 1 }, isError: true, text: '1 fail\n0 pass' },
  }
  let latestLore: KruxLore | undefined
  let latestCrew: KruxCrew | undefined
  engine(on, new Map(), extras)
  on('state.set', ($, e, next) => {
    if (e.plugin === 'krux-mod' && e.key === 'journal') journalWrites.push(e.value as KruxJournal)
    if (e.plugin === 'krux-mod' && e.key === 'lore') latestLore = e.value as KruxLore
    if (e.plugin === 'krux-mod' && e.key === 'crew') latestCrew = e.value as KruxCrew
    return next(e)
  })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.agent.spawn(spawnOf({ prompt: 'Młot: testy', description: 'Młot' }))
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  const failed = (await ui.find({ key: 'tests' }))?.text
  extras.toolReply = { result: { backgroundTaskId: 'host-task', timedOutAfterMs: 1000, exitCode: 0 }, text: '5 pass\n0 fail' }
  for (const agentId of [undefined, 'a1']) {
    await $.tool.call({ tool: 'Bash', command: 'npm test', agentId } as never)
    expect((await ui.find({ key: 'tests' }))?.text).toBe(failed)
    expect((await ui.find({ key: 'readiness' }))?.text).toBe('· do commita: testy padłe')
    expect(journalWrites.at(-1)?.entries.at(-1)).toMatchObject({ ok: null, summary: '' })
    expect(latestLore).toMatchObject({ testRuns: 1, testFails: 1, last: 'test-fail' })
    expect(latestCrew?.cues.some(cue => cue.kind === 'test-pass')).toBe(false)
  }
})

test('working and staged whitespace checks gate commit readiness with a five-second timeout', async ($, on) => {
  let workingCode = 0
  let cachedCode = 0
  let throws = false
  const calls: { argv: readonly string[]; timeoutMs: number | undefined }[] = []
  const processRun: Extras['processRun'] = async (argv, timeoutMs) => {
    if (argv.includes('--check')) {
      calls.push({ argv, timeoutMs })
      if (throws && argv.includes('--cached')) throw new Error('git unavailable')
      return { exitCode: argv.includes('--cached') ? cachedCode : workingCode, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
    }
    return { exitCode: 0, stdout: '# branch.head main\n? a.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
  }
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ok', text: '3 pass\n0 fail' }))
  engine(on, new Map(), { processRun })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  expect((await ui.find({ key: 'readiness' }))?.text).toBe('✓ do commita')
  const outcomes = [
    [0, 2, '· do commita: białe znaki'],
    [2, 0, '· do commita: białe znaki'],
    [1, 0, '✓ do commita'],
    [0, 128, '✓ do commita'],
    [2, 128, '· do commita: białe znaki'],
  ] as const
  for (const [working, cached, readiness] of outcomes) {
    workingCode = working
    cachedCode = cached
    await $.tool.call({ tool: 'Bash', command: 'git status' })
    expect((await ui.find({ key: 'readiness' }))?.text).toBe(readiness)
  }
  workingCode = 0
  throws = true
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect((await ui.find({ key: 'readiness' }))?.text).toBe('✓ do commita')
  expect(calls.length).toBe(16)
  for (const call of calls) {
    expect(call.argv).toEqual(call.argv.includes('--cached')
      ? ['git', '--no-optional-locks', 'diff', '--cached', '--check']
      : ['git', '--no-optional-locks', 'diff', '--check'])
    expect(call.timeoutMs).toBe(5000)
  }
})

test('overlapping git refreshes wait for the staged check before one follow-up read', async ($, on) => {
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { entered = resolve })
  let checks = 0
  let cachedChecks = 0
  let statuses = 0
  const processRun: Extras['processRun'] = async argv => {
    if (argv.includes('status')) statuses += 1
    if (argv.includes('--check')) {
      checks += 1
      if (argv.includes('--cached')) {
        cachedChecks += 1
        if (cachedChecks === 2) { entered(); await gate }
      }
    }
    return { exitCode: 0, stdout: '# branch.head main\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
  }
  engine(on, new Map(), { processRun })
  await start($)
  expect(checks).toBe(2)
  const first = $.tool.call({ tool: 'Edit', file_path: '/work/a.ts' } as never)
  let second: Promise<unknown> | undefined
  try {
    await started
    second = $.tool.call({ tool: 'Write', file_path: '/work/b.ts', content: '' })
    // Ten prompt stawia barierę po mikrozadaniach drugiego narzędzia.
    await $.prompt.submit({ text: '', wait: false, origin: ORIGIN })
    expect(statuses).toBe(2)
  } finally {
    release()
  }
  await Promise.all([first, second])
  expect(statuses).toBe(3)
  expect(checks).toBe(6)
})

test('behind toasts compare saved reads and skip initial, equal, lower and missing repo reads', async ($, on) => {
  const toasts: string[] = []
  const git = { stdout: '# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -2\n' }
  const extras: Extras = { git, toasts }
  engine(on, new Map(), extras)
  await start($)
  expect(toasts).toEqual([])
  for (const behind of [2, 1, 4, 4]) {
    git.stdout = `# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -${behind}\n`
    await $.tool.call({ tool: 'Bash', command: 'git status' })
  }
  expect(toasts).toEqual(['origin ma 4 nowych commitów — git pull.'])
  extras.git = undefined
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  extras.git = git
  git.stdout = git.stdout.replace('-4', '-8')
  await $.tool.call(inLoop('a1', { tool: 'Bash', command: 'git status' }))
  expect(toasts).toHaveLength(1)
})

test('a live plan gains the stuck mark at fifteen minutes without resetting its start', async ($, on) => {
  const clock = engine(on, new Map())
  await start($)
  await $.tool.call(TODOS as never)
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  await clock.advance(899_999)
  expect((await ui.find({ key: 'plan' }))?.text).not.toContain('⧗')
  await $.tool.call(TODOS as never)
  await clock.advance(1)
  expect((await ui.find({ key: 'task-1' }))?.text).toContain('⧗ 15 min')
  await clock.advance(60_000)
  expect((await ui.find({ key: 'task-1' }))?.text).toContain('⧗ 16 min')
})

test('a hidden shaft pane keeps the band digest stuck mark ticking without another tool', async ($, on) => {
  const clock = engine(on, new Map([['mode.sztolnia', false]]))
  await start($)
  await $.tool.call(TODOS as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns: 160 } })
  expect(await ui.find({ key: 'digest' })).toBeDefined()
  await clock.advance(899_999)
  expect((await ui.find({ key: 'plan' }))?.text).not.toContain('⧗')
  await clock.advance(1)
  expect((await ui.find({ key: 'plan' }))?.text).toContain('⧗ 15 min')
  await clock.advance(60_000)
  expect((await ui.find({ key: 'plan' }))?.text).toContain('⧗ 16 min')
})

test('main and mate failure bubbles name only the current first failing test', async ($, on) => {
  const extras: Extras = { toolError: '(fail) cache > drugi request [3ms]\n(fail) auth > login [2ms]\n1 pass\n2 fail', agents: [{ id: 'a1', status: 'running' }] }
  engine(on, new Map(), extras)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 3 } })
  expect((await ui.find({ type: 'Text', text: /Padły:/ }))?.text).toContain('cache > drugi request.')
  await $.agent.spawn(spawnOf({ prompt: 'Młot: testy', description: 'Młot' }))
  extras.toolError = '(fail) nowy test [3ms]\n1 pass\n1 fail'
  await $.tool.call(inLoop('a1', { tool: 'Bash', command: 'npm test' }))
  expect((await ui.find({ type: 'Text', text: /^Młot:.*Padły:/ }))?.text).toContain('nowy test.')
  extras.toolError = '1 fail'
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(await ui.find({ type: 'Text', text: /Padły:/ })).toBeUndefined()
})

test('plan limits turn automatic konkret on at eighty percent and off only when every window falls', async ($, on) => {
  on('ui.render', { component: 'SessionMode' }, ($, e) => ({ type: 'Text', props: {}, children: [e.props.modes.join(',')] }))
  const saved = new Map<string, unknown>()
  const toasts: string[] = []
  const usage: SessionUsage = { startedAt: 0, context: { window: 200_000, percent: 99 }, rateLimits: [{ kind: 'five_hour', percentUsed: 79 }, { kind: 'seven_day', percentUsed: 80 }] }
  engine(on, saved, { usage, toasts })
  await start($)
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:persona', 'krux-mod:konkret'])
  expect(toasts).toEqual(['Limit planu 80%: konkret włączony do resetu.'])
  const ui = await $.ui.mount({ plugin: 'krux-mod', surface: 'terminal', component: 'SessionMode', requestId: 'mode', props: { modes: [] } } as never)
  expect(await ui.find({ type: 'Text', text: 'krux,konkret (auto)' })).toBeDefined()
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  expect(toasts).toHaveLength(1)
  usage.rateLimits[0]!.percentUsed = 80
  usage.rateLimits[1]!.percentUsed = 0
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(toasts).toHaveLength(1)
  usage.rateLimits[0]!.percentUsed = 79
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:persona'])
  expect(toasts).toHaveLength(2)
  expect(toasts[1]).toContain('Konkret automatyczny wyłączony')
  expect(saved.size).toBe(0)
})

test('automatic konkret preserves a manually enabled mode through the limit reset', async ($, on) => {
  on('ui.render', { component: 'SessionMode' }, ($, e) => ({ type: 'Text', props: {}, children: [e.props.modes.join(',')] }))
  const saved = new Map<string, unknown>([['mode.persona', false], ['mode.konkret', true]])
  const usage: SessionUsage = { startedAt: 0, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 90 }] }
  engine(on, saved, { usage })
  await start($)
  const ui = await $.ui.mount({ plugin: 'krux-mod', surface: 'terminal', component: 'SessionMode', requestId: 'mode', props: { modes: [] } } as never)
  expect(await ui.find({ type: 'Text', text: 'konkret' })).toBeDefined()
  usage.rateLimits = []
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:konkret'])
  expect(saved.get('mode.konkret')).toBe(true)
  expect(saved.size).toBe(2)
})

test('/krux status reports auto, manual and off konkret without saving the automatic flag', async ($, on) => {
  const saved = new Map<string, unknown>([['mode.konkret', false]])
  const usage: SessionUsage = { startedAt: 0, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 80 }] }
  engine(on, saved, { usage, paneWaits: true })
  await start($)
  const command = { command: 'krux', origin: ORIGIN, presentation: { isFullscreen: false, columns: 120 } }
  const automatic = await $.command.run({ ...command, args: 'status' })
  expect(automatic.text).toBe('persona: on · konkret: auto · flow: off · animacje: on · kowal: on · sztolnia: on · czat: off')
  expect(automatic.context).toBeUndefined()
  expect(saved.get('mode.konkret')).toBe(false)
  expect(saved.size).toBe(1)
  const fallback = await $.command.run({ ...command, args: '' })
  expect(fallback.text).toContain('konkret: auto')
  const manual = await $.command.run({ ...command, args: 'konkret on' })
  expect(manual.text).toContain('konkret: on')
  expect((await $.command.run({ ...command, args: 'status' })).text).toContain('konkret: on')
  const disabled = await $.command.run({ ...command, args: 'konkret off' })
  expect(disabled.text).toContain('konkret: auto')
  usage.rateLimits = []
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  expect((await $.command.run({ ...command, args: 'status' })).text).toContain('konkret: off')
  expect(saved.get('mode.konkret')).toBe(false)
  expect(saved.size).toBe(1)
})

test('a completed limit reset wins over an older usage read that returns late', async ($, on) => {
  const low: SessionUsage = { startedAt: 0, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 0 }] }
  const high: SessionUsage = { ...low, rateLimits: [{ kind: 'five_hour', percentUsed: 90 }] }
  let enterFirst!: () => void
  let releaseFirst!: () => void
  const firstEntered = new Promise<void>(resolve => { enterFirst = resolve })
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve })
  let reads = 0
  const toasts: string[] = []
  engine(on, new Map(), { toasts, usageRead: async () => {
    reads += 1
    if (reads === 1) return low
    if (reads === 2) { enterFirst(); await firstGate; return high }
    return low
  } })
  await start($)
  const command = { command: 'krux', args: 'status', origin: ORIGIN, presentation: { isFullscreen: false, columns: 120 } }
  const off = {
    sections: ['intro', 'krux-mod:persona'],
    status: 'persona: on · konkret: off · flow: off · animacje: on · kowal: on · sztolnia: on · czat: off',
  }
  const snapshot = async () => ({ sections: await sectionIds($), status: (await $.command.run(command)).text })
  const oldRead = $.tool.call({ tool: 'Read', file_path: '/work/old-read.ts' })
  try {
    await firstEntered
    await $.tool.call({ tool: 'Read', file_path: '/work/new-read.ts' })
    expect(await snapshot()).toEqual(off)
  } finally {
    releaseFirst()
    await oldRead
  }
  expect(await snapshot()).toEqual(off)
  expect(toasts).toEqual([])
})

test('a limit crossing toasts once even when a newer read starts while the flag is being saved', async ($, on) => {
  const low: SessionUsage = { startedAt: 0, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 0 }] }
  const high: SessionUsage = { ...low, rateLimits: [{ kind: 'five_hour', percentUsed: 90 }] }
  let reads = 0
  let enterNewer!: () => void
  const newerEntered = new Promise<void>(resolve => { enterNewer = resolve })
  const toasts: string[] = []
  engine(on, new Map(), { toasts, usageRead: () => {
    reads += 1
    if (reads === 3) enterNewer()
    return reads === 1 ? low : high
  } })
  let newer: Promise<unknown> | null = null
  on('state.set', async ($state, e, next) => {
    // Zapis flagi z pierwszego odczytu 90% czeka, aż ruszy nowszy odczyt.
    if (e.plugin === 'krux-mod' && e.key === 'autoKonkret' && e.value === true && newer === null) {
      newer = $.tool.call({ tool: 'Read', file_path: '/work/newer.ts' })
      await newerEntered
    }
    return next(e)
  })
  await start($)
  await $.tool.call({ tool: 'Read', file_path: '/work/older.ts' })
  await newer
  expect(toasts.filter(text => text.startsWith('Limit planu 80%'))).toEqual(['Limit planu 80%: konkret włączony do resetu.'])
})

test('/clear invalidates a usage read still in flight from before the reset', async ($, on) => {
  const low: SessionUsage = { startedAt: 0, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 0 }] }
  const high: SessionUsage = { ...low, rateLimits: [{ kind: 'five_hour', percentUsed: 90 }] }
  let reads = 0
  let enterOld!: () => void
  let releaseOld!: () => void
  const oldEntered = new Promise<void>(resolve => { enterOld = resolve })
  const oldGate = new Promise<void>(resolve => { releaseOld = resolve })
  const toasts: string[] = []
  engine(on, new Map(), { toasts, usageRead: async () => {
    reads += 1
    if (reads === 2) { enterOld(); await oldGate; return high }
    return low
  } })
  on('classic.SessionStart', () => ({}))
  await start($)
  const oldRead = $.tool.call({ tool: 'Read', file_path: '/work/before-clear.ts' })
  try {
    await oldEntered
    await $.classic.SessionStart({ source: 'clear' })
  } finally {
    releaseOld()
    await oldRead
  }
  expect(await sectionIds($)).toEqual(['intro', 'krux-mod:persona'])
  expect(toasts).toEqual([])
})

test('/krux zapisz shares tool ids, deduplicates notes and reports the new id in a toast', async ($, on) => {
  const toasts: string[] = []
  engine(on, new Map(), { toasts })
  await start($)
  await $.tool.call({ tool: 'mcp__krux-mod__watki', open: [{ text: 'narzędzie' }] } as never)
  const command = { command: 'krux', origin: ORIGIN, presentation: { isFullscreen: false, columns: 120 } }
  await $.command.run({ ...command, args: 'zapisz Sprawdzić API' })
  expect(toasts).toEqual(['Wątek #2 zapisany.'])
  await $.command.run({ ...command, args: 'zapisz Sprawdzić   API' })
  expect(toasts[1]).toBe('Notatka już w otwartych wątkach.')
  const report = await $.tool.call({ tool: 'mcp__krux-mod__watki', open: [{ text: 'następny' }] } as never)
  expect(report.text).toBe('Open threads:\n#1 [todo] narzędzie\n#2 [todo] Sprawdzić API\n#3 [todo] następny')
  const help = await $.command.run({ ...command, args: 'zapisz' })
  expect(help.text).toContain('/krux zapisz <tekst>')
  expect(toasts).toHaveLength(2)
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  expect(await ui.find({ type: 'Text', text: 'Sprawdzić API' })).toBeDefined()
})

test('concurrent quick notes keep distinct ids', async ($, on) => {
  const toasts: string[] = []
  engine(on, new Map(), { toasts })
  await start($)
  const command = { command: 'krux', origin: ORIGIN, presentation: { isFullscreen: false, columns: 120 } }
  await Promise.all(['jeden', 'dwa'].map(text => $.command.run({ ...command, args: `zapisz ${text}` })))
  const report = await $.tool.call({ tool: 'mcp__krux-mod__watki' } as never)
  expect(['Open threads:\n#1 [todo] jeden\n#2 [todo] dwa', 'Open threads:\n#1 [todo] dwa\n#2 [todo] jeden']).toContain(report.text)
  expect(toasts.slice().sort()).toEqual(['Wątek #1 zapisany.', 'Wątek #2 zapisany.'])
})

test('concurrent quick notes preserve both entries while resumed history is being restored', async ($, on) => {
  const toasts: string[] = []
  engine(on, new Map(), { toasts, history: [{ role: 'assistant', text: '', toolUses: [{ tool_use_id: 'old', tool: 'mcp__krux-mod__watki', input: {}, text: 'Open threads:\n#99 [todo] stary' }] }] })
  await start($)
  const command = { command: 'krux', origin: ORIGIN, presentation: { isFullscreen: false, columns: 120 } }
  await Promise.all(['jeden', 'dwa'].map(text => $.command.run({ ...command, args: `zapisz ${text}` })))
  const report = await $.tool.call({ tool: 'mcp__krux-mod__watki' } as never)
  expect(['Open threads:\n#99 [todo] stary\n#100 [todo] jeden\n#101 [todo] dwa', 'Open threads:\n#99 [todo] stary\n#100 [todo] dwa\n#101 [todo] jeden']).toContain(report.text)
  expect(toasts.slice().sort()).toEqual(['Wątek #100 zapisany.', 'Wątek #101 zapisany.'])
})

test('a quick note before the first prompt survives restoration and continues resumed ids', async ($, on) => {
  engine(on, new Map(), { history: [{ role: 'assistant', text: '', toolUses: [{ tool_use_id: 'old', tool: 'mcp__krux-mod__watki', input: {}, text: 'Open threads:\n#99 [todo] stary' }] }] })
  await start($)
  await $.command.run({ command: 'krux', args: 'zapisz nowy', origin: ORIGIN, presentation: { isFullscreen: false, columns: 120 } })
  await $.prompt.submit({ text: 'dalej', wait: false, origin: ORIGIN })
  const report = await $.tool.call({ tool: 'mcp__krux-mod__watki' } as never)
  expect(report.text).toBe('Open threads:\n#99 [todo] stary\n#100 [todo] nowy')
})

test('long-turn toasts start at five minutes, use the main clock and reset after completion', async ($, on) => {
  const toasts: string[] = []
  const clock = engine(on, new Map(), { toasts })
  await start($)
  await $.turn.start({ text: '', turnId: 't1' })
  await clock.advance(299_999)
  await $.turn.complete({ answer: '', durationMs: 999_999, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(toasts).toEqual([])
  await $.turn.start({ text: '', turnId: 't2' })
  await clock.advance(300_000)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(toasts).toEqual(['Krux skończyć po 5 min.'])
  await clock.advance(300_000)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(toasts).toHaveLength(1)
  await $.turn.start({ text: '', turnId: 't3' })
  await clock.advance(359_999)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: true, turnId: 't3', reason: 'answer' })
  expect(toasts[1]).toBe('Krux skończyć po 5 min.')
})

test('mate turn events cannot replace or clear the main turn timer', async ($, on) => {
  const toasts: string[] = []
  const clock = engine(on, new Map(), { toasts })
  await start($)
  await $.turn.start({ text: '', turnId: 'main' })
  await clock.advance(60_000)
  await $.turn.start({ text: '', turnId: 'mate', agentId: 'a1' } as never)
  await clock.advance(240_000)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'mate', reason: 'answer', agentId: 'a1' } as never)
  expect(toasts).toEqual([])
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'main', reason: 'answer' })
  expect(toasts).toEqual(['Krux skończyć po 5 min.'])
})

test('a person returning after thirty minutes gets board state only in a toast', async ($, on) => {
  const toasts: string[] = []
  const clock = engine(on, new Map([['mode.persona', false]]), { toasts })
  await start($)
  await $.prompt.submit({ text: 'start', wait: false, origin: ORIGIN })
  await $.tool.call(TODOS as never)
  await clock.advance(1_799_999)
  await $.prompt.submit({ text: 'report', wait: false, origin: { kind: 'task-notification' } })
  expect(toasts).toEqual([])
  await clock.advance(1)
  const returned = await $.prompt.submit({ text: 'dalej', wait: false, origin: ORIGIN })
  expect(toasts).toEqual(['Plan 1/3'])
  expect(returned.context).toBeUndefined()
  await clock.advance(1_799_999)
  await $.prompt.submit({ text: 'przed progiem', wait: false, origin: ORIGIN })
  await clock.advance(1)
  await $.prompt.submit({ text: 'chwilę później', wait: false, origin: ORIGIN })
  expect(toasts).toHaveLength(1)
})

test('a return to an empty board is silent and a toggle still refreshes the person timestamp', async ($, on) => {
  const toasts: string[] = []
  const clock = engine(on, new Map(), { toasts })
  await start($)
  await $.prompt.submit({ text: 'wyłącz krux', wait: false, origin: ORIGIN })
  await clock.advance(1_800_000)
  await $.prompt.submit({ text: 'dalej', wait: false, origin: ORIGIN })
  expect(toasts).toEqual([])
  await $.tool.call(TODOS as never)
  await clock.advance(1_800_000)
  await $.prompt.submit({ text: 'wyłącz konkret', wait: false, origin: ORIGIN })
  expect(toasts).toEqual(['Plan 1/3'])
})

test('/krux raport returns session facts as text without model context or a pane', async ($, on) => {
  const opened: string[] = []
  const processRun: Extras['processRun'] = argv => ({ exitCode: 0, stdout: argv.includes('log') ? 'full\tabc123\tPoprawka parsera\n' : '# branch.head main\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ok', text: '3 pass\n0 fail' }))
  engine(on, new Map(), { opened, processRun })
  await start($)
  await $.tool.call(TODOS as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'mcp__krux-mod__watki', open: [{ text: 'Sprawdzić API' }] } as never)
  opened.length = 0
  const report = await $.command.run({ command: 'krux', args: 'raport', origin: ORIGIN, presentation: { isFullscreen: false, columns: 120 } })
  expect(report.text).toBe('## Commity\n- abc123 Poprawka parsera\n\n## Ostatni przebieg testów\nKomenda: npm test\nWynik: zaliczony\nWykonawca: Krux\nZaliczone: 3\nNieudane: 0\n\n## Plan\nZrobione: 1/3\n- [x] Test odtwarzający błąd\n- [ ] Poprawka w parser.js (w toku)\n- [ ] Changelog\n\n## Otwarte wątki\n- #1 [do zrobienia] Sprawdzić API\n\n## Podsumowanie sesji\nPrzebiegi testów: 1 (nieudane: 0)\nCommity: 0\nRozbiórki: 0')
  expect(report.context).toBeUndefined()
  expect(opened).toEqual([])
})

// W2: testy granic wpięcia; drzewo i wynik nadal pochodzą z prawdziwych hooków.
const CHAT_USER = { plugin: 'krux-mod', component: 'UserMessage', requestId: 'chat-user', surface: 'terminal', viewport: { columns: 100, rows: 40 }, props: { text: 'siema', origin: ORIGIN, isExpanded: false } } as const
const READ_ROW = { tool_use_id: 'read-1', tool: 'Read', input: { file_path: '/repo/a.ts' }, isRunning: false, isErrored: false, isInterrupted: false, output: 'ok' }
const TOOL_USE = { plugin: 'krux-mod', component: 'ToolUse', requestId: 'read-1', surface: 'terminal', viewport: { columns: 100, rows: 40 }, props: READ_ROW } as const
const PRESENTATION = { isFullscreen: false, columns: 120 }

async function kruxCommand($: Engine, args: string) {
  return $.command.run({ command: 'krux', args, origin: ORIGIN, presentation: PRESENTATION })
}

async function readForJournal($: Engine, id = 'read-1', agentId?: string) {
  return $.tool.call({ tool: 'Read', file_path: '/repo/a.ts', tool_use_id: id, ...(agentId === undefined ? {} : { agentId }) } as Parameters<Engine['tool']['call']>[0])
}

test('chat toggles persist independently, queue a note and appear in status and footer', async ($, on) => {
  on('ui.render', { component: 'SessionMode' }, ($, e) => ({ type: 'Text', props: {}, children: [e.props.modes.join(',')] }))
  const saved = new Map<string, unknown>([['mode.flow', true]])
  engine(on, saved)
  await start($)
  expect((await kruxCommand($, 'status')).text).toContain('czat: off')
  const command = await kruxCommand($, 'czat')
  expect(command.text).toContain('czat: on')
  expect(command.context?.[0]).toContain('czat włączony')
  expect(saved.get('mode.czat')).toBe(true)
  expect(saved.get('mode.flow')).toBe(true)
  const footer = await $.ui.mount({ plugin: 'krux-mod', surface: 'terminal', component: 'SessionMode', requestId: 'footer', props: { modes: ['plan'] } })
  expect(await footer.find({ type: 'Text', text: 'plan,krux,flow,czat' })).toBeDefined()
  const panel = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await panel.find({ key: 'cell-czat' }))?.props.width).toBe(18)
  await panel.press({ key: 'toggle-czat' })
  expect(saved.get('mode.czat')).toBe(false)
  expect((await $.prompt.submit({ text: 'dalej', origin: ORIGIN, wait: false })).context?.[0]).toContain('czat wyłączony')
})

test('chat mode restored from its own store key wraps messages even with persona off', async ($, on) => {
  engine(on, new Map<string, unknown>([['modes', { czat: false }], ['mode.czat', true], ['mode.persona', false]]))
  await start($)
  const reply = await $.ui.mount({ ...REPLY, surface: 'terminal', viewport: { columns: 100, rows: 40 }, props: { text: 'Build pad.', isFirstOfReply: false } })
  expect((await reply.find({ key: 'chat-header' }))?.text?.trim()).toMatch(/^Krux · \d{2}:\d{2}$/u)
  // Dymek niesie treść silnika w całości: opróżniona w `next(e)` gubi słowa.
  expect(await reply.find({ type: 'Text', text: 'Build pad.' })).toBeDefined()
  // Silnik odrzuca treść pod Boxem z `width`: każdy mówca bierze wiersz bez odsunięcia.
  expect((await reply.find({ key: 'chat' }))?.props.width).toBeUndefined()
  expect((await reply.find({ key: 'chat' }))?.props.paddingLeft).toBeUndefined()
  expect(await reply.find({ key: 'nameplate' })).toBeUndefined()
  expect((await reply.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'round').length).toBe(1)
  // Wiersz narzędzia w czacie stoi pod tekstem dymków, bez ramki, z natywną treścią.
  const tool = await $.ui.mount({ ...TOOL_USE, requestId: 'chat-tool-row' })
  expect((await tool.find({ key: 'chat-tool' }))?.props.paddingLeft).toBe(9)
  expect((await tool.find({ key: 'chat-tool' }))?.props.borderStyle).toBeUndefined()
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
  const result = await $.ui.mount({ ...TOOL_USE, component: 'ToolResult', requestId: 'chat-tool-row', props: { tool_use_id: 'chat-tool-row', tool: 'Read', output: 'ok', isErrored: false } })
  expect((await result.find({ key: 'chat-tool' }))?.props.paddingLeft).toBe(9)
  // Grupa niesie jedno wcięcie; jej wiersze nie dostają drugiego.
  const group = await $.ui.mount({ ...TOOL_USE, component: 'ToolGroup', requestId: 'chat-group', props: { calls: [{ ...READ_ROW, tool_use_id: 'in-group' }], isActive: false, isExpanded: true } })
  expect((await group.find({ key: 'chat-tool' }))?.props.paddingLeft).toBe(9)
  const row = await $.ui.mount({ ...TOOL_USE, requestId: 'in-group', props: { ...READ_ROW, tool_use_id: 'in-group' } })
  expect(await row.find({ key: 'chat-tool' })).toBeUndefined()
  expect(await row.find({ type: 'Text', text: 'engine' })).toBeDefined()
  const own = await $.ui.mount(CHAT_USER)
  expect((await own.find({ key: 'chat-header' }))?.text?.trim()).toMatch(/^Morra · \d{2}:\d{2}$/u)
  expect((await own.find({ key: 'chat' }))?.props.justifyContent).toBeUndefined()
  expect((await own.find({ key: 'chat-message' }))?.props.width).toBeUndefined()
  expect((await own.find({ key: 'chat' }))?.props.paddingLeft).toBeUndefined()
  expect(await own.find({ type: 'Text', text: 'siema' })).toBeDefined()
})

test('chat timestamps remain stable through redraw, resize and toggling off then on', async ($, on) => {
  const clock = engine(on, new Map([['mode.czat', true]]))
  await start($)
  const first = await $.ui.mount(CHAT_USER)
  const header = (await first.find({ key: 'chat-header' }))?.text?.trim()
  expect(header).toMatch(/^Morra · \d{2}:\d{2}$/u)
  await clock.advance(65_000)
  await first.redraw({ ...CHAT_USER.props, text: 'dalej' })
  expect((await first.find({ key: 'chat-header' }))?.text?.trim()).toBe(header)
  await kruxCommand($, 'czat off')
  expect(await first.find({ key: 'chat' })).toBeUndefined()
  await kruxCommand($, 'czat on')
  expect((await first.find({ key: 'chat-header' }))?.text?.trim()).toBe(header)
  await first.unmount()
  const narrow = await $.ui.mount({ ...CHAT_USER, viewport: { columns: 80, rows: 40 } })
  expect((await narrow.find({ key: 'chat' }))?.props.paddingLeft).toBeUndefined()
  expect((await narrow.find({ key: 'chat-header' }))?.text?.trim()).toBe(header)
  const second = await $.ui.mount({ ...CHAT_USER, requestId: 'later-user' })
  expect((await second.find({ key: 'chat-header' }))?.text?.trim()).not.toBe(header)
})

test('chat uses a timestamp supplied by props and passes through messages with no measured width', async ($, on) => {
  engine(on, new Map([['mode.czat', true]]))
  await start($)
  const timestamp = new Date(2026, 9, 7, 12, 34, 56).getTime()
  const own = await $.ui.mount({ ...CHAT_USER, props: { ...CHAT_USER.props, timestamp } } as unknown as Parameters<Engine['ui']['mount']>[0])
  expect((await own.find({ key: 'chat-header' }))?.text?.trim()).toBe('Morra · 12:34')
  const unknownWidth = await $.ui.mount({ ...REPLY, surface: 'terminal', props: { text: 'Treść', isFirstOfReply: true } })
  expect(await unknownWidth.find({ key: 'chat' })).toBeUndefined()
  expect(await unknownWidth.find({ key: 'nameplate' })).toBeUndefined()
  expect(await unknownWidth.find({ type: 'Text', text: 'Treść' })).toBeDefined()
})

test('chat reports keep a mate name from muster after the agent leaves the engine list', async ($, on) => {
  engine(on, new Map([['mode.czat', true]]))
  await start($)
  await $.agent.spawn(spawnOf({ description: 'Niuch węszyć', prompt: 'Sprawdź pliki' }))
  const report = await $.ui.mount({ ...CHAT_USER, requestId: 'niuch-report', props: { text: 'Gotowe.', origin: { kind: 'task-notification' }, isExpanded: false, task: { id: 'a1' }, from: { name: 'general-purpose' } } })
  expect((await report.find({ key: 'chat-header' }))?.text?.trim()).toMatch(/^Niuch · /u)
  expect((await report.find({ key: 'chat' }))?.props.paddingLeft).toBeUndefined()
  expect(await report.find({ type: 'Text', text: 'Gotowe.' })).toBeDefined()
})

test('chat resolves unrecorded agents from descriptions, keeps nameless orks and leaves shell notifications native', async ($, on) => {
  engine(on, new Map([['mode.czat', true]]), { agents: [{ id: 'nested', status: 'completed', description: 'Ochra: frontend' }, { id: 'plain', status: 'completed', description: 'sprawdzenie' }, { id: 'typed', status: 'completed', description: 'ocena zmian', type: 'krux-mod:piryt' }] })
  await start($)
  for (const [id, name] of [['nested', 'Ochra'], ['plain', 'ork'], ['typed', 'Piryt']] as const) {
    const report = await $.ui.mount({ ...CHAT_USER, requestId: id, props: { text: 'done', origin: { kind: 'task-notification' }, task: { id }, isExpanded: true } })
    expect((await report.find({ key: 'chat-header' }))?.text?.trim()).toMatch(new RegExp(`^${name} · `, 'u'))
    await report.unmount()
  }
  for (const props of [
    { text: 'shell done', origin: { kind: 'task-notification' as const }, task: { id: 'shell' }, isExpanded: false },
    { text: 'Niuch: hej', origin: { kind: 'peer' as const }, from: { name: 'Niuch' }, isExpanded: false },
    { text: 'ping', origin: { kind: 'scheduled-trigger' as const }, isExpanded: false },
  ]) {
    const native = await $.ui.mount({ ...CHAT_USER, requestId: props.text, props })
    expect(await native.find({ key: 'chat' })).toBeUndefined()
    expect(await native.find({ type: 'Text', text: props.text })).toBeDefined()
    await native.unmount()
  }
})

test('chat leaves Desktop messages and tool rows native even with the journal selected', async ($, on) => {
  engine(on, new Map([['mode.czat', true]]))
  await start($)
  await readForJournal($)
  await kruxCommand($, 'dziennik')
  const reply = await $.ui.mount({ ...REPLY, surface: 'desktop', viewport: { columns: 100, rows: 40 }, props: { text: 'Build pad.', isFirstOfReply: true } })
  const own = await $.ui.mount({ ...CHAT_USER, surface: 'desktop' })
  const tool = await $.ui.mount({ ...TOOL_USE, surface: 'desktop' })
  for (const [ui, body] of [[reply, 'Build pad.'], [own, 'siema'], [tool, 'engine']] as const) {
    expect(await ui.find({ key: 'chat' })).toBeUndefined()
    expect(await ui.find({ key: 'nameplate' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: body })).toBeDefined()
  }
})

test('the journal records main and mate results with ids, times and errors while chat is off', async ($, on) => {
  const journalWrites: KruxJournal[] = []
  const extras: Extras = { journalWrites, toolReply: { result: { exitCode: 0 }, text: '3 passed\n0 failed' } }
  const clock = engine(on, new Map(), extras)
  await start($)
  await clock.advance(1000)
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'test-1' } as Parameters<Engine['tool']['call']>[0])
  await $.agent.spawn(spawnOf({ description: 'Młot sprawdzać', prompt: 'Testy' }))
  extras.toolReply = { result: 'nope', text: 'nope', isError: true }
  await clock.advance(1000)
  await readForJournal($, 'mate-1', 'a1')
  extras.toolReply = { result: 'ok' }
  await readForJournal($, 'plain-1', 'unknown')
  const held = journalWrites.at(-1)
  expect(held).toEqual({ entries: [
    { id: 'test-1', who: 'Krux', agentId: null, tool: 'Bash', target: 'npm test', ok: true, summary: '3 przeszły', at: 1000 },
    { id: 'mate-1', who: 'Młot', agentId: 'a1', tool: 'Read', target: 'a.ts', ok: false, summary: '', at: 2000 },
    { id: 'plain-1', who: 'ork', agentId: 'unknown', tool: 'Read', target: 'a.ts', ok: true, summary: '', at: 2000 },
  ] })
  extras.toolDenied = true
  expect(await readForJournal($, 'denied')).toMatchObject({ deny: 'blocked' })
  expect(journalWrites.at(-1)).toEqual(held)
})

test('parallel tool completions preserve both journal entries and leave tool output untouched', async ($, on) => {
  const journalWrites: KruxJournal[] = []
  engine(on, new Map(), { journalWrites, toolReply: { result: { stdout: 'abc', exitCode: 0 }, text: 'abc' } })
  await start($)
  const results = await Promise.all([readForJournal($, 'parallel-1'), readForJournal($, 'parallel-2')])
  expect(results).toEqual([{ result: { stdout: 'abc', exitCode: 0 }, text: 'abc' }, { result: { stdout: 'abc', exitCode: 0 }, text: 'abc' }])
  const entries = journalWrites.at(-1)?.entries ?? []
  expect(entries.length).toBe(2)
  expect(new Set(entries.map(entry => entry.id))).toEqual(new Set(['parallel-1', 'parallel-2']))
})

test('the journal command opens a closed shaft and its buttons switch cards above the content', async ($, on) => {
  const saved = new Map<string, unknown>([['mode.sztolnia', false]])
  const opened: string[] = []
  engine(on, saved, { opened })
  await start($)
  await readForJournal($)
  const result = await kruxCommand($, 'dziennik')
  expect(result.context).toBeUndefined()
  expect(opened).toEqual(['sztolnia'])
  expect(saved.get('mode.sztolnia')).toBe(true)
  expect(saved.has('mode.dziennik')).toBe(false)
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  expect(await ui.find({ key: 'shaft-tabs' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Krux' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'a.ts' })).toBeDefined()
  expect(await ui.find({ key: 'work' })).toBeUndefined()
  await ui.press({ key: 'shaft-tab-stan' })
  expect(await ui.find({ key: 'work' })).toBeDefined()
  await ui.press({ key: 'shaft-tab-dziennik' })
  expect(await ui.find({ key: 'work' })).toBeUndefined()
  await kruxCommand($, 'dziennik')
  expect(opened).toEqual(['sztolnia'])
})

test('journal and selected card start empty and are not reconstructed from resumed history', async ($, on) => {
  on('classic.SessionStart', () => ({}))
  engine(on, new Map(), { history: [{ role: 'assistant', text: 'ok', toolUses: [{ tool_use_id: 'old', tool: 'Read', input: { file_path: 'old.ts' }, text: 'ok' }] }] })
  await start($)
  const ui = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  expect(await ui.find({ key: 'work' })).toBeDefined()
  await $.prompt.submit({ text: 'dalej', origin: ORIGIN, wait: false })
  await kruxCommand($, 'dziennik')
  expect(await ui.find({ type: 'Text', text: 'Dziennik pusty' })).toBeDefined()
  await readForJournal($)
  expect(await ui.find({ type: 'Text', text: 'a.ts' })).toBeDefined()
  await $.classic.SessionStart({ source: 'resume' })
  expect(await ui.find({ key: 'work' })).toBeDefined()
  await kruxCommand($, 'dziennik')
  expect(await ui.find({ type: 'Text', text: 'Dziennik pusty' })).toBeDefined()
})

test('tool rows collapse only with chat on and a placed, shown journal card', async ($, on) => {
  const extras: Extras = {}
  engine(on, new Map(), extras)
  await start($)
  await readForJournal($)
  const tool = await $.ui.mount(TOOL_USE)
  await kruxCommand($, 'dziennik')
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await kruxCommand($, 'czat on')
  expect((await tool.findAll({ type: 'Text' })).map(node => node.text).join('')).toBe('⚒ Read a.ts✓')
  extras.paneWaits = true
  await tool.redraw()
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
  extras.paneWaits = false
  extras.paneHidden = true
  await tool.redraw()
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
  extras.paneHidden = false
  const pane = await $.ui.mount({ ...SHAFT_PANE, surface: 'terminal', props: SHAFT_PROPS })
  await pane.press({ key: 'shaft-tab-stan' })
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await pane.press({ key: 'shaft-tab-dziennik' })
  expect(await tool.find({ type: 'Text', text: '⚒ Read a.ts' })).toBeDefined()
  await kruxCommand($, 'sztolnia off')
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
})

test('pane visibility changes restore native tools without a manual redraw', async ($, on) => {
  const invalidations: string[] = []
  const extras: Extras = { invalidations }
  const clock = engine(on, new Map([['mode.czat', true]]), extras)
  await start($)
  await readForJournal($)
  await kruxCommand($, 'dziennik')
  const tool = await $.ui.mount(TOOL_USE)
  expect(await tool.find({ type: 'Text', text: '⚒ Read a.ts' })).toBeDefined()
  // Silnik zmienia isShown przy własnych zakładkach, bez zapisu stanu moda.
  extras.paneHidden = true
  await kruxCommand($, '')
  await clock.advance(250)
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
  extras.paneHidden = false
  await clock.advance(250)
  expect(await tool.find({ type: 'Text', text: '⚒ Read a.ts' })).toBeDefined()
  // Także utrata miejsca albo zamknięcie przez plugin nie zmieniają trybów.
  extras.paneWaits = true
  await clock.advance(250)
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
  extras.paneWaits = false
  await clock.advance(250)
  expect(await tool.find({ type: 'Text', text: '⚒ Read a.ts' })).toBeDefined()
  extras.paneClosed = true
  await clock.advance(250)
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
  expect(invalidations).toEqual(Array(5).fill('ui.render'))
  await clock.advance(1000)
  expect(invalidations.length).toBe(5)
  await kruxCommand($, 'czat off')
  extras.paneClosed = false
  await clock.advance(1000)
  expect(invalidations.length).toBe(5)
})

test('a reset discards a pending visibility read and a failed read can recover', async ($, on) => {
  on('classic.SessionStart', () => ({}))
  const invalidations: string[] = []
  const logs: string[] = []
  const extras: Extras = { invalidations, logs }
  const clock = engine(on, new Map([['mode.czat', true]]), extras)
  await start($)
  await readForJournal($)
  await kruxCommand($, 'dziennik')
  const tool = await $.ui.mount(TOOL_USE)
  let entered!: () => void
  let release!: () => void
  const reading = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  extras.beforePaneList = async () => { entered(); await gate }
  extras.paneHidden = true
  const pending = clock.advance(250)
  await reading
  await $.classic.SessionStart({ source: 'resume' })
  extras.beforePaneList = undefined
  release()
  await pending
  await clock.advance(1000)
  expect(invalidations.length).toBe(0)
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
  extras.paneHidden = false
  await readForJournal($)
  await kruxCommand($, 'dziennik')
  expect(await tool.find({ type: 'Text', text: '⚒ Read a.ts' })).toBeDefined()
  extras.paneHidden = true
  extras.beforePaneList = async () => { throw new Error('panes unavailable') }
  await clock.advance(250)
  expect(logs.some(line => /dziennik: widoczność/u.test(line))).toBe(true)
  extras.beforePaneList = undefined
  await clock.advance(1000)
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
  expect(invalidations).toEqual(['ui.render'])
})

test('chat reenabled during a pending inactive tick keeps watching pane visibility', async ($, on) => {
  let blocked = false
  let entered!: () => void
  let release!: () => void
  const reading = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  on('state.get', { plugin: 'krux-mod', key: 'shaftTab' }, async ($, e, next) => {
    if (blocked) { blocked = false; entered(); await gate }
    return next(e)
  })
  const extras: Extras = {}
  const clock = engine(on, new Map([['mode.czat', true]]), extras)
  await start($)
  await readForJournal($)
  await kruxCommand($, 'dziennik')
  const tool = await $.ui.mount(TOOL_USE)
  await kruxCommand($, 'czat off')
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
  blocked = true
  const pending = clock.advance(250)
  await reading
  await kruxCommand($, 'czat on')
  expect(await tool.find({ type: 'Text', text: '⚒ Read a.ts' })).toBeDefined()
  release()
  await pending
  extras.paneHidden = true
  await clock.advance(500)
  expect(await tool.find({ type: 'Text', text: 'engine' })).toBeDefined()
})

test('unmatched tool rows and partly matched groups stay native; matched groups and ctrl+o rows stay valid', async ($, on) => {
  engine(on, new Map([['mode.czat', true]]), { toolError: 'failed' })
  await start($)
  await readForJournal($)
  await kruxCommand($, 'dziennik')
  // Linię niesie wiersz narzędzia; osobny wynik tego id nie dubluje jej.
  const result = await $.ui.mount({ ...TOOL_USE, component: 'ToolResult', props: { tool_use_id: 'read-1', tool: 'Read', output: 'failed', isErrored: true } })
  expect(await result.find({ key: 'journal-result' })).toBeDefined()
  expect(await result.find({ type: 'Text', text: '✗' })).toBeUndefined()
  expect(await result.find({ type: 'Text', text: 'engine' })).toBeUndefined()
  const row = await $.ui.mount({ ...TOOL_USE, requestId: 'read-1-row' })
  expect(await row.find({ type: 'Text', text: '✗' })).toBeDefined()
  const unknown = await $.ui.mount({ ...TOOL_USE, requestId: 'unknown', props: { ...READ_ROW, tool_use_id: 'unknown' } })
  expect(await unknown.find({ type: 'Text', text: 'engine' })).toBeDefined()
  const group = await $.ui.mount({ ...TOOL_USE, component: 'ToolGroup', requestId: 'group', props: { calls: [READ_ROW, { ...READ_ROW, tool_use_id: 'unknown' }], isActive: false, isExpanded: false } })
  expect(await group.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await readForJournal($, 'unknown')
  for (const isExpanded of [false, true]) {
    await group.redraw({ calls: [READ_ROW, { ...READ_ROW, tool_use_id: 'unknown' }], isActive: false, isExpanded })
    expect(await group.find({ type: 'Text', text: '⚒ 2 narzędzia' })).toBeDefined()
    expect(await group.find({ type: 'Text', text: '✗' })).toBeDefined()
  }
  await group.redraw({ calls: [{ ...READ_ROW, tool_use_id: undefined }], isActive: false, isExpanded: true })
  expect(await group.find({ type: 'Text', text: 'engine' })).toBeDefined()
  // ctrl+o rysuje sam ToolUse bez ToolGroup.
  const full = await $.ui.mount({ ...TOOL_USE, requestId: 'fullscreen-row', viewport: { columns: 180, rows: 60, isFullscreen: true } })
  expect(await full.find({ type: 'Text', text: '⚒ Read a.ts' })).toBeDefined()
})
