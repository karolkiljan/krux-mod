import type { KruxActivity, KruxDrift, KruxDriftKind, KruxMode, KruxModes, KruxScene } from '../types'

export const DEFAULT_MODES: KruxModes = { persona: true, konkret: false, flow: false, animacje: true, kowal: true, sztolnia: true, czat: false }

export const MODES: readonly KruxMode[] = ['persona', 'konkret', 'flow', 'animacje', 'kowal', 'sztolnia', 'czat']

export const VOICE_ANCHOR = `Krux pamiętać: Morra trzecią osobą — „Krux nie widzieć plik", nie „nie widzę pliku". Bezokolicznik zamiast formy osobowej: „Robak siedzieć w pętli", nie „Robak siedzi w pętli"; „Krux polecać wariant 2", nie „Polecam wariant 2". Czas osobnym słowem: „Krux już naprawić", „Krux zaraz puścić test", nie „naprawiłem". Bez „jest": „Plik pusty", nie „Plik jest pusty". Zdanie do 8 słów: „Build pad. Robak siedzieć w pętli.", nie „Build się wysypał, bo return jest w pętli". Łamać tylko ramę zdania: negacja, liczby, ścieżki i komunikaty błędów dosłownie — „3 testy nie przejść", nie „testy mało dobre". Słownik żywy: robak, smród, sztolnia, wykuć, zawał.`

// Krótka kotwica na tury, w których głos się trzyma. Pełna wraca na starcie,
// co REFRESH_TURNS tur i po każdej odpowiedzi, w której miernik złapał dryf.
export const VOICE_SHORT = `Krux pamiętać: Morra trzecią osobą; „Robak siedzieć w pętli”, nie „Robak siedzi”; „Krux już sprawdzić”, nie „sprawdziłem”; bez „jest”; zdania do 8 słów; negacja, liczby, ścieżki, błędy dosłownie.`

export const REFRESH_TURNS = 6

const DRIFT_FIX: Record<KruxDriftKind, (examples: string[]) => string> = {
  'second-person': examples => `Ostatnio padła druga osoba (${quote(examples)}). Do Morry trzecią osobą: „Morra sprawdzi”.`,
  'first-person': examples => `Ostatnio gładka pierwsza osoba (${quote(examples)}). Krux mówić bezokolicznikiem: „Krux zrobić”.`,
  'no-infinitive': () => 'Ostatnia odpowiedź bez bezokolicznika przy podmiocie. Wzór: „Build pad. Robak siedzieć w pętli.”',
  'long-sentences': () => 'Ostatnie zdania za długie. Ciąć do 8 słów.',
}

function quote(examples: string[]): string {
  return examples.map(example => `„${example}”`).join(', ')
}

// Kotwica na tę turę: krótka, gdy głos się trzyma; pełna z poprawką, gdy nie.
export function anchorFor(turn: number, drift: KruxDrift | null): string {
  const issues = drift?.issues ?? []
  if (issues.length > 0) {
    const fixes = issues.map(issue => DRIFT_FIX[issue.kind](issue.examples))
    const rewrites = (drift?.rewrites ?? []).map(({ from, to }) => `„${from}” → „${to}”`)
    if (rewrites.length > 0) fixes.push(`Własne zdania po orkowemu: ${rewrites.join('; ')}.`)
    return [VOICE_ANCHOR, ...fixes].join(' ')
  }
  if (turn % REFRESH_TURNS === 0) return VOICE_ANCHOR
  return VOICE_SHORT
}

export type PromptKind = 'review' | 'debug' | 'plan' | 'explain' | 'chat'

// Kolejność to priorytet: „przejrzyj, czemu test pada” to review, nie debug.
const PROMPT_KINDS: readonly [PromptKind, RegExp][] = [
  ['review', /(?<!\p{L})(?:review|przejrzyj|oceń|audyt\p{L}*|zrecenzuj|sprawdź kod)(?!\p{L})/iu],
  ['debug', /(?<!\p{L})(?:błąd|błęd\p{L}*|error|exception|crash\p{L}*|stack ?trace|nie działa|pada|padł\p{L}*|wywala|sypie|bug\p{L}*|robak\p{L}*|failing|failed)(?!\p{L})/iu],
  // Gołe „plan” bywa nazwą w robocie („pole plan”), więc tylko w prośbie o plan.
  ['plan', /(?<!\p{L})(?:^plan\p{L}*|(?:zrób|daj|przygotuj|napisz|ułóż|masz|jaki|twój)\s+plan\p{L}*|plan\p{L}*\s+(?:na|dla|działania|pracy)|zaplanuj|zaprojektuj|podejście|jak to zrobić|rozpisz|poukładaj|poukładał\p{L}*)(?!\p{L})/iu],
  ['explain', /^(?:co|jak|czym|czemu|dlaczego|po co|wyjaśnij|wytłumacz|opowiedz)(?!\p{L})|\?\s*$/iu],
]

// Prośba o robotę w formie pytania („Możesz dodać…?”) to nie prośba o wyjaśnienie.
const REQUEST = /^(?:czy\s+)?(?:możesz|mógłbyś|mogłabyś|dasz radę|zrób|dodaj|napraw|popraw|usuń|zmień|puść|odpal)(?!\p{L})/iu

const CHAT = /^(?:siema|cześć|hej|elo|dzięki|dziękuję|ok|okej|super|spoko)(?!\p{L})/iu

// Prośby, które pisze człowiek: Enter w terminalu, telefon przez most, host SDK,
// ping właściciela ze Slacka, kanał i kontynuacja akcji UI. Plugin może przekazać
// słowa człowieka z `asUser: true`. Raport subagenta, wiadomość innej sesji czy
// harmonogram nie dostają linii formatu ani notki o hordzie, a w transkrypcie tabliczki Morry.
const PERSON_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge', 'sdk', 'slack-ping', 'channel', 'auto-continuation'])

