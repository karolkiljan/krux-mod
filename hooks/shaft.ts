// Drzewo panelu Sztolni: otwarte wątki, stan repo, plan, ostatni przebieg
// testów, horda w biegu, kontekst i limity. Czysta funkcja: stan czyta `register.ts`, tu tylko elementy i dane.

import type { BoxProps, ElementConstructor, RenderElement, RenderNode, TextProps } from 'claude-code'

import type { KruxBoard, KruxGit, KruxThreads, KruxUsage } from '../types'
import { limitName, meter, planCount, planRows, readiness, resetIn, stuckMinutes, testLine, testsStale, tokens } from './board'
import { gitBusy, gitShort } from './git'
import type { MusterRow } from './muster'
import { PALETTE, SPEAKER_COLOR } from './sprites'
import { EMPTY_THREADS, THREAD_MARK } from './threads'

// Kolor Kruxa (iskra z palety) i skóry orka; dzielą je panele i pas.
export const KRUX_COLOR = SPEAKER_COLOR.Krux
export const ORC_COLOR = PALETTE.g!
// Stan na tablicy: zielone przeszło, czerwone padło albo blisko limitu.
const OK_COLOR = '#3fb950'
const ALARM_COLOR = '#e0322b'

// Plan najwyżej w 8 wierszach: długa lista nie spycha reszty tablicy.
const PLAN_ROWS = 8

export type ShaftElements = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps> }

export type ShaftData = {
  board: KruxBoard
  // Orkowie w biegu (`musterRows`); skończeni schodzą z tablicy.
  horde: readonly MusterRow[]
  usage: KruxUsage | null
  // Stan repo (`null` poza repo) i wątki, których Krux nie domknął.
  git: KruxGit | null
  threads: KruxThreads
  // Zegar sesji w ms: reset limitów i wiek zadania liczą się od niego.
  now: number
  columns: number
  // Wiersze panelu: „Kontekst” stoi na dole, a listy repo rosną z wysokością.
  rows: number
}

// Ile plików i commitów zmieści panel: wysoki pokazuje więcej, niski tylko czoło.
function repoRows(rows: number): { files: number; commits: number } {
  if (rows >= 36) return { files: 12, commits: 10 }
  if (rows >= 24) return { files: 8, commits: 6 }
  return { files: 4, commits: 3 }
}

