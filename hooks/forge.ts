import type { ClientModule } from 'claude-code'

import type { KruxCue, KruxEvent, KruxMood, KruxSpeaker } from '../types'
import { CATCH_X, CUE_FRAMES, ERRAND_FRAMES, FRAME_MS, ORC_GAP, ORC_WIDTH, SPEAKER_COLOR, bandColumns, behind, bubbleAt, canvasColumns, carried, catchStep, caughtScroll, depthSpot, dress, errandPose, floorHomes, floorStart, frameGrid, hasHearth, hearthProp, paint, roomGrid, runsOf, sliceRuns, slotX, stageGrid, stationX, tossFlight, tossFrames, tossGrid, tossScroll, trackArrive, trackDozing, trackFace, trackGrid, trackOff, trackStart, trackTo, walkerRows, withCatch, withCue, withEffort, withNap } from './sprites'
import type { Face, Placed, Run, StageScene, Track } from './sprites'
import { MATES } from './roster'
import { graphemes } from './terminal-text'

// Moduł powierzchni: rysuje Kruxa, kumpli i dymek na wątku rysującym, z własnym
// zegarem klatek. Hooks module podaje tylko, kto stoi, w jakiej scenie i humorze;
// podłogi, marszów między stanowiskami, wejść z prawej i zejść w prawo pilnuje płótno.

export type ForgeOrc = { key: string; face: Face; scene: StageScene; mood: KruxMood; workAt?: number }

export type ForgeProps = {
  variant: 'band' | 'pane'
  scale: 1 | 2
  // Ograniczony ruch: nic się nie rusza, kumple wchodzą i znikają bez marszu.
  still: boolean
  // Spoczynek bez roboty na scenie: płótno zamiera, ale dopiero gdy nikt nie schodzi.
  rest: boolean
  // Ilu orków naraz mieści płótno; Krux zawsze w slocie 0.
  slots: number
  // Szerokość wspólnej podłogi w kolumnach; bez niej tyle, ile zajmują orkowie.
  floor?: number
  // Stan roboty na ścianie: czerwone testy, liczba pieczęci w tej sesji.
  red?: boolean
  seals?: number
  // Trzy wiersze nad sceną na dymek, puste, gdy nikt nie mówi: wysokość stoi.
  bubbleRows: boolean
  orcs: ForgeOrc[]
  bubble: { key: string; text: string; speaker: KruxSpeaker } | null
  cues?: readonly KruxCue[]
  now?: number
}

// Ork na płótnie: `slot` to miejsce w składzie, `home` kolumna na podłodze. Marsz
// to `from` → `home` od klatki `enter`; `pending` to scena, która ruszy po dojściu.
// `leftAt` to klatka, w której rusza w prawo za krawędź (do niej schodzi do stójki).
// Co i od kiedy gra, trzyma oś czynności `track`.
type Actor = {
  face: Face
  mood: KruxMood
  track: Track
  slot: number
  home: number
  enter: number
  from: number
  pending?: StageScene
  arrived: number
  // Scena, przy której ork naprawdę stał: z niej bierze ładunek na marsz.
  worked: StageScene
  // Wyprawa w głąb po dojściu na stanowisko: od klatki `at` do sprzętu w kolumnie `spot`.
  errand?: { at: number; spot: number; scene: StageScene }
  errandAt?: number
  leftAt: number | null
  handoff?: { at: number; flight: number }
  cue?: { id: string; kind: KruxEvent; at: number }
  workAt?: number
  effortAt?: number
}

type ForgeState = { frame: number; actors: Record<string, Actor>; idle: boolean; reduced?: boolean; snoozing?: boolean; said?: { id: string; at: number }; laidAt?: number }

// Kolumny na klatkę w marszu: przez całą podłogę w około 3 s, także na szerokim terminalu.
const WALK_SPEED = 3
const WALK_FRAMES = 20

function walkSpeed(stage: number): number {
  return Math.max(WALK_SPEED, Math.ceil(stage / WALK_FRAMES))
}

// Po dojściu ork robi swoje co najmniej 3 s: szybkie Read, Bash, Read nie mogą gonić go po podłodze.
const STAY_FRAMES = 20

// Po głębi ork chodzi najwyżej raz na 15 s: wyprawa to przyprawa, nie etat.
const ERRAND_EVERY = 100