export function fromPerson(origin: { kind: string; asUser?: boolean } | undefined): boolean {
  return origin !== undefined && (PERSON_ORIGINS.has(origin.kind) || (origin.kind === 'plugin' && origin.asUser === true))
}

// Jedna linia formatu dla rodzaju prośby. Neutralna polszczyzna, bo to instrukcja.
// Limit słów tnie wyjście, które kosztuje 5× więcej niż wejście; Morra może poprosić o więcej.
export const FORMAT_HINT: Record<PromptKind, string> = {
  review: 'Format: znaleziska od najpoważniejszego, z `plik:linia` i skutkiem; do 200 słów, pełny audyt dłużej. Brak uwag — wprost.',
  debug: 'Format: przyczyna → dowód (`plik:linia` albo komunikat dosłownie) → poprawka, do 120 słów. Hipoteza to hipoteza.',
  plan: 'Format: kroki ciągiem, ryzyko przy kroku, do 120 słów, na końcu jedno pytanie o zgodę.',
  explain: 'Format: odpowiedź w pierwszym zdaniu, razem do 100 słów, chyba że Morra prosi o szczegóły.',
  chat: 'Format: 1–3 zdania.',
}

// Gdy rodzaju prośby nie widać: sam budżet długości.
export const LENGTH_HINT = 'Długość: do 150 słów; nagłówki i listy tylko, gdy niosą treść. Więcej, gdy Morra prosi.'

// Linia formatu na tę turę; `null` dla pustego tekstu i komend.
export function formatHint(text: string): string | null {
  const clean = text.trim()
  if (clean === '' || clean.startsWith('/')) return null
  const kind = promptKind(clean)
  return kind ? FORMAT_HINT[kind] : LENGTH_HINT
}

// Komendy, które kasują dane albo historię bez drogi powrotu poza backupem i reflogiem.
// Prośba z nimi dostaje linię o ruchu nieodwracalnym, a odpowiedzi z nimi miernik
// nie sądzi: ostrzeżenie idzie pełnymi zdaniami, tak każe kontrakt persony.
// Flagi szukamy najwyżej kilka słów za komendą, żeby nie skleić dwóch zdań prośby.
// Słowo okna (`ARG`) nie zawiera `&&`, `;` ani `|`: za nimi stoi następna komenda łańcucha.
const ARG = String.raw`[^\s;&|]+`
const DESTRUCTIVE = new RegExp(
  `(?<![\\p{L}\\d-])(?:${[
    // Git: historia zdalna i lokalna, schowki i zmiany w drzewie roboczym (te bez reflogu).
    String.raw`force[- ]push`,
    String.raw`push\s+(?:${ARG}\s+){0,4}?(?:-f|--force(?:-with-lease)?|--mirror|--delete|-d)(?![\p{L}\d-])`,
    String.raw`push\s+${ARG}\s+[:+][\p{L}\d]`,
    String.raw`reset\s+--hard`,
    String.raw`clean\s+-[a-z]*f`,
    String.raw`filter-(?:branch|repo)`,
    String.raw`git\s+checkout\s+(?:${ARG}\s+)?--\s+\S`,
    String.raw`git\s+checkout\s+\.(?:/\S*)?(?!\S)`,
    String.raw`stash\s+(?:clear|drop)(?![\p{L}\d-])`,
    String.raw`reflog\s+(?:expire|delete)`,
    String.raw`gc\s+(?:${ARG}\s+){0,3}?--prune=now`,
    // Pliki i dyski.
    String.raw`rm\s+-[a-z]*(?:r[a-z]*f|f[a-z]*r)`,
    String.raw`find\s+(?:${ARG}\s+){0,8}?(?:-delete|-exec\s+rm)(?![\p{L}\d-])`,
    String.raw`(?:rsync|sync)\s+(?:${ARG}\s+){0,6}?--delete(?![\p{L}\d])`,
    // `--help` i `--version` tylko piszą; każdy inny argument to plik albo dysk do zniszczenia.
    String.raw`shred\s+(?!--(?:help|version)(?!\S))\S`,
    String.raw`mkfs(?:\.[\p{L}\d]+)?\s+(?!--(?:help|version)(?!\S))\S`,
    String.raw`dd\s+(?:${ARG}\s+){0,4}?of=/dev/`,
    // SQL i narzędzia baz: reset schematu zabiera dane razem z nim.
    String.raw`drop\s+(?:table|database|schema|column)(?!\p{L})`,
    String.raw`truncate\s+table(?!\p{L})`,
    String.raw`delete\s+from(?!\p{L})`,
    String.raw`dropdb(?![\p{L}\d])`,
    String.raw`dropDatabase`,
    String.raw`flush(?:all|db)(?![\p{L}\d])`,
    String.raw`migrate\s+reset`,
    String.raw`--force-reset`,
    String.raw`db\s+reset`,
    String.raw`db:(?:drop|reset|purge|schema:load|migrate:reset)`,
    String.raw`ecto\.(?:drop|reset)`,
    String.raw`manage\.py\s+flush`,
    // Infrastruktura, kontenery i kubełki w chmurze.
    String.raw`terraform\s+(?:-${ARG}\s+){0,3}(?:destroy|apply\s+(?:${ARG}\s+){0,6}?-destroy)`,
    String.raw`pulumi\s+destroy`,
    String.raw`kubectl\s+(?:${ARG}\s+){0,4}?delete(?![\p{L}\d-])`,
    String.raw`helm\s+(?:uninstall|delete)`,
    String.raw`volume\s+(?:rm|prune)`,
    String.raw`(?:docker-)?compose\s+down\s+(?:${ARG}\s+){0,4}?(?:-v|--volumes)(?![\p{L}\d-])`,
    String.raw`system\s+prune\s+(?:${ARG}\s+){0,4}?--volumes`,
    String.raw`s3\s+(?:rm|rb)(?![\p{L}\d-])`,
    String.raw`gsutil\s+(?:-\S+\s+){0,2}rm(?![\p{L}\d-])`,
    String.raw`gh\s+(?:repo|release)\s+delete`,
    String.raw`unpublish(?![\p{L}\d])`,
  ].join('|')})`,
  'iu',
)