export function shaftTree({ Box, Text }: ShaftElements, data: ShaftData): RenderElement {
  const columns = Math.max(8, data.columns)
  const section = (key: string, title: string, rows: RenderNode[], aside = '') =>
    Box({
      key,
      flexDirection: 'column',
      children: [
        Box({ flexDirection: 'row', columnGap: 1, children: [Text({ bold: true, children: [title] }), Text({ dimColor: true, children: [aside] })] }),
        ...rows,
      ],
    })
  const items = data.threads.items
  const threads =
    items.length === 0
      ? []
      : [
          section(
            'threads',
            'Wątki',
            items.map(item =>
              Box({
                key: `thread-${item.id}`,
                flexDirection: 'row',
                columnGap: 1,
                children: [
                  Text({ ...threadColor(item.kind), children: [THREAD_MARK[item.kind]] }),
                  Box({ flexGrow: 1, flexShrink: 1, children: [Text({ children: [item.text] })] }),
                ],
              }),
            ),
            String(items.length),
          ),
        ]
  const repo = data.git
  const commit = repo !== null && repo.changed + repo.untracked > 0 ? readiness(data.board, repo) : null
  const room = repoRows(data.rows)
  const files = repo === null ? [] : repo.files.slice(0, room.files)
  // „+N dalej” tylko pod listą: liczby repo stoją wyżej.
  const moreFiles = repo === null || files.length === 0 ? 0 : repo.changed + repo.untracked + repo.conflicted - files.length
  const git =
    repo === null
      ? []
      : [
          section('git', 'Git', [
            Text({ wrap: 'truncate-end', children: [`⎇ ${repo.branch}${repo.upstream === null ? ' · bez upstreamu' : ` → ${repo.upstream}`}`] }),
            ...gitRows(repo).map(row => Box({ key: row.key, children: [Text({ ...(row.color === undefined ? {} : { color: row.color }), children: [row.text] })] })),
            ...(commit === null
              ? []
              : [Box({ key: 'readiness', children: [Text({ ...(commit.ready ? { color: OK_COLOR } : { dimColor: true }), children: [commit.ready ? '✓ do commita' : `· do commita: ${commit.missing.join(', ')}`] })] })]),
            ...files.map((file, index) =>
              Box({
                key: `file-${index}`,
                flexDirection: 'row',
                columnGap: 1,
                children: [
                  Box({ flexShrink: 0, children: [Text({ ...(file.code === 'U' ? { color: ALARM_COLOR } : { dimColor: true }), children: [`  ${file.code}`] })] }),
                  Box({ flexGrow: 1, flexShrink: 1, children: [Text({ wrap: 'truncate-middle', children: [file.path] })] }),
                ],
              }),
            ),
            ...(moreFiles > 0 ? [Text({ dimColor: true, children: [`  +${moreFiles} dalej`] })] : []),
          ]),
        ]
  const shownCommits = repo === null ? [] : repo.commits.slice(0, room.commits)
  const commits =
    shownCommits.length === 0
      ? []
      : [
          section(
            'commits',
            'Commity',
            shownCommits.map((commit, index) =>
              Box({
                key: `commit-${index}`,
                flexDirection: 'row',
                columnGap: 1,
                children: [
                  // Znak i hash nie ustępują miejsca: ucina się temat, nie hash.
                  Box({ flexShrink: 0, children: [Text({ ...(commit.pushed ? { dimColor: true } : { color: KRUX_COLOR }), children: [commit.pushed ? '·' : '↑'] })] }),
                  Box({ flexShrink: 0, children: [Text({ dimColor: true, children: [commit.hash] })] }),
                  Box({ flexGrow: 1, flexShrink: 1, children: [Text({ wrap: 'truncate-end', ...(commit.pushed ? { dimColor: true } : {}), children: [commit.subject] })] }),
                ],
              }),
            ),
            repo !== null && repo.ahead > 0 ? `↑${repo.ahead} niewypchnięte` : '',
          ),
        ]
  const { tasks, test: run } = data.board
  const { shown, earlier, later } = planRows(tasks, PLAN_ROWS)
  const plan =
    tasks.length === 0
      ? []
      : [
          section(
            'plan',
            'Plan',
            [
              ...(earlier > 0 ? [Text({ dimColor: true, children: [`  +${earlier} wcześniej`] })] : []),
              ...shown.map((task, index) => {
                const minutes = stuckMinutes(task, data.now)
                return Box({
                  key: `task-${index}`,
                  flexDirection: 'row',
                  columnGap: 1,
                  children: [
                    Box({
                      flexGrow: 1,
                      flexShrink: 1,
                      children: [
                        Text({
                          wrap: 'truncate-end',
                          bold: task.status === 'in_progress',
                          dimColor: task.status === 'completed',
                          ...(task.status === 'in_progress' ? { color: KRUX_COLOR } : {}),
                          children: [`${task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▸' : '·'} ${task.subject}`],
                        }),
                      ],
                    }),
                    // Dopisek nie ustępuje miejsca długiemu tematowi zadania.
                    ...(minutes === null ? [] : [Box({ flexShrink: 0, children: [Text({ color: KRUX_COLOR, children: [`⧗ ${minutes} min`] })] })]),
                  ],
                })
              }),
              ...(later > 0 ? [Text({ dimColor: true, children: [`  +${later} dalej`] })] : []),
            ],
            planCount(tasks),
          ),
        ]
  const counts = run === null ? '' : testLine(run)
  const tests =
    run === null
      ? []
      : [
          section('tests', 'Testy', [
            Box({
              flexDirection: 'row',
              columnGap: 1,
              children: [
                Text({ color: run.ok ? OK_COLOR : ALARM_COLOR, children: [run.ok ? '✓' : '✗'] }),
                Box({ flexGrow: 1, flexShrink: 1, children: [Text({ wrap: 'truncate-middle', children: [run.command] })] }),
                // Imię nie ustępuje miejsca komendzie: ucina się komenda, nie „Krux”.
                Box({ flexShrink: 0, children: [Text({ color: SPEAKER_COLOR[run.who], children: [run.who] })] }),
              ],
            }),
            ...(testsStale(data.board) ? [Text({ dimColor: true, children: ['  ◌ nieświeże'] })] : []),
            ...(counts ? [Text({ dimColor: true, wrap: 'truncate-end', children: [`  ${counts}`] })] : []),
            ...run.failures.map((name, index) => Box({ key: `failure-${index}`, children: [Text({ color: ALARM_COLOR, wrap: 'truncate-middle', children: [`  └ ${name}`] })] })),
          ]),
        ]
  const horde =
    data.horde.length === 0
      ? []
      : [
          section(
            'horde',
            'Horda',
            data.horde.map((row, index) =>
              Box({
                key: `mate-${index}`,
                flexDirection: 'column',
                children: [
                  Box({
                    flexDirection: 'row',
                    columnGap: 1,
                    children: [
                      Text({ color: ORC_COLOR, children: ['●'] }),
                      Text({ bold: true, color: SPEAKER_COLOR[row.mate ?? 'ork'], children: [row.name.padEnd(5)] }),
                      Box({ flexGrow: 1, flexShrink: 1, children: [Text({ wrap: 'truncate-end', children: [row.description || ' '] })] }),
                      Text({ dimColor: true, children: [row.time] }),
                    ],
                  }),
                  ...(row.last ? [Text({ dimColor: true, wrap: 'truncate-middle', children: [`  └ ${row.last}`] })] : []),
                ],
              }),
            ),
          ),
        ]
  // Kontekst i limity: pasek, procent, liczby; reset liczony od zegara sesji.
  const used = data.usage
  const barWidth = Math.max(4, Math.min(12, columns - 32))
  const gauges =
    used === null
      ? []
      : [
          section('usage', 'Kontekst', [
            Box({
              key: 'context',
              flexDirection: 'row',
              columnGap: 1,
              children: [
                Text({ color: (used.percent ?? 0) >= 80 ? ALARM_COLOR : KRUX_COLOR, children: [meter(used.percent ?? 0, barWidth)] }),
                Text({
                  dimColor: used.percent === null,
                  wrap: 'truncate-end',
                  children: [used.percent === null ? `— / ${tokens(used.window)}` : `${used.percent}% · ${tokens(used.tokens ?? 0)} / ${tokens(used.window)}`],
                }),
              ],
            }),
            ...used.limits.map((limit, index) =>
              Box({
                key: `limit-${index}`,
                flexDirection: 'row',
                columnGap: 1,
                children: [
                  Text({ color: limit.percentUsed >= 80 ? ALARM_COLOR : ORC_COLOR, children: [meter(limit.percentUsed, barWidth)] }),
                  Text({ wrap: 'truncate-end', children: [`${limitName(limit.kind)} ${Math.round(limit.percentUsed)}%`] }),
                  Text({ dimColor: true, wrap: 'truncate-end', children: [resetIn(limit.resetsAt, data.now)] }),
                ],
              }),
            ),
            ...(used.usd === null ? [] : [Box({ key: 'cost', children: [Text({ dimColor: true, children: [`koszt sesji $${used.usd.toFixed(2)}`] })] })]),
          ]),
        ]
  // Repo stoi zawsze, więc idzie na górę; wątki, plan, testy i horda przychodzą
  // i odchodzą pod nim, a góra panelu nie skacze.
  const passing = [...threads, ...plan, ...tests, ...horde]
  const work = [
    ...git,
    ...commits,
    ...(passing.length > 0 ? passing : [Text({ dimColor: true, children: ['Tablica pusta. Wątki, plan, testy i horda pojawią się przy robocie.'] })]),
  ]
  // Robota u góry, „Kontekst” przypięty do dołu: panel nie wisi pustym ogonem.
  return Box({
    flexDirection: 'column',
    ...(data.rows > 0 ? { minHeight: data.rows } : {}),
    children: [Box({ key: 'work', flexDirection: 'column', gap: 1, flexGrow: 1, ...(gauges.length > 0 ? { marginBottom: 1 } : {}), children: work }), ...gauges],
  })
}

