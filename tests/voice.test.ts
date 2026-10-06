import { expect, test } from 'claude-code/testing'

import {
  DEFAULT_MODES,
  FORMAT_HINT,
  LENGTH_HINT,
  RISK_HINT,
  VOICE_ANCHOR,
  VOICE_SHORT,
  applyToggle,
  describeTool,
  describeToolAhead,
  parseCommand,
  parsePhrase,
  personaSections,
  formatHint,
  fromPerson,
  isDestructive,
  promptKind,
  restVerb,
  riskHint,
  shellKind,
  spinnerWord,
  stripFrontmatter,
  workOf,
} from '../hooks/voice'

test('human origins include relayed words and UI follow-ups, not agent or plugin reports', async () => {
  for (const kind of ['composer', 'bridge', 'sdk', 'slack-ping', 'channel', 'auto-continuation']) {
    expect([kind, fromPerson({ kind })]).toEqual([kind, true])
  }
  expect(fromPerson({ kind: 'plugin', asUser: true })).toBe(true)
  expect(fromPerson({ kind: 'plugin' })).toBe(false)
  for (const kind of ['task-notification', 'peer', 'scheduled-trigger', 'unclassified']) {
    expect([kind, fromPerson({ kind })]).toEqual([kind, false])
  }
  expect(fromPerson(undefined)).toBe(false)
})

test('exact phrases from the Krux plugin toggle the same modes', async () => {
  expect(parsePhrase('wyłącz krux')).toEqual({ mode: 'persona', on: false })
  expect(parsePhrase('  Włącz KONKRET ')).toEqual({ mode: 'konkret', on: true })
  expect(parsePhrase('wyłącz flow')).toEqual({ mode: 'flow', on: false })
  expect(parsePhrase('wyłącz krux proszę')).toBe(null)
  expect(parsePhrase('czy wyłącz krux działa?')).toBe(null)
})

test('/krux arguments map to toggles, status, help and the pane', async () => {
  expect(parseCommand('')).toEqual({ kind: 'open' })
  expect(parseCommand('status')).toEqual({ kind: 'status' })
  expect(parseCommand('off')).toEqual({ kind: 'toggle', toggle: { mode: 'persona', on: false } })
  expect(parseCommand('konkret')).toEqual({ kind: 'toggle', toggle: { mode: 'konkret', on: 'flip' } })
  expect(parseCommand('flow on')).toEqual({ kind: 'toggle', toggle: { mode: 'flow', on: true } })
  expect(parseCommand('anim off')).toEqual({ kind: 'toggle', toggle: { mode: 'animacje', on: false } })
  expect(parseCommand('kowal off')).toEqual({ kind: 'toggle', toggle: { mode: 'kowal', on: false } })
  expect(parseCommand('kopać rudę')).toEqual({ kind: 'help', unknown: 'kopać rudę' })
})

test('a flip toggles one mode and leaves the others', async () => {
  const next = applyToggle(DEFAULT_MODES, { mode: 'konkret', on: 'flip' })
  expect(next).toEqual({ ...DEFAULT_MODES, konkret: true })
  expect(applyToggle(next, { mode: 'konkret', on: 'flip' })).toEqual(DEFAULT_MODES)
})

test('sections follow the plugin order: persona, konkret, flow', async () => {
  const texts = { persona: 'P', konkret: 'K', flow: 'F' }
  const all = personaSections({ persona: true, konkret: true, flow: true, animacje: false, kowal: false, sztolnia: false }, texts)
  expect(all.map(section => section.id)).toEqual(['krux-mod:persona', 'krux-mod:konkret', 'krux-mod:flow'])
  expect(all.every(section => section.scope === 'session')).toBe(true)
  expect(personaSections({ persona: false, konkret: false, flow: false, animacje: true, kowal: true, sztolnia: false }, texts)).toEqual([])
})

test('the anchor keeps the plugin budget of 1000 characters', async () => {
  expect(VOICE_ANCHOR.length <= 1000).toBe(true)
  expect(VOICE_ANCHOR).toContain('Morra trzecią osobą')
})