// Wielkość liter niesie sens: `branch -D` kasuje niescaloną gałąź, `-d` tylko scaloną;
// `TRUNCATE users` to SQL, „truncate the text” to proza; `wipefs -a` i `-o` kasują
// sygnatury dysku, a samo `wipefs` albo `-O` (kolumny) tylko je wypisuje.
const DESTRUCTIVE_CASED = new RegExp(
  String.raw`(?<![\p{L}\d-])(?:branch\s+-[a-zA-Z]*D|TRUNCATE\s|wipefs\s+(?:${ARG}\s+){0,3}?(?:-[a-zA-Z]*[ao][a-zA-Z]*|--all|--offset)(?![\p{L}\d-]))`,
  'u',
)

// `git restore` nadpisuje zmiany w drzewie roboczym, chyba że cofa tylko indeks (`--staged`).
// Argumenty kończą się na `&&`, `;` albo `|`: dalej stoi osobna komenda, sądzona osobno.
const RESTORE = new RegExp(String.raw`(?<![\p{L}\d-])git[ \t]+restore((?:[ \t]+${ARG})+)`, 'giu')

function restoresWorktree(text: string): boolean {
  for (const match of text.matchAll(RESTORE)) {
    const args = match[1]!.trim().split(/\s+/u)
    const staged = args.some(arg => arg === '--staged' || /^-[A-Za-z]*S/u.test(arg))
    const worktree = args.some(arg => arg === '--worktree' || /^-[A-Za-z]*W/u.test(arg))
    if (!staged || worktree) return true
  }
  return false
}

// `UPDATE … SET` bez `WHERE` nadpisuje całą tabelę; z `WHERE` to zwykła robota.
// Zdanie SQL ciągnie się przez następny wiersz, gdy ten jest wcięty albo zaczyna się od
// `WHERE`, `AND`, `OR`, `SET`, `FROM` lub `RETURNING`; `;` i każdy inny wiersz je kończą.
const SQL_TEXT = String.raw`(?:[^;\n]|\n(?=[ \t]|(?:where|and|or|set|from|returning)(?!\p{L})))`
const UPDATE_SET = new RegExp(String.raw`(?<![\p{L}\d-])update\s+[\p{L}\d_."\x60]+\s+set\s+${SQL_TEXT}*?=${SQL_TEXT}*`, 'giu')

function updatesAll(text: string): boolean {
  for (const match of text.matchAll(UPDATE_SET)) if (!/(?<!\p{L})where(?!\p{L})/iu.test(match[0])) return true
  return false
}

export function isDestructive(text: string): boolean {
  return DESTRUCTIVE.test(text) || DESTRUCTIVE_CASED.test(text) || restoresWorktree(text) || updatesAll(text)
}

// Prośba po polsku o skasowanie danych, historii, schowka albo infrastruktury i migracja
// na żywych danych. Plik, import czy martwy kod to nie dane: wracają z gita.
const RISK_WORDS = new RegExp(
  `(?<!\\p{L})(?:${[
    String.raw`(?:usuń|skasuj|wykasuj|wyczyść|wywal|zdropuj|dropnij|nadpisz|zresetuj|wyzeruj|zniszcz)\s+(?:\p{L}+\s+){0,2}?(?:baz\p{L}*|tabel\p{L}*|dane|danych|histori\p{L}*|gałąź|gałęz\p{L}*|branch\p{L}*|backup\p{L}*|kolumn\p{L}*|rekord\p{L}*|repo\p{L}*|wolumen\p{L}*|bucket\p{L}*|kubeł\p{L}*|kubł\p{L}*|klast\p{L}*|namespace\p{L}*|infrastruktur\p{L}*|środowisk\p{L}*|schowek|schowk\p{L}*|stash\p{L}*|dysk\p{L}*|partycj\p{L}*)`,
    String.raw`(?:puść|odpal|uruchom|wykonaj|przeprowadź|zrób)\s+(?:\p{L}+\s+){0,2}?migracj\p{L}*`,
    String.raw`zmigruj\p{L}*`,
  ].join('|')})(?!\\p{L})`,
  'iu',
)

// Prośba o decyzję wydania: tu nastrój nie może przechylać szali. W symulacji
// (docs/research/2026-10-09-mood-decisions-experiment.md) triumf zmienił
// „wstrzymać” na „wypuszczać” bez nowej informacji. „Wydajność” to nie wydanie.
const RELEASE_WORDS = /(?<!\p{L})(?:wypu[sś]\p{L}*|produkcj\p{L}*|deploy\p{L}*|wdr[oa]ż\p{L}*|release\p{L}*|wydani\p{L}*|wyda(?:ć|j(?!n)|m)\p{L}*|scal\p{L}*|merg\p{L}*)(?!\p{L})/iu

export function asksRelease(text: string): boolean {
  return RELEASE_WORDS.test(text.normalize('NFC'))
}

// Kontrakt persony wraca w chwili, gdy jest potrzebny: kotwica co turę pilnuje
// gramatyki, a ta linia przypomina, że ostrzeżenie idzie bez głosu.
export const RISK_HINT = 'Ruch nieodwracalny: skutek i drogę odwrotu podaj pełnymi zdaniami, bez głosu; głos wraca po ostrzeżeniu.'

// Linia ryzyka na tę turę albo `null`; komendy i pusty tekst jej nie dostają.
export function riskHint(text: string): string | null {
  const clean = text.normalize('NFC').trim()
  if (clean === '' || clean.startsWith('/')) return null
  return isDestructive(clean) || RISK_WORDS.test(clean) ? RISK_HINT : null
}

