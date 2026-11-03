import type { ClientModule } from 'claude-code'

import type { KruxCue, KruxEvent, KruxMood, KruxSpeaker } from '../types'
import { CATCH_X, CUE_FRAMES, DUET_FRAMES, DUET_GAP, ERRAND_FRAMES, ERRAND_SWAP, FRAME_MS, ORC_GAP, ORC_WIDTH, RISE_FRAMES, SPEAKER_COLOR, bandColumns, behind, bubbleAt, canvasColumns, carried, catchStep, caughtScroll, depthSpot, dayPhase, doorX, dress, duetPose, episodeKit, errandPose, farPose, floorHomes, floorStart, frameGrid, hasHearth, hearthProp, nextEpisode, paint, roomGrid, runsOf, sameStation, sliceRuns, slotX, stageGrid, stationX, tossFlight, tossFrames, tossGrid, tossScroll, trackArrive, trackBare, trackDozing, trackDue, trackFace, trackGrid, trackKit, trackLooping, trackOff, trackOut, trackResume, trackStart, trackTo, walkerRows, withCatch, withCue, withEffort, withNap } from './sprites'
import type { DuetKind, Episode, Face, Far, Placed, Run, StageScene, Track } from './sprites'
import type { Frame } from './stage'
import { ROSTER } from './roster'
import { graphemes } from './terminal-text'

// Moduł powierzchni: rysuje Kruxa, kumpli i dymek na wątku rysującym, z własnym
// zegarem klatek. Hooks module podaje tylko, kto stoi, w jakiej scenie i humorze;
// podłogi, marszów między stanowiskami, drogi po rekwizyty i do kwater pilnuje płótno.

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
  // Stan roboty na ścianie: czerwone testy, liczba pieczęci, kamieni (zielone testy) i sztabek
  // (udane budowania) w tej sesji; `blessed`: były padłe, więc zielone przywołuje Skarbnika.
  red?: boolean
  seals?: number
  gems?: number
  ingots?: number
  blessed?: boolean
  // Trzy wiersze nad sceną na dymek, puste, gdy nikt nie mówi: wysokość stoi.
  bubbleRows: boolean
  orcs: ForgeOrc[]
  bubble: { key: string; text: string; speaker: KruxSpeaker } | null
  cues?: readonly KruxCue[]
  now?: number
}

// Wyprawa do ściany od klatki `at`: z kolumny `from` do `spot`, z powrotem od `back`. `took`
// odnosi (sprzęt sceny `of`), `brings` przynosi; `episode` rusza po powrocie, bez niego ork
// idzie dalej bez rekwizytu.
type Errand = { at: number; from: number; spot: number; back: number; took?: Frame; of?: StageScene; brings?: Frame; episode?: Episode }

// Ork na płótnie: `slot` to miejsce w składzie, `home` kolumna na podłodze. Marsz
// to `from` → `home` od klatki `enter`; `pending` to scena, która ruszy po dojściu.
// `leftAt` to klatka, w której rusza do kwater (do niej odkłada robotę), a bez pokoju
// za prawą krawędź. Co i od kiedy gra, trzyma oś czynności `track`.
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
  errand?: Errand
  leftAt: number | null
  // Dokąd idzie po robocie (drzwi kwater albo sztolnia); głębia, z której rusza, gdy kończy jeszcze w drodze.
  door?: number
  sink?: number
  // Marsz z głębi: tyle głębi na starcie, 1 to drzwi.
  rise?: number
  // Rekwizyt został na ziemi, bo ork poszedł na scenkę.
  left?: { rows: Frame; x: number }
  handoff?: { at: number; flight: number }
  cue?: { id: string; kind: KruxEvent; at: number }
  workAt?: number
  effortAt?: number
}

// Scenka: gość idzie do gospodarza, potem grają razem od klatki `at`. `at` null: gość w drodze.
type Duet = { host: string; guest: string; kind: DuetKind; at: number | null }

type ForgeState = { frame: number; actors: Record<string, Actor>; idle: boolean; reduced?: boolean; snoozing?: boolean; said?: { id: string; at: number }; laidAt?: number; duet?: Duet; duetAt?: number }

// Kolumny na klatkę w marszu: przez całą podłogę w około 3 s, także na szerokim terminalu.
const WALK_SPEED = 3
const WALK_FRAMES = 20