function threadColor(kind: keyof typeof THREAD_MARK): { color?: string } {
  return kind === 'risk' ? { color: ALARM_COLOR } : kind === 'ask' ? { color: KRUX_COLOR } : {}
}

// Wiersze repo z dwukropkiem, bez odmiany liczebnika; czyste i równe repo to jeden `✓`.
function gitRows(git: KruxGit): { key: string; text: string; color?: string }[] {
  const rows = [
    git.conflicted > 0 ? { key: 'conflicted', text: `✗ konflikty: ${git.conflicted}`, color: ALARM_COLOR } : null,
    git.ahead > 0 ? { key: 'ahead', text: `↑ do wypchnięcia: ${git.ahead}`, color: KRUX_COLOR } : null,
    git.behind > 0 ? { key: 'behind', text: `↓ do ściągnięcia: ${git.behind}`, color: KRUX_COLOR } : null,
    git.changed > 0 ? { key: 'changed', text: `● zmienione: ${git.changed}` } : null,
    git.untracked > 0 ? { key: 'untracked', text: `+ nowe: ${git.untracked}` } : null,
  ].filter(row => row !== null)
  if (rows.length > 0) return rows
  return [{ key: 'clean', text: git.upstream === null ? '✓ czysto' : '✓ czysto, równo z upstreamem', color: OK_COLOR }]
}

