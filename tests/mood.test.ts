import { expect, test } from 'claude-code/testing'

import { EMPTY_LORE, recordTool } from '../hooks/lore'
import { CALM, EVENT_HOLD_MS, EVENT_SPEAKER, FADE_TOOLS, bubbleFor, eventLine, eventOf, mateIn, mateMoodAfter, mateStep, moodsAfter, moodsTick } from '../hooks/mood'
import { describeTool } from '../hooks/voice'

const failed = recordTool(EMPTY_LORE, 'Bash', { command: 'npm test' }, true)
const passed = recordTool(failed, 'Bash', { command: 'npm test' }, false)

test('only a new test run, commit or crash counts as an event', async () => {
  expect(eventOf(EMPTY_LORE, failed)).toBe('test-fail')
  expect(eventOf(failed, passed)).toBe('test-pass')
  expect(eventOf(EMPTY_LORE, recordTool(EMPTY_LORE, 'Bash', { command: 'git commit -m x' }, false))).toBe('commit')
  expect(eventOf(EMPTY_LORE, recordTool(EMPTY_LORE, 'Bash', { command: './run.sh' }, true))).toBe('zawał')
  const crashed = recordTool(EMPTY_LORE, 'Bash', { command: './run.sh' }, true)
  expect(eventOf(crashed, recordTool(crashed, 'Edit', { file_path: '/a.ts' }, false))).toBe(null)
  expect(eventOf(EMPTY_LORE, recordTool(EMPTY_LORE, 'Read', { file_path: '/a.ts' }, false))).toBe(null)
})

test('a build and a teardown are events too, each with a mate of its trade', async () => {
  const broken = recordTool(EMPTY_LORE, 'Bash', { command: 'npx tsc -p .' }, true)
  expect(eventOf(EMPTY_LORE, broken)).toBe('build-fail')
  // `| head` zjada kod wyjścia; błąd w wyjściu dalej znaczy, że stal pękła.
  expect(recordTool(EMPTY_LORE, 'Bash', { command: 'npx tsc -p . 2>&1 | head' }, false, 'a.ts(1,1): error TS2304: x').last).toBe('build-fail')
  expect(eventOf(broken, recordTool(broken, 'Bash', { command: 'npx tsc -p .' }, false))).toBe('build-pass')
  expect(eventOf(EMPTY_LORE, recordTool(EMPTY_LORE, 'Bash', { command: 'rm -rf dist' }, false))).toBe('tear')
  expect(recordTool(EMPTY_LORE, 'Bash', { command: 'rm -rf dist' }, true).last).toBe('zawał')
  expect(recordTool(EMPTY_LORE, 'Bash', { command: 'npx tsc -p .', run_in_background: true }, false)).toBe(EMPTY_LORE)
  expect([...new Set(Object.values(EVENT_SPEAKER))].sort()).toEqual(['Grom', 'Lont', 'Młot', 'Niuch', 'Piryt'])
})

test('a failed look around is no cave-in: grep without hits, git diff with exit 1', async () => {
  for (const command of ['grep -rn nope hooks', 'ls /nope', 'git diff --exit-code']) {
    expect(recordTool(EMPTY_LORE, 'Bash', { command }, true)).toBe(EMPTY_LORE)
  }
  expect(recordTool(EMPTY_LORE, 'Bash', { command: 'npm install' }, true).last).toBe('zawał')
  expect(recordTool(EMPTY_LORE, 'Bash', { command: 'git commit -m x' }, true).last).toBe('zawał')
})

test('a read in a command chain cannot hide a failed action', async () => {
  for (const command of [
    'pwd && ./scripts/migrate.sh',
    'cat in.json | python3 process.py',
    'git status && ./deploy.sh',
    'grep -l x src | xargs sed -i s/x/y/g',
  ]) {
    expect([command, recordTool(EMPTY_LORE, 'Bash', { command }, true).last]).toEqual([command, 'zawał'])
  }
  for (const command of ['pwd && git status', 'cat in.json | head -10', 'git diff --exit-code || git status', 'cd /repo && grep -rn foo .']) {
    expect(recordTool(EMPTY_LORE, 'Bash', { command }, true)).toBe(EMPTY_LORE)
  }
  expect(recordTool(EMPTY_LORE, 'Bash', { command: 'cd /repo && ./deploy.sh' }, true).last).toBe('zawał')
})

test('failures in the output turn a zero exit red, as the board reads it', async () => {
  const piped = recordTool(EMPTY_LORE, 'Bash', { command: 'npm test 2>&1 | tail -20' }, false, '(fail) auth > login\n 3 pass\n 1 fail')
  expect(piped).toMatchObject({ testRuns: 1, testFails: 1, last: 'test-fail' })
  expect(recordTool(EMPTY_LORE, 'Bash', { command: 'npm test' }, false, ' 4 pass\n 0 fail').last).toBe('test-pass')
})

