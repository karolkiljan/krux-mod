import { expect, test } from 'claude-code/testing'

import { gauge, infinitiveHits, matesNamed, orcish, rewrites } from '../hooks/gauge'
import { EMPTY_LORE, lifeNote, recordAnswer, recordTool, replay } from '../hooks/lore'
import { REFRESH_TURNS, VOICE_ANCHOR, VOICE_SHORT, anchorFor } from '../hooks/voice'

const ORC =
  'Krux przeczytać `cache.ts`. Robak siedzieć w pętli. Funkcja zwracać po pierwszy obieg. ' +
  'Krux wyciągnąć `return` na zewnątrz. Testy 12, wszystko zielone. Młot zadowolony. Morra sprawdzi diff.'

const SMOOTH =
  'Przejrzałem plik cache.ts i znalazłem problem, który powodował, że funkcja zwracała wynik już po pierwszej iteracji pętli. ' +
  'Naprawiłem to, przenosząc instrukcję return poza pętlę, a następnie uruchomiłem testy, które teraz przechodzą poprawnie. ' +
  'Jeśli chcesz, możesz jeszcze sprawdzić diff, zanim zrobisz commit do repozytorium.'

test('an orkish answer passes the gauge', async () => {
  expect(gauge(ORC)).toEqual({ issues: [] })
  expect(infinitiveHits(ORC) > 0).toBe(true)
})

test('a smooth answer drifts, with the words to fix quoted', async () => {
  const verdict = gauge(SMOOTH)!
  const kinds = verdict.issues.map(issue => issue.kind)
  expect(kinds).toContain('second-person')
  expect(kinds).toContain('first-person')
  expect(kinds).toContain('no-infinitive')
  expect(verdict.issues.find(issue => issue.kind === 'first-person')!.examples).toContain('Przejrzałem')
})

test('nouns ending like a past tense are no first person', async () => {
  const answer =
    'Krux sprawdzić moduł. Za modułem stać artykuł z tytułem. Pod stołem leżeć węzeł z kołem. ' +
    'Robak siedzieć w pętli. Krux wyciągnąć `return` na zewnątrz. Hasz pliku zgadzać się. Testy 12 zielone.'
  expect(gauge(answer)).toEqual({ issues: [] })
  // Czasownik na „-ułem” zostaje pierwszą osobą.
  const verdict = gauge(answer.replace('Krux sprawdzić moduł.', 'Zepsułem moduł, potem czułem wstyd.'))!
  expect(verdict.issues.find(issue => issue.kind === 'first-person')?.examples).toEqual(['Zepsułem', 'czułem'])
})

test('a tense word between subject and infinitive still counts', async () => {
  expect(infinitiveHits('Krux już naprawić walidację. Krux zaraz puścić testy.')).toBe(2)
  expect(infinitiveHits('Najpierw test. Potem uruchomić testy.')).toBe(0)
})

test('a short answer or code says nothing about the voice', async () => {
  expect(gauge('Zrobione.')).toBe(null)
  expect(gauge('```ts\n' + 'const zrobiłem = masz + chcesz\n'.repeat(20) + '```')).toBe(null)
})

test('mates are named in prose, not in code', async () => {
  expect(matesNamed('Młot burczeć, a Grom śmiać się.')).toEqual(['Grom', 'Młot'])
  expect(matesNamed('Zobacz `Grom.ts`.')).toEqual([])
})

test('the anchor is full on the first turn, on refresh and after drift; short otherwise', async () => {
  expect(anchorFor(0, null)).toBe(VOICE_ANCHOR)
  expect(anchorFor(1, null)).toBe(VOICE_SHORT)
  expect(anchorFor(1, { issues: [] })).toBe(VOICE_SHORT)
  expect(anchorFor(REFRESH_TURNS, null)).toBe(VOICE_ANCHOR)
  const fixed = anchorFor(3, { issues: [{ kind: 'first-person', examples: ['zrobiłem'] }] })
  expect(fixed.startsWith(VOICE_ANCHOR)).toBe(true)
  expect(fixed).toContain('„zrobiłem”')
  expect(VOICE_SHORT.length < 250).toBe(true)
})

test('the chronicle counts tests, commits and edits from real tool calls', async () => {
  let lore = recordTool(EMPTY_LORE, 'Bash', { command: 'npm test' }, true)
  lore = recordTool(lore, 'Bash', { command: 'npm test' }, false)
  lore = recordTool(lore, 'Bash', { command: 'git commit -m x' }, false)
  lore = recordTool(lore, 'Edit', { file_path: 'a.ts' }, false)
  expect(lore).toEqual({ ...EMPTY_LORE, testRuns: 2, testFails: 1, commits: 1, edits: 1, last: 'commit' })
  expect(recordTool(EMPTY_LORE, 'Bash', { command: './run.sh' }, true).last).toBe('zawał')
})

