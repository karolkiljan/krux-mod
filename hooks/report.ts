// Raport do wklejenia: wyłącznie dane z sesji, neutralna polszczyzna.
import type { KruxBoard, KruxGit, KruxLore, KruxThreadKind, KruxThreads } from '../types'

const THREAD_LABEL: Record<KruxThreadKind, string> = {
  todo: 'do zrobienia',
  risk: 'ryzyko',
  ask: 'czeka na decyzję',
}

// `since` to początek sesji w ms od epoki (`$.session.usage().startedAt`): starsze commity
// to historia repo, nie robota sesji. Bez początku albo czasu commita nic nie potwierdza sesji.
export function dayReport(git: KruxGit | null, board: KruxBoard, threads: KruxThreads, lore: KruxLore, since: number | null): string {
  const sections: string[][] = []
  // Git podaje czas w pełnych sekundach: commit z sekundy startu też należy do sesji.
  const from = since === null ? null : Math.floor(since / 1000) * 1000
  const commits = from === null ? [] : (git?.commits ?? []).filter(commit => commit.at !== undefined && commit.at >= from).slice(0, 10)
  if (commits.length > 0) {
    sections.push(['## Commity', ...commits.map(commit => `- ${commit.hash} ${commit.subject}`)])
  }

  const run = board.test
  if (run !== null) {
    const lines = ['## Ostatni przebieg testów', `Komenda: ${run.command}`, `Wynik: ${run.ok ? 'zaliczony' : 'nieudany'}`, `Wykonawca: ${run.who}`]
    if (run.passed !== null) lines.push(`Zaliczone: ${run.passed}`)
    if (run.failed !== null) lines.push(`Nieudane: ${run.failed}`)
    if (run.failures.length > 0) lines.push('Nieudane testy:', ...run.failures.map(name => `- ${name}`))
    sections.push(lines)
  }

  if (board.tasks.length > 0) {
    const done = board.tasks.filter(task => task.status === 'completed').length
    sections.push([
      '## Plan',
      `Zrobione: ${done}/${board.tasks.length}`,
      ...board.tasks.map(task => `- [${task.status === 'completed' ? 'x' : ' '}] ${task.subject}${task.status === 'in_progress' ? ' (w toku)' : ''}`),
    ])
  }

  if (threads.items.length > 0) {
    sections.push(['## Otwarte wątki', ...threads.items.map(item => `- #${item.id} [${THREAD_LABEL[item.kind]}] ${item.text}`)])
  }

  if (lore.testRuns > 0 || lore.testFails > 0 || lore.commits > 0 || lore.tears > 0) {
    sections.push([
      '## Podsumowanie sesji',
      `Przebiegi testów: ${lore.testRuns} (nieudane: ${lore.testFails})`,
      `Commity: ${lore.commits}`,
      `Rozbiórki: ${lore.tears}`,
    ])
  }

  return sections.length > 0 ? sections.map(lines => lines.join('\n')).join('\n\n') : 'Brak danych do raportu dnia.'
}
