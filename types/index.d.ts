export type KruxMode = 'persona' | 'konkret' | 'flow' | 'animacje' | 'kowal' | 'sztolnia'

export type KruxModes = Record<KruxMode, boolean>

// Scena kowala nad promptem: młot przy kuciu, kilof przy kopaniu w powłoce, próba stali przy
// testach, pieczęć przy commicie i pushu, piec przy budowaniu, rozbiórka przy `rm`, pochodnia
// przy Grep i odczytach w powłoce, krzak przy Glob, zwój przy czytaniu, mapa przy planie, kruk
// przy sieci i MCP, róg przy hordzie, znak zapytania przy pytaniu; dumanie, gdy model myśli,
// pisanie, gdy pisze odpowiedź.
export type KruxScene =
  | 'hammer'
  | 'pick'
  | 'test'
  | 'seal'
  | 'build'
  | 'tear'
  | 'torch'
  | 'horn'
  | 'read'
  | 'plan'
  | 'scout'
  | 'raven'
  | 'ask'
  | 'think'
  | 'write'

export type KruxActivity = {
  verb: string
  target: string
  scene: KruxScene
  startedAt?: number
}

// Kumple z hordy; ork bez imienia w opisie zadania to `null` w `KruxHordeMember.mate`.
export type KruxMate = 'Niuch' | 'Grom' | 'Piryt' | 'Ochra' | 'Młot' | 'Lont'

export type KruxMood = 'calm' | 'grumpy' | 'proud'

// Humor każdego orka; `fade` liczy wywołania narzędzi do powrotu spokoju.
export type KruxMoods = { faces: Record<'Krux' | KruxMate, KruxMood>; fade: number }

export type KruxSpeaker = 'Krux' | KruxMate | 'ork'

// Subagent na scenie, po `agentId` z `agent.spawn`.
export type KruxHordeMember = { agentId: string; mate: KruxMate | null; scene: KruxScene; target: string; startedAt?: number }

// Dymek nad orkiem `key` (`agentId` kumpla albo 'krux'). `step` to krok wysłanego
// kumpla, trwa, póki kumpel stoi na scenie; `event` to wtręt po zdarzeniu kroniki,
// do `until` w ms od epoki; `thought` to myśl Kruxa, liczona przy rysowaniu.
export type KruxBubble =
  | { kind: 'step'; key: string; speaker: KruxSpeaker; text: string }
  | { kind: 'thought'; key: string; speaker: KruxSpeaker; text: string }
  | { kind: 'event'; key: string; speaker: KruxSpeaker; text: string; until: number }

// Znak dla płótna, do `until` w ms od epoki: reakcja orka `key` na zdarzenie kroniki
// z jego roboty albo `handoff` — kumpel skończył i oddaje Kruxowi zwój, zanim zejdzie.
export type KruxCue = { key: string; kind: KruxEvent | 'handoff'; until: number }

// Scena poza Kruxem: wysłani kumple, trzymany dymek (krok albo wtręt, nigdy myśl) i znaki dla płótna.
export type KruxCrew = { members: KruxHordeMember[]; bubble: Exclude<KruxBubble, { kind: 'thought' }> | null; cues: KruxCue[] }

// Odstępstwo od głosu w ostatniej odpowiedzi, z cytatami do poprawki.
export type KruxDriftKind = 'second-person' | 'first-person' | 'no-infinitive' | 'long-sentences'

export type KruxDrift = {
  issues: { kind: KruxDriftKind; examples: string[] }[]
  // Zdania z odpowiedzi przepisane na bezokolicznik: model widzi własny tekst po orkowemu.
  rewrites?: { from: string; to: string }[]
}

export type KruxEvent = 'test-fail' | 'test-pass' | 'build-fail' | 'build-pass' | 'commit' | 'tear' | 'zawał'

// Kronika sesji: z niej horda bierze, o czym gadać. `builds` liczy budowanie,
// typy i lint, `tears` udane rozbiórki (`rm`, `git clean`, `reset`), `uiEdits`
// edycje plików interfejsu.
export type KruxLore = {
  testRuns: number
  testFails: number
  builds: number
  buildFails: number
  commits: number
  tears: number
  edits: number
  uiEdits: number
  last: KruxEvent | null
  lastMate: KruxMate | null
  quietTurns: number
}