test('the horde speaks every few turns, from a fact, never the same mate twice', async () => {
  const failing = recordTool(EMPTY_LORE, 'Bash', { command: 'npm test' }, true)
  expect(lifeNote(failing, 0)).toBe(null)
  const quiet = recordAnswer(recordAnswer(failing, []), [])
  const note = lifeNote(quiet, 0)!
  expect(note).toContain('mową o Młocie')
  expect(note).toContain('przebiegi testów w tej sesji: 1, padłe: 1')
  // Fakt z sesji to robota Kruxa: kumpel ją komentuje, nie dostaje jej na konto.
  expect(note).toContain('to robota Kruxa')
  const afterMlot = { ...quiet, lastMate: 'Młot' as const }
  const other = lifeNote(afterMlot, 0)!
  expect(other).not.toMatch(/mową o Młocie/u)
  expect(other).toContain('Nie Młota')
  expect(recordAnswer(quiet, ['Grom']).quietTurns).toBe(0)
  // Forma z kodu: kolejne wstawki nie powtarzają tej samej budowy.
  const forms = [2, 5, 8, 11].map(turn => /forma: ([^.]+)\./u.exec(lifeNote(quiet, turn)!)![1])
  expect(new Set(forms).size).toBe(4)
})

// O tym, czy wstawka pasuje, decyduje kod: model brał „jeśli pasuje” za rozkaz
// i stawiał kumpla na końcu w 31 z 32 tur benchu.
test('the note names the mate’s character and its place, and leaves no maybe', async () => {
  const quiet = { ...EMPTY_LORE, quietTurns: 2 }
  const note = lifeNote(quiet, 0)!
  expect(note).toContain('(węszy wszędzie i mówi półsłówkami)')
  expect(note).not.toContain('jeśli pasuje')
  const places = [2, 5].map(turn => /miejsce: ([^;]+);/u.exec(lifeNote(quiet, turn)!)![1])
  expect(new Set(places).size).toBe(2)
})

test('every trade gets its facts: builds for Grom, interface edits for Ochra, teardown for Lont', async () => {
  let lore = recordTool(EMPTY_LORE, 'Edit', { file_path: '/repo/src/Button.tsx' }, false)
  lore = recordTool(lore, 'Bash', { command: 'npx tsc --noEmit 2>&1 | head' }, false, 'src/a.ts(3,7): error TS2322: Type')
  lore = recordTool(lore, 'Bash', { command: 'rm -rf dist' }, false)
  expect(lore).toMatchObject({ edits: 1, uiEdits: 1, builds: 1, buildFails: 1, tears: 1, last: 'tear' })
  const quiet = { ...lore, quietTurns: 2 }
  const notes = [0, 1, 2].map(seed => lifeNote(quiet, seed)!)
  expect(notes.find(note => note.includes('mową o Gromie'))).toContain('przebiegi budowania, typów i lintu w tej sesji: 1, padłe: 1')
  expect(notes.find(note => note.includes('mową o Ochrze'))).toContain('edycje plików interfejsu w tej sesji: 1')
  expect(notes.find(note => note.includes('mową o Loncie'))).toContain('rozbiórki w tej sesji')
})

// Notka nie zgaduje rodzaju kumpla: Ochrę model bierze za „nią”.
test('the note after Ochra speaks of her without a gendered verb', async () => {
  const note = lifeNote({ ...EMPTY_LORE, quietTurns: 2, lastMate: 'Ochra' }, 0)!
  expect(note).toContain('Nie Ochrę: o Ochrze była ostatnia wstawka.')
  expect(note).not.toMatch(/(?<!\p{L})był(?!\p{L})|(?<!\p{L})mu(?!\p{L})/u)
})

// Kontrakt każe ostrzegać pełnymi zdaniami; miernik nie może za to ciąć następnej tury.
test('a warning before an irreversible move is not judged', async () => {
  const warning =
    'Stać. `git push --force` na `main` nadpisze historię na serwerze i skasuje commity, których Morra nie ma lokalnie. ' +
    'Inni, którzy pracują na tej gałęzi, stracą swoją bazę i będą musieli ją odtwarzać ręcznie. ' +
    'Bezpieczniej użyć `git push --force-with-lease`, który odmówi, jeśli na serwerze pojawiło się coś nowego.'
  expect(gauge(warning)).toBe(null)
  expect(gauge(warning.replaceAll('--force-with-lease', 'X').replaceAll('--force', 'X') + ' Droga odwrotu prowadzi przez reflog.')).toBe(null)
  expect(anchorFor(1, gauge(warning))).toBe(VOICE_SHORT)
})

