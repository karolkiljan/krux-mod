// Stan repo dla Sztolni: gałąź, upstream, commity do wypchnięcia i ściągnięcia,
// pliki zmienione, nowe i w konflikcie. Komendę puszcza `register.ts`, tu tylko
// odczyt jej wyjścia i podpisy. Niewypchnięte commity daje `rev-list`.

import type { KruxGit } from '../types'

export const GIT_STATUS = ['git', '--no-optional-locks', '-c', 'core.quotePath=false', 'status', '--porcelain=v2', '--branch'] as const
export const GIT_LOG = ['git', '--no-optional-locks', '-c', 'core.quotePath=false', 'log', '--format=%H%x09%h%x09%s', '-n', '10'] as const
export const GIT_CHECK = ['git', '--no-optional-locks', 'diff', '--check'] as const
export const GIT_CHECK_CACHED = ['git', '--no-optional-locks', 'diff', '--cached', '--check'] as const

// Osiągalność zamiast pozycji w logu: merge przeplata commity lokalne i upstream.
export const GIT_UNPUSHED = ['git', '--no-optional-locks', '-c', 'core.quotePath=false', 'rev-list', '@{upstream}..HEAD'] as const

// Plików w panelu najwyżej tyle; reszta to liczba w wierszu „zmienione”.
const FILES_LIMIT = 20

// Narzędzia, po których stan repo może być inny: powłoka (commit, push, checkout)
// i edycje plików.
export const GIT_TOOLS: ReadonlySet<string> = new Set(['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// Ścieżka i litera stanu z wiersza porcelain v2: `1 XY … ścieżka`, `2 XY … ścieżka\tstara`,
// `u XY … ścieżka`, `? ścieżka`. Litera: drzewo robocze przed indeksem.
function fileOf(line: string): { code: string; path: string } | null {
  if (line.startsWith('? ')) return { code: '?', path: line.slice(2) }
  const fields = line.split(' ')
  const skip = line.startsWith('1 ') ? 8 : line.startsWith('2 ') ? 9 : line.startsWith('u ') ? 10 : -1
  if (skip < 0 || fields.length <= skip) return null
  const xy = fields[1] ?? '..'
  const code = line.startsWith('u ') ? 'U' : xy[1] !== '.' ? xy[1]! : xy[0]!
  return { code, path: fields.slice(skip).join(' ').split('\t')[0]! }
}

// Wyjścia `GIT_STATUS`, `GIT_LOG` i `GIT_UNPUSHED`; brak odczytu ostatniego to null.
export function gitOf(output: string, log = '', unpushed: string | null = null): KruxGit {
  const git: KruxGit = { branch: '', upstream: null, ahead: 0, behind: 0, changed: 0, untracked: 0, conflicted: 0, files: [], commits: [] }
  for (const line of output.split(/\r?\n/u)) {
    if (line.startsWith('# branch.head ')) git.branch = line.slice('# branch.head '.length)
    else if (line.startsWith('# branch.upstream ')) git.upstream = line.slice('# branch.upstream '.length)
    else if (line.startsWith('# branch.ab ')) {
      const counts = /\+(\d+) -(\d+)/u.exec(line)
      if (counts) {
        git.ahead = Number(counts[1])
        git.behind = Number(counts[2])
      }
    } else if (line.startsWith('? ')) git.untracked += 1
    else if (line.startsWith('u ')) git.conflicted += 1
    else if (/^[12] /u.test(line)) git.changed += 1
    const file = fileOf(line)
    if (file !== null && git.files.length < FILES_LIMIT) git.files.push(file)
  }
  // Pełne hashe porównujemy, krótkie pokazujemy. Brak odczytu nie potwierdza wypchnięcia.
  const local = new Set((unpushed ?? '').split(/\r?\n/u).filter(Boolean))
  git.commits = log
    .split(/\r?\n/u)
    .filter(line => line.includes('\t'))
    .map(line => {
      const [oid = '', hash = '', ...subject] = line.split('\t')
      return { hash, subject: subject.join('\t'), pushed: git.upstream !== null && unpushed !== null && !local.has(oid) }
    })
  return git
}

// Czy repo ma coś do powiedzenia: commity w drodze albo pliki poza commitem.
export function gitBusy(git: KruxGit): boolean {
  return git.ahead > 0 || git.behind > 0 || git.changed > 0 || git.untracked > 0 || git.conflicted > 0
}

// Krótki podpis na jedną linię: `main ↑6 ↓1 ●3 +1 ✗1`, tylko niezerowe.
export function gitShort(git: KruxGit): string {
  const marks = [
    git.ahead > 0 ? `↑${git.ahead}` : '',
    git.behind > 0 ? `↓${git.behind}` : '',
    git.changed > 0 ? `●${git.changed}` : '',
    git.untracked > 0 ? `+${git.untracked}` : '',
    git.conflicted > 0 ? `✗${git.conflicted}` : '',
  ].filter(Boolean)
  return [git.branch, ...marks].join(' ')
}