// Skrót tablicy na pas nad promptem, gdy panelu Sztolni nie widać: po linii na
// wątki, repo, gotowość do commita, plan, testy i kontekst. Wątki zachowują
// pierwszeństwo, gotowość stoi przy repo; pas bierze linie od góry do wysokości
// płótna, więc testy i kontekst ustępują im miejsca. Brak danych (albo czyste
// i równe repo) oznacza brak linii; gotowość wymaga zmienionych lub nowych plików.
// Horda stoi na płótnie obok, więc skrót jej nie powtarza.
export type DigestLine = { key: string; mark: string; text: string; color?: string }

export type DigestExtra = {
  git: KruxGit | null
  threads: KruxThreads
  // Zegar sesji w ms od epoki; bez odczytu nie potwierdzamy utknięcia.
  now?: number
}

export function shaftDigest(board: KruxBoard, usage: KruxUsage | null, extra: DigestExtra = { git: null, threads: EMPTY_THREADS }): DigestLine[] {
  const lines: DigestLine[] = []
  const latest = extra.threads.items.at(-1)
  if (latest !== undefined) {
    const count = extra.threads.items.length
    lines.push({ key: 'threads', mark: THREAD_MARK[latest.kind], text: count > 1 ? `${count} · ${latest.text}` : latest.text, ...threadColor(latest.kind) })
  }
  const git = extra.git
  if (git !== null && gitBusy(git)) {
    // Gałąź z upstreamem, potem znaki stanu: `main → origin/main ↑2 ●3`.
    const marks = gitShort(git).slice(git.branch.length)
    lines.push({ key: 'git', mark: '⎇', text: `${git.branch}${git.upstream === null ? '' : ` → ${git.upstream}`}${marks}`, ...(git.conflicted > 0 ? { color: ALARM_COLOR } : git.ahead > 0 || git.behind > 0 ? { color: KRUX_COLOR } : {}) })
  }
  if (git !== null && git.changed + git.untracked > 0) {
    const commit = readiness(board, git)
    lines.push({ key: 'readiness', mark: commit.ready ? '✓' : '·', text: commit.ready ? 'do commita' : `do commita: ${commit.missing.join(', ')}`, ...(commit.ready ? { color: OK_COLOR } : {}) })
  }
  const { tasks, test: run } = board
  if (tasks.length > 0) {
    const current = tasks.find(task => task.status === 'in_progress') ?? tasks.find(task => task.status === 'pending')
    const minutes = current === undefined || extra.now === undefined ? null : stuckMinutes(current, extra.now)
    // Wiek przed tematem, żeby nie zginął przy ucinaniu długiego zadania.
    const age = minutes === null ? '' : `⧗ ${minutes} min `
    lines.push(
      current === undefined
        ? { key: 'plan', mark: '✓', text: `plan ${planCount(tasks)}`, color: OK_COLOR }
        : { key: 'plan', mark: current.status === 'in_progress' ? '▸' : '·', text: `${planCount(tasks)} ${age}${current.subject}`, color: KRUX_COLOR },
    )
  }
  if (run !== null) {
    const counts = testLine(run)
    // Nieświeżość na początku, żeby nie zginęła przy ucinaniu długiej komendy.
    const text = `${testsStale(board) ? '◌ nieświeże · ' : ''}${run.command}${counts ? ` · ${counts}` : ''}`
    lines.push({ key: 'tests', mark: run.ok ? '✓' : '✗', text, color: run.ok ? OK_COLOR : ALARM_COLOR })
  }
  if (usage !== null && usage.percent !== null) {
    // Tylko zapełnienie kontekstu; okna limitów pozostają w panelu Sztolni.
    lines.push({ key: 'usage', mark: '◔', text: `kontekst ${usage.percent}%`, ...(usage.percent >= 80 ? { color: ALARM_COLOR } : {}) })
  }
  return lines
}