// Kumpel dalej niż tyle kolumn od Kruxa podchodzi ze zwojem, zamiast rzucać przez cały pas.
const TOSS_REACH = 2 * (ORC_WIDTH + ORC_GAP)
// Gdzie staje kumpel, który podszedł: na prawo od dłoni Kruxa.
const HANDOFF_GAP = 12

// Gdzie stoi ork w danej klatce; `null`, gdy już zszedł za prawą krawędź.
function placeOf(actor: Actor, frame: number, stage: number): { x: number; walking: boolean } | null {
  const { home, from } = actor
  const speed = walkSpeed(stage)
  if (actor.leftAt !== null && frame >= actor.leftAt) {
    const x = home + speed * (frame - actor.leftAt)
    return x >= stage ? null : { x, walking: true }
  }
  const gone = speed * Math.max(0, frame - actor.enter)
  const x = from < home ? Math.min(home, from + gone) : Math.max(home, from - gone)
  return { x, walking: frame >= actor.enter && x !== home }
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

// Oddanie zwoju od klatki `at`: blisko Kruxa rzut, dalej kumpel najpierw podchodzi.
// Lot zależy od odległości od dłoni Kruxa, marsz w prawo rusza po nim.
function tossFrom(actor: Actor, at: number, kruxX: number, stage: number): Pick<Actor, 'handoff' | 'leftAt' | 'home' | 'from' | 'enter'> {
  const gap = actor.home - kruxX
  const near = gap >= HANDOFF_GAP && gap <= TOSS_REACH
  const home = near ? actor.home : kruxX + HANDOFF_GAP
  const walk = Math.ceil(Math.abs(actor.home - home) / walkSpeed(stage))
  const flight = tossFlight(home - kruxX)
  return { home, from: actor.home, enter: at, handoff: { at: at + walk, flight }, leftAt: at + walk + tossFrames(flight) }
}

// Ork kończy: najpierw schodzi do stójki, potem maszeruje; w bezruchu znika od razu.
// Kończy tam, gdzie akurat stoi, więc marsz w prawo nie skacze do starego domu.
function depart(actor: Actor, frame: number, still: boolean, handoff: boolean, stage: number, kruxX: number): Actor | null {
  if (still) return null
  const x = placeOf(actor, frame, stage)?.x ?? actor.home
  const track = trackOff(actor.track, frame)
  // Kumpel w głębi najpierw wraca z wyprawy: skok z małej pozy byłby widać.
  const at = Math.max(frame, track.since, actor.errand === undefined ? 0 : actor.errand.at + ERRAND_FRAMES)
  const stopped = { ...actor, home: x, from: x, pending: undefined }
  return { ...stopped, track, leftAt: at, ...(handoff ? tossFrom(stopped, at, kruxX, stage) : {}) }
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
  const stage = Math.max(bandColumns(slots), props.variant === 'band' ? (props.floor ?? 0) : 0)
  // W bezruchu orkowie stoją w slotach od lewej krawędzi, więc palenisko nie ma gdzie stanąć.
  const hearth = props.variant === 'band' && !props.still && hasHearth(stage, slots)
  // Pokój stoi tam, gdzie pas ma wiersze na dymek: dymek kładzie się na ścianie.
  const room = props.variant === 'band' && props.bubbleRows
  const actors: Record<string, Actor> = { ...state.actors }
  const kruxAt = () => (actors.krux === undefined ? 0 : (placeOf(actors.krux, frame, stage)?.x ?? actors.krux.home))
  let changed = first
  const present = new Set<string>()
  const born = new Set<string>()
  // Domy przestawiamy raz na klatkę: silnik odpina płótno po 3 zapisach stanu bez tyknięcia.
  const layout = state.laidAt !== frame
  let laid = false
  // Kto zszedł ze sceny, zaczyna schodzić przed rozdaniem slotów, więc czekający widzi, że slot się zwolni.
  const leave = (key: string, actor: Actor) => {
    const next = depart(actor, frame, props.still, props.variant === 'band' && (props.cues ?? []).some(cue => cue.key === key && cue.kind === 'handoff'), stage, kruxAt())
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
      actors[orc.key] = { face: orc.face, mood: orc.mood, track, slot, home: slotX(slot), enter, from, arrived: enter, worked: orc.scene, leftAt: null, workAt: orc.workAt, ...(worked === null ? {} : { effortAt: frame - worked }) }
      born.add(orc.key)
      changed = true
    } else {
      let next = was
      // W drodze na stanowisko scena czeka na dojście; oś rusza dopiero tam.
      if (was.pending !== undefined) {
        const track = trackFace(was.track, orc.face, orc.key, frame, true)
        if (was.pending !== orc.scene || track !== was.track) next = { ...next, pending: orc.scene, track }
      } else {
        // Kumpel, który dostał imię, gra odtąd czynności swojego fachu.
        const track = trackFace(trackTo(was.track, orc.scene, orc.key, frame, frozen), orc.face, orc.key, frame, frozen)
        if (track !== was.track) next = { ...next, track }
      }
      if (orc.mood !== was.mood || orc.face !== was.face) next = { ...next, mood: orc.mood, face: orc.face }
      if (orc.workAt !== was.workAt) next = { ...next, workAt: orc.workAt, effortAt: frame }
      if (next !== prior) {
        actors[orc.key] = next
        changed = true
      }
    }
    present.add(orc.key)
  }
  // Domy na podłodze. Spoczynek i świeżo przybyły ork stoją, gdzie stoją; w bezruchu każdy w swoim slocie.
  const scenes = new Map(props.orcs.map(orc => [orc.key, orc.scene]))
  const standing = Object.entries(actors).filter(([key, actor]) => actor.leftAt === null && scenes.has(key))
  const pinned = (actor: Actor) => frozen || actor.errand !== undefined || (actor.pending === undefined && frame - actor.arrived < STAY_FRAMES)
  const bounds = [floorStart(hearth), stage - ORC_WIDTH] as const
  const onFloor = (x: number) => Math.max(bounds[0], Math.min(bounds[1], x))
  const homes = floorHomes(
    standing.map(([key, actor]) => ({
      key,
      slot: actor.slot,
      want: props.still ? slotX(actor.slot) : !born.has(key) && pinned(actor) ? onFloor(actor.home) : stationX(scenes.get(key)!, stage, hearth),
    })),
    stage,
  )
  for (const [key, actor] of standing) {
    const home = homes[key]!
    if (born.has(key)) {
      const from = actor.from === stage ? stage : home
      const track = first ? actor.track : trackStart(scenes.get(key)!, key, actor.enter, Math.ceil(Math.abs(from - home) / walkSpeed(stage)), actor.face)
      // Kumpel wbiega z prawej i najpierw bierze sprzęt z głębi, jak każdy po marszu.
      actors[key] = { ...actor, home, from, track, ...(room && !first && !props.still && from === stage ? { pending: scenes.get(key)! } : {}) }
    } else if (props.still) {
      // Bezruch włączony w drodze: zegar stoi, więc marsz i wyprawa nie skończą się same.
      if (home !== actor.home || actor.from !== home || actor.pending !== undefined || actor.errand !== undefined) {
        const { pending, errand: _stopped, ...rest } = actor
        actors[key] = { ...rest, home, from: home, enter: frame, ...(pending === undefined ? {} : { track: trackArrive(actor.track, pending, key, frame), worked: pending }) }
        changed = true
      }
    } else if (layout && home !== actor.home && (!pinned(actor) || onFloor(actor.home) !== actor.home)) {
      laid = true
      // Przypięty ork nie ustępuje sąsiadowi, chyba że stoi poza podłogą albo na palenisku:
      // inaczej dom skakałby między rysunkami bez jednego tyknięcia zegara.
      const x = placeOf(actor, frame, stage)?.x ?? actor.home
      if (actor.pending !== undefined) {
        // Podłoga zwęziła się w trakcie wyprawy: ork wraca z głębi od razu i idzie na nowe miejsce.
        const { errand: _cut, ...rest } = actor
        actors[key] = { ...rest, home, from: x, enter: Math.max(frame, actor.enter) }
      } else {
        // Rekwizyt najpierw odjeżdża do stójki, dopiero potem ork rusza.
        const track = trackOff(actor.track, frame)
        actors[key] = { ...actor, track, home, from: x, enter: Math.max(frame, track.since), pending: scenes.get(key)! }
      }
      changed = true
    }
  }
  // Identyfikator zdarzenia pozostaje po zakończeniu reakcji: render jej nie powtarza.
  const cuedKeys = new Set<string>()
  for (const cue of [...(props.cues ?? [])].reverse()) {
    if (cue.kind === 'handoff') {
      const actor = actors[cue.key]
      if (!props.still && props.variant === 'band' && actor !== undefined && actor.leftAt !== null && frame < actor.leftAt && actor.handoff === undefined) {
        // Znak przyszedł, gdy ork już schodził: rzuca w klatce, w której miał ruszyć w marsz.
        actors[cue.key] = { ...actor, ...tossFrom(actor, actor.leftAt, kruxAt(), stage) }
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
  const loads: Placed[] = []
  const deep: { rows: readonly string[]; x: number; y: number }[] = []
  const standsAt: Record<string, number> = {}
  let moving = false
  const caught = catchOf(actors, frame)
  const kruxX = kruxAt()
  for (const [key, seen] of Object.entries(actors)) {
    let actor = seen
    const at = placeOf(actor, frame, stage)
    if (at === null) {
      delete actors[key]
      changed = true
      continue
    }
    standsAt[key] = at.x
    // Pas się spłaszczył: nie ma głębi, w której ork mógłby stać.
    if (actor.errand !== undefined && !room) {
      const { errand: _flat, ...rest } = actor
      actor = rest
      actors[key] = actor
      changed = true
    }
    // Doszedł: scena rusza ze stójki tu, na stanowisku.
    if (actor.pending !== undefined && frame >= actor.enter && !at.walking) {
      const due = room && !frozen && actor.errand === undefined && (actor.errandAt === undefined || frame - actor.errandAt >= ERRAND_EVERY)
      if (due) {
        // Najpierw po sprzęt w głąb pomieszczenia, robota rusza po powrocie.
        actor = { ...actor, errand: { at: frame, spot: depthSpot(actor.pending, stage, hearth), scene: actor.pending }, errandAt: frame }
        actors[key] = actor
        changed = true
      } else if (actor.errand === undefined || frame - actor.errand.at >= ERRAND_FRAMES) {
        const { pending, errand, ...rest } = actor
        // Zdarzenie w głębi nie przepada: reakcja gra po powrocie.
        const cue = errand !== undefined && actor.cue !== undefined && actor.cue.at >= errand.at ? { cue: { ...actor.cue, at: frame } } : {}
        actor = { ...rest, ...cue, track: trackArrive(actor.track, pending, key, frame), arrived: frame, worked: pending }
        actors[key] = actor
        changed = true
      }
    }
    // Kumpel skończył w głębi: wyprawa dobiega końca, potem marsz.
    if (actor.errand !== undefined && actor.pending === undefined && frame - actor.errand.at >= ERRAND_FRAMES) {
      const { errand: _back, ...rest } = actor
      actor = rest
      actors[key] = actor
      changed = true
    }
    if (actor.errand !== undefined) {
      const pose = errandPose(frame - actor.errand.at, actor.home, actor.errand.spot, actor.errand.scene, actor.face)
      deep.push(pose)
      standsAt[key] = pose.x
      moving = true
      continue
    }
    const tossing = actor.handoff !== undefined && frame >= actor.handoff.at && frame < actor.leftAt!
    const reacting = actor.cue !== undefined && frame - actor.cue.at < CUE_FRAMES
    moving ||= at.walking || tossing || reacting || actor.pending !== undefined || (actor.leftAt !== null && frame < actor.leftAt)
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
      const scroll = tossScroll(frame - actor.handoff!.at, actor.home + 6, kruxX + CATCH_X, actor.handoff!.flight)
      if (scroll !== null) scrolls.push(scroll)
      const caught = caughtScroll(frame - actor.handoff!.at, actor.handoff!.flight, kruxX)
      if (caught !== null) scrolls.push(caught)
    }
    // W marszu niesie to, co wziął ze stanowiska; kumpel do Kruxa niesie zwój.
    const bringing = actor.handoff !== undefined && frame < actor.handoff.at
    if (at.walking && (bringing || (actor.pending !== undefined && actor.from !== stage))) {
      const load = carried(bringing ? 'read' : actor.worked, at.x, actor.home > at.x)
      if (load !== null) loads.push(load)
    }
    placed.push({ rows, x: at.x, walking: at.walking })
  }
  // Zegar stoi, gdy płótno nieruchome i nikt nie maszeruje.
  const saidId = props.bubble === null ? '' : `${props.bubble.key}:${props.bubble.text}`
  const speech = state.said?.id === saidId ? state.said : { id: saidId, at: frame }
  const typing = props.bubble !== null && (frame - speech.at + 1) * 3 < Math.min(40, graphemes(props.bubble.text).length)
  const idle = props.still || (frozen && !moving && !typing)
  if (changed || idle !== state.idle || speech !== state.said || state.reduced !== props.still) {
    surface.setState({ frame, actors, idle, said: speech, reduced: props.still, snoozing: idle ? state.snoozing : false, ...(laid ? { laidAt: frame } : state.laidAt === undefined ? {} : { laidAt: state.laidAt }) })
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
  // Podłoga urosła pod orkiem: palenisko staje dopiero, gdy nikt nie ma go pod nogami.
  const hearthFree = hearth && placed.every(orc => orc.x >= floorStart(true))
  const grid =
    props.variant === 'pane'
      ? dress(krux === undefined ? frameGrid(frame, 'pane') : trackGrid(krux.track, frame, 'pane', krux.mood, frozen), 'Krux')
      : stageGrid([...(hearthFree ? [hearthProp(frame)] : []), ...placed, ...loads, ...flying], stage)
  const width = Math.max(canvasColumns(slots, true), stage)
  // Pokój czuje to, co Krux: zawał sypie pyłem, smród czerwieni pochodnie, zielone je rozpala.
  const absent = MATES.filter(mate => !props.orcs.some(orc => orc.face === mate))
  const felt = krux?.cue !== undefined && frame - krux.cue.at < CUE_FRAMES ? { kind: krux.cue.kind, age: frame - krux.cue.at } : null
  const scene = room ? paint(deep.reduce<string[]>((back, orc) => paint(back, orc.rows, orc.x, orc.y), roomGrid(width, frame, hearth, { feel: felt, alive: !frozen, red: props.red === true, seals: props.seals ?? 0, absent })), grid, 0, 6) : grid
  const { Box, Text } = surface.elements
  const lines = runsOf(scene, props.scale)
  const said = props.variant === 'band' ? props.bubble : null
  const speaker = said === null ? undefined : actors[said.key]
  // W głębi pomieszczenia ork nie gada: dymek zasłoniłby ścianę, do której właśnie idzie.
  // Wyjątek to wtręt po zdarzeniu: tego przemilczeć nie wolno.
  const quiet = speaker?.errand !== undefined && !(props.cues ?? []).some(cue => cue.key === said?.key && cue.kind !== 'handoff')
  const talking = said !== null && speaker !== undefined && speaker.leftAt === null && !quiet ? said : null
  const spoken = talking === null ? '' : props.still ? talking.text : graphemes(talking.text).slice(0, Math.max(1, (frame - speech.at + 1) * 3)).join('')
  const bubbleText = talking !== null ? bubbleAt(spoken, standsAt[said!.key] ?? speaker!.home, width) : props.variant === 'band' && props.bubbleRows ? [' ', ' ', ' '] : []
  const bubbleColor = talking === null ? {} : { color: SPEAKER_COLOR[talking.speaker] }
  const texts = (runs: readonly Run[]) =>
    runs.map(run =>
      Text({
        ...(run.color === undefined ? {} : { color: run.color }),
        ...(run.backgroundColor === undefined ? {} : { backgroundColor: run.backgroundColor }),
        children: [run.text],
      }),
    )
  const row = (key: string, children: ReturnType<typeof texts>) => Box({ key, flexDirection: 'row', children })
  if (room) {
    // Górne wiersze to ściana; dymek przecina je, a po bokach ściana biegnie dalej.
    return Box({
      flexDirection: 'column',
      children: lines.map((runs, y) => {
        const line = talking === null || y >= 3 ? null : bubbleText[y]!
        if (line === null) return row(y < 3 ? `bubble-${y}` : `row-${y - 3}`, texts(runs))
        const left = line.length - line.trimStart().length
        const right = width - (line.length - line.trimEnd().length)
        return row(`bubble-${y}`, [...texts(sliceRuns(runs, 0, left)), Text({ ...bubbleColor, children: [line.trim()] }), ...texts(sliceRuns(runs, right, width))])
      }),
    })
  }
  const bubble = bubbleText.map((line, y) => Box({ key: `bubble-${y}`, children: [Text({ ...bubbleColor, children: [line] })] }))
  return Box({ flexDirection: 'column', children: [...bubble, ...lines.map((runs, y) => row(`row-${y}`, texts(runs)))] })
}

export default Forge