test('a test run sent to the background is not a run yet', async () => {
  expect(recordTool(EMPTY_LORE, 'Bash', { command: 'npm test', run_in_background: true }, false, 'running')).toBe(EMPTY_LORE)
})

test('moods follow the table in the spec', async () => {
  expect(moodsAfter('test-fail', failed).faces).toMatchObject({ Krux: 'grumpy', Młot: 'grumpy', Niuch: 'calm' })
  expect(moodsAfter('test-pass', passed).faces).toMatchObject({ Krux: 'proud', Młot: 'proud' })
  const firstGreen = recordTool(EMPTY_LORE, 'Bash', { command: 'npm test' }, false)
  expect(moodsAfter('test-pass', firstGreen).faces).toMatchObject({ Krux: 'calm', Młot: 'proud' })
  expect(moodsAfter('commit', EMPTY_LORE).faces).toMatchObject({ Krux: 'proud', Piryt: 'calm' })
  expect(moodsAfter('zawał', EMPTY_LORE).faces).toMatchObject({ Krux: 'grumpy', Niuch: 'grumpy' })
  expect(moodsAfter('build-fail', EMPTY_LORE).faces).toMatchObject({ Krux: 'grumpy', Grom: 'grumpy' })
  expect(moodsAfter('tear', EMPTY_LORE).faces).toMatchObject({ Krux: 'calm', Lont: 'proud' })
})

test('a dispatched mate’s own result moves only that mate’s face', async () => {
  const grumpy = moodsAfter('zawał', EMPTY_LORE)
  const after = mateMoodAfter(grumpy, 'Młot', 'test-fail')
  expect(after.faces).toMatchObject({ Krux: 'grumpy', Niuch: 'grumpy', Młot: 'grumpy' })
  expect(mateMoodAfter(CALM, 'Lont', 'tear').faces).toMatchObject({ Krux: 'calm', Lont: 'proud' })
  expect(after.fade).toBe(FADE_TOOLS)
})

test('a mood fades back to calm after eight tool calls without news', async () => {
  let moods = moodsAfter('test-fail', failed)
  // Liczba wprost: pętla po `FADE_TOOLS` przeszłaby razem ze zmianą progu.
  for (let i = 1; i < 8; i += 1) moods = moodsTick(moods)
  expect(moods.faces.Krux).toBe('grumpy')
  moods = moodsTick(moods)
  expect(moods).toEqual(CALM)
  expect(moodsTick(CALM)).toBe(CALM)
})

test('the mate is the first horde name in the task, declined or not', async () => {
  expect(mateIn('Niuch: zwiad', 'Jesteś Niuch')).toBe('Niuch')
  expect(mateIn('zwiad', 'Puść Młota, potem Niucha')).toBe('Młot')
  expect(mateIn('Ochra robi formularz', 'Grom')).toBe('Ochra')
  expect(mateIn('przeszukaj kod', 'znajdź wywołania endpointu')).toBe(null)
  expect(mateIn('Gromada plików', '')).toBe(null)
})

test('event lines carry the numbers from the lore', async () => {
  const twice = recordTool(failed, 'Bash', { command: 'npm test' }, true)
  const lines = [0, 1, 2].map(seed => eventLine('test-fail', twice, seed))
  expect(lines).toContain('Smród! 2 na 2 padać.')
  expect(eventLine('test-pass', recordTool(twice, 'Bash', { command: 'npm test' }, false), 0)).toContain('2')
})

test('a failed-test event names the supplied first failure in every variant', () => {
  const failures = ['auth > login', 'cache > expiry']
  const lines = [0, 1, 2].map(seed => eventLine('test-fail', failed, seed, failures[0]))
  expect(lines).toEqual([
    'Smród! 1 na 1 padać. Padły: auth > login.',
    'Czerwono. Robak gryźć. Padły: auth > login.',
    'Test padać. Kilof w dłoń! Padły: auth > login.',
  ])
})

test('a failed-test event without a name keeps the existing text', () => {
  const lines = ['Smród! 1 na 1 padać.', 'Czerwono. Robak gryźć.', 'Test padać. Kilof w dłoń!']
  for (const seed of [0, 1, 2]) {
    expect(eventLine('test-fail', failed, seed)).toBe(lines[seed])
    expect(eventLine('test-fail', failed, seed, undefined)).toBe(lines[seed])
    expect(eventLine('test-fail', failed, seed, '')).toBe(lines[seed])
  }
})

