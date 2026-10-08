import type { ClientModule } from 'claude-code'

import type { KruxCue, KruxEvent, KruxMood, KruxSpeaker } from '../types'
import { CATCH_X, CUE_FRAMES, FRAME_MS, SPEAKER_COLOR, bandColumns, behind, bubbleLines, canvasColumns, catchStep, caughtScroll, dress, frameGrid, runsOf, slotX, stageGrid, tossFlight, tossFrames, tossGrid, tossScroll, trackDozing, trackFace, trackGrid, trackOff, trackStart, trackTo, walkerRows, withCatch, withCue, withEffort, withNap } from './sprites'
import type { Face, Placed, StageScene, Track } from './sprites'
import { graphemes } from './terminal-text'

// Moduł powierzchni: rysuje Kruxa, kumpli i dymek na wątku rysującym, z własnym
// zegarem klatek. Hooks module podaje tylko, kto stoi, w jakiej scenie i humorze;
// sloty, wejścia z prawej i zejścia w prawo pilnuje płótno.

export type ForgeOrc = { key: string; face: Face; scene: StageScene; mood: KruxMood; workAt?: number }

export type ForgeProps = {
  variant: 'band' | 'pane'
  scale: 1 | 2
  // Ograniczony ruch: nic się nie rusza, kumple wchodzą i znikają bez marszu.
  still: boolean
  // Spoczynek bez roboty na scenie: płótno zamiera, ale dopiero gdy nikt nie schodzi.
  rest: boolean
  // Ile prostokątów orków mieści płótno; Krux zawsze w slocie 0.
  slots: number
  // Trzy wiersze nad sceną na dymek, puste, gdy nikt nie mówi: wysokość stoi.
  bubbleRows: boolean
  orcs: ForgeOrc[]
  bubble: { key: string; text: string; speaker: KruxSpeaker } | null
  cues?: readonly KruxCue[]
  now?: number
}

// Ork na płótnie: jego slot i marsz; `enter` i `from` opisują wejście, `leftAt`
// klatkę, w której rusza w prawo za krawędź (do niej schodzi do stójki).
// Co i od kiedy gra, trzyma oś czynności `track`.
type Actor = {
  face: Face
  mood: KruxMood
  track: Track
  slot: number
  enter: number
  from: number
  leftAt: number | null
  handoff?: { at: number; flight: number }
  cue?: { id: string; kind: KruxEvent; at: number }
  workAt?: number
  effortAt?: number
}

type ForgeState = { frame: number; actors: Record<string, Actor>; idle: boolean; reduced?: boolean; snoozing?: boolean; said?: { id: string; at: number } }

// Kolumny na klatkę w marszu: przez całe płótno w około 3 s.
const WALK_SPEED = 3

// Gdzie stoi ork w danej klatce; `null`, gdy już zszedł za prawą krawędź.
function placeOf(actor: Actor, frame: number, stage: number): { x: number; walking: boolean } | null {
  const home = slotX(actor.slot)
  if (actor.leftAt !== null && frame >= actor.leftAt) {
    const x = home + WALK_SPEED * (frame - actor.leftAt)
    return x >= stage ? null : { x, walking: true }
  }
  const x = Math.max(home, actor.from - WALK_SPEED * (frame - actor.enter))
  return { x, walking: x !== home }
}

// Slot zwalnia się, gdy ork rusza w marsz; póki schodzi do stójki, stoi w nim dalej.
function freeSlot(actors: Record<string, Actor>, slots: number, frame: number): number | null {
  const taken = new Set(Object.values(actors).filter(actor => actor.leftAt === null || frame < actor.leftAt).map(actor => actor.slot))
  for (let slot = 1; slot < slots; slot += 1) if (!taken.has(slot)) return slot
  return null
}

// Klatka, w której slot się zwolnił: kumpel, który na niego czekał, rusza od niej,
// nawet gdy płótno nie rysowało każdej klatki.
function freedAt(actors: Record<string, Actor>, slot: number, frame: number): number {
  const starts = Object.values(actors).flatMap(actor => (actor.slot === slot && actor.leftAt !== null && actor.leftAt <= frame ? [actor.leftAt] : []))
  return starts.length === 0 ? frame : Math.max(...starts)
}

