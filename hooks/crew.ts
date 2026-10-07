// Scena poza Kruxem: kto z hordy na niej stoi, czyj dymek wisi i jakie znaki
// czekają na płótno. Każde zdarzenie to jedno przejście `crewAfter`; stan trzyma
// register.ts, jednym `update`. Kumpel mówi tylko wtedy, gdy stoi na scenie:
// o swoim kroku, o wyniku swojej roboty albo o zdarzeniu z kroniki.

import type { KruxActivity, KruxCrew, KruxCue, KruxEvent, KruxHordeMember, KruxLore } from '../types'
import { EVENT_HOLD_MS, EVENT_SPEAKER, eventLine, mateStep } from './mood'

export const EMPTY_CREW: KruxCrew = { members: [], bubble: null, cues: [] }

// Znaki starsze niż wtręt płótno już zagrało; tyle wystarczy na kilka zdarzeń naraz.
const CUES_KEPT = 8

export type CrewEvent =
  // Subagent z głównej pętli wbiega na scenę.
  | { kind: 'spawn'; member: KruxHordeMember }
  // Narzędzie albo faza kumpla (dumanie, pisanie): jego poza i dymek z krokiem, chyba że wisi świeży wtręt.
  | { kind: 'mate-tool'; agentId: string; doing: KruxActivity }
  // Narzędzie Kruxa: wtręt i reakcja Kruxa po zdarzeniu albo koniec dymka kumpla.
  | { kind: 'own-tool'; event: KruxEvent | null; lore: KruxLore; seed: number; failure?: string }
  // Wynik narzędzia kumpla: jego wtręt i reakcja na własną robotę; `lore` to kronika tego jednego wywołania.
  | { kind: 'mate-event'; agentId: string; event: KruxEvent; lore: KruxLore; seed: number; failure?: string }
  // Pętla kumpla skończona: oddaje zwój i schodzi ze sceny razem ze swoim krokiem.
  | { kind: 'mate-done'; agentId: string }
  // Silnik widzi jako `running` tylko tych; reszta schodzi bez zakończenia i bez zwoju.
  | { kind: 'running'; ids: ReadonlySet<string> }
  // Minął czas wtrętu.
  | { kind: 'expire' }

// Stan sprzed tej wersji nie ma znaków: brak to pusta lista.
function cuesOf(crew: KruxCrew): KruxCue[] {
  return crew.cues ?? []
}

function cued(crew: KruxCrew, cue: KruxCue, now: number): KruxCue[] {
  return [...cuesOf(crew).filter(old => old.until > now), cue].slice(-CUES_KEPT)
}

export function crewAfter(crew: KruxCrew, event: CrewEvent, now: number): KruxCrew {
  const { members, bubble } = crew
  switch (event.kind) {
    case 'spawn':
      return { ...crew, members: [...members.filter(other => other.agentId !== event.member.agentId), event.member] }
    case 'mate-tool': {
      const member = members.find(other => other.agentId === event.agentId)
      if (member === undefined) return crew
      // Róg zostaje dla Kruxa: kumpel, który sam woła hordę, dalej kuje.
      const scene = event.doing.scene === 'horn' ? 'hammer' : event.doing.scene
      const moved = members.map(other => (other === member ? { ...member, scene, target: event.doing.target, ...(event.doing.startedAt === undefined ? {} : { startedAt: event.doing.startedAt }) } : other))
      if (bubble?.kind === 'event' && bubble.until > now) return { ...crew, members: moved }
      return { ...crew, members: moved, bubble: { kind: 'step', key: member.agentId, speaker: member.mate ?? 'ork', text: mateStep(event.doing) } }
    }
    case 'own-tool': {
      if (event.event === null) return bubble?.kind === 'step' ? { ...crew, bubble: null } : crew
      const mate = EVENT_SPEAKER[event.event]
      const member = members.find(other => other.mate === mate)
      const text = eventLine(event.event, event.lore, event.seed, event.failure)
      const until = now + EVENT_HOLD_MS
      // Komentuje kumpel z pasującym fachem, ale reaguje ten, kto robił: Krux.
      const cues = cued(crew, { key: 'krux', kind: event.event, until }, now)
      return { ...crew, cues, bubble: member ? { kind: 'event', key: member.agentId, speaker: mate, text, until } : { kind: 'event', key: 'krux', speaker: 'Krux', text, until } }
    }
    case 'mate-event': {
      const member = members.find(other => other.agentId === event.agentId)
      if (member === undefined) return crew
      const text = eventLine(event.event, event.lore, event.seed, event.failure)
      const until = now + EVENT_HOLD_MS
      return { ...crew, cues: cued(crew, { key: member.agentId, kind: event.event, until }, now), bubble: { kind: 'event', key: member.agentId, speaker: member.mate ?? 'ork', text, until } }
    }
    case 'mate-done': {
      const left = members.filter(other => other.agentId !== event.agentId)
      if (left.length === members.length) return crew
      return {
        members: left,
        bubble: bubble?.kind === 'step' && bubble.key === event.agentId ? null : bubble,
        cues: cued(crew, { key: event.agentId, kind: 'handoff', until: now + EVENT_HOLD_MS }, now),
      }
    }
    case 'running': {
      const left = members.filter(other => event.ids.has(other.agentId))
      if (left.length === members.length) return crew
      return { ...crew, members: left, bubble: bubble?.kind === 'step' && !event.ids.has(bubble.key) ? null : bubble }
    }
    case 'expire': {
      const cues = cuesOf(crew)
      const fresh = cues.filter(cue => cue.until > now)
      const quiet = bubble?.kind === 'event' && bubble.until <= now
      if (!quiet && fresh.length === cues.length) return crew
      return { ...crew, bubble: quiet ? null : bubble, cues: fresh }
    }
  }
}
