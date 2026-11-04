import { expect, test } from 'claude-code/testing'

import {
  changesRepo,
  DEFAULT_MODES,
  HELP,
  FORMAT_HINT,
  LENGTH_HINT,
  MODES,
  RISK_HINT,
  VOICE_ANCHOR,
  VOICE_SHORT,
  applyToggle,
  describeTool,
  describeToolAhead,
  parseCommand,
  parsePhrase,
  modelNote,
  personaSections,
  formatHint,
  fromPerson,
  isDestructive,
  promptKind,
  restVerb,
  riskHint,
  asksRelease,
  shellKind,
  spinnerWord,
  statusLine,
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

test('/krux zapisz keeps the entire note, including case and Polish characters', () => {
  expect(parseCommand('zapisz Sprawdzić Żółć i API v2')).toEqual({ kind: 'save', text: 'Sprawdzić Żółć i API v2' })
  expect(parseCommand('  ZAPISZ\t Zażółć  GĘŚLĄ\njaźń  ')).toEqual({ kind: 'save', text: 'Zażółć  GĘŚLĄ\njaźń' })
  expect(parseCommand('zapisz raport flow OFF')).toEqual({ kind: 'save', text: 'raport flow OFF' })
})

test('/krux zapisz without note text returns help', () => {
  expect(parseCommand('zapisz')).toEqual({ kind: 'help', unknown: 'zapisz' })
  expect(parseCommand('  ZAPISZ \t\n ')).toEqual({ kind: 'help', unknown: 'ZAPISZ' })
})

test('/krux raport accepts only the standalone report command', () => {
  expect(parseCommand('raport')).toEqual({ kind: 'report' })
  expect(parseCommand('  RAPORT\t ')).toEqual({ kind: 'report' })
  expect(parseCommand('raport jutro')).toEqual({ kind: 'help', unknown: 'raport jutro' })
  expect(parseCommand('zapiszNowy tekst')).toEqual({ kind: 'help', unknown: 'zapiszNowy tekst' })
})

test('/krux help lists note saving and the daily report', () => {
  expect(HELP).toContain('/krux zapisz <tekst>')
  expect(HELP).toContain('/krux raport')
})

test('chat defaults off and commands toggle it without changing the voice sections', () => {
  expect(DEFAULT_MODES.czat).toBe(false)
  expect(MODES).toContain('czat')
  expect(parseCommand('czat')).toEqual({ kind: 'toggle', toggle: { mode: 'czat', on: 'flip' } })
  expect(parseCommand('CZAT on')).toEqual({ kind: 'toggle', toggle: { mode: 'czat', on: true } })
  expect(parseCommand('czat off')).toEqual({ kind: 'toggle', toggle: { mode: 'czat', on: false } })
  expect(modelNote('czat', true)).toContain('czat włączony')
  expect(modelNote('czat', false)).toContain('czat wyłączony')
  expect(statusLine(applyToggle(DEFAULT_MODES, { mode: 'czat', on: 'flip' }))).toContain('czat: on')
  expect(HELP).toContain('/krux czat [on|off]')
  expect(HELP).toContain('/krux dziennik')
})

test('the journal command selects a card instead of toggling a persistent mode', () => {
  expect(parseCommand('  DZIENNIK ')).toEqual({ kind: 'journal' })
  expect(parseCommand('dziennik off')).toEqual({ kind: 'help', unknown: 'dziennik off' })
})

test('a flip toggles one mode and leaves the others', async () => {
  const next = applyToggle(DEFAULT_MODES, { mode: 'konkret', on: 'flip' })
  expect(next).toEqual({ ...DEFAULT_MODES, konkret: true })
  expect(applyToggle(next, { mode: 'konkret', on: 'flip' })).toEqual(DEFAULT_MODES)
})

test('status distinguishes automatic konkret from a manual mode and keeps the other modes', () => {
  expect(statusLine(DEFAULT_MODES)).toBe('persona: on · konkret: off · flow: off · animacje: on · kowal: on · sztolnia: on · czat: off')
  expect(statusLine(DEFAULT_MODES, true)).toBe('persona: on · konkret: auto · flow: off · animacje: on · kowal: on · sztolnia: on · czat: off')
  for (const automatic of [false, true]) {
    expect(statusLine({ ...DEFAULT_MODES, konkret: true }, automatic)).toBe('persona: on · konkret: on · flow: off · animacje: on · kowal: on · sztolnia: on · czat: off')
  }
})

test('sections follow the plugin order: persona, konkret, flow', async () => {
  const texts = { persona: 'P', konkret: 'K', flow: 'F' }
  const all = personaSections({ persona: true, konkret: true, flow: true, animacje: false, kowal: false, sztolnia: false, czat: true }, texts)
  expect(all.map(section => section.id)).toEqual(['krux-mod:persona', 'krux-mod:konkret', 'krux-mod:flow'])
  expect(all.every(section => section.scope === 'session')).toBe(true)
  expect(personaSections({ persona: false, konkret: false, flow: false, animacje: true, kowal: true, sztolnia: false, czat: true }, texts)).toEqual([])
})

test('the anchor keeps the plugin budget of 1000 characters', async () => {
  expect(VOICE_ANCHOR.length <= 1000).toBe(true)
  expect(VOICE_ANCHOR).toContain('Morra trzecią osobą')
})

// Bez tej pary przebieg benchu zgubił bezokoliczniki (hooks/CLAUDE.md, niezmienniki).
test('both anchors keep the „Robak siedzieć”, not „Robak siedzi” pair', async () => {
  for (const anchor of [VOICE_ANCHOR, VOICE_SHORT]) {
    expect(anchor).toMatch(/„Robak siedzieć w pętli", nie „Robak siedzi/u)
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

// Bez rozpoznania przebieg nie trafia na tablicę, a czerwony wraca do kroniki jako zawał.
test('test runs behind wrappers, monorepo filters and other ecosystems are still test runs', () => {
  for (const command of [
    'timeout 300 npm test',
    'timeout -s KILL 120 pytest -x',
    'nice -n 10 npm test',
    'xvfb-run -a npm test',
    'npm t',
    'pnpm -r test',
    'pnpm --filter web test',
    'npm -w pkg test',
    'npm --workspace=pkg run test',
    'yarn workspace web test',
    './gradlew test',
    'mvn -q clean verify',
    './mvnw test',
    'vendor/bin/phpunit',
    './node_modules/.bin/jest',
    'php artisan test',
    'composer test',
    'tox -e py311',
    'tox',
    'nox -s tests',
    'cargo nextest run',
    'npx cypress run',
    'swift test',
    'flutter test',
    'bazel test //...',
    'ctest',
    'py.test',
    'make -C pkg test',
    'make tests',
  ]) {
    expect([command, workOf('Bash', { command })]).toEqual([command, 'test'])
  }
  for (const [command, kind] of [
    ['./gradlew build -x test', 'dig'],
    ['npm -w pkg run build', 'dig'],
    ['npm install test-utils', 'install'],
    ['npx cypress open', 'dig'],
    ['make -j4', 'build'],
    ['timeout 5 ./deploy.sh', 'dig'],
    // Sesja tox/nox od lintu, typów albo dokumentacji to nie próba testów.
    ['tox -e lint', 'dig'],
    ['nox -s typecheck', 'dig'],
    ['tox -e docs', 'dig'],
  ] as const) {
    expect([command, workOf('Bash', { command })]).toEqual([command, kind])
  }
})

test('a seed picks a synonym, so the same work does not repeat word for word', async () => {
  const verbs = new Set([0, 1, 2].map(seed => describeTool('Read', { file_path: 'a.ts' }, seed).verb))
  expect(verbs.size).toBe(3)
  expect(describeTool('Read', { file_path: 'a.ts' }, 7).verb).toBe(describeTool('Read', { file_path: 'a.ts' }, 7).verb)
})

test('at rest the caption matches how much work the turn took', async () => {
  expect(restVerb(0, 0)).toBe('Krux tylko gadać')
  expect(restVerb(3, 0)).toBe('Krux odpoczywać przy ogniu')
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

// Przy wyjaśnieniu miernik nie sądzi długości (hooks/CLAUDE.md): grzeczna forma i wtręt
// „ok,” na przedzie nie mogą zrobić z prośby o wyjaśnienie pogawędki ani roboty.
// Krótka rozmowa za wtrętem („Dzięki za pomoc!”, „Hej Krux”) to dalej pogawędka.
test('a polite or prefixed request to explain is still explain, an interjection with small talk stays chat', () => {
  for (const text of [
    'Możesz wyjaśnić, jak działa cache?',
    'możesz mi wytłumaczyć, czemu to działa',
    'Czy mógłbyś opowiedzieć, jak działa replay?',
    'ok, wyjaśnij jak działa cache',
    'super, wytłumacz ten regex',
  ]) {
    expect([text, promptKind(text)]).toEqual([text, 'explain'])
  }
  for (const text of ['ok, dzięki', 'dzięki!', 'ok', 'hej, siema', 'Dzięki za pomoc!', 'Hej Krux', 'Siema, Krux!', 'dzięki, działa', 'Super robota!', 'ok, rozumiem']) {
    expect([text, promptKind(text)]).toEqual([text, 'chat'])
  }
  expect(formatHint('Dzięki za pomoc!')).toBe(FORMAT_HINT.chat)
  for (const text of ['ok, dodaj test dla parsera', 'okej, usuń tabelę users', 'Możesz dodać kolumnę email?', 'ok, możesz dodać kolumnę?']) {
    expect([text, promptKind(text)]).toEqual([text, null])
  }
  expect(promptKind('ok, przejrzyj ten moduł')).toBe('review')
  expect(formatHint('ok, wyjaśnij jak działa cache')).toBe(FORMAT_HINT.explain)
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
    'git filter-branch --index-filter "git rm --cached secrets.txt" HEAD',
    'git filter-repo --path secrets.txt --invert-paths',
    'TRUNCATE users;',
    'truncate table users',
    'DELETE FROM users;',
    'DROP DATABASE app;',
    'drop schema public cascade',
    'ALTER TABLE users DROP COLUMN email;',
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
    'SELECT * FROM users;',
    'CREATE DATABASE app;',
    'ALTER TABLE users ADD COLUMN email text;',
    'git log --diff-filter=D',
    '/krux status',
  ]) {
    expect([text, riskHint(text)]).toEqual([text, null])
  }
  expect(isDestructive('```sh\ngit push --force-with-lease\n```')).toBe(true)
})

// Grzeczna prośba idzie bezokolicznikiem albo 1. os. l. mn., często bez polskich znaków.
test('a polite, plural or unaccented Polish request to destroy data gets the risk line too', () => {
  for (const text of [
    'możesz usunąć tabelę users?',
    'trzeba usunąć bazę',
    'chcę wyczyścić historię gita',
    'musisz wywalić tabelę users',
    'usuńmy bazę',
    'skasujmy tabelę users',
    'usuwamy tabelę users',
    'usun baze',
    'wyczysc historie',
    'skasuj galaz feature/x',
    'usuń ostatnie 3 commity',
    'skasuj commit',
    'możesz puścić migrację na produkcji?',
    // Przeczenie stoi przed innym słowem albo za przecinkiem: prośba zostaje prośbą.
    'nie, usuń bazę',
    'Nie ruszaj kodu, usuń tabelę logs',
  ]) {
    expect([text, riskHint(text)]).toEqual([text, RISK_HINT])
  }
  for (const text of [
    // Zakaz buduje się z formy niedokonanej („nie usuwaj”), więc „nie” przed czasownikiem to nie prośba.
    'Dodaj kolumnę email, ale nie usuwaj danych z tabeli users',
    'Nigdy nie usuwaj gałęzi main',
    'Nie usuwać bazy!',
    'Tylko nie kasuj historii!',
    'usuwanie literówek',
    'usun literowke',
    'wyczyść kod',
    'czyścimy kod w repo',
    'możesz usunąć ten plik?',
    'usunięcie martwego importu',
    'trzeba zresetować licznik tur',
    'dodaj usuwanie konta',
  ]) {
    expect([text, riskHint(text)]).toEqual([text, null])
  }
})

// Rozdzielone, długie i sklejone flagi znaczą to samo co jeden zlepek krótkich.
test('split, long and bundled flags are as irreversible as the bundled short ones', () => {
  for (const text of [
    'rm -r -f build',
    'rm -f -r build',
    'rm --recursive --force build',
    'rm -r build',
    'rm -R build',
    'git rm -r -f src',
    'git clean -d -f',
    'git clean --force',
    'git clean -d --force',
    'git push -uf origin main',
    'git push -fu origin main',
    'git branch -d -f stara',
    'git branch -df stara',
    'git branch --delete --force stara',
    'git branch --force --delete stara',
    'git checkout -f main',
    'git checkout --force main',
    'git switch -f main',
    'git switch --discard-changes main',
    'rm -rfv build',
    'rm -rI build',
    'rm -rf $(dirname x)',
    'sudo rm -rf /tmp/x',
    'git rm -rfq src',
  ]) {
    expect([text, isDestructive(text)]).toEqual([text, true])
  }
  for (const text of [
    'rm -i x',
    'rm -f x',
    'git rm -r --cached node_modules',
    'docker run --rm -v data:/x alpine',
    'docker rm -f web',
    // Prymitywy find z „r” w `$(…)`, plik o nazwie `-rf` za `--` i podkomenda `rm`
    // menedżera pakietów to nie rekurencyjne `rm`.
    "rm $(find build -name '*.o' -print)",
    'rm $(find . -type f -newer stamp)',
    'rm -- -rf',
    'pnpm rm -r lodash',
    'npm rm -r foo',
    'git clean -n',
    'git clean -nd',
    'git push -u origin feature/x',
    'git checkout -b feature/x',
    'git switch -c feature/x',
    'git branch -d scalona',
    'git branch -f main HEAD~1',
  ]) {
    expect([text, isDestructive(text)]).toEqual([text, false])
  }
})

// `riskHint` biegnie synchronicznie w `prompt.submit`: długi zlepek liter albo łańcuch
// `update … set` bez `=` nie może zawiesić hooka cofaniem wzorca.
// Wejścia, które przed poprawką kosztowały po 4,5 s i więcej, teraz po kilka ms; próg 2 s
// zostawia zapas na obciążoną maszynę, a cofanie kwadratowe albo gorsze dalej go przekracza.
test('long flag bundles and UPDATE chains are judged without catastrophic backtracking', { timeoutMs: 30_000 }, () => {
  for (const text of [
    'git branch -' + 'df'.repeat(2000) + '1',
    'git push -' + 'f'.repeat(20000) + '1',
    'git checkout -' + 'f'.repeat(20000) + '1',
    'update t u set a b c '.repeat(2000),
    'update t set a b c '.repeat(2000),
  ]) {
    const start = Date.now()
    expect(isDestructive(text)).toBe(false)
    expect([text.slice(0, 24), Date.now() - start < 2000]).toEqual([text.slice(0, 24), true])
  }
})

test('deleting cloud resources and Mongo collections is irreversible, listing them is not', () => {
  for (const text of [
    'gcloud storage rm -r gs://kubel',
    'gcloud storage buckets delete gs://kubel',
    'gcloud sql instances delete prod-db',
    'az group delete -n prod --yes',
    'az storage blob delete-batch -s dane',
    'aws s3api delete-bucket --bucket kubel',
    'aws rds delete-db-instance --db-instance-identifier prod',
    'aws ec2 terminate-instances --instance-ids i-1',
    'aws --profile prod ec2 terminate-instances --instance-ids i-1',
    'aws --region eu-west-1 --profile p s3api delete-object --bucket b --key k',
    'tofu destroy',
    'terragrunt run-all destroy',
    'cdk destroy --force',
    'eksctl delete cluster -n prod',
    'db.users.drop()',
    'db.users.deleteMany({})',
    'mongosh --eval "db.users.remove({})"',
  ]) {
    expect([text, isDestructive(text), riskHint(text)]).toEqual([text, true, RISK_HINT])
  }
  for (const text of [
    'gcloud storage ls gs://kubel',
    'az group list',
    'aws s3api list-buckets',
    'aws ec2 describe-instances',
    // Nazwa zasobu albo wartość opcji z „delete-” to nie operacja usuwania.
    'aws lambda invoke --function-name delete-old out.json',
    'aws ssm get-parameter --name delete-flag',
    'aws logs tail /aws/lambda/x --filter-pattern terminate-',
    'tofu plan',
    'terragrunt plan',
    'cdk diff',
    'eksctl get cluster',
    'db.users.find({})',
    'db.users.deleteOne({ _id: 1 })',
  ]) {
    expect([text, riskHint(text)]).toEqual([text, null])
  }
})

// Alias, `ONLY` i nawiasy przed `SET` nie zawężają zdania; `WHERE` w literale ani w komentarzu też.
test('an UPDATE with an alias or a quoted WHERE still overwrites the table', () => {
  for (const text of [
    'UPDATE users u SET active = false',
    'UPDATE users AS u SET active = false',
    'UPDATE ONLY users SET a = 1',
    'UPDATE [dbo].[users] SET a = 1',
    "UPDATE users SET note = 'where';",
    'UPDATE users SET a = 1 -- WHERE id = 1',
    'ALTER TABLE users DROP email',
  ]) {
    expect([text, isDestructive(text)]).toEqual([text, true])
  }
  for (const text of [
    'UPDATE users u SET a = 1 WHERE u.id = 2',
    "UPDATE users SET note = 'x' WHERE id = 2",
    "UPDATE users SET name = 'O''Brien' WHERE id = 2",
    'ALTER TABLE users DROP CONSTRAINT users_email_key',
    'update package.json and set version = 2',
  ]) {
    expect([text, isDestructive(text)]).toEqual([text, false])
  }
})

test('irreversible commands beyond git and SQL get the risk line, their safe neighbours do not', async () => {
  for (const text of [
    'git push --mirror origin',
    'git push origin --delete feature/x',
    'git push origin :feature/x',
    'git push origin +main',
    'git push -d origin feature/x',
    'git checkout -- .',
    'git checkout HEAD -- src/app.ts',
    'git checkout .',
    'git -C repo checkout -- .',
    'git -C repo restore .',
    'git restore .',
    'git restore --staged --worktree src/',
    'git stash clear',
    'git stash drop stash@{0}',
    'git reflog expire --expire=now --all',
    'git reflog delete HEAD@{1}',
    'git gc --prune=now',
    'find . -name "*.log" -delete',
    'find tmp -type f -exec rm {} +',
    'rsync -a --delete src/ dst/',
    'aws s3 sync ./out s3://site --delete',
    'shred -u secrets.txt',
    'shred notatki.txt',
    'mkfs.ext4 /dev/sdb1',
    'sformatuj /dev/sdb1 przez mkfs.ext4',
    'wipefs -a /dev/sdb',
    'dd if=/dev/zero of=/dev/sda bs=1M',
    'dropdb app_dev',
    'db.dropDatabase()',
    'redis-cli FLUSHALL',
    'redis-cli FLUSHDB',
    'npx prisma migrate reset',
    'npx prisma db push --force-reset',
    'supabase db reset',
    'bin/rails db:drop',
    'rails db:migrate:reset',
    'rails db:schema:load',
    'mix ecto.reset',
    'python manage.py flush',
    'UPDATE users SET role = 1;',
    'update users set active = false',
    'terraform destroy',
    'terraform -chdir=infra destroy',
    'terraform apply -auto-approve -destroy',
    'pulumi destroy --yes',
    'kubectl delete namespace prod',
    'kubectl -n prod delete pvc data',
    'helm uninstall api',
    'helm delete api',
    'helm -n prod uninstall api',
    'docker volume rm pgdata',
    'docker volume prune -f',
    'docker compose down -v',
    'docker-compose down -v',
    'docker compose -f prod.yml down -v',
    'docker system prune -a --volumes',
    'aws s3 rm s3://kubel/dane --recursive',
    'aws s3 rb s3://kubel --force',
    'gsutil -m rm -r gs://kubel',
    'gh repo delete karolkiljan/stary',
    'npm unpublish pakiet@1.0.0',
  ]) {
    expect([text, isDestructive(text), riskHint(text)]).toEqual([text, true, RISK_HINT])
  }
  for (const text of [
    'zresetuj bazę na stagingu',
    'usuń wolumen z bazą',
    'zniszcz infrastrukturę testową',
    'usuń namespace prod',
    'wyczyść stash',
  ]) {
    expect([text, riskHint(text)]).toEqual([text, RISK_HINT])
  }
  for (const text of [
    'git checkout main',
    'git checkout -b feature/x',
    'git restore --staged src/app.ts',
    'git restore -S src/app.ts',
    'git stash',
    'git stash pop',
    'git push -u origin feature/x',
    'git gc',
    'find . -name "*.ts"',
    'rsync -a src/ dst/',
    'aws s3 cp raport.pdf s3://kubel/',
    'aws s3 ls',
    'rails db:migrate',
    'UPDATE users SET role = 1 WHERE id = 7;',
    'update the set of tests',
    'terraform plan',
    'kubectl get pods',
    'kubectl apply -f deploy.yaml',
    'docker compose down',
    'docker volume ls',
    'npm publish',
    'restore the backup from yesterday',
    'zresetuj licznik tur',
    'dodaj test dla dysku',
    'git reflog',
    'shred --help',
    'mkfs --help',
    'mkfs.ext4 --help',
    'wipefs /dev/sdb',
    'wipefs -O UUID /dev/sdb',
    'dd if=/dev/sda of=dysk.img bs=1M',
    'createdb app_dev',
    'db.getCollectionNames()',
    'redis-cli INFO keyspace',
    'npx prisma db push',
    'supabase db push',
    'mix ecto.migrate',
    'python manage.py migrate',
    'pulumi preview',
    'helm upgrade --install api ./chart',
    'docker-compose down',
    'docker compose -f prod.yml down',
    'helm -n prod list',
    'git -C repo checkout main',
    'git -C repo restore --staged .',
    'docker system prune -f',
    'terraform -chdir=infra plan',
    'aws s3 mb s3://kubel',
    'gsutil ls gs://kubel',
    'gh release list',
  ]) {
    expect([text, riskHint(text)]).toEqual([text, null])
  }
})

// Łańcuch sądzimy komenda po komendzie: groźna komenda za bezpieczną nie ginie,
// a flaga jednej komendy nie przechodzi przez `&&`, `;` ani `|` na następną. W cudzysłowie
// i po `\` te znaki należą do argumentu (`-regex '(a|b)'`, `-exec … \;`).
test('each command of a shell chain is judged on its own', async () => {
  for (const text of [
    'git restore --staged . && git restore .',
    'git restore --staged a.ts; git restore b.ts',
    "find . -name '*.log' -exec gzip {} \\; -exec rm {} \\;",
    "find . -regextype posix-extended -regex '.*\\.(pyc|pyo)' -delete",
  ]) {
    expect([text, isDestructive(text)]).toEqual([text, true])
  }
  for (const text of [
    'git restore --staged a.ts && git add b.ts',
    'git push && docker run -d nginx',
    'docker compose down && docker run -v "$PWD":/app node',
    'kubectl get events | grep delete',
  ]) {
    expect([text, isDestructive(text)]).toEqual([text, false])
  }
})

// Sformatowany `UPDATE` zajmuje kilka wierszy: `WHERE` niżej należy do tego samego
// zdania SQL, a `;`, pusty wiersz, następne zdanie SQL albo zwykły wcięty kod je kończą.
test('a formatted UPDATE keeps the WHERE from its next lines', async () => {
  for (const text of [
    'UPDATE users\nSET role = 1\nWHERE id = 7;',
    '```sql\nUPDATE users\nSET active = false,\n    role = 2\nWHERE id = 7\n```',
  ]) {
    expect([text, isDestructive(text)]).toEqual([text, false])
  }
  for (const text of [
    'UPDATE users\nSET role = 1;',
    'UPDATE users SET role = 1;\nSELECT * FROM users WHERE id = 7;',
    'UPDATE users SET role = 1\n\nSELECT * FROM users WHERE id = 7',
    'UPDATE users SET role = 1\nSELECT * FROM users WHERE id = 7',
    '    cur.execute("UPDATE users SET active = false")\n    cur.execute("SELECT * FROM users WHERE id = 7")',
    '  UPDATE a SET x = 1 WHERE id = 2\n  UPDATE b SET y = 2',
  ]) {
    expect([text, isDestructive(text)]).toEqual([text, true])
  }
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

test('heredoc input is data, while real commands after its delimiter still choose the work', () => {
  const commands = [
    "cat <<'AUDIT_TEXT'\nnpm test\nAUDIT_TEXT",
    'cat <<"AUDIT_TEXT"\nnpm test\nAUDIT_TEXT',
    'cat <<\\AUDIT_TEXT\nnpm test\nAUDIT_TEXT',
    "cat <<AU'DIT'_TEXT\nnpm test\nAUDIT_TEXT",
    'cat <<-AUDIT_TEXT\n\tnpm test\n\tAUDIT_TEXT',
    "cat <<'END;TEXT'\nnpm test\nEND;TEXT",
    'cat <<ONE <<TWO\nnpm test\nONE\ngit commit -m fake\nTWO',
  ]
  for (const command of commands) {
    expect(shellKind(command)).toBe('look')
    expect(workOf('Bash', { command })).toBe('look')
    expect(describeTool('Bash', { command }).scene).toBe('torch')
    expect(shellKind(`${command}\nnpm test`)).toBe('test')
    expect(workOf('Bash', { command: `${command}\ngit commit -m real` })).toBe('seal')
  }
})

test('a heredoc marker inside a shell comment does not swallow real commands after the data', () => {
  const command = 'cat <<DATA # documentation mentions <<NOT_A_DOCUMENT\nnpm test\nDATA\nnpm test'
  expect(workOf('Bash', { command })).toBe('test')
})

test('arithmetic bit shifts are not heredocs and keep later test commands visible', () => {
  for (const command of [
    'workers=$((1 << 2))\nnpm test',
    '((workers = 1 << 2)); npm test',
    'workers=$(((1 + 2) << 1))\nnpm test',
    '((workers = (1 << 2)));\ncat <<DATA\ngit commit -m fake\nDATA\nnpm test',
  ]) {
    expect(workOf('Bash', { command })).toBe('test')
    expect(describeTool('Bash', { command }).scene).toBe('test')
  }
})

// Angielskie „publish” liczy się tylko całym słowem: identyfikator (`publishConfig`, `publisher.ts`) to nie wydanie.
test('a release question is recognised, performance talk is not', () => {
  for (const text of ['Wypuszczamy to dziś na produkcję?', 'Co sprawdzić przed wydaniem?', 'można deployować?', 'wdrażamy jutro', 'scalamy PR?', 'wdróż to na staging', 'zmerguj PR', 'zdeployuj', 'npm publish', 'npm publish.', 'zrób publish paczki', 'opublikuj paczkę']) {
    expect([text, asksRelease(text)]).toEqual([text, true])
  }
  for (const text of ['A co z wydajnością przy dużym ruchu?', 'napraw testy', 'Jak poszło?', 'popraw opis produktu', 'zmień kolor przycisku', 'Popraw publisher.ts', 'czemu publishConfig nie działa?', 'npm run publish-docs pada', 'Popraw publish.ts']) {
    expect([text, asksRelease(text)]).toEqual([text, false])
  }
})

test('git is read again only after a tool that may change the repo', () => {
  for (const [tool, input] of [
    ['Edit', { file_path: 'a.ts' }],
    ['NotebookEdit', { notebook_path: 'a.ipynb' }],
    ['Bash', { command: 'git commit -m x' }],
    ['Bash', { command: 'ls && ./deploy.sh' }],
    ['Bash', { command: 'git diff > patch.txt' }],
    ['Bash', { command: 'cat a >> b' }],
    ['Bash', { command: 'find . -name "*.tmp" -delete' }],
    ['Bash', { command: 'git branch -D old' }],
    ['Bash', { command: 'git branch feature' }],
  ] as const) expect(changesRepo(tool, input)).toBe(true)
  for (const [tool, input] of [
    ['Read', { file_path: 'a.ts' }],
    ['Grep', { pattern: 'x' }],
    ['Bash', { command: 'ls -la' }],
    ['Bash', { command: 'cat a.ts | head -5' }],
    ['Bash', { command: 'git status 2>&1' }],
    ['Bash', { command: 'git log --oneline -5 2>/dev/null' }],
    ['Bash', { command: 'rg foo > /dev/null' }],
    ['Bash', { command: 'git branch -a' }],
    ['Bash', { command: 'git branch' }],
    ['Bash', { command: 'cd /repo && grep -n x a.ts' }],
  ] as const) expect(changesRepo(tool, input)).toBe(false)
})