function walkSpeed(stage: number): number {
  return Math.max(WALK_SPEED, Math.ceil(stage / WALK_FRAMES))
}

// Droga między ścianą a podłogą trwa co najmniej tyle klatek, nawet gdy drzwi stoją tuż za orkiem.
const DEPTH_FRAMES = 8

function depthSpan(from: number, to: number, stage: number): number {
  return Math.max(DEPTH_FRAMES, Math.ceil(Math.abs(to - from) / walkSpeed(stage)))
}

// Po dojściu ork robi swoje co najmniej 3 s: szybkie Read, Bash, Read nie mogą gonić go po podłodze.
const STAY_FRAMES = 20

// Scenka najwyżej co 12 s i dopiero, gdy obaj 6 s stoją przy swojej robocie.
const DUET_EVERY = 80
const DUET_SETTLED = 40

// Para ze sporu walczy albo się kłóci, po zielonych przybija piątkę, inaczej podaje sobie sprzęt.
function duetKind(host: Actor, guest: Actor, seed: number): DuetKind {
  if (host.mood === 'proud' || guest.mood === 'proud') return 'highfive'
  const rivals = host.face !== 'Krux' && host.face !== null && ROSTER[host.face].spar === guest.face
  if (rivals) return seed % 2 === 0 ? 'fence' : 'argue'
  return seed % 3 === 0 ? 'fence' : 'pass'
}

// Kumpel dalej niż tyle kolumn od Kruxa podchodzi ze zwojem, zamiast rzucać przez cały pas.
const TOSS_REACH = 2 * (ORC_WIDTH + ORC_GAP)
// Gdzie staje kumpel, który podszedł: na prawo od dłoni Kruxa.
const HANDOFF_GAP = 12

// Gdzie stoi ork w danej klatce; `null`, gdy już wszedł do kwater albo zszedł za prawą krawędź.
function placeOf(actor: Actor, frame: number, stage: number): { x: number; walking: boolean; depth: number } | null {
  const { home, from } = actor
  const speed = walkSpeed(stage)
  if (actor.leftAt !== null && frame >= actor.leftAt) {
    if (actor.door === undefined) {
      const x = home + speed * (frame - actor.leftAt)
      return x >= stage ? null : { x, walking: true, depth: 0 }
    }
    const t = (frame - actor.leftAt) / depthSpan(home, actor.door, stage)
    const sink = actor.sink ?? 0
    return t >= 1 ? null : { x: Math.round(home + (actor.door - home) * t), walking: true, depth: sink + (1 - sink) * t }
  }
  if (actor.rise !== undefined) {
    const t = Math.min(1, Math.max(0, frame - actor.enter) / depthSpan(from, home, stage))
    return { x: Math.round(from + (home - from) * t), walking: frame >= actor.enter && t < 1, depth: actor.rise * (1 - t) }
  }
  const gone = speed * Math.max(0, frame - actor.enter)
  const x = from < home ? Math.min(home, from + gone) : Math.max(home, from - gone)
  return { x, walking: frame >= actor.enter && x !== home, depth: 0 }
}

// Slot zwalnia się, gdy ork rusza w marsz; póki schodzi do stójki, stoi w nim dalej.
function freeSlot(actors: Record<string, Actor>, slots: number, frame: number): number | null {
  const taken = new Set(Object.values(actors).filter(actor => actor.leftAt === null || frame < actor.leftAt).map(actor => actor.slot))
  for (let slot = 1; slot < slots; slot += 1) if (!taken.has(slot)) return slot
  return null
}

// Oddanie zwoju od klatki `at`: blisko Kruxa rzut, dalej kumpel najpierw podchodzi.
// Lot zależy od odległości od dłoni Kruxa, marsz do kwater rusza po nim. Kumpel, który
// już idzie po rekwizyt zostawiony przy scence (`walks`), rzuca stamtąd, bez drugiego marszu.
function tossFrom(actor: Actor, at: number, kruxX: number, stage: number, walks = false): Pick<Actor, 'handoff' | 'leftAt'> & Partial<Pick<Actor, 'home' | 'from' | 'enter'>> {
  if (walks) {
    const flight = tossFlight(actor.home - kruxX)
    return { handoff: { at, flight }, leftAt: at + tossFrames(flight) }
  }
  const gap = actor.home - kruxX
  const near = gap >= HANDOFF_GAP && gap <= TOSS_REACH
  const home = near ? actor.home : kruxX + HANDOFF_GAP
  const walk = Math.ceil(Math.abs(actor.home - home) / walkSpeed(stage))
  const flight = tossFlight(home - kruxX)
  return { home, from: actor.home, enter: at, handoff: { at: at + walk, flight }, leftAt: at + walk + tossFrames(flight) }
}