// Bez tej pary przebieg benchu zgubił bezokoliczniki (CLAUDE.md, niezmienniki).
test('both anchors keep the „Robak siedzieć”, not „Robak siedzi” pair', async () => {
  for (const anchor of [VOICE_ANCHOR, VOICE_SHORT]) {
    expect(anchor).toMatch(/„Robak siedzieć w pętli[”"], nie „Robak siedzi/u)
  }
})

// Model nie wykona „co kilka odpowiedzi”: o hordzie decyduje `lifeNote`, kotwica milczy.
test('the anchor carries grammar only, the horde waits for its note', async () => {
  expect(VOICE_ANCHOR).not.toMatch(/hord|kumpel|co kilka/iu)
})

test('frontmatter is stripped, the body kept', async () => {
  expect(stripFrontmatter('---\nname: x\n---\n\n## Body\n')).toBe('## Body')
  expect(stripFrontmatter('## Body')).toBe('## Body')
})

test('the spinner word is stable for one seed and orkish', async () => {
  const first = spinnerWord('tool-use', 'Sauteing')
  expect(spinnerWord('tool-use', 'Sauteing')).toBe(first)
  expect(['Harować', 'Robić swoje', 'Pracować', 'Mozolić się']).toContain(first)
})

test('while a tool runs, the spinner word follows its scene', async () => {
  expect(['Kopać', 'Drążyć sztolnię', 'Kruszyć skałę', 'Rąbać chodnik']).toContain(spinnerWord('tool-use', 'Sauteing', 'pick'))
  expect(['Świecić w szczeliny', 'Węszyć', 'Iść tropem', 'Zaglądać w kąty']).toContain(spinnerWord('tool-use', 'Sauteing', 'torch'))
  // Przed wywołaniem narzędzie jeszcze nieznane: scena poprzedniego nic nie mówi.
  expect(spinnerWord('tool-input', 'Sauteing', 'pick')).toBe(spinnerWord('tool-input', 'Sauteing'))
})

test('shell commands are told apart by kind', async () => {
  expect(shellKind('npm test')).toBe('test')
  expect(shellKind('cd /repo && claude plugin test .')).toBe('test')
  expect(shellKind('CI=1 npx vitest run')).toBe('test')
  expect(shellKind('pnpm exec vitest run')).toBe('test')
  expect(shellKind('yarn jest --ci')).toBe('test')
  expect(shellKind('git status')).toBe('trail')
  expect(shellKind('git diff --check')).toBe('trail')
  expect(shellKind('git add . && git commit -m x')).toBe('seal')
  expect(shellKind('npm install')).toBe('install')
  expect(shellKind('npx -p typescript@5 tsc -p .')).toBe('build')
  expect(shellKind('tsc -p .')).toBe('build')
  expect(shellKind('rm -rf dist')).toBe('tear')
  expect(shellKind('ls -la | head')).toBe('look')
  expect(shellKind('./run.sh')).toBe('dig')
  // Próba stali także za `make`, menedżerem pakietów i opakowaniem na przedzie.
  expect(shellKind('make test')).toBe('test')
  expect(shellKind('make check')).toBe('test')
  expect(shellKind('make')).toBe('build')
  expect(shellKind('pnpm vitest run')).toBe('test')
  expect(shellKind('uv run pytest -q')).toBe('test')
  expect(shellKind('env CI=1 npm test')).toBe('test')
  expect(shellKind('git -C /repo commit -m x')).toBe('seal')
  expect(describeTool('Bash', { command: 'npm test' }).verb).toBe('Krux bić próbę stali')
  expect(describeTool('Bash', { command: './run.sh' }).verb).toBe('Krux walić kilofem')
})

test('a seed picks a synonym, so the same work does not repeat word for word', async () => {
  const verbs = new Set([0, 1, 2].map(seed => describeTool('Read', { file_path: 'a.ts' }, seed).verb))
  expect(verbs.size).toBe(3)
  expect(describeTool('Read', { file_path: 'a.ts' }, 7).verb).toBe(describeTool('Read', { file_path: 'a.ts' }, 7).verb)
})

test('at rest the caption matches how much work the turn took', async () => {
  expect(restVerb(0, 0)).toBe('Krux tylko gadać')
  expect(restVerb(3, 0)).toBe('Krux odpoczywać przy kowadle')
  expect(restVerb(40, 0)).toBe('Krux studzić żelazo')
  expect(restVerb(40, 5)).toBe(restVerb(40, 5))
})

test('tool activity is Krux at work, never an unsent mate', async () => {
  expect(describeTool('Read', { file_path: '/repo/src/app.ts' })).toEqual({ verb: 'Krux czytać runy', target: 'app.ts', scene: 'read' })
  expect(describeTool('Grep', { pattern: 'TODO' }).verb).toBe('Krux węszyć')
  expect(describeTool('Bash', { command: 'npm   test' }).target).toBe('npm test')
  expect(describeTool('mcp__github__get_issue', {}).target).toBe('github/get_issue')
  for (const tool of ['Read', 'Edit', 'Write', 'Grep', 'Bash', 'WebFetch', 'Other']) {
    expect(describeTool(tool, {}).verb.startsWith('Krux ')).toBe(true)
  }
})

test('each kind of work has its own scene', async () => {
  expect(describeTool('Bash', { command: 'ls' }).scene).toBe('torch')
  expect(describeTool('Grep', { pattern: 'x' }).scene).toBe('torch')
  expect(describeTool('Glob', { pattern: '*.ts' }).scene).toBe('scout')
  expect(describeTool('Read', { file_path: 'a.ts' }).scene).toBe('read')
  expect(describeTool('Skill', { skill: 'x' }).scene).toBe('read')
  expect(describeTool('TodoWrite', {}).scene).toBe('plan')
  expect(describeTool('ExitPlanMode', {}).scene).toBe('plan')
  expect(describeTool('WebFetch', { url: 'https://x' }).scene).toBe('raven')
  expect(describeTool('WebSearch', { query: 'x' }).scene).toBe('raven')
  expect(describeTool('AskUserQuestion', {}).scene).toBe('ask')
  expect(describeTool('Agent', { description: 'zwiad' }).scene).toBe('horn')
  expect(describeTool('Edit', {}).scene).toBe('hammer')
  expect(describeTool('mcp__github__get_issue', {}).scene).toBe('raven')
  for (const [command, scene] of [['npm test', 'test'], ['git commit -m done', 'seal'], ['npm run build', 'build'], ['rm old.txt', 'tear'], ['git status', 'torch'], ['echo hello', 'pick']]) {
    expect(describeTool('Bash', { command }).scene).toBe(scene)
  }
})

// Scena i podpis z tej samej decyzji co kronika: odczyt na przedzie nie ukrywa roboty.
test('a read at the head of a chain hides neither the work behind it nor its scene', async () => {
  expect(workOf('Bash', { command: 'ls && ./deploy.sh' })).toBe('dig')
  expect(describeTool('Bash', { command: 'ls && ./deploy.sh' })).toMatchObject({ verb: 'Krux walić kilofem', scene: 'pick' })
  expect(describeTool('Bash', { command: 'git status && git diff' }).scene).toBe('torch')
})

test('engine tools get scenes of their own instead of the default hammer', async () => {
  expect(describeTool('SubagentHandback', {})).toEqual({ verb: 'Krux oddawać meldunek', target: '', scene: 'read' })
  expect(describeTool('TaskCreate', {}).scene).toBe('plan')
  expect(describeTool('TaskUpdate', {}).scene).toBe('plan')
  expect(describeTool('TaskOutput', {}).scene).toBe('read')
  expect(describeTool('ReadNotifications', {}).scene).toBe('read')
  expect(describeTool('SendMessage', { summary: 'wznowienie zwiadu' })).toMatchObject({ target: 'wznowienie zwiadu', scene: 'raven' })
  expect(describeTool('Monitor', {}).scene).toBe('scout')
  expect(describeTool('Nieznane', {})).toMatchObject({ target: 'Nieznane', scene: 'hammer' })
  for (const tool of ['SubagentHandback', 'TaskCreate', 'TaskOutput', 'SendMessage', 'Monitor']) {
    expect([tool, describeTool(tool, {}).verb.startsWith('Krux ')]).toEqual([tool, true])
  }
})

// Kawałek strumienia zna nazwę narzędzia, ale nie komendę: przy `Bash` scena by zgadywała.
test('a tool chunk names the tool, but Bash waits for its command', async () => {
  expect(describeToolAhead('Bash')).toBe(null)
  expect(describeToolAhead('Read')).toEqual(describeTool('Read', {}))
  expect(describeToolAhead('Agent', 3)).toEqual(describeTool('Agent', {}, 3))
})

test('the kind of request is read from the prompt alone', async () => {
  expect(promptKind('przejrzyj ten moduł, czemu test pada')).toBe('review')
  expect(promptKind('build pada z TypeError w render.js')).toBe('debug')
  expect(promptKind('rozpisz plan migracji')).toBe('plan')
  expect(promptKind('Zerknij na README.md, czy jest tam coś o architekturze.')).toBe(null)
  expect(promptKind('Jak byś to poukładał na dziś?')).toBe('plan')
  expect(promptKind('jak działa B-tree')).toBe('explain')
  expect(promptKind('a to po co?')).toBe('explain')
  expect(promptKind('siema')).toBe('chat')
  expect(promptKind('dodaj kolumnę email do users')).toBe(null)
  // Słowo „plan” jako nazwa w robocie i prośba w formie pytania to nie plan ani wyjaśnienie.
  expect(promptKind('dodaj pole plan do tabeli users')).toBe(null)
  expect(promptKind('Możesz dodać kolumnę email do users?')).toBe(null)
  expect(promptKind('zrób plan na jutro')).toBe('plan')
  expect(promptKind('jaki masz plan?')).toBe('plan')
  expect(promptKind('/krux status')).toBe(null)
  for (const hint of [...Object.values(FORMAT_HINT), LENGTH_HINT, RISK_HINT]) expect(hint.length <= 120).toBe(true)
})

// Kotwica co turę pilnuje gramatyki; o ostrzeżeniu przypomina linia ryzyka,
// tylko gdy prośba kasuje dane albo historię.
test('a request to destroy data or history gets the risk line, ordinary work does not', async () => {
  for (const text of [
    'usuń tabelę users',
    'skasuj gałąź feature/x',
    'zrób force push na main',
    'git push origin main --force',
    'zrób git reset --hard HEAD~3',
    'rm -rf build',
    'DROP TABLE users;',
    'wyczyść bazę testową',
    'puść migrację na produkcji',
    'nadpisz historię gita',
    'git branch -D stara',
    'git clean -fdx',
  ]) {
    expect([text, riskHint(text)]).toEqual([text, RISK_HINT])
  }
  for (const text of [
    'usuń martwy import',
    'usuń ten plik',
    'wyczyść cache',
    'dodaj kolumnę email do users',
    'git push origin main',
    'napisz migrację dodającą kolumnę',
    'git branch -d scalona',
    'ustaw wrap truncate-end',
    'truncate the text to 40 chars',
    '/krux status',
  ]) {
    expect([text, riskHint(text)]).toEqual([text, null])
  }
  expect(isDestructive('```sh\ngit push --force-with-lease\n```')).toBe(true)
})

test('every prompt but a command gets a format line with a length budget', async () => {
  expect(formatHint('build pada z TypeError')).toBe(FORMAT_HINT.debug)
  expect(formatHint('dodaj kolumnę email do users')).toBe(LENGTH_HINT)
  expect(formatHint('/krux status')).toBe(null)
  expect(formatHint('  ')).toBe(null)
  expect(FORMAT_HINT.explain).toContain('do 100 słów')
})

test('shell separators inside quotes or escapes do not invent commands', () => {
  for (const command of ["printf 'x; npm test'", 'printf "x&& npm test"', "printf 'x|| npm test'", "printf 'x| npm test'", "printf 'x\n npm test'", 'printf x\\; npm test', 'printf "x\\\"; npm test"']) {
    expect(shellKind(command)).toBe('dig')
  }
  for (const command of ["printf 'x;' && npm test", 'printf "x;"; npm test', 'printf x\\\n; npm test', 'ls | npm test', 'ls || npm test', "printf 'x\\'; npm test"]) {
    expect(workOf('Bash', { command })).toBe('test')
  }
})