test('a failed-test name fits 24 characters including the ellipsis', () => {
  expect(eventLine('test-fail', failed, 0, 'abcdefghijklmnopqrstuvwx')).toBe('Smród! 1 na 1 padać. Padły: abcdefghijklmnopqrstuvwx.')
  expect(eventLine('test-fail', failed, 0, 'abcdefghijklmnopqrstuvwxy')).toBe('Smród! 1 na 1 padać. Padły: abcdefghijklmnopqrstuvw…')
  expect(eventLine('test-fail', failed, 0, 'abcdefghijklmnopqrstuvwxyz > login')).toBe('Smród! 1 na 1 padać. Padły: abcdefghijklmnopqrstuvw…')
  expect(eventLine('test-fail', failed, 0, 'login…')).toBe('Smród! 1 na 1 padać. Padły: login…')
})

test('failed-test names preserve Polish characters before and after truncation', () => {
  expect(eventLine('test-fail', failed, 1, 'zażółć gęślą jaźń')).toBe('Czerwono. Robak gryźć. Padły: zażółć gęślą jaźń.')
  expect(eventLine('test-fail', failed, 1, 'Zażółć gęślą jaźń — próba logowania')).toBe('Czerwono. Robak gryźć. Padły: Zażółć gęślą jaźń — pró…')
})

test('other events never present a supplied name as a failed test', () => {
  expect(eventLine('test-pass', passed, 0, 'auth > login')).toBe('Zielono! Smrodów po drodze: 1.')
  expect(eventLine('build-fail', { ...EMPTY_LORE, builds: 1, buildFails: 1 }, 0, 'auth > login')).toBe('Piec pluć! 1 na 1 padać.')
})

// Liczba przy bezokoliczniku albo w etykiecie nie potrzebuje odmiany:
// „po 1 smrodach” i „2 na 2 padło” były błędne.
test('event lines never decline a number wrong', async () => {
  for (const count of [1, 2, 3, 5, 12, 22]) {
    const lore = { ...EMPTY_LORE, testRuns: count + 1, testFails: count, builds: count + 1, buildFails: count, commits: count }
    for (const event of Object.keys(EVENT_SPEAKER) as (keyof typeof EVENT_SPEAKER)[]) {
      for (const seed of [0, 1, 2]) expect(eventLine(event, lore, seed)).not.toMatch(/padło|padła|padły|smrodach|razy/u)
    }
  }
})

test('a mate step names the tool and its target, never Krux', async () => {
  const text = mateStep(describeTool('Grep', { pattern: 'lore' }, 0))
  expect(text).toBe('węszyć lore')
  expect(text.startsWith('Krux')).toBe(false)
})

test('bubble order: held event, then mate step, then Krux at work, then rest', async () => {
  const base = { now: 10_000, working: true, activity: describeTool('Read', { file_path: '/repo/forge.ts' }, 0), moods: CALM, seed: 0 }
  const event = { kind: 'event' as const, key: 'a1', speaker: 'Młot' as const, text: 'Smród!', until: 10_000 + EVENT_HOLD_MS }
  expect(bubbleFor({ ...base, held: event })).toBe(event)
  const step = { kind: 'step' as const, key: 'a2', speaker: 'Niuch' as const, text: 'węszyć lore' }
  expect(bubbleFor({ ...base, held: step })).toBe(step)
  const expired = { ...event, until: 9_000 }
  const krux = bubbleFor({ ...base, held: expired })
  expect(krux?.speaker).toBe('Krux')
  expect(krux?.text).toContain('forge.ts')
  expect(bubbleFor({ ...base, working: false, activity: null, held: step })).toBe(step)
  const rest = bubbleFor({ ...base, working: false, activity: null, held: null })
  expect(rest).toMatchObject({ kind: 'thought', key: 'krux', speaker: 'Krux' })
})

test('no mate speaks at rest or at work unless they were dispatched or comment on the lore', async () => {
  for (let seed = 0; seed < 12; seed += 1) {
    const atWork = bubbleFor({ now: 0, held: null, working: true, activity: describeTool('Edit', { file_path: '/a.ts' }, seed), moods: CALM, seed })
    const atRest = bubbleFor({ now: 0, held: null, working: false, activity: null, moods: moodsAfter('commit', EMPTY_LORE), seed })
    for (const said of [atWork, atRest]) {
      expect(said?.speaker).toBe('Krux')
      expect(/Niuch|Grom|Piryt|Ochr|Młot|Lont/u.test(said?.text ?? '')).toBe(false)
    }
  }
})

test('the rest bubble never repeats the strike count the caption beside it shows', () => {
  for (const moods of [CALM, moodsAfter('commit', EMPTY_LORE), moodsAfter('test-fail', EMPTY_LORE)]) {
    for (let seed = 0; seed < 12; seed += 1) {
      expect(bubbleFor({ now: 0, held: null, working: false, activity: null, moods, seed })!.text).not.toMatch(/\d|uderz/u)
    }
  }
})