// Rodzaj prośby z samego tekstu, bez wywołania modelu; `null`, gdy nie wiadomo.
export function promptKind(text: string): PromptKind | null {
  const clean = text.normalize('NFC').trim()
  if (clean === '' || clean.startsWith('/')) return null
  for (const [kind, pattern] of PROMPT_KINDS) {
    if (kind === 'explain' && REQUEST.test(clean)) continue
    if (pattern.test(clean)) return kind
  }
  if (CHAT.test(clean) && clean.split(/\s+/u).length <= 6) return 'chat'
  return null
}

// Kompakcja: streszczenie neutralne, persona i tak wraca z promptu systemowego.
export const COMPACT_NOTE =
  'Streszczenie pisz neutralną polszczyzną, bez głosu Kruxa i bez wstawek o hordzie: persona wraca z promptu systemowego. ' +
  'Zachowaj dosłownie fakty, decyzje, ścieżki, liczby, komendy, stan testów i otwarte zadania. ' +
  'Z życia hordy zostaw najwyżej jedną linię: którzy kumple już się odzywali i o czym, żeby się nie powtarzać.'

export const NAMEPLATE = { krux: '⚒ Krux', morra: 'Morra' } as const

export type Toggle = { mode: KruxMode; on: boolean | 'flip' }

export type KruxCommand =
  | { kind: 'open' }
  | { kind: 'status' }
  | { kind: 'save'; text: string }
  | { kind: 'report' }
  | { kind: 'journal' }
  | { kind: 'help'; unknown: string }
  | { kind: 'toggle'; toggle: Toggle }

const PHRASE = /^(włącz|wyłącz) (krux|konkret|flow)$/iu

// Dokładne frazy z pluginu Krux: cała wiadomość, po trim, bez różnicy wielkości liter.
export function parsePhrase(text: string): Toggle | null {
  const match = PHRASE.exec(text.normalize('NFC').trim())
  if (!match) return null
  const verb = match[1]!.toLocaleLowerCase('pl')
  const noun = match[2]!.toLocaleLowerCase('pl')
  const mode: KruxMode = noun === 'krux' ? 'persona' : (noun as KruxMode)
  return { mode, on: verb === 'włącz' }
}

const ON_WORDS = new Set(['on', 'włącz', 'tak'])
const OFF_WORDS = new Set(['off', 'wyłącz', 'nie'])
const MODE_WORDS: Record<string, KruxMode> = {
  krux: 'persona',
  persona: 'persona',
  konkret: 'konkret',
  flow: 'flow',
  animacje: 'animacje',
  anim: 'animacje',
  kowal: 'kowal',
  sztolnia: 'sztolnia',
  czat: 'czat',
}

export function parseCommand(args: string): KruxCommand {
  const clean = args.trim()
  const words = clean.normalize('NFC').toLocaleLowerCase('pl').split(/\s+/u).filter(Boolean)
  if (words.length === 0) return { kind: 'open' }
  const [first, second] = words
  if (first === 'zapisz') {
    const text = clean.slice(first.length).trim()
    return text ? { kind: 'save', text } : { kind: 'help', unknown: clean }
  }
  if (first === 'raport' && words.length === 1) return { kind: 'report' }
  if (first === 'dziennik' && words.length === 1) return { kind: 'journal' }
  if (first === 'status') return { kind: 'status' }
  if (ON_WORDS.has(first!) && words.length === 1) return { kind: 'toggle', toggle: { mode: 'persona', on: true } }
  if (OFF_WORDS.has(first!) && words.length === 1) return { kind: 'toggle', toggle: { mode: 'persona', on: false } }
  const mode = MODE_WORDS[first!]
  if (mode !== undefined && words.length <= 2) {
    if (second === undefined) return { kind: 'toggle', toggle: { mode, on: 'flip' } }
    if (ON_WORDS.has(second)) return { kind: 'toggle', toggle: { mode, on: true } }
    if (OFF_WORDS.has(second)) return { kind: 'toggle', toggle: { mode, on: false } }
  }
  return { kind: 'help', unknown: args.trim() }
}

export function applyToggle(modes: KruxModes, toggle: Toggle): KruxModes {
  const on = toggle.on === 'flip' ? !modes[toggle.mode] : toggle.on
  return { ...modes, [toggle.mode]: on }
}

// Notka dla modelu po zmianie trybu: neutralna, bo instrukcja, nie mowa Kruxa.
export function modelNote(mode: KruxMode, on: boolean): string | null {
  switch (mode) {
    case 'persona':
      return on
        ? 'Tryb Krux włączony. Persona stoi w prompcie systemowym — od tej tury mów głosem Kruxa.'
        : 'Tryb Krux wyłączony. Odpowiadaj neutralnie, bez głosu orka.'
    case 'konkret':
      return on ? 'Konkret włączony. Kontrakt zakresu stoi w prompcie systemowym.' : 'Konkret wyłączony.'
    case 'flow':
      return on ? 'Flow włączony. Kontrakt rytmu stoi w prompcie systemowym.' : 'Flow wyłączony.'
    case 'czat':
      return on ? 'Tryb czat włączony. Wygląd rozmowy zmienia mod; treść odpowiedzi pozostaje bez zmian.' : 'Tryb czat wyłączony. Wraca dotychczasowy wygląd rozmowy.'
    case 'animacje':
    case 'kowal':
    case 'sztolnia':
      return null
  }
}

