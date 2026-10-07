import { expect, mock, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'
import type { AgentStatus, SessionUsage, TurnStepChunk } from 'claude-code'

import { ACTS, PALETTE, SPEAKER_COLOR } from '../hooks/sprites'
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

type Extras = { beforeStoreGet?: () => void; logs?: string[]; onPrompt?: () => void; toasts?: string[]; settings?: Record<string, unknown>; plugins?: string[]; toolError?: string; agentGate?: Promise<void>; history?: History; agents?: { id: string; status: AgentStatus }[]; opened?: string[]; closed?: string[]; usage?: SessionUsage; beforeAgentList?: () => Promise<void>; beforeStoreSet?: () => Promise<void>; paneWaits?: boolean; git?: { stdout: string }; tools?: string[] }

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
  on('settings.read', () => ({ value: extras.settings ?? {} }))
  on('command.list', () => ({
    value: (extras.plugins ?? []).map(plugin => ({ name: `${plugin}:${plugin}`, description: '', source: 'plugin' as const, plugin })),
  }))
  on('command.register', () => ({ value: { command: 'krux' } }))
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
  on('process.run', ($, e) => ({
    value: { ...(extras.git && e.argv[0] === 'git' ? { exitCode: 0, stdout: extras.git.stdout, stderr: '' } : { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }), isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('tool.register', ($, e) => {
    extras.tools?.push(String(e.name))
    return { value: { tool: `mcp__krux-mod__${String(e.name)}` } }
  })
  on('ui.panes', () => ({ value: [...panes].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: !extras.paneWaits })) }))
  on('session.start', () => ({ cwd: '/work' }))
  on('session.messages', () => ({ value: extras.history ?? [] }))
  on('session.usage', () => ({ value: extras.usage ?? { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  const clock = mock.clock(on)
  let spawned = 0
  on('agent.spawn', () => {
    spawned += 1
    return { model: 'claude-opus-5-5', agentId: `a${spawned}` }
  })
  on('agent.list', async () => {
    await extras.beforeAgentList?.()
    return { value: (extras.agents ?? []).map(agent => ({ ...agent, description: '', type: 'general-purpose' })) }
  })
  on('prompt.compose', () => ({ sections: BASE }))
  on('prompt.submit', ($, e) => { extras.onPrompt?.(); return { text: e.text, context: e.context } })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', async ($, e) => {
    if ((String(e.tool) === 'Agent' || String(e.tool) === 'Task') && extras.agentGate) await extras.agentGate
    return extras.toolError ? { isError: true as const, result: extras.toolError, text: extras.toolError } : { result: 'ok' }
  })
  on('ui.render', ($, e) => ({ type: 'Text', props: {}, children: [String((e.props as { word?: string }).word ?? 'engine')] }))
  return clock
}

// Harness dopełnia resztę pól spawnu i pętlę narzędzia; typy chcą pełnego wejścia silnika.
function spawnOf(input: { prompt: string; description: string; parentAgentId?: string; run_in_background?: boolean }) {
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
  expect(status.text).toBe('persona: on · konkret: off · flow: off · animacje: on · kowal: on · sztolnia: on')
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
  expect(await ui.find({ type: 'Text', text: 'uderzeń młota: 1' })).toBeDefined()
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
  for (const key of ['threads', 'git', 'plan', 'tests']) if ((await low.find({ key })) !== undefined) shown.push(key)
  expect(shown).toEqual(['threads', 'git', 'plan'])
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

// Kolory rekwizytów sceny, których nie ma w porównywanych scenach ani na samym orku.
function propColors(scene: StageScene, ...others: StageScene[]): Set<string> {
  const cells = (of: StageScene) =>
    new Set(ACTS[of].flatMap(act => [...act.intro, ...Array.from({ length: act.length }, (_, t) => act.loop(t, t))]).join('').split(''))
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
  let closed = 0
  on('turn.step', async function* (_$, e) {
    try {
      for (const chunk of chunks) yield chunk
      return { turnId: e.turnId, index: e.index, answer: 'Odpowiedź', toolUses: [], stopReason: 'end_turn', usage: null }
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
    expect(returned).toMatchObject({ answer: 'Odpowiedź', turnId: 't1', index: 0 })
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
  const line = await tiny.find({ type: 'Text', text: /^⚒ Krux czytać runy .*app\.ts.* · uderzeń młota: 1$/ })
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

test('idle, the smith stands still and sums up the last turn and the session', async ($, on) => {
  engine(on, new Map())
  await start($)
  for (const turnId of ['t1', 't2']) {
    await $.turn.start({ text: 'kop', turnId })
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    if (turnId === 't2') await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' })
  }
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, isWorking: false } })
  expect(await ui.find({ type: 'Text', text: 'Krux odpoczywać przy kowadle' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'ostatnia tura — uderzeń: 2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'sesja — uderzeń: 3' })).toBeDefined()
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

test('all six mode buttons sit in equal cells that wrap to the pane width', async ($, on) => {
  engine(on, new Map())
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const widths = []
  for (const mode of ['persona', 'konkret', 'flow', 'animacje', 'kowal', 'sztolnia']) {
    expect(await ui.find({ key: `toggle-${mode}` })).toBeDefined()
    widths.push((await ui.find({ type: 'Box', key: `cell-${mode}` }))?.props.width)
  }
  expect(new Set(widths).size).toBe(1)
  expect(widths[0]).toBeGreaterThan(0)
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

const REPLY = { plugin: 'krux-mod', component: 'AssistantMessage', requestId: 'm1' } as const

test('the nameplate opens a turn once, not again on the bullet after each tool group', async ($, on) => {
  engine(on, new Map())
  await start($)
  await $.turn.start({ text: 'kuj', turnId: 't1' })
  const plate = async (requestId: string) => {
    const ui = await $.ui.mount({ ...REPLY, requestId, surface: 'terminal', props: { text: 'Krux kuć.', isFirstOfReply: true } })
    const found = (await ui.find({ type: 'Text', text: '⚒ Krux' })) !== undefined
    await ui.unmount()
    return found
  }
  expect(await plate('m1')).toBe(true)
  expect(await plate('m2')).toBe(false)
  // Przerysowanie pierwszego bloku tabliczki nie gubi.
  expect(await plate('m1')).toBe(true)
  await $.turn.start({ text: 'dalej', turnId: 't2' })
  expect(await plate('m3')).toBe(true)
})

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
  expect(limit).toContain('5 h')
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
        { tool_use_id: 'a', tool: 'TodoWrite', input: { todos: TODOS.todos } },
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
    if (failCompact && e.key === 'modes') return { value: null }
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

test('the nameplate retains recent request ids and forgets older turns', async ($, on) => {
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
  }
  expect(await plate('bounded-39')).toBe(true)
  expect(await plate('bounded-38')).toBe(true)
  expect(await plate('bounded-0')).toBe(false)
  expect(await plate('new-block')).toBe(false)
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