// Ork przerwał wyprawę, bo skończył robotę: nowego rekwizytu już nie bierze. Gdy niósł go
// w drodze powrotnej, zawraca z tej samej głębi i odnosi.
function recall(errand: Errand, frame: number): Errand {
  const t = frame - errand.at
  const { brings, episode, ...kept } = errand
  if (t < ERRAND_SWAP || brings === undefined) return { ...kept, back: errand.spot }
  return { at: frame - Math.max(0, ERRAND_FRAMES - t), from: errand.from, spot: errand.back, back: errand.back, took: brings, ...(episode === undefined ? {} : { of: episode.scene }) }
}

// Ork kończy: odkłada robotę, odnosi rekwizyt, potem idzie do kwater; w bezruchu znika od razu.
// Bez pokoju schodzi w prawo. Kończy tam, gdzie akurat stoi, więc marsz nie skacze do starego domu.
function depart(actor: Actor, frame: number, still: boolean, handoff: boolean, stage: number, kruxX: number, hearth: boolean, room: boolean): Actor | null {
  if (still) return null
  // Zwój oddaje się na nogach: kumpel w drodze z kwater najpierw dochodzi, potem rzuca.
  if (handoff && actor.rise !== undefined) {
    const { pending: _cut, ...walking } = actor
    const at = actor.enter + depthSpan(actor.from, actor.home, stage)
    const stopped: Actor = { ...walking, ...(room ? { door: doorX(actor.face, stage, hearth) } : {}) }
    return { ...stopped, ...tossFrom(stopped, at, kruxX, stage, true) }
  }
  const place = placeOf(actor, frame, stage)
  const x = place?.x ?? actor.home
  const track = trackOff(actor.track, frame, room)
  const { pending: _cut, rise: _up, errand: _gone, ...rest } = actor
  const stopped: Actor = { ...rest, track, home: x, from: x, ...(room ? { door: doorX(actor.face, stage, hearth) } : {}), ...(place !== null && place.depth > 0 ? { sink: place.depth } : {}) }
  // Z pustymi rękami i bez zejścia nie ma na co czekać: `since` to już nieaktualny plan marszu.
  let at = track.stops === 'bare' && track.leaving === null ? frame : Math.max(frame, track.since)
  if (actor.errand !== undefined) {
    // Ork w głębi najpierw wraca z wyprawy: skok z małej pozy byłby widać.
    const errand = recall(actor.errand, frame)
    stopped.errand = errand
    at = Math.max(at, errand.at + ERRAND_FRAMES)
  } else if (room) {
    const kit = actor.left?.rows ?? trackKit(track)
    if (kit !== undefined) {
      // Rekwizyt został na ziemi przy scence: najpierw do niego, potem z nim na ścianę.
      const home = actor.left?.x ?? x
      const spot = depthSpot(track.scene, stage, hearth)
      const walk = Math.ceil(Math.abs(home - x) / walkSpeed(stage))
      stopped.home = home
      stopped.enter = at
      stopped.errand = { at: at + walk, from: home, spot, back: spot, took: kit, of: track.scene }
      at += walk + ERRAND_FRAMES
    }
  }
  return { ...stopped, leftAt: at, ...(handoff ? tossFrom(stopped, at, kruxX, stage, actor.left !== undefined) : {}) }
}

// Krok chwytu Kruxa, gdy któryś kumpel właśnie rzuca mu zwój; `null`, gdy nikt.
function catchOf(actors: Record<string, Actor>, frame: number): number | null {
  for (const actor of Object.values(actors)) {
    const step = actor.handoff === undefined ? null : catchStep(frame - actor.handoff.at, actor.handoff.flight)
    if (step !== null) return step
  }
  return null
}