// Linia dla człowieka w transkrypcie. Po wyłączeniu persony mówi już neutralnie.
export function userLine(mode: KruxMode, on: boolean): string {
  switch (mode) {
    case 'persona':
      return on ? 'Krux wrócić do kuźni. Palenisko gorące.' : 'Persona wyłączona. Odpowiedzi będą neutralne.'
    case 'konkret':
      return on ? 'Konkret włączony: tylko to, o co Morra prosi.' : 'Konkret wyłączony.'
    case 'flow':
      return on ? 'Flow włączony: jeden ruch na raz, zgoda przed każdym.' : 'Flow wyłączony.'
    case 'animacje':
      return on ? 'Animacje włączone: kowal wraca nad prompt.' : 'Animacje wyłączone: kowal odkłada młot.'
    case 'kowal':
      return on ? 'Kowal zostaje nad promptem także w spoczynku.' : 'Kowal schodzi znad promptu, gdy Claude kończy robotę.'
    case 'sztolnia':
      return on ? 'Sztolnia otwarta: plan, testy, horda i kontekst z boku transkryptu.' : 'Sztolnia zamknięta.'
    case 'czat':
      return on ? 'Czat włączony: awatary i nagłówki rozmowy.' : 'Czat wyłączony.'
  }
}

export function statusLine(modes: KruxModes, autoKonkret = false): string {
  return MODES.map(mode => `${mode}: ${modes[mode] ? 'on' : mode === 'konkret' && autoKonkret ? 'auto' : 'off'}`).join(' · ')
}

export const HELP = [
  '/krux — panel kuźni (tryby, horda, kowal)',
  '/krux on | off — persona',
  '/krux konkret [on|off] — precyzja zakresu',
  '/krux flow [on|off] — jeden ruch na raz',
  '/krux animacje [on|off] — kowal nad promptem',
  '/krux kowal [on|off] — kowal także w spoczynku',
  '/krux sztolnia [on|off] — panel ze stanem roboty',
  '/krux czat [on|off] — rozmowa z awatarami',
  '/krux dziennik — karta dziennika narzędzi w Sztolni',
  '/krux zapisz <tekst> — dodaj notatkę do otwartych wątków',
  '/krux raport — raport dnia do wklejenia',
  '/krux status — stan trybów',
].join('\n')

// Nagłówek YAML zostaje w pliku dla czytelnika, model dostaje samo body.
export function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, '').trim()
}

export type Texts = { persona: string; konkret: string; flow: string }

export type Section = { id: string; text: string; scope: 'session' }

export function personaSections(modes: KruxModes, texts: Texts): Section[] {
  const sections: Section[] = []
  if (modes.persona && texts.persona) sections.push({ id: 'krux-mod:persona', text: texts.persona, scope: 'session' })
  if (modes.konkret && texts.konkret) sections.push({ id: 'krux-mod:konkret', text: texts.konkret, scope: 'session' })
  if (modes.flow && texts.flow) sections.push({ id: 'krux-mod:flow', text: texts.flow, scope: 'session' })
  return sections
}

export type SpinnerMode = 'requesting' | 'responding' | 'thinking' | 'tool-input' | 'tool-use'

const SPINNER_WORDS: Record<SpinnerMode, readonly string[]> = {
  requesting: ['Wołać gońca', 'Dmuchać w miech', 'Rozpalać palenisko', 'Sypać węgiel', 'Czekać na gońca', 'Nasłuchiwać w sztolni', 'Grzać żelazo'],
  thinking: ['Dumać', 'Drapać łeb', 'Ważyć rudę', 'Liczyć na palcach', 'Gapić się w ogień', 'Kreślić w popiele', 'Mielić myśl', 'Ciągnąć się za kieł'],
  // Narzędzie jeszcze nieznane, więc słowo nie może zgadywać, czym Krux zaraz walnie.
  'tool-input': ['Sięgać po narzędzie', 'Zakasywać rękawy', 'Szykować robotę', 'Brać się do roboty', 'Pluć w dłonie'],
  'tool-use': ['Harować', 'Robić swoje', 'Pracować', 'Mozolić się'],
  responding: ['Skrobać runy', 'Gadać', 'Ciosać zdanie', 'Ryć w tabliczce', 'Składać meldunek', 'Wycinać zbędne słowa', 'Kleić słowa'],
}

// Przy pracy narzędzia słowo idzie za sceną, żeby czytanie pliku nie było kopaniem.
const SCENE_WORDS: Record<KruxScene, readonly string[]> = {
  hammer: ['Kuć', 'Klepać', 'Hartować stal', 'Prostować pręt', 'Walić w kowadło'],
  pick: ['Kopać', 'Drążyć sztolnię', 'Kruszyć skałę', 'Rąbać chodnik'],
  test: ['Bić próbę stali', 'Stukać w ostrze', 'Słuchać kanarka', 'Wieszać ciężar'],
  seal: ['Pieczętować', 'Lać wosk', 'Odstawiać wózek', 'Ciągnąć windę'],
  build: ['Hartować', 'Sypać do pieca', 'Studzić stal', 'Dmuchać w miech'],
  tear: ['Rozbierać', 'Wywalać gruz', 'Podpalać lont', 'Burzyć mur'],
  torch: ['Świecić w szczeliny', 'Węszyć', 'Iść tropem', 'Zaglądać w kąty'],
  horn: ['Dąć w róg', 'Zbierać hordę', 'Rozsyłać zwiad'],
  read: ['Ślęczeć nad zwojem', 'Czytać runy', 'Wodzić palcem po runach', 'Rozwijać pergamin'],
  plan: ['Kreślić mapę', 'Rysować szlak', 'Mazać węglem', 'Stawiać krzyżyk'],
  scout: ['Siedzieć w krzaku', 'Wypatrywać', 'Rozglądać się', 'Czaić się'],
  raven: ['Słać kruka', 'Czekać na kruka', 'Wypatrywać gońca'],
  ask: ['Drapać się w łeb', 'Czekać na Morrę', 'Dumać'],
  think: ['Ważyć rudę', 'Liczyć na palcach', 'Gapić się w ogień', 'Dumać'],
  write: ['Ryć w tabliczce', 'Wycinać zbędne słowa', 'Skrobać runy', 'Ciosać zdanie'],
}

