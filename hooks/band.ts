// Pas nad promptem jako czysty plan: co powiedzieć w podpisie, kto stoi na
// płótnie i ile wierszy pas zabiera. register.ts tylko czyta stan i zamienia
// plan na elementy; literał modułu płótna zostaje tam.

import type { KruxActivity, KruxBubble, KruxCue, KruxHordeMember, KruxMoods } from '../types'
import type { ForgeOrc, ForgeProps } from './forge'
import { bubbleFor } from './mood'
import { ORC_GAP, ORC_WIDTH, bandColumns, canvasColumns } from './sprites'
import { restVerb } from './voice'

// Podpis z lewej, przerwa 2 kolumny, za nim płótno.
export const CAPTION_COLUMNS = 28
export const CAPTION_GAP = 2

// Krux i do trzech kumpli; reszta hordy liczona w podpisie.
const STAGE_MATES = 3

// Płótno z dymkiem: 3 wiersze dymka i 3 wiersze sceny. Niskie: sama scena.
const TALL_ROWS = 6
const LOW_ROWS = 3

export type BandInput = {
  working: boolean
  activity: KruxActivity | null
  // Uderzenia tej tury i całej sesji.
  strikes: number
  total: number
  moods: KruxMoods
  // Kumple, których silnik widzi jako `running`, w kolejności wejścia.
  members: readonly KruxHordeMember[]
  held: KruxBubble | null
  cues?: readonly KruxCue[]
  // Krux czeka na `Agent` z pierwszego planu.
  waiting: boolean
  // Ograniczony ruch w ustawieniach.
  still: boolean
  now: number
  columns: number
  rows: number
  // Czy powierzchnia potrafi narysować płótno `Client`.
  hasClient: boolean
}

export type BandPlan = {
  // Szara kreska nad pasem, gdy jest na nią wiersz.
  rule: boolean
  verb: string
  target: string
  tally: string
  // `null`: za wąsko albo za nisko na płótno — pas to jedna linia tekstu.
  stage: { props: ForgeProps; width: number; height: number } | null
}

export function bandPlan(input: BandInput): BandPlan {
  const { working, members } = input
  const room = input.columns - CAPTION_COLUMNS - CAPTION_GAP
  const fit = input.hasClient ? Math.floor((room + ORC_GAP) / (ORC_WIDTH + ORC_GAP)) : 0
  // Stała liczba prostokątów: płótno nie zmienia szerokości, gdy horda przychodzi i odchodzi.
  const slots = Math.max(1, Math.min(1 + STAGE_MATES, fit))
  const shown = members.slice(0, slots - 1)
  const hidden = members.length - shown.length
  // Krux czeka na wyniki hordy: w spoczynku albo w trakcie `Agent` na pierwszym planie.
  // Gdy kumpel już oddał zwój, róg z wywołania `Agent` zagrał: Krux odbiera zwój
  // tam, gdzie czekał, zamiast dąć od nowa.
  const handedBack = input.activity?.scene === 'horn' && (input.cues ?? []).some(cue => cue.kind === 'handoff' && cue.until > input.now)
  const lounging = handedBack || (members.length > 0 && (!working || input.waiting))
  const orcs: ForgeOrc[] = [
    { key: 'krux', face: 'Krux', scene: lounging ? 'lounge' : (input.activity?.scene ?? 'hammer'), mood: input.moods.faces.Krux, ...(!lounging && input.activity?.startedAt !== undefined ? { workAt: input.activity.startedAt } : {}) },
    ...shown.map(member => ({ key: member.agentId, face: member.mate, scene: member.scene, mood: member.mate ? input.moods.faces[member.mate] : ('calm' as const), ...(member.startedAt === undefined ? {} : { workAt: member.startedAt }) })),
  ]
  // Krok kumpla, którego już nie ma na scenie, nie wisi nad nikim.
  const gone = input.held?.kind === 'step' && !members.some(member => member.agentId === input.held!.key)
  const said = bubbleFor({ now: input.now, held: gone ? null : input.held, working, activity: input.activity, moods: input.moods, seed: input.total })
  const speaker = said === null ? undefined : orcs.find(orc => orc.key === said.key)
  // Wysokość pasa zależy tylko od miejsca, nie od tego, czy ktoś mówi.
  const tall = input.hasClient && input.rows >= TALL_ROWS + 1 && room >= canvasColumns(slots, true)
  const height = tall ? TALL_ROWS : input.rows >= LOW_ROWS && fit >= 1 ? LOW_ROWS : 0
  const inCanvas = tall && said !== null && speaker !== undefined
  const verb = lounging ? 'Krux czekać na hordę' : working ? (input.activity?.verb ?? 'Krux rozpalać palenisko') : restVerb(input.strikes, input.total)
  const spoken = said === null ? '' : said.speaker === 'Krux' ? said.text : `${said.speaker === 'ork' ? 'Ork' : said.speaker}: ${said.text}`
  const target = !inCanvas && spoken ? spoken : working ? (input.activity?.target ?? '') : `ostatnia tura — uderzeń: ${input.strikes}`
  // Licznik ukrytych kumpli na początku: przy 28 kolumnach ucina się koniec linii.
  const crowd = hidden > 0 ? `+${hidden} z hordy · ` : ''
  const tally = `${crowd}${working ? `uderzeń młota: ${input.strikes}` : `sesja — uderzeń: ${input.total}`}`
  // Kreska zabiera wiersz, więc staje tylko nad pasem, który mieści się cały.
  const rule = input.rows >= Math.max(1, height) + 1
  if (height === 0) return { rule, verb, target, tally, stage: null }
  const props: ForgeProps = {
    variant: 'band',
    scale: 1,
    still: input.still,
    // W spoczynku płótno stoi, chyba że na scenie kuje jeszcze agent w tle.
    rest: !working && shown.length === 0,
    slots,
    bubbleRows: tall,
    orcs,
    bubble: inCanvas ? { key: speaker!.key, text: said!.text, speaker: said!.speaker } : null,
    cues: (input.cues ?? []).filter(cue => cue.until > input.now),
    now: input.now,
  }
  return { rule, verb, target, tally, stage: { props, width: tall ? canvasColumns(slots, true) : bandColumns(slots), height } }
}