test('text to paste stands in a quote and stays out of the gauge', async () => {
  const answer =
    'Krux już skończyć. Opis PR do wklejenia:\n\n' +
    '> Dodałem obsługę wygasania wpisów w cache na podstawie `ttl_seconds`. Zmieniłem metodę `invalidate`, która teraz usuwa klucz zamiast wpisywać `nil`.\n\n' +
    'Krux zaraz puścić testy. Robak siedzieć w pętli. Morra sprawdzi diff. Testy 12, wszystko zielone. Krux czekać na znak.'
  expect(gauge(answer)).toEqual({ issues: [] })
  expect(rewrites(answer).some(fix => fix.from.includes('Dodałem'))).toBe(false)
})

// „zawał” stoi w słowniku żywym: „zawałem” nie może wrócić w kotwicy jako „Krux zawać”.
test('nouns like „zawałem” or „hasłem” are no first person and never get rewritten', async () => {
  for (const noun of ['zawałem', 'działem', 'przedziałem', 'kapitałem', 'tyłem', 'hasłem', 'źródłem', 'pomysłem', 'światłem']) {
    expect([noun, orcish(noun, false)]).toEqual([noun, null])
  }
  expect(rewrites('Build skończyć się zawałem. Komenda padać.')).toEqual([])
  const answer =
    'Krux już sprawdzić logowanie. Użytkownik wchodzić hasłem. Źródłem robaka być stary token. ' +
    'Krux zaraz wykuć poprawkę w dziale auth. Robak siedzieć w pętli. Testy 12, wszystko zielone. Sesja trzymać się działem kont.'
  expect(gauge(answer)).toEqual({ issues: [] })
  // Czasowniki dalej idą do bezokolicznika albo zostają nietknięte.
  expect(orcish('działałem', false)).toBe('Krux działać')
  expect(orcish('powiedziałem', false)).toBe('Krux powiedzieć')
  expect(orcish('mogłem', false)).toBe(null)
})

test('present and future first person drift too, not only „-łem”', async () => {
  const answer =
    'Widzę 3 robaki w `app.rb`. Sprawdzam najpierw linię 7. Polecam wariant 1, bo najprostszy. ' +
    'Krux już przeczytać README. Robak siedzieć w pętli. Testy 12, wszystko zielone. Krux zaraz puścić test.'
  const verdict = gauge(answer)!
  expect(verdict.issues.find(issue => issue.kind === 'first-person')?.examples).toEqual(['Widzę', 'Sprawdzam', 'Polecam'])
})

test('nouns in „-ość” are no infinitive', async () => {
  expect(infinitiveHits('Sprawdziłem poprawność i wydajność.')).toBe(0)
  expect(infinitiveHits('Krux sprawdzić poprawność.')).toBe(1)
})

// Punkty listy bez kropki sklejały się w jedno długie zdanie i dawały fałszywe flagi.
test('a list item ends a sentence even without a period', async () => {
  const answer = [
    'Krux już przeczytać `app.rb`. Robaki dwa:',
    '- linia 7 sprawdzać prawdziwość wartości',
    '- linia 14 wpisywać nil zamiast kasować',
    'Konfiguracja też zła.',
    '- `ttl_seconds` martwy, kod go nie czytać',
    '- README mówić, że brak wygasania to zamiar',
    'Ruch duży.',
    '- puste klucze zalewać bazę przy każdym chybieniu',
    '- `@store` rosnąć bez limitu i bez eviction',
    'Krux polecać testy.',
  ].join('\n')
  expect(gauge(answer)).toEqual({ issues: [] })
  expect(gauge(answer.replaceAll('\n- ', ' i ').replaceAll('\n', ' '))!.issues.map(issue => issue.kind)).toContain('long-sentences')
})

test('replay counts prompts, not tool results, and gauges the last answer', async () => {
  const found = replay([
    { role: 'user', text: 'napraw', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'git commit -m x' } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{}] },
    { role: 'assistant', text: ORC, toolUses: [] },
    { role: 'user', text: 'dalej', toolUses: [] },
    { role: 'assistant', text: SMOOTH, toolUses: [] },
  ])
  expect(found.turns).toBe(2)
  expect(found.lore).toEqual({ ...EMPTY_LORE, commits: 1, last: 'commit', lastMate: 'Młot', quietTurns: 1 })
  expect(found.drift!.issues.length > 0).toBe(true)
  expect(replay([])).toEqual({ turns: 0, lore: EMPTY_LORE, drift: null })
})