function hashOf(seed: string): number {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return hash
}

// Element listy wybrany seedem: ta sama liczba zawsze daje to samo słowo.
export function pick<T>(words: readonly T[], seed: number): T {
  return words[Math.abs(Math.trunc(seed)) % words.length]!
}

// Ten sam seed daje to samo słowo, więc spinner nie mruga przy każdym redraw.
export function spinnerWord(mode: SpinnerMode, seed: string, scene?: KruxScene): string {
  const words = mode === 'tool-use' && scene !== undefined ? SCENE_WORDS[scene] : SPINNER_WORDS[mode]
  return pick(words, hashOf(seed))
}

// Podpis kowala w spoczynku zależy od tego, ile było roboty w ostatniej turze.
export function restVerb(turnStrikes: number, seed: number): string {
  if (turnStrikes === 0) return pick(['Krux tylko gadać', 'Krux odłożyć młot, gadać'], seed)
  if (turnStrikes <= 20) return pick(['Krux odpoczywać przy kowadle', 'Krux ocierać pot', 'Krux siedzieć na pniaku'], seed)
  return pick(['Krux studzić żelazo', 'Krux prostować grzbiet', 'Krux pić z wiadra'], seed)
}

function basename(path: unknown): string {
  if (typeof path !== 'string' || path === '') return ''
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function clip(text: unknown, size: number): string {
  if (typeof text !== 'string') return ''
  const line = text.replace(/\s+/gu, ' ').trim()
  return line.length > size ? `${line.slice(0, size - 1)}…` : line
}

export type ShellKind = 'test' | 'seal' | 'install' | 'build' | 'trail' | 'tear' | 'look' | 'dig'

// Kolejność to priorytet: `cd repo && npm test` to próba stali, nie zaglądanie.
const SHELL_KINDS: readonly [ShellKind, RegExp][] = [
  ['test', /^(?:(?:npm|pnpm|yarn|bun) (?:run )?test|(?:(?:pnpm(?: exec)?|yarn|bun(?: run)?) )?(?:vitest|jest|pytest|rspec|mocha|playwright)\b|claude plugin test|(?:cargo|go|deno|mix|dotnet) test|make (?:test|check)\b|node (?:\S+ )*--test\b|(?:bundle exec )?(?:rspec|rake test|rails test)|python3? -m (?:pytest|unittest))/u],
  ['seal', /^git (?:commit|push|tag|merge|rebase|cherry-pick)\b|^gh pr (?:create|merge)\b/u],
  ['install', /^(?:(?:npm|pnpm|yarn|bun) (?:install|add|ci|i)\b|(?:yarn|bun)$|pip3? install|bundle(?: install)?$|gem install|brew install|cargo add|go get)/u],
  ['build', /^(?:(?:npm|pnpm|yarn|bun) (?:run )?(?:build|lint|typecheck|check)\b|tsc\b|eslint|prettier|biome|claude plugin validate|make\b|cargo (?:build|check|clippy)|go (?:build|vet)|rubocop)/u],
  ['tear', /^(?:rm|rmdir|git (?:rm|clean|reset|restore))\b/u],
  ['trail', /^git (?:status|diff|log|show|blame|branch|stash list|reflog)\b|^gh (?:pr|issue|run) (?:view|list|diff|checks)\b/u],
  ['look', /^(?:ls|cat|head|tail|less|find|fd|rg|grep|tree|wc|pwd|which|file|stat|du|sed -n)\b/u],
]

// Scena idzie za rodzajem komendy, tak jak podpis: pieczętowanie to nie kopanie.
// Odczyty i ślady gita świecą po ścianach, jak Grep.
const SHELL_SCENES: Record<ShellKind, KruxScene> = {
  test: 'test',
  seal: 'seal',
  install: 'pick',
  build: 'build',
  trail: 'torch',
  tear: 'tear',
  look: 'torch',
  dig: 'pick',
}

const SHELL_VERBS: Record<ShellKind, readonly string[]> = {
  test: ['Krux bić próbę stali', 'Krux stukać w ostrze', 'Krux sprawdzać, czy stal trzymać'],
  seal: ['Krux pieczętować robotę', 'Krux odstawiać wózek na górę'],
  install: ['Krux ładować wózek', 'Krux znosić rudę'],
  build: ['Krux hartować', 'Krux wrzucać do pieca'],
  trail: ['Krux czytać ślady w chodniku', 'Krux oglądać stare ślady'],
  tear: ['Krux rozbierać', 'Krux wywalać gruz'],
  look: ['Krux zaglądać w szczelinę', 'Krux świecić w kąt'],
  dig: ['Krux walić kilofem', 'Krux kruszyć skałę', 'Krux drążyć dalej'],
}

type HereDocument = { delimiter: string; tabs: boolean; end: number }

// Słowo delimitera po usunięciu cytowania i backslashy; jego treść nie jest
// komendą. `<<-` pozwala na tabulatory przed delimiterem i w danych.
function hereDocumentAt(command: string, offset: number): HereDocument | null {
  let i = offset + 2
  const tabs = command[i] === '-'
  if (tabs) i += 1
  while (command[i] === ' ' || command[i] === '\t') i += 1
  let delimiter = ''
  let quote = ''
  let word = false
  for (; i < command.length; i += 1) {
    const char = command[i]!
    if (char === '\\' && quote !== "'") {
      const next = command[i + 1]
      if (next === undefined) return null
      if (quote === '"' && !'$`"\\\n'.includes(next)) { delimiter += char; continue }
      if (next !== '\n') delimiter += next
      word = true
      i += 1
    } else if (quote) {
      if (char === quote) quote = ''
      else delimiter += char
    } else if (char === "'" || char === '"') {
      quote = char
      word = true
    } else if (/\s|[;&|<>()]/u.test(char)) break
    else { delimiter += char; word = true }
  }
  return word && quote === '' ? { delimiter, tabs, end: i } : null
}

// Kawałki łańcucha bez opakowań na przedzie (zmienne, `sudo`, `env`, `time`, `npx`,
// `uv run`) i bez katalogu gita (`git -C repo commit` to dalej commit).
function shellParts(command: unknown): string[] {
  if (typeof command !== 'string') return []
  // Separator w cytacie albo za backslashem należy do argumentu, nie łańcucha.
  const parts: string[] = []
  const documents: HereDocument[] = []
  let quote = ''
  let arithmetic = 0
  let start = 0
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i]!
    if (char === '\\' && quote !== "'") {
      i += 1
      continue
    }
    if (quote) {
      if (char === quote) quote = ''
      continue
    }
    if (char === "'" || char === '"') quote = char
    else if (arithmetic > 0) {
      if (char === '(') arithmetic += 1
      else if (char === ')') arithmetic -= 1
    }
    else if (char === '(' && command[i + 1] === '(') {
      // `((...))` i `$((...))` używają << do przesuwania bitów, nie do danych heredoc.
      arithmetic = 2
      i += 1
    }
    else if (char === '#' && (i === 0 || /[\s;&|()]/u.test(command[i - 1]!))) {
      parts.push(command.slice(start, i))
      const newline = command.indexOf('\n', i)
      if (newline < 0) { start = command.length; break }
      start = newline
      i = newline - 1
    }
    else if (char === '<' && command[i + 1] === '<' && command[i - 1] !== '<' && command[i + 2] !== '<') {
      const document = hereDocumentAt(command, i)
      if (document !== null) { documents.push(document); i = document.end - 1 }
    }
    else if (char === ';' || char === '|' || char === '\n' || (char === '&' && command[i + 1] === '&')) {
      parts.push(command.slice(start, i))
      if ((char === '&' || char === '|') && command[i + 1] === char) i += 1
      if (char === '\n' && documents.length > 0) {
        let after = i + 1
        for (const document of documents) {
          while (after < command.length) {
            const newline = command.indexOf('\n', after)
            const end = newline < 0 ? command.length : newline
            const line = command.slice(after, end)
            after = newline < 0 ? command.length : end + 1
            if ((document.tabs ? line.replace(/^\t+/u, '') : line) === document.delimiter) break
          }
        }
        documents.length = 0
        i = after - 1
      }
      start = i + 1
    }
  }
  parts.push(command.slice(start))
  return parts
    .map(part =>
      part
        .trim()
        .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+|(?:sudo|env|time)\s+|(?:npx|bunx|uvx)\s+(?:-p\s+\S+\s+)*|(?:uv|poetry|pipenv) run\s+)*/u, '')
        .replace(/^git\s+(?:-[Cc]\s+\S+\s+)+/u, 'git ')
        .replace(/\s+/gu, ' '),
    )
    // Zmiana katalogu to nie robota: `cd /repo && grep` dalej tylko patrzy.
    .filter(part => part !== '' && !/^(?:cd|pushd|popd)(?:\s|$)/u.test(part))
}