// Rzut zwoju od klatki `at`: lot zależy od odległości slotu od Kruxa, marsz rusza po nim.
function tossFrom(actor: Actor, at: number): Pick<Actor, 'handoff' | 'leftAt'> {
  const flight = tossFlight(slotX(actor.slot))
  return { handoff: { at, flight }, leftAt: at + tossFrames(flight) }
}

// Ork kończy: najpierw schodzi do stójki, potem maszeruje; w bezruchu znika od razu.
function depart(actor: Actor, frame: number, still: boolean, handoff: boolean): Actor | null {
  if (still) return null
  const track = trackOff(actor.track, frame)
  const at = Math.max(frame, track.since)
  return { ...actor, track, leftAt: at, ...(handoff ? tossFrom(actor, at) : {}) }
}

// Krok chwytu Kruxa, gdy któryś kumpel właśnie rzuca mu zwój; `null`, gdy nikt.
function catchOf(actors: Record<string, Actor>, frame: number): number | null {
  for (const actor of Object.values(actors)) {
    const step = actor.handoff === undefined ? null : catchStep(frame - actor.handoff.at, actor.handoff.flight)
    if (step !== null) return step
  }
  return null
}

const Forge: ClientModule<ForgeProps, ForgeState> = (props, surface) => {
  const first = surface.state === undefined
  const state = surface.state ?? { frame: 0, actors: {}, idle: props.still || props.rest }
  const frame = state.frame
  // Kumpel, który kończy w spoczynku, najpierw maszeruje w prawo; do tego czasu
  // płótno żyje, a Krux schodzi do stójki zamiast skakać.
  const keys = new Set(props.orcs.map(orc => orc.key))
  const leaving = Object.entries(state.actors).some(([key, actor]) => actor.leftAt !== null || !keys.has(key))
  const frozen = props.still || (props.rest && !leaving)
  const slots = props.variant === 'pane' ? 1 : Math.max(1, props.slots)
  const stage = bandColumns(slots)
  const actors: Record<string, Actor> = { ...state.actors }
  let changed = first
  const present = new Set<string>()
  // Kto zszedł ze sceny, zaczyna schodzić przed rozdaniem slotów, więc czekający widzi, że slot się zwolni.
  const leave = (key: string, actor: Actor) => {
    const next = depart(actor, frame, props.still, props.variant === 'band' && (props.cues ?? []).some(cue => cue.key === key && cue.kind === 'handoff'))
    if (next === null) delete actors[key]
    else actors[key] = next
    changed = true
  }
  for (const [key, actor] of Object.entries(actors)) if (!keys.has(key) && (actor.leftAt === null || props.still)) leave(key, actor)
  for (const orc of props.orcs) {
    const prior = actors[orc.key]
    // Po zwężeniu płótna kumpel za ostatnim slotem wchodzi od nowa do wolnego albo schodzi.
    const outside = prior !== undefined && orc.key !== 'krux' && prior.slot >= slots
    // Wraca, zanim ruszył w marsz: zostaje w swoim slocie, bez wbiegania od nowa.
    const back = prior !== undefined && prior.leftAt !== null && frame < prior.leftAt && !outside
    const was = back ? { ...prior, leftAt: null, handoff: undefined } : prior
    if (was === undefined || was.leftAt !== null || outside) {
      const slot = orc.key === 'krux' ? 0 : freeSlot(actors, slots, frame)
      if (slot === null) {
        // Slot zwolni się, gdy ork, który w nim schodzi do stójki, ruszy w marsz: kumpel za krawędzią czeka.
        const settling = Object.values(actors).some(actor => actor.leftAt !== null && frame < actor.leftAt && actor.slot < slots)
        if (was !== undefined && settling) present.add(orc.key)
        continue
      }
      // Na starcie płótna, w bezruchu i sam Krux stoją od razu w slocie; reszta wbiega z prawej.
      const from = first || props.still || slot === 0 ? slotX(slot) : stage
      const enter = outside ? freedAt(actors, slot, frame) : frame
      // Scena rusza dopiero w slocie: marsz kończy się stójką, z niej wchodzi czynność.
      // Na starcie płótna ork już jest w pętli roboty.
      const track = trackStart(orc.scene, orc.key, enter, first ? 'in-loop' : Math.ceil((from - slotX(slot)) / WALK_SPEED), orc.face)
      // Wiek roboty przy montowaniu płótna: ork, który kuje od dawna, poci się od razu.
      const worked = orc.workAt === undefined ? null : Math.max(0, Math.floor(((props.now ?? orc.workAt) - orc.workAt) / FRAME_MS))
      actors[orc.key] = { face: orc.face, mood: orc.mood, track, slot, enter, from, leftAt: null, workAt: orc.workAt, ...(worked === null ? {} : { effortAt: frame - worked }) }
      changed = true
    } else {
      let next = was
      // Kumpel, który dostał imię, gra odtąd czynności swojego fachu.
      const track = trackFace(trackTo(was.track, orc.scene, orc.key, frame, frozen), orc.face, orc.key, frame, frozen)
      if (track !== was.track) next = { ...next, track }
      if (orc.mood !== was.mood || orc.face !== was.face) next = { ...next, mood: orc.mood, face: orc.face }
      if (orc.workAt !== was.workAt) next = { ...next, workAt: orc.workAt, effortAt: frame }
      if (next !== prior) {
        actors[orc.key] = next
        changed = true
      }
    }
    present.add(orc.key)
  }
  // Identyfikator zdarzenia pozostaje po zakończeniu reakcji: render jej nie powtarza.
  const cuedKeys = new Set<string>()
  for (const cue of [...(props.cues ?? [])].reverse()) {
    if (cue.kind === 'handoff') {
      const actor = actors[cue.key]
      if (!props.still && props.variant === 'band' && actor !== undefined && actor.leftAt !== null && frame < actor.leftAt && actor.handoff === undefined) {
        // Znak przyszedł, gdy ork już schodził: rzuca w klatce, w której miał ruszyć w marsz.
        actors[cue.key] = { ...actor, ...tossFrom(actor, actor.leftAt) }
        changed = true
      }
      continue
    }
    if (cuedKeys.has(cue.key)) continue
    cuedKeys.add(cue.key)
    const actor = actors[cue.key]
    const id = `${cue.kind}:${cue.until}`
    if (actor !== undefined && actor.cue?.id !== id) {
      actors[cue.key] = { ...actor, cue: { id, kind: cue.kind, at: props.still ? frame - CUE_FRAMES : frame } }
      changed = true
    }
  }
  // Bez slotu i bez widoków na wolny: schodzi.
  for (const [key, actor] of Object.entries(actors)) if (!present.has(key) && (actor.leftAt === null || props.still)) leave(key, actor)
  const placed: (Placed & { walking: boolean })[] = []
  const scrolls: Placed[] = []
  let moving = false
  const caught = catchOf(actors, frame)
  for (const [key, actor] of Object.entries(actors)) {
    const at = placeOf(actor, frame, stage)
    if (at === null) {
      delete actors[key]
      changed = true
      continue
    }
    const tossing = actor.handoff !== undefined && frame >= actor.handoff.at && frame < actor.leftAt!
    const reacting = actor.cue !== undefined && frame - actor.cue.at < CUE_FRAMES
    moving ||= at.walking || tossing || reacting || (actor.leftAt !== null && frame < actor.leftAt)
    let raw = tossing ? tossGrid(frame - actor.handoff!.at, actor.mood) : trackGrid(actor.track, frame, 'band', actor.mood, frozen)
    if (!at.walking && !props.still) {
      if (reacting) raw = withCue(raw, actor.cue!.kind, frame - actor.cue!.at)
      // Krux wyciąga dłoń po zwój kumpla; w tych klatkach się nie poci.
      const catching = key === 'krux' ? caught : null
      if (catching !== null) raw = withCatch(raw, catching)
      if (actor.leftAt === null && !frozen && !reacting && catching === null && actor.workAt !== undefined) raw = withEffort(raw, frame - (actor.effortAt ?? frame))
      if (key === 'krux' && ((frozen && state.snoozing) || trackDozing(actor.track, frame))) raw = withNap(raw)
    }
    const rows = at.walking ? walkerRows(frame, actor.face) : dress(raw, actor.face)
    if (tossing) {
      const scroll = tossScroll(frame - actor.handoff!.at, slotX(actor.slot) + 6, CATCH_X, actor.handoff!.flight)
      if (scroll !== null) scrolls.push(scroll)
      const caught = caughtScroll(frame - actor.handoff!.at, actor.handoff!.flight)
      if (caught !== null) scrolls.push(caught)
    }
    placed.push({ rows, x: at.x, walking: at.walking })
  }
  // Zegar stoi, gdy płótno nieruchome i nikt nie maszeruje.
  const saidId = props.bubble === null ? '' : `${props.bubble.key}:${props.bubble.text}`
  const speech = state.said?.id === saidId ? state.said : { id: saidId, at: frame }
  const typing = props.bubble !== null && (frame - speech.at + 1) * 3 < Math.min(40, graphemes(props.bubble.text).length)
  const idle = props.still || (frozen && !moving && !typing)
  if (changed || idle !== state.idle || speech !== state.said || state.reduced !== props.still) {
    surface.setState({ frame, actors, idle, said: speech, reduced: props.still, snoozing: idle ? state.snoozing : false })
  }
  if (first) {
    let quietTicks = 0
    surface.every(FRAME_MS, () => {
      const now = surface.state
      if (now === undefined || now.reduced) return
      if (!now.idle) {
        quietTicks = 0
        surface.setState({ ...now, frame: now.frame + 1, snoozing: false })
      } else if (++quietTicks === 200) surface.setState({ ...now, snoozing: true })
    })
  }
  // Maszerujący na wierzchu: przechodzą przed slotami innych.
  placed.sort((a, b) => Number(a.walking) - Number(b.walking))
  // Zwój leci za głowami: łapie go dłoń, a policzki i oczy zostają na wierzchu.
  const flying = scrolls.map(scroll => placed.reduce((prop, orc) => behind(prop, orc), scroll))
  const krux = actors.krux
  const grid =
    props.variant === 'pane'
      ? dress(krux === undefined ? frameGrid(frame, 'pane') : trackGrid(krux.track, frame, 'pane', krux.mood, frozen), 'Krux')
      : stageGrid([...placed, ...flying], stage)
  const { Box, Text } = surface.elements
  const lines = runsOf(grid, props.scale)
  const width = canvasColumns(slots, true)
  const said = props.variant === 'band' ? props.bubble : null
  const speaker = said === null ? undefined : actors[said.key]
  const talking = said !== null && speaker !== undefined && speaker.leftAt === null ? said : null
  const spoken = talking === null ? '' : props.still ? talking.text : graphemes(talking.text).slice(0, Math.max(1, (frame - speech.at + 1) * 3)).join('')
  const bubbleText = talking !== null ? bubbleLines(spoken, speaker!.slot, width) : props.variant === 'band' && props.bubbleRows ? [' ', ' ', ' '] : []
  const bubble = bubbleText.map((line, y) =>
    Box({ key: `bubble-${y}`, children: [Text({ ...(talking === null ? {} : { color: SPEAKER_COLOR[talking.speaker] }), children: [line] })] }),
  )
  return Box({
    flexDirection: 'column',
    children: [
      ...bubble,
      ...lines.map((runs, y) =>
        Box({
          key: `row-${y}`,
          flexDirection: 'row',
          children: runs.map(run =>
            Text({
              ...(run.color === undefined ? {} : { color: run.color }),
              ...(run.backgroundColor === undefined ? {} : { backgroundColor: run.backgroundColor }),
              children: [run.text],
            }),
          ),
        }),
      ),
    ],
  })
}

export default Forge