// Wyprawa po dojściu: odnosi rekwizyt spod nóg i bierze następny; `null`, gdy nic nie trzeba nosić.
// Inne stanowisko to dwa kursy: tu tylko odnosi, po nowy sprzęt pójdzie na miejscu.
function errandOf(actor: Actor, scene: StageScene, key: string, frame: number, stage: number, hearth: boolean): Errand | null {
  const episode = nextEpisode(actor.track, scene, key, frame)
  const took = actor.left?.rows ?? trackKit(actor.track)
  const kit = episodeKit(episode, actor.face)
  if (took === undefined && kit === undefined) return null
  const stays = took === undefined || sameStation(actor.track.scene, scene)
  const spot = depthSpot(took === undefined ? scene : actor.track.scene, stage, hearth)
  return { at: frame, from: actor.home, spot, back: stays ? depthSpot(scene, stage, hearth) : spot, ...(took === undefined ? {} : { took, of: actor.track.scene }), ...(stays ? { episode, ...(kit === undefined ? {} : { brings: kit }) } : {}) }
}

const Forge: ClientModule<ForgeProps, ForgeState> = (props, surface) => {
  const first = surface.state === undefined
  const state = surface.state ?? { frame: 0, actors: {}, idle: props.still || props.rest }
  const frame = state.frame
  const slots = props.variant === 'pane' ? 1 : Math.max(1, props.slots)
  const stage = Math.max(bandColumns(slots), props.variant === 'band' ? (props.floor ?? 0) : 0)
  // W bezruchu orkowie stoją w slotach od lewej krawędzi, więc palenisko nie ma gdzie stanąć.
  const hearth = props.variant === 'band' && !props.still && hasHearth(stage, slots)
  // Pokój stoi tam, gdzie pas ma wiersze na dymek: dymek kładzie się na ścianie.
  const room = props.variant === 'band' && props.bubbleRows
  // Tam, gdzie jest pokój, sprzęt chodzi przez ściany i drzwi, a nie przez płótno.
  const fetching = room && !props.still
  // Kumpel, który kończy w spoczynku, najpierw idzie do kwater; do tego czasu płótno żyje.
  // Krux w spoczynku odnosi robotę i podchodzi do paleniska: zegar staje, gdy gra już jego pętlę.
  const keys = new Set(props.orcs.map(orc => orc.key))
  const leaving = Object.entries(state.actors).some(([key, actor]) => actor.leftAt !== null || !keys.has(key))
  const watching = props.orcs.find(orc => orc.key === 'krux')?.scene
  const settled = (actor: Actor | undefined) => actor !== undefined && actor.pending === undefined && actor.errand === undefined && actor.leftAt === null && actor.rise === undefined && actor.track.scene === watching && trackLooping(actor.track, frame)
  const tucked = !fetching || first || settled(state.actors.krux)
  const frozen = props.still || (props.rest && !leaving && tucked)
  const actors: Record<string, Actor> = { ...state.actors }
  const kruxAt = () => (actors.krux === undefined ? 0 : (placeOf(actors.krux, frame, stage)?.x ?? actors.krux.home))
  let changed = first
  const present = new Set<string>()
  const born = new Set<string>()
  let duet = state.duet
  let duetAt = state.duetAt
  const inDuet = (key: string) => duet !== undefined && (duet.host === key || duet.guest === key)
  // Domy przestawiamy raz na klatkę: silnik odpina płótno po 3 zapisach stanu bez tyknięcia.
  const layout = state.laidAt !== frame
  let laid = false
  // Kto zszedł ze sceny, zaczyna schodzić przed rozdaniem slotów, więc czekający widzi, że slot się zwolni.
  const leave = (key: string, actor: Actor) => {
    const next = depart(actor, frame, props.still, props.variant === 'band' && (props.cues ?? []).some(cue => cue.key === key && cue.kind === 'handoff'), stage, kruxAt(), hearth, room)
    if (next === null) delete actors[key]
    else actors[key] = next
    changed = true
  }
  for (const [key, actor] of Object.entries(actors)) if (!keys.has(key) && (actor.leftAt === null || props.still)) leave(key, actor)
  // Kumpel jeszcze odkłada robotę albo rzuca zwój: Krux stoi i czeka, żeby go złapać.
  const expecting = Object.entries(actors).some(([key, actor]) => key !== 'krux' && actor.leftAt !== null && frame < actor.leftAt)
  for (const orc of props.orcs) {
    const prior = actors[orc.key]
    // Po zwężeniu płótna kumpel za ostatnim slotem bierze wolny slot i robi dalej; bez wolnego schodzi.
    let was = prior
    const outside = prior !== undefined && orc.key !== 'krux' && prior.slot >= slots
    const spare = outside ? freeSlot(actors, slots, frame) : null
    if (prior !== undefined && spare !== null) {
      was = { ...prior, slot: spare }
      changed = true
    }
    const lost = outside && spare === null
    // Wraca, zanim ruszył w marsz: zostaje w swoim slocie i wraca do roboty.
    if (prior !== undefined && prior.leftAt !== null && frame < prior.leftAt && !lost) {
      const { handoff: _kept, door: _none, sink: _deep, ...returned } = was!
      const x = placeOf(prior, frame, stage)?.x ?? prior.home
      was = { ...returned, leftAt: null, ...(fetching ? { pending: orc.scene, from: x, enter: Math.max(frame, prior.track.since) } : {}) }
    }
    if (was === undefined || was.leftAt !== null || lost) {
      const slot = orc.key === 'krux' ? 0 : freeSlot(actors, slots, frame)
      if (slot === null) {
        // Slot zwolni się, gdy ork, który w nim schodzi do stójki, ruszy w marsz: kumpel za krawędzią czeka.
        const settling = Object.values(actors).some(actor => actor.leftAt !== null && frame < actor.leftAt && actor.slot < slots)
        if (was !== undefined && settling) present.add(orc.key)
        continue
      }
      // Na starcie płótna i w bezruchu ork stoi od razu w slocie. W pokoju wychodzi z kwater albo
      // zawraca z drogi do nich; bez pokoju wbiega z prawej.
      const there = prior === undefined ? null : placeOf(prior, frame, stage)
      const rises = fetching && !first
      const door = doorX(orc.face, stage, hearth)
      const from = first || props.still ? slotX(slot) : rises ? (there?.x ?? door) : slot === 0 ? slotX(slot) : stage
      const fresh = rises && there === null && orc.face !== null
      const enter = frame + (fresh ? RISE_FRAMES : 0)
      // Scena rusza dopiero w slocie: marsz kończy się stójką, z niej wchodzi czynność.
      // Na starcie płótna ork już jest w pętli roboty.
      const track = trackStart(orc.scene, orc.key, enter, first ? 'in-loop' : Math.ceil((from - slotX(slot)) / WALK_SPEED), orc.face)
      // Wiek roboty przy montowaniu płótna: ork, który kuje od dawna, poci się od razu.
      const worked = orc.workAt === undefined ? null : Math.max(0, Math.floor(((props.now ?? orc.workAt) - orc.workAt) / FRAME_MS))
      actors[orc.key] = { face: orc.face, mood: orc.mood, track, slot, home: slotX(slot), enter, from, arrived: enter, worked: orc.scene, leftAt: null, workAt: orc.workAt, ...(worked === null ? {} : { effortAt: frame - worked }), ...(rises ? { rise: there?.depth ?? 1 } : {}) }
      born.add(orc.key)
      changed = true
    } else {
      let next = was
      // W drodze na stanowisko scena czeka na dojście; oś rusza dopiero tam.
      if (inDuet(orc.key)) {
        // Scenka trzyma orka: nowa scena rusza po niej.
      } else if (was.pending !== undefined) {
        const track = trackFace(was.track, orc.face, orc.key, frame, true)
        if (was.pending !== orc.scene || track !== was.track) next = { ...next, pending: orc.scene, track }
      } else if (fetching) {
        // Nowa scena albo koniec czynności: rekwizyt zostaje na ziemi, ork go odniesie.
        // Na zwój kumpla Krux czeka tam, gdzie stoi.
        const stale = orc.scene !== was.track.scene || orc.face !== was.track.face || trackDue(was.track, frame)
        const free = !(orc.key === 'krux' && expecting)
        if (stale && free && frame >= was.track.since && frame - was.arrived >= STAY_FRAMES) {
          const track = trackOff(was.track, frame, true)
          next = { ...next, track, pending: orc.scene, from: was.home, enter: Math.max(frame, track.since) }
        }
      } else {
        // Oś stoi przy rekwizycie, gdy pas spłaszczył się w trakcie wyprawy: robota rusza dalej.
        const steady = was.track.stops === undefined ? was.track : trackResume(was.track, frame)
        // Kumpel, który dostał imię, gra odtąd czynności swojego fachu.
        const track = trackFace(trackTo(steady, orc.scene, orc.key, frame, frozen), orc.face, orc.key, frame, frozen)
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
  // W pokoju ork nie rusza się spod swojego rekwizytu: najpierw musi go odnieść.
  const pinned = (actor: Actor) => frozen || actor.errand !== undefined || actor.left !== undefined || trackKit(actor.track) !== undefined || (duet !== undefined && (actors[duet.host] === actor || actors[duet.guest] === actor)) || (actor.pending === undefined && (fetching || frame - actor.arrived < STAY_FRAMES))
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
      const rising = actor.rise !== undefined
      const from = rising ? actor.from : actor.from === stage ? stage : home
      const track = first ? actor.track : trackStart(scenes.get(key)!, key, actor.enter, Math.ceil(Math.abs(from - home) / walkSpeed(stage)), actor.face)
      // Z kwater idzie po sprzęt, jak każdy po marszu: najpierw ściana, potem robota. Pamięć epizodów zostaje z nim.
      actors[key] = { ...actor, home, from, track: rising ? trackBare({ ...track, memory: actor.track.memory }) : track, ...(rising ? { pending: scenes.get(key)! } : {}) }
    } else if (props.still) {
      // Bezruch włączony w drodze: zegar stoi, więc marsz i wyprawa nie skończą się same.
      if (home !== actor.home || actor.from !== home || actor.pending !== undefined || actor.errand !== undefined || actor.rise !== undefined || actor.left !== undefined) {
        const { pending, errand: _stopped, rise: _up, left: _gone, ...rest } = actor
        actors[key] = { ...rest, home, from: home, enter: frame, ...(pending === undefined ? {} : { track: trackArrive(actor.track, nextEpisode(actor.track, pending, key, frame), frame), worked: pending }) }
        changed = true
      }
    } else if (layout && home !== actor.home && (!pinned(actor) || onFloor(actor.home) !== actor.home)) {
      laid = true
      // Przypięty ork nie ustępuje sąsiadowi, chyba że stoi poza podłogą albo na palenisku:
      // inaczej dom skakałby między rysunkami bez jednego tyknięcia zegara.
      const place = placeOf(actor, frame, stage)
      const x = place?.x ?? actor.home
      if (actor.pending !== undefined) {
        // Podłoga zwęziła się w trakcie wyprawy: ork wraca z głębi od razu i idzie na nowe miejsce.
        const { errand: _cut, left: _gone, rise: _up, ...rest } = actor
        actors[key] = { ...rest, home, from: x, enter: Math.max(frame, actor.enter), track: fetching && actor.track.stops !== undefined ? trackBare(actor.track) : actor.track, ...(place !== null && place.depth > 0 ? { rise: place.depth } : {}) }
      } else if (fetching) {
        // Rekwizyt zostaje na ziemi, ork go odniesie i dopiero wtedy ruszy.
        const track = trackOff(actor.track, frame, true)
        actors[key] = { ...actor, track, pending: scenes.get(key)!, from: x, enter: Math.max(frame, track.since) }
      } else {
        // Rekwizyt najpierw odjeżdża do stójki, dopiero potem ork rusza.
        const track = trackOff(actor.track, frame)
        actors[key] = { ...actor, track, home, from: x, enter: Math.max(frame, track.since), pending: scenes.get(key)! }
      }
      changed = true
    }
  }
  // Rekwizyt, który zostaje na ziemi, gdy ork idzie na scenkę.
  const groundKit = (actor: Actor, track: Track): Pick<Actor, 'left'> => {
    const kit = trackKit(track)
    return kit === undefined ? {} : { left: { rows: kit, x: actor.home } }
  }
  // Scenka: koniec albo rozpad wraca orków do roboty, gość odchodzi na swoje stanowisko.
  if (duet !== undefined) {
    const { host: hostKey, guest: guestKey } = duet
    const host = actors[hostKey]
    const guest = actors[guestKey]
    const done = duet.at !== null && frame - duet.at >= DUET_FRAMES
    if (done || props.still || host === undefined || guest === undefined || host.leftAt !== null || guest.leftAt !== null) {
      // Scenka odwołana, zanim gość doszedł: gospodarz robi dalej, nawet nie odłożył narzędzia.
      if (host !== undefined && host.leftAt === null && duet.at !== null) {
        const { left: _gone, ...rest } = host
        const scene = scenes.get(hostKey) ?? host.track.scene
        actors[hostKey] = { ...rest, track: host.track.stops === undefined ? trackArrive(host.track, nextEpisode(host.track, scene, hostKey, frame), frame) : trackResume(host.track, frame), arrived: frame }
      }
      if (guest !== undefined && guest.leftAt === null) {
        const scene = scenes.get(guestKey) ?? guest.track.scene
        const home = guest.left?.x ?? onFloor(stationX(scene, stage, hearth))
        const x = placeOf(guest, frame, stage)?.x ?? guest.home
        const { left: _gone, ...rest } = guest
        actors[guestKey] = props.still ? { ...rest, track: trackArrive(guest.track, nextEpisode(guest.track, scene, guestKey, frame), frame), home: x, from: x, arrived: frame } : { ...guest, home, from: x, enter: frame, pending: scene }
      }
      duet = undefined
      duetAt = frame
      changed = true
    } else if (duet.at === null && frame >= guest.enter && !placeOf(guest, frame, stage)?.walking) {
      // Gość doszedł: gospodarz odkłada robotę, scenka rusza, gdy obaj stoją.
      const track = trackOff(host.track, frame, fetching)
      actors[hostKey] = { ...host, track, ...groundKit(host, track) }
      duet = { ...duet, at: Math.max(frame, track.since) }
      changed = true
    }
  } else if (layout && !frozen && !props.still && frame - (duetAt ?? -DUET_EVERY) >= DUET_EVERY) {
    const free = standing.map(([key]) => key).filter(key => {
      const actor = actors[key]
      return actor !== undefined && !born.has(key) && actor.leftAt === null && actor.pending === undefined && actor.errand === undefined && frame - actor.arrived >= DUET_SETTLED
    })
    const guestKey = free.find(key => key !== 'krux')
    const hostKey = free.find(key => key !== guestKey)
    const host = hostKey === undefined ? undefined : actors[hostKey]
    const guest = guestKey === undefined ? undefined : actors[guestKey]
    if (host !== undefined && guest !== undefined && host.home + DUET_GAP <= stage - ORC_WIDTH) {
      const track = trackOff(guest.track, frame, fetching)
      const x = placeOf(guest, frame, stage)?.x ?? guest.home
      actors[guestKey!] = { ...guest, ...groundKit(guest, track), track, home: host.home + DUET_GAP, from: x, enter: Math.max(frame, track.since) }
      duet = { host: hostKey!, guest: guestKey!, kind: duetKind(host, guest, frame), at: null }
      laid = true
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
  const grounded: Placed[] = []
  const deep: Far[] = []
  const standsAt: Record<string, number> = {}
  let moving = false
  const caught = catchOf(actors, frame)
  const kruxX = kruxAt()
  // Ktoś w drzwiach kwater: stoją otworem.
  let doorway = false
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
    // Wstał i doszedł: dalej zwykły ork na podłodze.
    if (actor.rise !== undefined && frame >= actor.enter && !at.walking) {
      const { rise: _up, ...rest } = actor
      actor = rest
      actors[key] = actor
      changed = true
    }
    // Doszedł: najpierw sprzęt, potem robota; scena rusza tu, na stanowisku. Wolny ork, któremu
    // podłoga wyznaczyła inny dom, najpierw tam idzie: nie bierze sprzętu spod cudzych nóg.
    if (actor.pending !== undefined && actor.errand === undefined && !inDuet(key) && frame >= actor.enter && !at.walking && (pinned(actor) || (homes[key] ?? actor.home) === actor.home)) {
      const { pending, left, ...rest } = actor
      if (left !== undefined && pending === actor.track.scene) {
        // Wrócił do swojego rekwizytu: dalej ta sama czynność.
        actor = { ...rest, track: trackResume(actor.track, frame), arrived: frame }
      } else {
        const errand = fetching ? errandOf(actor, pending, key, frame, stage, hearth) : null
        actor = errand !== null ? { ...actor, errand } : { ...rest, track: trackArrive(actor.track, nextEpisode(actor.track, pending, key, frame), frame), arrived: frame, worked: pending }
      }
      actors[key] = actor
      changed = true
    }
    if (actor.errand !== undefined && frame - actor.errand.at >= ERRAND_FRAMES) {
      const { errand, pending, left: _gone, ...rest } = actor
      // Zdarzenie w głębi nie przepada: reakcja gra po powrocie.
      const cue = actor.cue !== undefined && actor.cue.at >= errand.at ? { cue: { ...actor.cue, at: frame } } : {}
      if (errand.episode !== undefined) actor = { ...rest, ...cue, from: actor.home, track: trackArrive(actor.track, errand.episode, frame, errand.brings !== undefined), arrived: frame, worked: errand.episode.scene }
      // Odniósł i idzie dalej: nowe stanowisko wyznaczy następny rysunek, stąd `enter` o klatkę później.
      else actor = { ...rest, ...cue, track: trackBare(actor.track), ...(pending === undefined ? {} : { pending, from: actor.home, enter: frame + 1 }) }
      actors[key] = actor
      changed = true
    }
    // Rekwizyt zostawiony na ziemi stoi, dopóki ork go nie odniesie.
    if (actor.left !== undefined && frame >= actor.track.since && (actor.errand === undefined || frame < actor.errand.at)) grounded.push(actor.left)
    // Scenka gra obu; rekwizyt między nimi liczy się od gospodarza.
    if (duet !== undefined && duet.at !== null && (key === duet.guest || (key === duet.host && frame >= duet.at))) {
      const pose = duetPose(duet.kind, Math.max(0, frame - duet.at))
      const rows = dress(key === duet.host ? pose.host : pose.guest, actor.face)
      placed.push({ rows, x: key === duet.host ? at.x : at.x - 2, walking: false })
      if (key === duet.host && pose.prop.length > 0) loads.push({ rows: [...pose.prop], x: at.x })
      moving = true
      continue
    }
    if (actor.errand !== undefined && frame >= actor.errand.at) {
      const pose = errandPose(frame - actor.errand.at, actor.errand.from, actor.errand, actor.face)
      deep.push(...pose)
      standsAt[key] = pose[pose.length - 1]!.x
      moving = true
      continue
    }
    // W głębi: wychodzi z kwater albo idzie między drzwiami a podłogą.
    if (at.depth > 0) {
      deep.push(farPose(at.depth, at.x, frame, actor.face))
      doorway ||= actor.face !== null && at.depth >= 0.7 && Math.abs(at.x - doorX(actor.face, stage, hearth)) <= 3
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
    if (at.walking && (bringing || (actor.pending !== undefined && actor.from !== stage && actor.rise === undefined))) {
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
    surface.setState({ frame, actors, idle, said: speech, reduced: props.still, snoozing: idle ? state.snoozing : false, ...(laid ? { laidAt: frame } : state.laidAt === undefined ? {} : { laidAt: state.laidAt }), ...(duet === undefined ? {} : { duet }), ...(duetAt === undefined ? {} : { duetAt }) })
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
      : stageGrid([...(hearthFree ? [hearthProp(frame)] : []), ...grounded, ...placed, ...loads, ...flying], stage)
  const width = Math.max(canvasColumns(slots, true), stage)
  // Pokój czuje to, co Krux: zawał sypie pyłem, smród czerwieni pochodnie, zielone je rozpala.
  // Sprzęt schodzi ze ściany, gdy ork sięgnie po niego w wyprawie, i wraca, gdy go odłoży.
  const taken = Object.values(actors).flatMap(actor => {
    const { errand } = actor
    if (errand === undefined || frame < errand.at) return [trackOut(actor.track)]
    return [frame - errand.at < ERRAND_SWAP ? (errand.of ?? null) : errand.brings === undefined ? null : (errand.episode?.scene ?? null)]
  }).filter(scene => scene !== null)
  const felt = krux?.cue !== undefined && frame - krux.cue.at < CUE_FRAMES ? { kind: krux.cue.kind, age: frame - krux.cue.at } : null
  const when = new Date(props.now ?? 43_200_000)
  const roomState = { feel: felt, alive: !frozen, red: props.red === true, seals: props.seals ?? 0, gems: props.gems ?? 0, ingots: props.ingots ?? 0, blessed: props.blessed === true, phase: dayPhase(when.getHours()), date: { month: when.getMonth() + 1, day: when.getDate() }, taken, door: doorway }
  const scene = room ? paint(deep.reduce<string[]>((back, orc) => paint(back, orc.rows, orc.x, orc.y), roomGrid(width, frame, hearth, roomState)), grid, 0, 6) : grid
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