// Rodzaj kawałków łańcucha: rozpoznana robota ma priorytet nad resztą.
export function shellKind(command: unknown): ShellKind {
  const parts = shellParts(command)
  for (const [kind, pattern] of SHELL_KINDS) {
    if (parts.some(part => pattern.test(part))) return kind
  }
  return 'dig'
}

// Rodzaj roboty narzędzia, jedyne miejsce tej decyzji: kronika liczy z niego edycje,
// testy i zawały, a pas wie, kiedy Krux czeka na hordę. `null` — nic z tych rzeczy.
export type ToolWork = 'edit' | 'agent' | ShellKind

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

// `Task` to dawna nazwa `Agent`: stare sesje i historia mogą ją jeszcze nieść.
const AGENT_TOOLS = new Set(['Agent', 'Task'])

export function workOf(tool: string, input: Record<string, unknown>): ToolWork | null {
  if (EDIT_TOOLS.has(tool)) return 'edit'
  if (AGENT_TOOLS.has(tool)) return 'agent'
  if (tool === 'Bash') return bashKind(input.command)
  return null
}

// Rodzaj komendy powłoki dla `workOf` i dla sceny z podpisem: odczyt na początku
// łańcucha nie może ukryć późniejszej komendy, ani jej błędu w kronice, ani roboty
// na scenie (`ls && ./deploy.sh` to już kopanie, nie zaglądanie).
function bashKind(command: unknown): ShellKind {
  const kind = shellKind(command)
  if (kind !== 'look' && kind !== 'trail') return kind
  const onlyReads = shellParts(command).every(part => {
    const work = shellKind(part)
    return work === 'look' || work === 'trail'
  })
  return onlyReads ? kind : 'dig'
}

// Scena pieczęci obejmuje też push, tag i PR. Kronika liczy wyłącznie commit,
// a próbny przebieg nie zapisuje commita; tekst wiadomości może zawierać nazwę flagi.
// Najkrótsze jednoznaczne prefiksy: `--d` koliduje z date, `--s` ze signoff/status/squash,
// `--p` z patch/pathspec, a `--po` z post-rewrite. Formaty statusu też oznaczają próbę.
const COMMIT_PREVIEWS = [['dry-run', 2], ['short', 2], ['porcelain', 3], ['long', 1]] as const