test('replay reads a test run from its output, like the live chronicle', async () => {
  const found = replay([
    { role: 'user', text: 'testy', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'npm test | tail' }, text: '(fail) a\n 1 pass\n 1 fail' }] },
  ])
  expect(found.lore).toMatchObject({ testRuns: 1, testFails: 1, last: 'test-fail' })
})

test('personal forms turn into infinitives only where the rule is sure', async () => {
  expect(orcish('Przejrzałem', true)).toBe('Krux przejrzeć')
  expect(orcish('uruchomiłem', false)).toBe('Krux uruchomić')
  expect(orcish('chciałam', false)).toBe('Krux chcieć')
  expect(orcish('wziąłem', false)).toBe('Krux wziąć')
  expect(orcish('znalazłem', false)).toBe(null)
  expect(orcish('Polecam', true)).toBe('Krux polecać')
  expect(orcish('proponuję', true)).toBe('Krux proponować')
  expect(orcish('program', false)).toBe(null)
  expect(orcish('siedzi', false)).toBe('siedzieć')
})

test('ambiguous endings pick the right verb or stay untouched', async () => {
  expect(orcish('zmieniałem', false)).toBe('Krux zmieniać')
  expect(orcish('widziałem', false)).toBe('Krux widzieć')
  expect(orcish('myślałem', false)).toBe('Krux myśleć')
  expect(orcish('pracowałem', false)).toBe('Krux pracować')
  expect(orcish('kanałem', false)).toBe(null)
  expect(orcish('rozdziałem', false)).toBe(null)
  expect(orcish('Czuję', true)).toBe('Krux czuć')
  expect(orcish('Pokazuję', true)).toBe('Krux pokazywać')
  expect(orcish('Przeszukuję', true)).toBe('Krux przeszukiwać')
  expect(orcish('Dziękuję', true)).toBe('Krux dziękować')
  expect(orcish('Program', true)).toBe(null)
  expect(orcish('ma', false, 'szukać')).toBe(null)
  expect(orcish('ma', false, 'robaka')).toBe('mieć')
})

test('rewrites keep quotes and do not double the subject', async () => {
  expect(rewrites('Ja zmieniałem plik.')).toEqual([{ from: 'Ja zmieniałem plik.', to: 'Ja zmieniać plik.' }])
  expect(rewrites('Morra powie, co Niuch ma szukać.')).toEqual([])
  expect(rewrites('Wpisał „Zrobiłem to” w notce.')).toEqual([])
})

test('nouns ending in -sz are not second person', async () => {
  const text = 'Klawisz i mysz działają. Nasz moduł stoi. ' + 'Krux już naprawić robaka w pliku. '.repeat(6)
  expect(gauge(text)).toEqual({ issues: [] })
  expect(gauge('Robisz to źle. ' + 'Krux już naprawić robaka w pliku. '.repeat(6))!.issues[0]!.kind).toBe('second-person')
})

test('a drifted answer brings back its own sentences in orc speech', async () => {
  const found = rewrites('Robak siedzi w `app.rb:7`. Trafia w przyczynę.\n\n```ruby\nma = 1\n```')
  expect(found).toEqual([
    { from: 'Robak siedzi w `app.rb:7`.', to: 'Robak siedzieć w `app.rb:7`.' },
    { from: 'Trafia w przyczynę.', to: 'Trafiać w przyczynę.' },
  ])
  const verdict = gauge(SMOOTH)!
  expect(verdict.rewrites![0]!.to.startsWith('Krux przejrzeć plik cache.ts')).toBe(true)
  const anchor = anchorFor(1, verdict)
  expect(anchor).toContain('Własne zdania po orkowemu: „Przejrzałem plik')
  expect(gauge(ORC)).toEqual({ issues: [] })
})

test('inherited dictionary names are not verbs and cannot crash rewrites', () => {
  for (const word of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
    expect(orcish(word, false)).toBe(null)
    expect(rewrites(`Pole ${word} działa poprawnie.`)).toEqual([{ from: `Pole ${word} działa poprawnie.`, to: `Pole ${word} działać poprawnie.` }])
  }
  expect(gauge(SMOOTH + ' Pole constructor działa poprawnie.')).not.toBe(null)
})
