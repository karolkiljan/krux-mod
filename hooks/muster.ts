// Apel hordy w Sztolni: kogo Krux wysłał, z czym, ile to trwa i czym ork
// teraz robi. Lista silnika (`$.agent.list()`) nie zna czasu, więc start, ostatnie
// narzędzie i koniec notujemy sami. Czyste funkcje.

import type { KruxMate, KruxMuster, KruxRun } from '../types'
import { describeTool } from './voice'

// Najwyżej tylu orków w pamięci; starsze wpisy wypadają.
export const MUSTER_LIMIT = 30
// Bez listy silnika nie pokazujemy osieroconego biegu dłużej niż pół godziny.
const UNCONFIRMED_MS = 30 * 60 * 1000

export const EMPTY_MUSTER: KruxMuster = { runs: [] }

export function musterSpawn(muster: KruxMuster, agentId: string, mate: KruxMate | null, description: string, now: number): KruxMuster {
  const run: KruxRun = { agentId, mate, description, startedAt: now, endedAt: null, last: '' }
  const runs = [...muster.runs.filter(one => one.agentId !== agentId), run]
  return { runs: runs.length > MUSTER_LIMIT ? runs.slice(runs.length - MUSTER_LIMIT) : runs }
}

// Narzędzie orka z apelu; obcy `agentId` (pętla zagnieżdżona, fork silnika) nic nie zmienia.
export function musterTool(muster: KruxMuster, agentId: string, tool: string, input: Record<string, unknown>): KruxMuster {
  if (!muster.runs.some(run => run.agentId === agentId)) return muster
  const target = describeTool(tool, input).target
  // Nieznane narzędzie ma za cel własną nazwę (MCP: `serwer/narzędzie`): bez powtórki.
  const last = !target ? tool : target === tool || tool.startsWith('mcp__') ? target : `${tool} ${target}`
  return {
    runs: muster.runs.map(run => (run.agentId === agentId ? { ...run, last } : run)),
  }
}

export function musterDone(muster: KruxMuster, agentId: string, now: number): KruxMuster {
  if (!muster.runs.some(run => run.agentId === agentId && run.endedAt === null)) return muster
  return { runs: muster.runs.map(run => (run.agentId === agentId && run.endedAt === null ? { ...run, endedAt: now } : run)) }
}

// `m:ss`, od godziny `h:mm:ss`.
export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const s = String(seconds % 60).padStart(2, '0')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}:${s}`
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${s}`
}

export type MusterRow = { agentId: string; name: string; mate: KruxMate | null; description: string; time: string; last: string }

// Orkowie w biegu, od najdawniej wysłanego; skończeni schodzą z tablicy.
// Bez listy silnika (`null`) czas biegu ogranicza heurystyka; z listą tylko ci, których
// silnik widzi w `running` (ork bez końca poza listą skończył poza zdarzeniami).
export function musterRows(muster: KruxMuster, now: number, running: ReadonlySet<string> | null, limit: number): MusterRow[] {
  return muster.runs
    .filter(run => run.endedAt === null && (running === null ? now - run.startedAt < UNCONFIRMED_MS : running.has(run.agentId)))
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(0, Math.max(0, limit))
    .map(run => ({ agentId: run.agentId, name: run.mate ?? 'ork', mate: run.mate, description: withoutName(run.description, run.mate), time: elapsed(now - run.startedAt), last: run.last }))
}

// Opis bez imienia na początku („Niuch: zwiad”): imię stoi już w wierszu.
function withoutName(description: string, mate: KruxMate | null): string {
  if (mate === null) return description
  const rest = description.replace(new RegExp(`^\\s*${mate}\\s*[:—–-]\\s*`, 'u'), '')
  return rest === '' ? description : rest
}

export function anyRunning(muster: KruxMuster): boolean {
  return muster.runs.some(run => run.endedAt === null)
}