export function isCommitCommand(command: unknown): boolean {
  return shellParts(command).some(part => {
    if (!/^git commit(?:\s|$)/u.test(part)) return false
    const words = part.match(/(?:[^\s"'\\]|\\[\s\S]|"(?:\\[\s\S]|[^"\\])*"|'[^']*')+/gu) ?? []
    const args = words.slice(2).map(word => word.replace(/^(["'])([\s\S]*)\1$/u, '$2'))
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i]!
      if (arg === '--') break
      // Wiadomość po `-m` także w złożonych krótkich flagach (`-am`, `-qm`).
      if (['--message', '--file'].includes(arg) || /^-[^-]*[mF]$/u.test(arg)) { i += 1; continue }
      if (arg.startsWith('--') && COMMIT_PREVIEWS.some(([name, minimum]) => arg.length - 2 >= minimum && name.startsWith(arg.slice(2)))) return false
    }
    return true
  })
}

// Co kowal robi przy danym narzędziu. Zawsze Krux, nigdy kumpel: kumpel dostaje
// robotę tylko wtedy, gdy ktoś go naprawdę wysłał (Agent). `seed` wybiera synonim,
// żeby ta sama robota nie brzmiała w kółko tak samo; 0 daje słowo podstawowe.
export function describeTool(tool: string, input: Record<string, unknown>, seed = 0): KruxActivity {
  switch (tool) {
    case 'Read':
      return { verb: pick(['Krux czytać runy', 'Krux ślęczeć nad zwojem', 'Krux wodzić palcem po runach'], seed), target: basename(input.file_path), scene: 'read' }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { verb: pick(['Krux kuć', 'Krux przekuwać', 'Krux klepać na kowadle'], seed), target: basename(input.file_path ?? input.notebook_path), scene: 'hammer' }
    case 'Write':
      return { verb: pick(['Krux wykuć nowe', 'Krux odlewać nowe', 'Krux ciosać od zera'], seed), target: basename(input.file_path), scene: 'hammer' }
    case 'Grep':
      return { verb: pick(['Krux węszyć', 'Krux szukać tropu', 'Krux świecić po ścianach'], seed), target: clip(input.pattern, 32), scene: 'torch' }
    case 'Glob':
      return { verb: pick(['Krux wypatrywać z krzaka', 'Krux szukać tropu', 'Krux rozglądać się'], seed), target: clip(input.pattern, 32), scene: 'scout' }
    case 'Bash': {
      const kind = bashKind(input.command)
      return { verb: pick(SHELL_VERBS[kind], seed), target: clip(input.command, 40), scene: SHELL_SCENES[kind] }
    }
    case 'WebFetch':
      return { verb: pick(['Krux słać gońca po zwój', 'Krux słać gońca'], seed), target: clip(input.url, 40), scene: 'raven' }
    case 'WebSearch':
      return { verb: pick(['Krux pytać po traktach', 'Krux słać gońca na zwiad'], seed), target: clip(input.query, 40), scene: 'raven' }
    case 'Agent':
    case 'Task':
      return { verb: pick(['Krux wołać hordę', 'Krux dąć w róg'], seed), target: clip(input.description, 40), scene: 'horn' }
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return { verb: 'Krux skrobać listę roboty', target: '', scene: 'plan' }
    // Kumpel oddaje raport tym narzędziem silnika: zwija zwój, zaraz go rzuci.
    case 'SubagentHandback':
      return { verb: 'Krux oddawać meldunek', target: '', scene: 'read' }
    case 'TaskOutput':
    case 'ReadNotifications':
      return { verb: 'Krux czytać wieści z tła', target: '', scene: 'read' }
    case 'SendMessage':
      return { verb: pick(['Krux słać wieść', 'Krux posyłać gońca'], seed), target: clip(input.summary, 40), scene: 'raven' }
    case 'Monitor':
      return { verb: 'Krux wypatrywać znaku', target: '', scene: 'scout' }
    case 'EnterPlanMode':
    case 'ExitPlanMode':
      return { verb: pick(['Krux kreślić mapę roboty', 'Krux rysować plan'], seed), target: '', scene: 'plan' }
    case 'Skill':
      return { verb: 'Krux sięgać po księgę', target: clip(input.skill, 40), scene: 'read' }
    case 'AskUserQuestion':
      return { verb: 'Krux pytać Morrę', target: '', scene: 'ask' }
    case 'ToolSearch':
      return { verb: 'Krux grzebać w skrzyni z narzędziami', target: clip(input.query, 40), scene: 'scout' }
    case 'mcp__krux-mod__watki':
      return { verb: 'Krux przybijać kartkę do tablicy', target: '', scene: 'plan' }
    default:
      // Narzędzie MCP gada z cudzą kuźnią: wieść niesie kruk, jak przy sieci.
      if (tool.startsWith('mcp__')) return { verb: pick(['Krux słać kruka', 'Krux słać gońca za góry'], seed), target: tool.split('__').slice(1).join('/'), scene: 'raven' }
      return { verb: pick(['Krux dłubać', 'Krux majstrować', 'Krux kręcić korbą'], seed), target: tool, scene: 'hammer' }
  }
}

// Kawałek `tool` ze strumienia zna tylko nazwę narzędzia. Scena powłoki zależy od
// komendy, więc tu nie zgaduje: `null` czeka na `tool.call` z argumentami.
export function describeToolAhead(tool: string, seed = 0): KruxActivity | null {
  return tool === 'Bash' ? null : describeTool(tool, {}, seed)
}

// Co Krux robi między narzędziami: myśli albo pisze odpowiedź. Fazę rozpoznaje
// strumień `turn.step`; `seed` wybiera synonim jak przy narzędziach.
export type Phase = 'think' | 'write'

export function describePhase(phase: Phase, seed = 0): KruxActivity {
  if (phase === 'think') return { verb: pick(['Krux dumać', 'Krux ważyć myśl', 'Krux mielić myśl'], seed), target: '', scene: 'think' }
  return { verb: pick(['Krux skrobać odpowiedź', 'Krux ryć meldunek', 'Krux ciosać zdania'], seed), target: '', scene: 'write' }
}
