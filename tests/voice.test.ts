import { expect, test } from 'claude-code/testing'

import {
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

test('irreversible commands beyond git and SQL get the risk line, their safe neighbours do not', async () => {
  for (const text of [
    'git push --mirror origin',
    'git push origin --delete feature/x',
    'git push origin :feature/x',
    'git push origin +main',
    'git checkout -- .',
    'git checkout HEAD -- src/app.ts',
    'git checkout .',
    'git restore .',
    'git restore --staged --worktree src/',
    'git stash clear',
    'git stash drop stash@{0}',
    'git reflog expire --expire=now --all',
    'git gc --prune=now',
    'find . -name "*.log" -delete',
    'find tmp -type f -exec rm {} +',
    'rsync -a --delete src/ dst/',
    'aws s3 sync ./out s3://site --delete',
    'shred -u secrets.txt',
    'mkfs.ext4 /dev/sdb1',
    'wipefs -a /dev/sdb',
    'dd if=/dev/zero of=/dev/sda bs=1M',
    'dropdb app_dev',
    'db.dropDatabase()',
    'redis-cli FLUSHALL',
    'npx prisma migrate reset',
    'npx prisma db push --force-reset',
    'supabase db reset',
    'bin/rails db:drop',
    'rails db:schema:load',
    'mix ecto.reset',
    'python manage.py flush',
    'UPDATE users SET role = 1;',
    'update users set active = false',
    'terraform destroy',
    'terraform apply -auto-approve -destroy',
    'pulumi destroy --yes',
    'kubectl delete namespace prod',
    'kubectl -n prod delete pvc data',
    'helm uninstall api',
    'docker volume rm pgdata',
    'docker volume prune -f',
    'docker compose down -v',
    'docker system prune -a --volumes',
    'aws s3 rm s3://kubel/dane --recursive',
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
  ]) {
    expect([text, riskHint(text)]).toEqual([text, null])
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

test('a release question is recognised, performance talk is not', () => {
  for (const text of ['Wypuszczamy to dziś na produkcję?', 'Co sprawdzić przed wydaniem?', 'można deployować?', 'wdrażamy jutro', 'scalamy PR?']) {
    expect([text, asksRelease(text)]).toEqual([text, true])
  }
  for (const text of ['A co z wydajnością przy dużym ruchu?', 'napraw testy', 'Jak poszło?']) {
    expect([text, asksRelease(text)]).toEqual([text, false])
  }
})