// Pozycja planu z `TodoWrite` (bez id) albo z `TaskCreate` (id z wyniku narzędzia).
// `startedAt`: ms od epoki, gdy zadanie weszło w `in_progress`; z niego znak utknięcia.
export type KruxTask = { id: string | null; subject: string; status: 'pending' | 'in_progress' | 'completed'; startedAt?: number }

// Ostatni przebieg testów: komenda, wynik, liczby z wyjścia (gdy dało się je
// odczytać) i nazwy padających testów; `who` to Krux albo kumpel, który puścił.
export type KruxTestRun = {
  command: string
  ok: boolean
  passed: number | null
  failed: number | null
  failures: string[]
  who: 'Krux' | KruxMate | 'ork'
  // Kiedy przebieg się skończył, ms od epoki; brak w stanie starszej sesji.
  at?: number
}

// Tablica Sztolni: plan, ostatni przebieg testów i ostatnia edycja pliku (ms od epoki);
// edycja po przebiegu robi testy nieświeżymi.
export type KruxBoard = { tasks: KruxTask[]; test: KruxTestRun | null; editedAt?: number | null }

// Zapełnienie okna kontekstu, okna limitów i koszt z `$.session.usage()`.
export type KruxUsage = {
  percent: number | null
  tokens: number | null
  window: number
  limits: { kind: string; percentUsed: number; resetsAt: string | null }[]
  usd: number | null
}

// Jeden ork wysłany z pętli głównej: start i koniec w ms od epoki i ostatnie
// narzędzie z celem.
export type KruxRun = {
  agentId: string
  mate: KruxMate | null
  description: string
  startedAt: number
  endedAt: number | null
  last: string
}

// Apel hordy w Sztolni.
export type KruxMuster = { runs: KruxRun[] }

// Stan repo z `git status --porcelain=v2 --branch` i `git log`: gałąź (`(detached)` bez
// gałęzi), upstream, commity do wypchnięcia i ściągnięcia, pliki zmienione,
// nowe i w konflikcie.
export type KruxGit = {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  changed: number
  untracked: number
  conflicted: number
  // Pliki poza commitem (litera stanu i ścieżka) i ostatnie commity, od najnowszego;
  // `pushed` false dla tych, które czekają na wypchnięcie.
  files: { code: string; path: string }[]
  commits: { hash: string; subject: string; pushed: boolean }[]
  // Wynik `git diff --check`: true czysto, false błędy białych znaków, null bez odczytu.
  whitespace?: boolean | null
}

// Otwarty wątek Sztolni: czego Krux nie domknął (`todo`), co ryzykowne (`risk`)
// albo co czeka na decyzję Morry (`ask`). Model pisze je narzędziem moda.
export type KruxThreadKind = 'todo' | 'risk' | 'ask'
export type KruxThread = { id: number; kind: KruxThreadKind; text: string }
export type KruxThreads = { next: number; items: KruxThread[] }

declare module 'claude-code' {
  interface PluginState {
    'krux-mod': {
      modes: KruxModes
      activity: KruxActivity | null
      strikes: number
      sessionStrikes: number
      still: boolean
      turns: number
      drift: KruxDrift | null
      lore: KruxLore
      replayed: boolean
      mood: KruxMoods
      crew: KruxCrew
      waiting: number
      // Tablica Sztolni: plan i ostatni przebieg testów; odczyt zużycia sesji.
      board: KruxBoard
      usage: KruxUsage | null
      muster: KruxMuster
      // Zegar panelu: co sekundę dla apelu, przy progu i pełnych minutach dla utknięcia planu.
      musterNow: number
      // Stan repo (`null` poza repo albo gdy git nie odpowiada) i otwarte wątki.
      git: KruxGit | null
      threads: KruxThreads
      // `konkret` włączony przez mod, bo okno limitu planu przekroczyło 80%; tryb Morry w `$.store` zostaje.
      autoKonkret: boolean
      // Początek bieżącej tury i ostatni prompt człowieka, ms od epoki.
      turnAt: number | null
      seenAt: number | null
    }
  }
}
