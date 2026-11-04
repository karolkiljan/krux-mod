import { expect, test } from 'claude-code/testing'

import { bandPlan } from '../hooks/band'
import Forge from '../hooks/forge'
import type { ForgeOrc, ForgeProps } from '../hooks/forge'
import { CALM } from '../hooks/mood'
import { MATES } from '../hooks/roster'
import { ACTS, DUET_FRAMES, SPEAKER_COLOR, WALL_MIN, DUET_GAP, ERRAND_FRAMES, PALETTE, RISE_FRAMES, TOAST_RETURN, carried, doorX, errandEnd, kitAt, kitReach, quartersDoor, routeOf, stationX, tossFrames, trackGrid } from '../hooks/sprites'
import type { Track } from '../hooks/sprites'
import { STAND, legAt, pad } from '../hooks/stage'
import { drawHeadless, headless, svgOf } from '../hooks/vector'

// Powierzchnia na niby: stan, zegar klatek i elementy jako zwykłe obiekty.
function surfaceOf() {
  let tick: (() => void) | null = null
  const surface = {
    state: undefined as unknown,
    setState(next: unknown) {
      surface.state = next
    },
    every(_ms: number, fn: () => void) {
      tick = fn
    },
    elements: { Box: (props: unknown) => ({ type: 'Box', props }), Text: (props: unknown) => ({ type: 'Text', props }) },
  }
  return { surface, tick: () => tick?.() }
}

type Seen = { frame: number; idle: boolean; duet?: { host: string; guest: string; kind: string; at: number | null; meet?: number }; duetAt?: number; snoozing?: boolean; actors: Record<string, { leftAt: number | null; slot: number; home: number; arrived: number; from: number; pending?: string; errand?: { at: number; from: number; spot: number; took?: readonly string[]; brings?: readonly string[]; start?: number; lead?: number }; enter: number; track: Track; handoff?: { at: number; flight: number }; cue?: { id: string; at: number; held?: true }; effortAt?: number; rise?: number; door?: number; left?: { x: number; rows?: readonly string[] } }> }

const KRUX: ForgeOrc = { key: 'krux', face: 'Krux', scene: 'lounge', mood: 'calm' }
const NIUCH: ForgeOrc = { key: 'a1', face: 'Niuch', scene: 'scout', mood: 'calm' }
// Kumpel zza drzwi kwater; Niuch, zwiad, mieszka w norze w sztolni.
const GROM: ForgeOrc = { key: 'a1', face: 'Grom', scene: 'hammer', mood: 'calm' }
const BAND: ForgeProps = { variant: 'band', scale: 1, still: false, rest: false, slots: 2, bubbleRows: true, orcs: [KRUX, NIUCH], bubble: null }
// Niski pas nie ma pokoju: bez ściany rekwizyt wysuwa się spod orka, a kumpel schodzi w prawo.
const FLAT: ForgeProps = { ...BAND, bubbleRows: false }

const draw = (props: ForgeProps, surface: ReturnType<typeof surfaceOf>['surface']) => Forge(props, surface as never)

test('a band too narrow for the wall keeps its bubble rows but stays flat, without the room', () => {
  for (const [floor, room] of [[WALL_MIN - 1, false], [WALL_MIN, true]] as const) {
    const { surface } = surfaceOf()
    const tree = draw({ ...BAND, floor, orcs: [{ ...KRUX, scene: 'hammer' }] }, surface) as unknown as { props: { children: unknown[] } }
    // Wysokość ta sama: trzy wiersze dymka i trzy wiersze podłogi albo sześć wierszy pokoju.
    expect([floor, tree.props.children.length]).toEqual([floor, 6])
    expect([floor, JSON.stringify(tree).includes(PALETTE.E!)]).toEqual([floor, room])
  }
})

test('an 80-column terminal keeps the room: the wall tightens its gaps instead of going flat', () => {
  // Podpis 28 kolumn i przerwa 2 zostawiają płótnu 50 kolumn z wierszami dymka.
  const plan = bandPlan({ working: true, activity: { scene: 'hammer', verb: 'Krux kuć', target: '' }, strikes: 1, total: 1, moods: CALM, members: [], held: null, waiting: false, still: false, now: 10_000, columns: 80, rows: 10, hasClient: true })
  const { surface } = surfaceOf()
  const tree = draw(plan.stage!.props, surface)
  expect([plan.stage!.props.floor, plan.stage!.props.bubbleRows, JSON.stringify(tree).includes(PALETTE.E!)]).toEqual([50, true, true])
})

test('a marching orc looks where it goes: a mate running in from the right has its pupils on the left', () => {
  const { surface, tick } = surfaceOf()
  draw({ ...FLAT, orcs: [{ ...KRUX, scene: 'hammer' }] }, surface)
  const joined: ForgeProps = { ...FLAT, orcs: [{ ...KRUX, scene: 'hammer' }, { key: 'a9', face: null, scene: 'read', mood: 'calm' }] }
  const looks: number[] = []
  for (let i = 0; i < 12; i += 1) {
    const pixels = pixelsOf(draw(joined, surface))
    // W marszu do slotu oś czeka: scena rusza w klatce `since`.
    const walking = (surface.state as Seen).frame < (surface.state as Seen).actors.a9!.track.since
    // Czubek głowy (4 piksele skóry) i lewe oko kumpla na prawo od slotu Kruxa.
    const crown = pixels[0]!.findIndex((cell, x) => x >= 24 && [0, 1, 2, 3].every(dx => pixels[0]![x + dx] === PALETTE.g))
    const eye = pixels[1]!.findIndex((cell, x) => x >= 24 && cell === PALETTE.r)
    if (walking && crown >= 0 && eye >= 0) looks.push(eye - crown)
    tick()
  }
  // Źrenice o piksel w lewo od czubka: patrzy w stronę marszu, nie w widza.
  expect(looks.length).toBeGreaterThan(0)
  expect(new Set(looks)).toEqual(new Set([-1]))
})

test('on a flat band the last mate done at rest marches out right and the clock runs until it is gone', () => {
  const { surface, tick } = surfaceOf()
  draw(FLAT, surface)
  const after: ForgeProps = { ...FLAT, rest: true, orcs: [{ ...KRUX, scene: 'hammer' }] }
  draw(after, surface)
  const leaving = surface.state as Seen
  expect(leaving.actors.a1?.leftAt).toBeGreaterThanOrEqual(leaving.frame)
  expect(leaving.idle).toBe(false)
  for (let step = 0; step < 40 && (surface.state as Seen).actors.a1 !== undefined; step += 1) {
    tick()
    draw(after, surface)
  }
  const done = surface.state as Seen
  expect(done.actors.a1).toBe(undefined)
  draw(after, surface)
  expect((surface.state as Seen).idle).toBe(true)
})

test('in the room a mate done carries the kit back, walks to the quarters and the clock runs until Krux settles by the hearth', () => {
  const { surface, tick } = surfaceOf()
  const start: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...GROM, scene: 'pick' }] }
  draw(start, surface)
  const after: ForgeProps = { ...FLOOR, rest: true, orcs: [{ ...KRUX, scene: 'watch' }] }
  draw(after, surface)
  const going = (surface.state as Seen).actors.a1!
  expect(going.errand?.took).toBeDefined()
  expect(going.leftAt).toBeGreaterThanOrEqual(going.errand!.at + ERRAND_FRAMES)
  expect(going.door).toBe(quartersDoor(140, true))
  expect((surface.state as Seen).idle).toBe(false)
  for (let step = 0; step < 150 && !(surface.state as Seen).idle; step += 1) {
    tick()
    draw(after, surface)
  }
  const done = surface.state as Seen
  expect(done.idle).toBe(true)
  expect(done.actors.a1).toBe(undefined)
  expect(done.actors.krux!.track.scene).toBe('watch')
  expect(done.actors.krux!.home).toBe(12)
  // Kumpel odpoczywa za drzwiami kwater: jego fartucha w pokoju już nie ma.
  expect(JSON.stringify(draw(after, surface))).not.toContain(PALETTE.M)
})

test('without a hearth Krux at rest never warms his hands at the empty edge, by the fire he does', { timeoutMs: 30_000 }, () => {
  // Czynność, którą Krux gra w danej klatce: ta sama trasa co w rysunku, z `cold` osi.
  const playing = (track: Track, frame: number) => {
    const route = routeOf(track.scene, track.face, track.seed, track.first, track.done, track.cold === true)
    return route.legs[legAt(route, Math.max(0, frame - track.since))]!.act.name
  }
  const acts = (floor: number, slots: number) => {
    const seen = new Set<string>()
    for (let n = 0; n < 16; n++) {
      const { surface, tick } = surfaceOf()
      const work: ForgeProps = { ...FLOOR, slots, floor, orcs: [{ ...KRUX, scene: 'test' }] }
      draw(work, surface)
      for (let i = 0; i < 10 + 7 * n; i++) { tick(); draw(work, surface) }
      const rest: ForgeProps = { ...work, rest: true, orcs: [{ ...KRUX, scene: 'watch' }] }
      for (let i = 0; i < 160; i++) {
        tick()
        draw(rest, surface)
        const { track } = (surface.state as Seen).actors.krux!
        if (track.scene === 'watch' && (surface.state as Seen).frame >= track.since) seen.add(playing(track, (surface.state as Seen).frame))
      }
    }
    return seen
  }
  // Pas obok Sztolni na terminalu 80 kolumn: dwa miejsca, bez paleniska.
  expect(acts(50, 2).has('grzanie rąk')).toBe(false)
  expect(acts(50, 2).size).toBeGreaterThan(0)
  expect(acts(140, 3).has('grzanie rąk')).toBe(true)
})

test('at rest the canvas mounts with Krux watching by the hearth and nobody else on the floor', () => {
  const { surface, tick } = surfaceOf()
  const rest: ForgeProps = { ...FLOOR, rest: true, orcs: [{ ...KRUX, scene: 'watch' }] }
  const tree = JSON.stringify(draw(rest, surface))
  const state = surface.state as Seen
  expect(state.idle).toBe(true)
  expect(state.actors.krux).toMatchObject({ home: 12 })
  expect(state.actors.krux!.track.scene).toBe('watch')
  for (const apron of ['N', 'M', 'P', 'O', 'L', 'T']) expect(tree).not.toContain(PALETTE[apron])
  tick()
  expect((surface.state as Seen).frame).toBe(0)
})

test('when the turn ends Krux takes his gear back and goes to watch by the hearth, then the clock stops', () => {
  const { surface, tick } = surfaceOf()
  const work: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'pick' }] }
  draw(work, surface)
  const rest: ForgeProps = { ...FLOOR, rest: true, orcs: [{ ...KRUX, scene: 'watch' }] }
  let stowed = false
  for (let i = 0; i < 160 && !(surface.state as Seen).idle; i++) {
    tick()
    draw(rest, surface)
    stowed ||= (surface.state as Seen).actors.krux!.errand?.took !== undefined
  }
  const krux = (surface.state as Seen).actors.krux!
  expect(stowed).toBe(true)
  expect((surface.state as Seen).idle).toBe(true)
  expect([krux.track.scene, krux.home, krux.pending]).toEqual(['watch', 12, undefined])
})

test('a call to work takes Krux from the hearth: he walks over, fetches the kit and only then starts', () => {
  const { surface, tick } = surfaceOf()
  draw({ ...FLOOR, rest: true, orcs: [{ ...KRUX, scene: 'watch' }] }, surface)
  const work: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'pick' }] }
  draw(work, surface)
  expect((surface.state as Seen).idle).toBe(false)
  let fetched = false
  for (let i = 0; i < 160 && ((surface.state as Seen).actors.krux!.pending !== undefined || (surface.state as Seen).actors.krux!.track.scene !== 'pick'); i++) {
    tick()
    draw(work, surface)
    fetched ||= (surface.state as Seen).actors.krux!.errand?.brings !== undefined
  }
  expect(fetched).toBe(true)
  const there = (surface.state as Seen).actors.krux!
  expect([there.track.scene, there.home, there.rise]).toEqual(['pick', 118, undefined])
})

test('a mate called to work comes out of the door of the quarters, not from the right edge, and goes back through it', () => {
  const { surface, tick } = surfaceOf()
  const alone: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }
  draw(alone, surface)
  const joined: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...GROM, scene: 'pick' }] }
  draw(joined, surface)
  const up = (surface.state as Seen).actors.a1!
  expect(up).toMatchObject({ rise: 1, from: quartersDoor(140, true), enter: (surface.state as Seen).frame + RISE_FRAMES })
  // Z progu idzie wzdłuż ściany prosto po kilof i dopiero z nim schodzi na podłogę.
  expect(up.errand).toMatchObject({ at: up.enter, start: quartersDoor(140, true) })
  expect(up.errand!.brings).toBeDefined()
  for (let i = 0; i < 100 && ((surface.state as Seen).actors.a1!.errand !== undefined || (surface.state as Seen).actors.a1!.pending !== undefined); i++) {
    tick()
    draw(joined, surface)
  }
  expect((surface.state as Seen).actors.a1!.track.scene).toBe('pick')
})

test('a mate called from the quarters walks along the wall to its gear and steps down once, with no yo-yo', () => {
  // Najniższy wiersz fartucha kumpla: im głębiej w pokoju, tym wyżej. Liczymy zawrócenia w pionie.
  const turns = (face: ForgeOrc['face'], scene: ForgeOrc['scene'], apron: string) => {
    const { surface, tick } = surfaceOf()
    draw({ ...FLOOR, orcs: [{ ...KRUX, scene: 'horn' }] }, surface)
    const joined: ForgeProps = { ...FLOOR, orcs: [KRUX, { key: 'a1', face, scene, mood: 'calm' }] }
    const ys: number[] = []
    for (let i = 0; i < 60; i++) {
      const rows = pixelsOf(draw(joined, surface)).map((row, y) => (row.includes(PALETTE[apron]!) ? y : -1)).filter(y => y >= 0)
      const mate = (surface.state as Seen).actors.a1!
      // Do pierwszej klatki roboty na stanowisku: potem głowa rusza się już z czynnością.
      if (mate.pending === undefined && mate.errand === undefined && mate.rise === undefined && (surface.state as Seen).frame >= mate.track.since) break
      if (rows.length > 0) ys.push(Math.max(...rows))
      tick()
    }
    expect(ys.length).toBeGreaterThan(10)
    let count = 0
    let way = 0
    for (let i = 1; i < ys.length; i++) {
      const step = Math.sign(ys[i]! - ys[i - 1]!)
      if (step !== 0 && way !== 0 && step !== way) count += 1
      if (step !== 0) way = step
    }
    return count
  }
  expect(turns('Grom', 'pick', 'M')).toBe(0)
  expect(turns('Ochra', 'read', 'O')).toBe(0)
  expect(turns('Niuch', 'scout', 'N')).toBe(0)
})

test('a mate who ends on its way along the wall turns back at the same depth; with a scroll it fetches nothing and throws from the floor', () => {
  // Fartuch Ochry: lewa kolumna i najniższy wiersz, także w głębi.
  const ochraAt = (tree: unknown) => {
    const cells = pixelsOf(tree).flatMap((row, y) => row.map((cell, x) => (cell === PALETTE.O ? [x, y] as const : null))).filter(cell => cell !== null)
    return cells.length === 0 ? null : { x: Math.min(...cells.map(([x]) => x)), y: Math.max(...cells.map(([, y]) => y)) }
  }
  for (const handoff of [false, true]) {
    const { surface, tick } = surfaceOf()
    draw({ ...FLOOR, orcs: [{ ...KRUX, scene: 'horn' }] }, surface)
    const joined: ForgeProps = { ...FLOOR, orcs: [KRUX, { key: 'a1', face: 'Ochra', scene: 'read', mood: 'calm' }] }
    let last = null as ReturnType<typeof ochraAt>
    for (let i = 0; i < 8; i++) { last = ochraAt(draw(joined, surface)); tick() }
    const { errand } = (surface.state as Seen).actors.a1!
    expect((surface.state as Seen).frame - errand!.at).toBeLessThan(errand!.lead!)
    const done: ForgeProps = { ...FLOOR, orcs: [KRUX], cues: handoff ? [{ key: 'a1', kind: 'handoff', until: 9_000_000 }] : [] }
    let jump = 0
    let thrown = false
    draw(done, surface)
    // Robota skończona: nowego rekwizytu już nie bierze, z drogi wzdłuż ściany schodzi z pustymi rękami.
    expect((surface.state as Seen).actors.a1!.errand?.brings).toBe(undefined)
    for (let i = 0; i < 160 && (surface.state as Seen).actors.a1 !== undefined; i++) {
      const at = ochraAt(draw(done, surface))
      if (at !== null && last !== null) jump = Math.max(jump, Math.abs(at.x - last.x), Math.abs(at.y - last.y) > 2 ? 99 : 0)
      if (at !== null) last = at
      const mate = (surface.state as Seen).actors.a1
      thrown ||= mate?.handoff !== undefined && (surface.state as Seen).frame >= mate.handoff.at
      tick()
    }
    // Bez skoku w bok ani w głąb, a zwój leci tylko wtedy, gdy był.
    expect([handoff, jump <= 4, thrown, (surface.state as Seen).actors.a1]).toEqual([handoff, true, handoff, undefined])
  }
})

test('a mate called from the quarters stands on the sill in the open door, then steps down into the room', () => {
  const { surface, tick } = surfaceOf()
  draw({ ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }, surface)
  const joined: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...GROM, scene: 'pick' }] }
  const door = quartersDoor(140, true)!
  const feet: number[] = []
  let tree = draw(joined, surface)
  for (let i = 0; i < 3; i += 1) {
    feet.push(pixelsOf(tree).findLastIndex(row => row.slice(door, door + 3).includes(PALETTE.G!)))
    tick()
    tree = draw(joined, surface)
  }
  // Próg to dolny wiersz ściany (5): kumpel stoi w ciemnym otworze, nie pod nim, i schodzi piksel na klatkę.
  expect(feet).toEqual([5, 5, 6])
})

test('a nameless orc comes out of the shaft and goes back into it: it has no cot', () => {
  const { surface } = surfaceOf()
  draw({ ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }, surface)
  draw({ ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { key: 'a9', face: null, scene: 'read', mood: 'calm' }] }, surface)
  const orc = (surface.state as Seen).actors.a9!
  expect(orc.from).toBe(doorX(null, 140, true))
  expect(orc.enter).toBe((surface.state as Seen).frame)
})

test('a tired act goes back to the wall and the next one comes from it in the same trip', () => {
  const { surface, tick } = surfaceOf()
  const work: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }
  draw(work, surface)
  const first = (surface.state as Seen).actors.krux!.track.first
  let swap: Seen['actors'][string]['errand']
  for (let i = 0; i < 260 && swap === undefined; i++) {
    tick()
    draw(work, surface)
    swap = (surface.state as Seen).actors.krux!.errand
  }
  expect(swap?.took).toBeDefined()
  expect(swap?.brings).toBeDefined()
  for (let i = 0; i < ERRAND_FRAMES + 1; i++) { tick(); draw(work, surface) }
  const krux = (surface.state as Seen).actors.krux!
  expect(krux.errand).toBe(undefined)
  expect(krux.track.first).toBe(first + 1)
})

test('a kit only moves with its orc: while the orc is on its way the floor in front of the station stays empty', () => {
  const { surface, tick } = surfaceOf()
  const at = (scene: ForgeOrc['scene']): ForgeProps => ({ ...FLOOR, orcs: [{ ...KRUX, scene }] })
  draw(at('hammer'), surface)
  let seen = 0
  for (let i = 0; i < 90; i++) {
    tick()
    const tree = draw(at('read'), surface) as unknown as { props: { children: { props: { key: string; children: { props: { color?: string; children: string[] } }[] } }[] } }
    const { frame, actors } = surface.state as Seen
    const errand = actors.krux!.errand
    if (errand === undefined || frame - errand.at < 7 || frame - errand.at >= 10) continue
    // Przy ścianie ork i jego rekwizyt stoją w głębi: za paleniskiem dolny wiersz podłogi jest pusty.
    const bottom = tree.props.children.find(row => row.props.key === 'row-2')!
    expect(bottom.props.children.flatMap(text => text.props.children).join('').slice(12).trim()).toBe('')
    seen += 1
  }
  expect(seen).toBeGreaterThan(0)
})

test('an orc pinned to its kit on a crowded floor still goes for the next one: pinned never means stuck', () => {
  const { surface, tick } = surfaceOf()
  const crowd = (scene: ForgeOrc['scene'], other: ForgeOrc['scene']): ForgeProps => ({ ...FLOOR, slots: 3, floor: 70, orcs: [{ ...KRUX, scene }, { ...NIUCH, scene: other }, { ...NIUCH, key: 'a2', face: 'Grom', scene: other }] })
  draw(crowd('read', 'read'), surface)
  for (let i = 0; i < 60; i++) { tick(); draw(crowd('read', 'read'), surface) }
  // Sąsiedzi stoją ciasno, więc podłoga liczy dla każdego inny dom, niż ma przy swoim rekwizycie.
  const later = crowd('test', 'pick')
  for (let i = 0; i < 260; i++) { tick(); draw(later, surface) }
  const { actors } = surface.state as Seen
  expect([actors.krux!.track.scene, actors.a1!.track.scene, actors.a2!.track.scene]).toEqual(['test', 'pick', 'pick'])
})

test('kit acts are real: every act with a tool names a kit, only body language has none', () => {
  const bare = Object.values(ACTS).flat().filter(act => act.kit === undefined).map(act => act.name).sort()
  expect(bare).toEqual(['drapanie', 'dumanie', 'grzanie rąk', 'kruk', 'nasłuch', 'przeciąganie', 'rozglądanie', 'wiatr', 'węszenie'].sort())
})

test('the guest of a scene leaves its kit on the floor and comes back to the same act', () => {
  const seen = surfaceOf()
  const pair2: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...NIUCH, scene: 'pick' }] }
  draw(pair2, seen.surface)
  const act = (seen.surface.state as Seen).actors.a1!.track.first
  for (let i = 0; i < 120 && (seen.surface.state as Seen).duet === undefined; i++) { seen.tick(); draw(pair2, seen.surface) }
  const guest = (seen.surface.state as Seen).actors.a1!
  expect(guest.left?.x).toBe(118)
  for (let i = 0; i < 160 && (seen.surface.state as Seen).actors.a1!.left !== undefined; i++) { seen.tick(); draw(pair2, seen.surface) }
  const back = (seen.surface.state as Seen).actors.a1!
  expect(back.home).toBe(118)
  expect(back.pending).toBe(undefined)
  expect(back.track.first).toBe(act)
})

test('with reduced motion a mate who is done leaves without a march', () => {
  const { surface } = surfaceOf()
  draw({ ...BAND, still: true }, surface)
  draw({ ...BAND, still: true, rest: true, orcs: [KRUX] }, surface)
  expect((surface.state as Seen).actors.a1).toBe(undefined)
  expect((surface.state as Seen).idle).toBe(true)
})

test('a mate who is done settles to the stand in its slot before the march, props never vanish in one frame', () => {
  const { surface, tick } = surfaceOf()
  draw(FLAT, surface)
  const after: ForgeProps = { ...FLAT, orcs: [KRUX] }
  draw(after, surface)
  const start = surface.state as Seen
  const out = start.actors.a1!
  // Na starcie płótna Niuch jest w pętli roboty, więc ma co odłożyć: marsz rusza później.
  expect(out.leftAt).toBeGreaterThan(start.frame)
  expect(out.track.leaving).not.toBe(null)
  // Ostatnia klatka przed marszem to stójka, bez rekwizytu.
  expect(trackGrid(out.track, out.leftAt! - 1, 'band', 'calm', false)).toEqual(pad(STAND))
  // Póki schodzi, slot jest jego: nowy kumpel nie wbiega mu na głowę.
  draw({ ...after, orcs: [KRUX, { ...NIUCH, key: 'a2' }] }, surface)
  expect((surface.state as Seen).actors.a2).toBe(undefined)
  for (let step = 0; step < 60 && (surface.state as Seen).actors.a1 !== undefined; step += 1) {
    tick()
    draw(after, surface)
  }
  expect((surface.state as Seen).actors.a1).toBe(undefined)
})

test('a mate who comes back while settling stays in its slot instead of running in again', () => {
  const { surface } = surfaceOf()
  draw(BAND, surface)
  draw({ ...BAND, orcs: [KRUX] }, surface)
  const before = (surface.state as Seen).actors.a1!
  draw(BAND, surface)
  const back = (surface.state as Seen).actors.a1!
  expect(back.leftAt).toBe(null)
  expect([back.slot, back.enter]).toEqual([before.slot, before.enter])
})

test('completion settles, hands off the scroll, then releases the slot for departure', () => {
  const { surface, tick } = surfaceOf()
  draw(FLAT, surface)
  const after: ForgeProps = { ...FLAT, rest: true, orcs: [KRUX], cues: [{ key: 'a1', kind: 'handoff', until: 4000 }] }
  draw(after, surface)
  const out = (surface.state as Seen).actors.a1!
  expect(out.handoff!.at).toBe(out.track.since)
  expect(out.leftAt!).toBeGreaterThan(out.handoff!.at + out.handoff!.flight)
  for (let i = 0; i < out.leftAt!; i++) { tick(); draw(after, surface) }
  expect((surface.state as Seen).idle).toBe(false)
})

test('a completion cue arriving during settling still hands the scroll over', () => {
  const { surface } = surfaceOf()
  draw(BAND, surface)
  draw({ ...BAND, orcs: [KRUX] }, surface)
  const at = (surface.state as Seen).actors.a1!.leftAt!
  draw({ ...BAND, orcs: [KRUX], cues: [{ key: 'a1', kind: 'handoff', until: 4000 }] }, surface)
  expect((surface.state as Seen).actors.a1!.handoff!.at).toBe(at)
  expect((surface.state as Seen).actors.a1!.leftAt!).toBeGreaterThan(at)
})

test('multiple reactions for one actor play the latest once across redraws', () => {
  const { surface, tick } = surfaceOf()
  const props: ForgeProps = { ...BAND, cues: [{ key: 'krux', kind: 'test-fail', until: 4000 }, { key: 'krux', kind: 'test-pass', until: 4100 }] }
  draw(props, surface)
  const start = (surface.state as Seen).actors.krux!.cue!
  expect(start.id).toBe('test-pass:4100')
  tick(); draw(props, surface)
  expect((surface.state as Seen).actors.krux!.cue!.at).toBe(start.at)
})

test('the same scene gets a fresh effort clock for each new tool call', () => {
  const { surface, tick } = surfaceOf()
  const props = { ...BAND, orcs: [{ ...KRUX, scene: 'read' as const, workAt: 0 }] }
  draw(props, surface)
  for (let i = 0; i < 70; i++) { tick(); draw(props, surface) }
  draw({ ...props, orcs: [{ ...props.orcs[0]!, workAt: 10500 }] }, surface)
  expect((surface.state as Seen).actors.krux!.effortAt).toBe(70)
})

test('effort counts only from a known start of work, even when the canvas mounts late', () => {
  const idle = surfaceOf()
  draw({ ...BAND, now: 1_000_000 }, idle.surface)
  expect((idle.surface.state as Seen).actors.krux!.effortAt).toBe(undefined)
  const busy = surfaceOf()
  draw({ ...BAND, now: 15_000, orcs: [{ ...KRUX, scene: 'read', workAt: 0 }] }, busy.surface)
  expect((busy.surface.state as Seen).actors.krux!.effortAt).toBe(-100)
})

test('idle typing finishes before freezing, then a nap arrives after thirty seconds', () => {
  const { surface, tick } = surfaceOf()
  const props: ForgeProps = { ...BAND, rest: true, orcs: [KRUX], bubble: { key: 'krux', text: 'Palenisko tlić spokojnie.', speaker: 'Krux' } }
  draw(props, surface)
  expect((surface.state as Seen).idle).toBe(false)
  for (let i = 0; i < 10; i++) { tick(); draw(props, surface) }
  expect((surface.state as Seen).idle).toBe(true)
  for (let i = 0; i < 200; i++) { tick(); draw(props, surface) }
  expect((surface.state as Seen).snoozing).toBe(true)
  draw({ ...props, rest: false }, surface)
  expect((surface.state as Seen).snoozing).toBe(false)
})

test('animated speech reveals complete emoji and combining graphemes on every tick', () => {
  for (const grapheme of ['🇵🇱', '👨‍👩‍👧‍👦', 'a\u0301']) {
    const { surface, tick } = surfaceOf()
    const props: ForgeProps = { ...BAND, rest: true, orcs: [KRUX], bubble: { key: 'krux', text: `ab${grapheme}cdef`, speaker: 'Krux' } }
    expect(JSON.stringify(draw(props, surface))).toContain(`["ab${grapheme}"]`)
    tick()
    expect(JSON.stringify(draw(props, surface))).toContain(`["ab${grapheme}cde"]`)
    tick()
    expect(JSON.stringify(draw(props, surface))).toContain(`["ab${grapheme}cdef"]`)
    expect((surface.state as Seen).idle).toBe(true)
  }
})

test('reduced motion freezes reactions, typing and naps as well as walking', () => {
  const { surface, tick } = surfaceOf()
  const props: ForgeProps = { ...BAND, still: true, rest: true, orcs: [KRUX], cues: [{ key: 'krux', kind: 'test-pass', until: 4000 }], bubble: { key: 'krux', text: 'Gotowe.', speaker: 'Krux' } }
  const before = draw(props, surface)
  // Zamrożone płótno nadal rysuje orka i cały dymek: pusty wynik równy sobie nie dowodzi bezruchu.
  expect(JSON.stringify(before)).toContain('Gotowe.')
  expect(JSON.stringify(before)).toMatch(/[▀▄█]/u)
  for (let i = 0; i < 240; i++) { tick(); draw(props, surface) }
  expect(draw(props, surface)).toEqual(before)
  expect((surface.state as Seen).frame).toBe(0)
})

const FLOOR: ForgeProps = { ...BAND, slots: 3, floor: 140, orcs: [{ ...KRUX, scene: 'hammer' }] }

test('a new station: Krux takes the old kit back to the wall, walks over and fetches the new one before he starts', () => {
  const { surface, tick } = surfaceOf()
  draw(FLOOR, surface)
  const before = (surface.state as Seen).actors.krux!
  expect(before.home).toBe(12)
  const mine: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'pick' }] }
  // Świeżo przy kowadle: 3 s zostaje na miejscu, szybkie narzędzia nie gonią go po podłodze.
  draw(mine, surface)
  expect((surface.state as Seen).actors.krux!.pending).toBe(undefined)
  for (let i = 0; i < 20; i++) { tick(); draw(mine, surface) }
  const going = (surface.state as Seen).actors.krux!
  expect(going.pending).toBe('pick')
  // Spod rekwizytu nie rusza: stanowisko zmieni dopiero z pustymi rękami.
  expect(going.home).toBe(12)
  const kinds: string[] = []
  for (let i = 0; i < 120 && (surface.state as Seen).actors.krux!.pending !== undefined; i++) {
    tick()
    draw(mine, surface)
    const { errand, home } = (surface.state as Seen).actors.krux!
    const kind = errand === undefined ? `podłoga ${home}` : errand.took !== undefined ? 'odnosi' : 'przynosi'
    if (kinds.at(-1) !== kind) kinds.push(kind)
  }
  expect(kinds).toEqual(['podłoga 12', 'odnosi', 'podłoga 12', 'podłoga 118', 'przynosi', 'podłoga 118'])
  const there = surface.state as Seen
  expect(there.actors.krux!.pending).toBe(undefined)
  expect(there.actors.krux!.track.scene).toBe('pick')
  expect(there.actors.krux!.track.setAt).toBe(there.frame)
})

test('a march never jumps the width of an orc: on a wide floor each frame moves at most four columns', () => {
  const { surface, tick } = surfaceOf()
  const wide: ForgeProps = { ...FLOOR, slots: 4, floor: 230 }
  draw(wide, surface)
  const trial: ForgeProps = { ...wide, orcs: [{ ...KRUX, scene: 'test' }] }
  const steps: number[] = []
  let last: number | null = null
  for (let i = 0; i < 160 && (surface.state as Seen).actors.krux!.track.scene !== 'test'; i++) {
    tick()
    const pixels = pixelsOf(draw(trial, surface))
    const krux = (surface.state as Seen).actors.krux!
    // Lewa krawędź skóry Kruxa na podłodze, tylko w marszu: nie w głębi i nie przy rekwizycie.
    const marching = krux.errand === undefined && krux.pending !== undefined && (surface.state as Seen).frame >= krux.enter && krux.from !== krux.home
    const xs = pixels.slice(6).map(row => row.findIndex((cell, x) => x >= 10 && cell === PALETTE.g)).filter(x => x >= 0)
    const at = xs.length === 0 ? null : Math.min(...xs)
    if (marching && at !== null && last !== null && at !== last) steps.push(Math.abs(at - last))
    last = marching ? at : null
  }
  // Ork ma 6 pikseli: krok najwyżej 4, więc kolejne sylwetki na siebie zachodzą.
  expect(Math.max(...steps)).toBeLessThanOrEqual(4)
  expect(steps.length).toBeGreaterThan(10)
})

test('a render without a tick settles: the floor never writes state in a loop', () => {
  const { surface } = surfaceOf()
  const props: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'pick' }, { ...NIUCH, scene: 'torch' }, { ...NIUCH, key: 'a2', face: 'Młot', scene: 'pick' }] }
  draw(props, surface)
  draw(props, surface)
  const settled = surface.state
  draw(props, surface)
  expect(surface.state).toBe(settled)
  draw({ ...props, floor: 80 }, surface)
  const narrowed = surface.state
  draw({ ...props, floor: 80 }, surface)
  expect(surface.state).toBe(narrowed)
  expect(settled).toBeDefined()
})

test('with reduced motion everybody keeps a slot and nobody walks', () => {
  const { surface } = surfaceOf()
  const still: ForgeProps = { ...FLOOR, still: true, orcs: [{ ...KRUX, scene: 'pick' }] }
  draw(still, surface)
  expect((surface.state as Seen).actors.krux!.home).toBe(0)
  draw({ ...still, orcs: [{ ...KRUX, scene: 'read' }] }, surface)
  expect((surface.state as Seen).actors.krux).toMatchObject({ home: 0, from: 0 })
  expect((surface.state as Seen).actors.krux!.pending).toBe(undefined)
})

test('a mate far from Krux walks up with the scroll before handing it over', () => {
  const { surface, tick } = surfaceOf()
  const working: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...NIUCH, scene: 'pick' }] }
  draw(working, surface)
  expect((surface.state as Seen).actors.a1!.home).toBe(118)
  const done: ForgeProps = { ...FLOOR, cues: [{ key: 'a1', kind: 'handoff', until: 4000 }] }
  draw(done, surface)
  const out = (surface.state as Seen).actors.a1!
  expect(out.home).toBe(24)
  expect(out.from).toBe(118)
  expect(out.handoff!.at).toBeGreaterThan(out.track.since)
  const at = out.handoff!.at
  while ((surface.state as Seen).frame < at) { tick(); draw(done, surface) }
  const beside = JSON.stringify(draw(done, surface))
  expect(beside).toMatch(/[▀▄█]/u)
  expect((surface.state as Seen).actors.a1!.leftAt).toBeGreaterThan(at)
})

test('nobody stands in the hearth: a floor that grew moves Krux off it, reduced motion draws no hearth', () => {
  const { surface, tick } = surfaceOf()
  const narrow: ForgeProps = { ...FLOOR, floor: 70 }
  draw(narrow, surface)
  expect((surface.state as Seen).actors.krux!.home).toBe(0)
  draw(FLOOR, surface)
  for (let i = 0; i < 80 && (surface.state as Seen).actors.krux!.pending !== undefined; i++) { tick(); draw(FLOOR, surface) }
  expect((surface.state as Seen).actors.krux!.pending).toBe(undefined)
  expect((surface.state as Seen).actors.krux!.home).toBe(12)
  const still = surfaceOf()
  const frozen = JSON.stringify(draw({ ...FLOOR, still: true }, still.surface))
  expect(frozen).not.toContain(PALETTE.k)
})

test('wall gear stands behind everyone, with no filled background, and the bubble keeps every row its width', () => {
  const { surface } = surfaceOf()
  const props: ForgeProps = { ...FLOOR, bubble: { key: 'krux', text: 'Gotowe.', speaker: 'Krux' }, rest: true }
  const tree = draw(props, surface) as unknown as { props: { children: { props: { key: string; children: { props: { children: string[] } }[] } }[] } }
  const rows = tree.props.children
  expect(rows.map(row => row.props.key)).toEqual(['bubble-0', 'bubble-1', 'bubble-2', 'row-0', 'row-1', 'row-2'])
  for (const row of rows) expect([...row.props.children.flatMap(text => text.props.children).join('')].length).toBe(140)
  expect(JSON.stringify(tree)).toContain(PALETTE.E)
})

test('a low band stays flat: no room where no rows are left for it', () => {
  const { surface } = surfaceOf()
  expect(JSON.stringify(draw({ ...FLOOR, bubbleRows: false }, surface))).not.toContain(PALETTE.E)
})

test('the busiest drawing on a wide terminal keeps well under the engine bounds', () => {
  const { surface, tick } = surfaceOf()
  const orc = (key: string, face: ForgeOrc['face'], scene: ForgeOrc['scene']): ForgeOrc => ({ key, face, scene, mood: 'proud' })
  const props: ForgeProps = { ...FLOOR, slots: 4, floor: 300, orcs: [orc('krux', 'Krux', 'hammer'), orc('a1', 'Niuch', 'torch'), orc('a2', 'Grom', 'build'), orc('a3', 'Lont', 'tear')], bubble: { key: 'krux', text: 'Hmm, długi dymek nad kuźnią hordy.', speaker: 'Krux' } }
  let longest = 0
  for (let i = 0; i < 60; i++) {
    longest = Math.max(longest, JSON.stringify(draw(props, surface)).length)
    tick()
  }
  expect(longest).toBeLessThan(50_000)
})

test('every scene goes for its gear: each change of station means a trip to the wall', () => {
  const { surface, tick } = surfaceOf()
  const at = (scene: ForgeOrc['scene']): ForgeProps => ({ ...FLOOR, orcs: [{ ...KRUX, scene }] })
  draw(at('hammer'), surface)
  let trips = 0
  let was = false
  for (const scene of ['pick', 'read', 'test'] as const) {
    for (let i = 0; i < 140 && (surface.state as Seen).actors.krux!.track.scene !== scene; i++) {
      tick()
      draw(at(scene), surface)
      const out = (surface.state as Seen).actors.krux!.errand !== undefined
      if (out && !was) trips += 1
      was = out
    }
    expect((surface.state as Seen).actors.krux!.track.scene).toBe(scene)
    for (let i = 0; i < 21; i++) { tick(); draw(at(scene), surface) }
  }
  expect(trips).toBeGreaterThanOrEqual(5)
})

test('an orc deep in the room has no bubble, so the wall he walks to stays in sight', () => {
  const { surface, tick } = surfaceOf()
  const say = { key: 'krux', text: 'Kilof iść.', speaker: 'Krux' as const }
  const at = (scene: ForgeOrc['scene']): ForgeProps => ({ ...FLOOR, bubble: say, orcs: [{ ...KRUX, scene }] })
  draw(at('hammer'), surface)
  for (let i = 0; i < 80 && (surface.state as Seen).actors.krux!.errand === undefined; i++) { tick(); draw(at('pick'), surface) }
  expect((surface.state as Seen).actors.krux!.errand).toBeDefined()
  expect(JSON.stringify(draw(at('pick'), surface))).not.toContain('Kilof')
})

const untilErrand = (at: (scene: ForgeOrc['scene']) => ForgeProps, draws: { surface: ReturnType<typeof surfaceOf>['surface']; tick: () => void }) => {
  draw(at('hammer'), draws.surface)
  for (let i = 0; i < 90 && (draws.surface.state as Seen).actors.krux!.errand === undefined; i++) { draws.tick(); draw(at('pick'), draws.surface) }
  expect((draws.surface.state as Seen).actors.krux!.errand).toBeDefined()
}
const onFloor = (scene: ForgeOrc['scene']): ForgeProps => ({ ...FLOOR, orcs: [{ ...KRUX, scene }] })

test('reduced motion switched on deep in the room brings the orc back at once', () => {
  const seen = surfaceOf()
  untilErrand(onFloor, seen)
  draw({ ...onFloor('read'), still: true }, seen.surface)
  const krux = (seen.surface.state as Seen).actors.krux!
  expect(krux.errand).toBe(undefined)
  expect(krux.pending).toBe(undefined)
  expect(krux).toMatchObject({ home: 0, from: 0 })
  expect(krux.track.scene).toBe('read')
})

test('reduced motion switched on mid-march stops the walk even when the slot is the destination', () => {
  const { surface, tick } = surfaceOf()
  const low: ForgeProps = { ...FLOOR, slots: 3, floor: 70, orcs: [{ ...KRUX, scene: 'pick' }] }
  draw(low, surface)
  const back: ForgeProps = { ...low, orcs: [{ ...KRUX, scene: 'hammer' }] }
  for (let i = 0; i < 80 && (surface.state as Seen).actors.krux!.home !== 0; i++) { tick(); draw(back, surface) }
  expect((surface.state as Seen).actors.krux!.home).toBe(0)
  expect((surface.state as Seen).actors.krux!.from).toBeGreaterThan(0)
  draw({ ...back, still: true }, surface)
  expect((surface.state as Seen).actors.krux).toMatchObject({ home: 0, from: 0 })
  expect((surface.state as Seen).actors.krux!.pending).toBe(undefined)
})

test('a floor that changes under a mate on the way out moves its door, and the mate walks there without a jump', () => {
  // Fartuch Groma na płótnie: lewa kolumna, także w głębi.
  const gromAt = (tree: unknown) => {
    const xs = pixelsOf(tree).map(row => row.indexOf(PALETTE.M!)).filter(x => x >= 0)
    return xs.length === 0 ? null : Math.min(...xs)
  }
  // `wait`: tyknięcia po końcu roboty, zanim podłoga zwęzi się ze 140; 70 to już zejście w głąb.
  // Podłoga 60 przy dwóch miejscach ma wolniejszy marsz i drzwi tylko w sztolni.
  const cases = [
    { wait: 2, slots: 3, floor: 80, door: quartersDoor(80, false)!, quarters: true },
    { wait: 70, slots: 3, floor: 80, door: quartersDoor(80, false)!, quarters: true },
    { wait: 2, slots: 2, floor: 60, door: doorX('Grom', 60, true), quarters: false },
  ]
  for (const { wait, slots, floor, door, quarters } of cases) {
    const seen = surfaceOf()
    const work: ForgeProps = { ...FLOOR, slots, orcs: [KRUX, { ...GROM, scene: 'pick' }] }
    draw(work, seen.surface)
    for (let i = 0; i < 150; i++) { seen.tick(); draw(work, seen.surface) }
    const done: ForgeProps = { ...FLOOR, slots, orcs: [KRUX], cues: [{ key: 'a1', kind: 'handoff', until: 9_000_000 }] }
    draw(done, seen.surface)
    const leftAt = (seen.surface.state as Seen).actors.a1!.leftAt!
    let before: number | null = null
    for (let i = 0; i < wait; i++) { seen.tick(); before = gromAt(draw(done, seen.surface)) }
    expect([wait, (seen.surface.state as Seen).frame >= leftAt]).toEqual([wait, wait > 2])
    const narrow: ForgeProps = { ...done, floor }
    // Kto stał za nową krawędzią, wchodzi na płótno marszem: skok liczy się tylko między widocznymi klatkami.
    let last = before !== null && before < floor ? before : null
    let jump = 0
    let open = false
    const throwing = new Set<number | null>()
    for (let i = 0; i < 160 && (seen.surface.state as Seen).actors.a1 !== undefined; i++) {
      const tree = draw(narrow, seen.surface)
      const state = seen.surface.state as Seen
      expect(state.actors.a1?.door ?? door).toBe(door)
      const x = gromAt(tree)
      if (x !== null && last !== null) jump = Math.max(jump, Math.abs(x - last))
      if (x !== null) last = x
      // Plan liczy marsz tempem z chwili decyzji: rzut zaczyna się, gdy Grom już stoi.
      const toss = state.actors.a1?.handoff
      if (toss !== undefined && state.frame >= toss.at && state.frame < toss.at + tossFrames(toss.flight)) throwing.add(x)
      open ||= [1, 2, 3, 4].every(y => pixelsOf(tree)[y]![door + 1] === PALETTE.I)
      seen.tick()
    }
    // Ostatni krok Groma kończy się w nowych drzwiach (kwatery się przed nim otwierają), nie w ścianie ani za krawędzią.
    expect([floor, wait, jump <= 4, open, Math.abs(last! - door) <= 1, throwing.size]).toEqual([floor, wait, true, quarters, true, wait > 2 ? 0 : 1])
  }
})

test('a floor narrowed at the end of an errand keeps the orc on the canvas', () => {
  const seen = surfaceOf()
  untilErrand(onFloor, seen)
  for (let i = 0; i < ERRAND_FRAMES - 2; i++) { seen.tick(); draw(onFloor('pick'), seen.surface) }
  draw({ ...onFloor('pick'), floor: 80 }, seen.surface)
  for (let i = 0; i < 30; i++) {
    seen.tick()
    draw({ ...onFloor('pick'), floor: 80 }, seen.surface)
    const { from, home } = (seen.surface.state as Seen).actors.krux!
    expect(Math.min(from, home)).toBeGreaterThanOrEqual(0)
    expect(home).toBeLessThanOrEqual(80 - 22)
  }
})

test('a narrowed floor sends the orc to stow its kit first, and an orc past the new edge walks in at once', () => {
  const seen = surfaceOf()
  draw(onFloor('pick'), seen.surface)
  for (let i = 0; i < 60; i++) { seen.tick(); draw(onFloor('pick'), seen.surface) }
  const narrow: ForgeProps = { ...onFloor('pick'), floor: 130 }
  let prior = (seen.surface.state as Seen).actors.krux!
  const vanished: number[] = []
  for (let i = 0; i < ERRAND_FRAMES + 60; i++) {
    draw(narrow, seen.surface)
    const krux = (seen.surface.state as Seen).actors.krux!
    // Rekwizyt z ziemi nie znika w jednej klatce: odnosi go wyprawa.
    if (prior.track.stops === 'kit' && krux.track.stops === 'bare' && prior.errand === undefined && krux.errand === undefined) vanished.push((seen.surface.state as Seen).frame)
    prior = krux
    seen.tick()
  }
  expect(vanished).toEqual([])
  const krux = (seen.surface.state as Seen).actors.krux!
  expect([krux.home, krux.track.scene, krux.pending]).toEqual([stationX('pick', 130, true), 'pick', undefined])
  // Krux za nową krawędzią (170 → 80) wchodzi od niej od razu, zamiast sekundami iść zza płótna.
  const far = surfaceOf()
  const wide: ForgeProps = { ...onFloor('pick'), slots: 4, floor: 170 }
  draw(wide, far.surface)
  for (let i = 0; i < 60; i++) { far.tick(); draw(wide, far.surface) }
  let shown = -1
  for (let i = 0; i < 20 && shown < 0; i++) {
    const pixels = pixelsOf(draw({ ...wide, floor: 80 }, far.surface))
    if (pixels.slice(6).some(row => row.slice(12).includes(PALETTE.g!))) shown = i
    far.tick()
  }
  expect(shown).toBeGreaterThanOrEqual(0)
  expect(shown).toBeLessThanOrEqual(2)
})

test('a band that flattens mid-errand ends it instead of losing the orc', () => {
  const seen = surfaceOf()
  untilErrand(onFloor, seen)
  draw({ ...onFloor('pick'), bubbleRows: false }, seen.surface)
  expect((seen.surface.state as Seen).actors.krux!.errand).toBe(undefined)
  expect(JSON.stringify(draw({ ...onFloor('pick'), bubbleRows: false }, seen.surface))).toContain(PALETTE.g)
})

test('a load comes from where the orc stood, not from where it is going', () => {
  const { surface, tick } = surfaceOf()
  const at = (scene: ForgeOrc['scene']): ForgeProps => ({ ...FLOOR, floor: 200, orcs: [{ ...KRUX, scene }] })
  draw(at('hammer'), surface)
  let carriedSteel = false
  for (let i = 0; i < 60; i++) {
    tick()
    const tree = JSON.stringify(draw(at('pick'), surface))
    const krux = (surface.state as Seen).actors.krux!
    if (krux.pending !== undefined && krux.errand === undefined && (surface.state as Seen).frame > krux.enter) carriedSteel ||= tree.includes(PALETTE.R!)
  }
  expect(carriedSteel).toBe(true)
  expect(carried('hammer', 0, true)).toMatchObject({ x: 6 })
})

test('a mate running in fetches its gear from the back before it starts', () => {
  const { surface, tick } = surfaceOf()
  draw(FLOOR, surface)
  const joined: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...NIUCH, scene: 'pick' }] }
  draw(joined, surface)
  // Z nory w głębi sztolni idzie prosto po kilof, zanim zacznie: bez zejścia na podłogę.
  expect((surface.state as Seen).actors.a1!.errand?.brings).toBeDefined()
  for (let i = 0; i < 70 && ((surface.state as Seen).actors.a1!.errand !== undefined || (surface.state as Seen).actors.a1!.pending !== undefined); i++) {
    tick()
    draw(joined, surface)
  }
  expect((surface.state as Seen).actors.a1!.track.scene).toBe('pick')
})

test('a mate who finishes deep in the room comes back before marching off, without a jump', () => {
  const { surface, tick } = surfaceOf()
  draw(FLOOR, surface)
  const joined: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...NIUCH, scene: 'pick' }] }
  draw(joined, surface)
  // Z nory doszedł wzdłuż ściany do kilofa: kończy w głębi, przy sprzęcie.
  const atGear = () => { const { errand } = (surface.state as Seen).actors.a1!; return errand !== undefined && (surface.state as Seen).frame - errand.at >= (errand.lead ?? 0) }
  for (let i = 0; i < 70 && !atGear(); i++) { tick(); draw(joined, surface) }
  const errand = (surface.state as Seen).actors.a1!.errand!
  const done: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }
  draw(done, surface)
  expect((surface.state as Seen).actors.a1!.leftAt).toBeGreaterThanOrEqual(errand.at + errandEnd(errand))
  for (let i = 0; i < 70 && (surface.state as Seen).actors.a1 !== undefined; i++) { tick(); draw(done, surface) }
  expect((surface.state as Seen).actors.a1).toBe(undefined)
})

test('an event deep in the room still speaks, and the reaction plays once the orc is back at work', () => {
  const seen = surfaceOf()
  untilErrand(onFloor, seen)
  const at = (seen.surface.state as Seen).actors.krux!.errand!.at
  const hit: ForgeProps = { ...onFloor('pick'), bubble: { key: 'krux', text: 'Zawał! Komenda paść.', speaker: 'Krux' }, cues: [{ key: 'krux', kind: 'zawał', until: 9_000_000 }] }
  seen.tick()
  expect(JSON.stringify(draw(hit, seen.surface))).toContain('Za')
  // W głębi i w marszu reakcji nie widać: zdarzenie czeka, aż Krux stanie przy sztolni z kilofem.
  expect((seen.surface.state as Seen).actors.krux!.cue).toMatchObject({ held: true })
  expect((seen.surface.state as Seen).actors.krux!.cue!.at).toBeGreaterThan(at)
  for (let i = 0; i < 160 && (seen.surface.state as Seen).actors.krux!.cue!.held === true; i++) { seen.tick(); draw(hit, seen.surface) }
  const krux = (seen.surface.state as Seen).actors.krux!
  expect([krux.track.scene, krux.pending, krux.errand, krux.cue!.held]).toEqual(['pick', undefined, undefined, undefined])
  expect(krux.cue!.at).toBe((seen.surface.state as Seen).frame)
})

test('a commit right after a change of station plays its reaction when Krux reaches the forge', () => {
  // Z drogą i bez zdarzenia: reakcja to różnica pikseli na podłodze.
  const run = (cued: boolean) => {
    const seen = surfaceOf()
    draw(onFloor('write'), seen.surface)
    for (let i = 0; i < 40; i++) { seen.tick(); draw(onFloor('write'), seen.surface) }
    const floors: string[] = []
    for (let i = 0; i < 140; i++) {
      seen.tick()
      const props: ForgeProps = { ...onFloor('seal'), cues: cued && i >= 5 ? [{ key: 'krux', kind: 'commit', until: 9_000_000 }] : [] }
      floors.push(JSON.stringify(pixelsOf(draw(props, seen.surface)).slice(6)))
    }
    return { floors, krux: (seen.surface.state as Seen).actors.krux! }
  }
  const cued = run(true)
  const plain = run(false)
  // `git commit` przestawia scenę na pieczęć: Krux odnosi zwój, idzie do kuźni, przynosi pieczęć i dopiero tam się cieszy.
  expect(cued.krux.track.scene).toBe('seal')
  expect(cued.krux.cue!.held).toBe(undefined)
  expect(cued.floors.filter((floor, i) => floor !== plain.floors[i]).length).toBeGreaterThanOrEqual(12)
})

test('reduced motion drops a reaction that waits on the way, so it never plays late after motion returns', () => {
  const seen = surfaceOf()
  untilErrand(onFloor, seen)
  const hit: ForgeProps = { ...onFloor('pick'), cues: [{ key: 'krux', kind: 'zawał', until: 9_000_000 }] }
  seen.tick()
  draw(hit, seen.surface)
  expect((seen.surface.state as Seen).actors.krux!.cue!.held).toBe(true)
  draw({ ...hit, still: true }, seen.surface)
  expect((seen.surface.state as Seen).actors.krux!.cue!.held).toBe(undefined)
  // Ruch wraca, Krux idzie do stołu: przy dojściu stare zdarzenie już nie gra.
  const table: ForgeProps = { ...hit, orcs: [{ ...KRUX, scene: 'read' }] }
  for (let i = 0; i < 200 && ((seen.surface.state as Seen).actors.krux!.track.scene !== 'read' || (seen.surface.state as Seen).actors.krux!.pending !== undefined); i++) { seen.tick(); draw(table, seen.surface) }
  const state = seen.surface.state as Seen
  expect(state.actors.krux!.track.scene).toBe('read')
  expect(state.frame - state.actors.krux!.cue!.at).toBeGreaterThanOrEqual(14)
})

test('homes move once a frame at most, so a crowded table cannot trip the engine', () => {
  const { surface } = surfaceOf()
  const orc = (key: string, scene: ForgeOrc['scene']): ForgeOrc => ({ key, face: null, scene, mood: 'calm' })
  draw({ ...FLOOR, slots: 4, floor: 94, orcs: [{ ...KRUX, scene: 'read' }, orc('a', 'read'), orc('b', 'read')] }, surface)
  let writes = 0
  const write = surface.setState
  surface.setState = next => { writes += 1; write(next) }
  const crowd: ForgeProps = { ...FLOOR, slots: 4, floor: 94, orcs: [{ ...KRUX, scene: 'pick' }, orc('a', 'pick'), orc('b', 'read'), orc('c', 'read')] }
  for (let i = 0; i < 5; i++) draw(crowd, surface)
  expect(writes).toBeLessThanOrEqual(2)
})

// Pary orków, które stoją przy robocie (bez marszu, wyprawy, wstawania i scenki) bliżej niż ork z przerwą.
const crowded = (state: Seen): string[] => {
  const keys = Object.keys(state.actors).filter(key => {
    const actor = state.actors[key]!
    return actor.leftAt === null && actor.pending === undefined && actor.errand === undefined && actor.rise === undefined && state.duet?.host !== key && state.duet?.guest !== key
  })
  return keys.flatMap((a, i) => keys.slice(i + 1).filter(b => Math.abs(state.actors[a]!.home - state.actors[b]!.home) < 24).map(b => `${state.frame}:${a}/${b}`))
}

test('nobody walks onto a pinned mate: Krux going to the forge stands beside the mate already there', () => {
  const seen = surfaceOf()
  const at = (krux: ForgeOrc['scene'], mates: ForgeOrc[]): ForgeProps => ({ ...FLOOR, orcs: [{ ...KRUX, scene: krux }, ...mates] })
  draw(at('read', []), seen.surface)
  for (let i = 0; i < 40; i++) { seen.tick(); draw(at('read', []), seen.surface) }
  for (let i = 0; i < 80; i++) { seen.tick(); draw(at('read', [GROM]), seen.surface) }
  const overlaps: string[] = []
  for (let i = 0; i < 300; i++) {
    seen.tick()
    draw(at('hammer', [GROM]), seen.surface)
    overlaps.push(...crowded(seen.surface.state as Seen))
  }
  expect(overlaps).toEqual([])
  // Krux doszedł do kuźni i robi obok kumpla.
  expect((seen.surface.state as Seen).actors.krux!.track.scene).toBe('hammer')
})

test('two mates working by Krux waiting for the horde never stand one on another', () => {
  const seen = surfaceOf()
  draw({ ...FLOOR, orcs: [{ ...KRUX, scene: 'horn' }] }, seen.surface)
  for (let i = 0; i < 10; i++) { seen.tick(); draw({ ...FLOOR, orcs: [{ ...KRUX, scene: 'horn' }] }, seen.surface) }
  const overlaps: string[] = []
  for (const [grom, mlot] of [['hammer', 'pick'], ['read', 'pick'], ['hammer', 'hammer'], ['pick', 'read'], ['hammer', 'build']] as const) {
    const props: ForgeProps = { ...FLOOR, orcs: [KRUX, { ...GROM, scene: grom }, { key: 'a2', face: 'Młot', scene: mlot, mood: 'calm' }] }
    for (let i = 0; i < 150; i++) {
      seen.tick()
      draw(props, seen.surface)
      overlaps.push(...crowded(seen.surface.state as Seen))
    }
  }
  expect(overlaps).toEqual([])
})

test('the hearth waits until nobody has it underfoot', () => {
  const { surface, tick } = surfaceOf()
  draw({ ...FLOOR, floor: 70 }, surface)
  expect(JSON.stringify(draw(FLOOR, surface))).not.toContain(PALETTE.k)
  for (let i = 0; i < 16; i++) { tick(); draw(FLOOR, surface) }
  expect(JSON.stringify(draw(FLOOR, surface))).toContain(PALETTE.k)
})

const pair: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'read' }, { ...NIUCH, scene: 'pick' }] }
const untilDuet = (seen: ReturnType<typeof surfaceOf>, props: ForgeProps) => {
  draw(props, seen.surface)
  for (let i = 0; i < 120 && (seen.surface.state as Seen).duet === undefined; i++) { seen.tick(); draw(props, seen.surface) }
  expect((seen.surface.state as Seen).duet).toBeDefined()
}

test('two settled orcs meet for a scene, play it side by side, then the guest walks back', () => {
  const seen = surfaceOf()
  untilDuet(seen, pair)
  const state = () => seen.surface.state as Seen
  expect(state().duet).toMatchObject({ host: 'krux', guest: 'a1' })
  // Gość staje za rekwizytem gospodarza, nie na nim: gospodarz wychodzi zza niego do `meet`.
  const meet = state().duet!.meet ?? state().actors.krux!.home
  expect(state().actors.a1!.home).toBe(meet + DUET_GAP)
  for (let i = 0; i < 80 && state().duet?.at === null; i++) { seen.tick(); draw(pair, seen.surface) }
  const started = state().duet!.at!
  expect(started).toBeGreaterThanOrEqual(state().frame)
  for (let i = 0; i < DUET_FRAMES + 30 && state().duet !== undefined; i++) { seen.tick(); draw(pair, seen.surface) }
  expect(state().duet).toBe(undefined)
  expect(state().duetAt).toBeGreaterThanOrEqual(started + DUET_FRAMES)
  expect(state().actors.a1!.pending).toBe('pick')
  for (let i = 0; i < 40 && state().actors.a1!.pending !== undefined; i++) { seen.tick(); draw(pair, seen.surface) }
  expect(state().actors.a1!.home).toBeGreaterThan(meet + DUET_GAP)
})

test('the guest of a scene stands past the kit of the host, and without free floor between them there is no scene', () => {
  const kitEdge = (state: Seen, key: string) => {
    const left = state.actors[key]!.left
    return left === undefined ? state.actors[key]!.home : left.x + kitReach(left.rows as string[])
  }
  for (const props of [pair, { ...FLOOR, slots: 4, floor: 170, orcs: [{ ...KRUX, scene: 'hammer' }, { ...GROM, scene: 'build' }, { key: 'a2', face: 'Młot', scene: 'test', mood: 'calm' }] }] as ForgeProps[]) {
    const seen = surfaceOf()
    draw(props, seen.surface)
    let scenes = 0
    let last: number | null = null
    for (let i = 0; i < 1500; i++) {
      seen.tick()
      draw(props, seen.surface)
      const state = seen.surface.state as Seen
      if (state.duet === undefined || state.duet.at === null || state.duet.at === last) continue
      last = state.duet.at
      scenes += 1
      // Gospodarz wyszedł zza rekwizytu, gość stoi na wolnej podłodze za nim, nie w kowadle ani w tablicy.
      expect(state.actors[state.duet.guest]!.home).toBeGreaterThanOrEqual(kitEdge(state, state.duet.host))
      expect(state.actors[state.duet.guest]!.home - state.actors[state.duet.host]!.home).toBe(DUET_GAP)
    }
    expect(scenes).toBeGreaterThan(3)
  }
  // Krux przy kowadle i Grom przy kuźni obok: między kowadłem a Gromem nie ma wolnej podłogi.
  const tight: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...GROM, scene: 'build' }] }
  const seen = surfaceOf()
  draw(tight, seen.surface)
  for (let i = 0; i < 600; i++) {
    seen.tick()
    draw(tight, seen.surface)
    expect((seen.surface.state as Seen).duet).toBe(undefined)
  }
})

test('a mate who ends in a scene next to Krux throws the scroll at once, and Krux catches it before he walks back', () => {
  const seen = surfaceOf()
  draw(pair, seen.surface)
  for (let i = 0; i < 300 && !((seen.surface.state as Seen).duet?.at != null && (seen.surface.state as Seen).frame >= (seen.surface.state as Seen).duet!.at! + 6); i++) { seen.tick(); draw(pair, seen.surface) }
  const end = (seen.surface.state as Seen).frame
  expect((seen.surface.state as Seen).duet).toMatchObject({ host: 'krux', guest: 'a1' })
  draw({ ...pair, orcs: [{ ...KRUX, scene: 'read' }], cues: [{ key: 'a1', kind: 'handoff', until: 9_000_000 }] }, seen.surface)
  const state = seen.surface.state as Seen
  const mate = state.actors.a1!
  // Rzut z miejsca scenki, krótki lot; po rekwizyt kumpel idzie dopiero potem.
  expect(mate.handoff!.at).toBe(end)
  expect(mate.handoff!.flight).toBeLessThanOrEqual(4)
  expect(mate.enter).toBeGreaterThanOrEqual(mate.handoff!.at + tossFrames(mate.handoff!.flight))
  // Krux wraca do swojego rekwizytu ze zwojem w dłoni, nie w trakcie lotu.
  expect(state.actors.krux!.enter).toBeGreaterThanOrEqual(mate.handoff!.at + tossFrames(mate.handoff!.flight))
  // Póki łapie, stoi z pustymi rękami: rekwizyt leży na ziemi raz, nie drugi raz w jego klatce.
  const kit = pad(state.actors.krux!.left!.rows as string[])
  const krux = state.actors.krux!.from
  const near = (pixels: (string | null)[][]) => kit.flatMap((row, y) => [...row].filter((cell, dx) => cell !== '.' && pixels[6 + y]![krux + dx] === PALETTE[cell])).length
  for (let i = 0; i < tossFrames(mate.handoff!.flight); i++) {
    seen.tick()
    expect(near(pixelsOf(draw({ ...pair, orcs: [{ ...KRUX, scene: 'read' }], cues: [{ key: 'a1', kind: 'handoff', until: 9_000_000 }] }, seen.surface)))).toBeLessThan(5)
  }
})

test('a guest who finishes mid-scene frees the host, and the host returns to work', () => {
  const seen = surfaceOf()
  untilDuet(seen, pair)
  const alone: ForgeProps = { ...pair, orcs: [{ ...KRUX, scene: 'read' }] }
  draw(alone, seen.surface)
  seen.tick()
  draw(alone, seen.surface)
  const state = seen.surface.state as Seen
  expect(state.duet).toBe(undefined)
  expect(state.actors.krux!.track.scene).toBe('read')
})

test('reduced motion ends a scene at once, with everybody in a slot', () => {
  const seen = surfaceOf()
  untilDuet(seen, pair)
  draw({ ...pair, still: true }, seen.surface)
  const state = seen.surface.state as Seen
  expect(state.duet).toBe(undefined)
  expect(state.actors.a1!.pending).toBe(undefined)
})

test('a lone orc never starts a scene', () => {
  const { surface, tick } = surfaceOf()
  draw(onFloor('read'), surface)
  for (let i = 0; i < 200; i++) { tick(); draw(onFloor('read'), surface) }
  expect((surface.state as Seen).duet).toBe(undefined)
})

const untilScene = (seen: ReturnType<typeof surfaceOf>, props: ForgeProps, scene: ForgeOrc['scene'], key = 'krux') => {
  for (let i = 0; i < 160 && ((seen.surface.state as Seen).actors[key]?.track.scene !== scene || (seen.surface.state as Seen).actors[key]?.pending !== undefined); i++) { seen.tick(); draw(props, seen.surface) }
  expect((seen.surface.state as Seen).actors[key]!.track.scene).toBe(scene)
}

test('after a march the next act starts where the orc stands, not where it came from', () => {
  const seen = surfaceOf()
  draw(FLOOR, seen.surface)
  const mine: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'pick' }] }
  untilScene(seen, mine, 'pick')
  for (let i = 0; i < 260 && (seen.surface.state as Seen).actors.krux!.pending === undefined; i++) { seen.tick(); draw(mine, seen.surface) }
  const krux = (seen.surface.state as Seen).actors.krux!
  expect(krux.pending).toBe('pick')
  expect([krux.from, krux.home]).toEqual([118, 118])
})

test('a far mate stows the kit from its own station and only then walks the scroll over', () => {
  const { surface } = surfaceOf()
  draw({ ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...NIUCH, scene: 'pick' }] }, surface)
  draw({ ...FLOOR, cues: [{ key: 'a1', kind: 'handoff', until: 4000 }] }, surface)
  const out = (surface.state as Seen).actors.a1!
  expect(out.errand?.from).toBe(118)
  expect([out.from, out.home]).toEqual([118, 24])
  expect(out.enter).toBeGreaterThanOrEqual(out.errand!.at + ERRAND_FRAMES)
})

test('a job that ends on the way leaves the gear on the wall: no kit reappears at the orc', () => {
  const seen = surfaceOf()
  const start: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...NIUCH, scene: 'read' }] }
  draw(start, seen.surface)
  const moved: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...NIUCH, scene: 'pick' }] }
  // Niuch odniósł rekwizyt i idzie przez podłogę.
  for (let i = 0; i < 120 && !((seen.surface.state as Seen).actors.a1!.track.stops === 'bare' && (seen.surface.state as Seen).actors.a1!.from !== (seen.surface.state as Seen).actors.a1!.home); i++) { seen.tick(); draw(moved, seen.surface) }
  draw({ ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }, seen.surface)
  const out = (seen.surface.state as Seen).actors.a1!
  expect(out.track.stops).toBe('bare')
  expect(out.errand).toBe(undefined)
  expect(out.leftAt).toBe((seen.surface.state as Seen).frame)
})

test('scenes do not restart the thirty seconds of an act: two orcs keep changing acts', () => {
  const seen = surfaceOf()
  const pairAtWork: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'read' }, { ...NIUCH, scene: 'pick' }] }
  draw(pairAtWork, seen.surface)
  const first = (seen.surface.state as Seen).actors.krux!.track.first
  let duets = 0
  let was = false
  for (let i = 0; i < 1000; i++) {
    seen.tick()
    draw(pairAtWork, seen.surface)
    const on = (seen.surface.state as Seen).duet !== undefined
    if (on && !was) duets += 1
    was = on
  }
  expect(duets).toBeGreaterThan(3)
  expect((seen.surface.state as Seen).actors.krux!.track.first - first).toBeGreaterThanOrEqual(2)
})

test('a mate who ends on the way out goes straight back through the door; with a scroll it first walks over', () => {
  const quiet = surfaceOf()
  const alone: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }
  const joined: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...NIUCH, scene: 'pick' }] }
  draw(alone, quiet.surface)
  draw(joined, quiet.surface)
  for (let i = 0; i < 6; i++) { quiet.tick(); draw(joined, quiet.surface) }
  draw(alone, quiet.surface)
  expect((quiet.surface.state as Seen).actors.a1!.leftAt).toBe((quiet.surface.state as Seen).frame)
  const loud = surfaceOf()
  draw(alone, loud.surface)
  draw(joined, loud.surface)
  for (let i = 0; i < 6; i++) { loud.tick(); draw(joined, loud.surface) }
  draw({ ...alone, cues: [{ key: 'a1', kind: 'handoff', until: 4000 }] }, loud.surface)
  const walking = (loud.surface.state as Seen).actors.a1!
  expect(walking.rise).toBe(1)
  expect(walking.handoff!.at).toBeGreaterThan((loud.surface.state as Seen).frame)
})

test('Krux waits for the last scroll where he stands: no new gear and no sleep while it flies', () => {
  const seen = surfaceOf()
  const waiting: ForgeProps = { ...FLOOR, orcs: [KRUX, { ...NIUCH, scene: 'pick' }] }
  draw(waiting, seen.surface)
  for (let i = 0; i < 30; i++) { seen.tick(); draw(waiting, seen.surface) }
  const done: ForgeProps = { ...FLOOR, rest: true, orcs: [{ ...KRUX, scene: 'hammer' }], cues: [{ key: 'a1', kind: 'handoff', until: 9_000_000 }] }
  draw(done, seen.surface)
  for (let i = 0; i < 200; i++) {
    const { actors, frame } = seen.surface.state as Seen
    if (actors.a1 === undefined || frame >= actors.a1.leftAt!) break
    expect([actors.krux!.pending, actors.krux!.errand, actors.krux!.leftAt]).toEqual([undefined, undefined, null])
    seen.tick()
    draw(done, seen.surface)
  }
  const watch: ForgeProps = { ...done, orcs: [{ ...KRUX, scene: 'watch' }] }
  for (let i = 0; i < 160 && !(seen.surface.state as Seen).idle; i++) { seen.tick(); draw(watch, seen.surface) }
  expect((seen.surface.state as Seen).actors.krux!.track.scene).toBe('watch')
})

test('a mate past the last slot after the stage narrows takes a free one and keeps working', () => {
  const seen = surfaceOf()
  const orc = (key: string, face: ForgeOrc['face'], scene: ForgeOrc['scene']): ForgeOrc => ({ key, face, scene, mood: 'calm' })
  const three: ForgeProps = { ...FLOOR, slots: 3, floor: 110, orcs: [{ ...KRUX, scene: 'hammer' }, orc('a1', 'Niuch', 'pick'), orc('a2', 'Grom', 'read')] }
  draw(three, seen.surface)
  for (let i = 0; i < 90; i++) { seen.tick(); draw(three, seen.surface) }
  const before = (seen.surface.state as Seen).actors.a2!
  expect(before.slot).toBe(2)
  // Grom bywa w scence z Niuchem: wtedy jego stanowisko to rekwizyt zostawiony na ziemi.
  const station = before.left?.x ?? before.home
  const narrowed: ForgeProps = { ...three, slots: 2, orcs: [{ ...KRUX, scene: 'hammer' }, orc('a2', 'Grom', 'read')] }
  // Niuch jeszcze odkłada robotę w swoim slocie; Grom czeka przy swojej, bez wracania na pryczę.
  for (let i = 0; i < 60 && (seen.surface.state as Seen).actors.a2!.slot !== 1; i++) {
    draw(narrowed, seen.surface)
    expect((seen.surface.state as Seen).actors.a2!.rise).toBe(undefined)
    seen.tick()
  }
  draw(narrowed, seen.surface)
  const after = (seen.surface.state as Seen).actors.a2!
  expect(after.slot).toBe(1)
  expect([after.home, after.rise, after.leftAt]).toEqual([station, undefined, null])
})

test('a band flattened on the way back to the wall returns the orc to work, it does not freeze it', () => {
  const seen = surfaceOf()
  const work: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }
  draw(work, seen.surface)
  for (let i = 0; i < 260 && (seen.surface.state as Seen).actors.krux!.errand === undefined; i++) { seen.tick(); draw(work, seen.surface) }
  const flat = { ...work, bubbleRows: false }
  draw(flat, seen.surface)
  for (let i = 0; i < 4; i++) { seen.tick(); draw(flat, seen.surface) }
  const krux = (seen.surface.state as Seen).actors.krux!
  expect(krux.errand).toBe(undefined)
  expect(krux.pending).toBe(undefined)
  expect(krux.track.stops).toBe(undefined)
})

test('a scene called off before the guest arrives leaves the host at work, tool in hand', () => {
  const seen = surfaceOf()
  draw(pair, seen.surface)
  for (let i = 0; i < 120 && (seen.surface.state as Seen).duet === undefined; i++) { seen.tick(); draw(pair, seen.surface) }
  expect((seen.surface.state as Seen).duet?.at).toBe(null)
  const before = (seen.surface.state as Seen).actors.krux!.track
  draw({ ...pair, orcs: [{ ...KRUX, scene: 'read' }] }, seen.surface)
  seen.tick()
  draw({ ...pair, orcs: [{ ...KRUX, scene: 'read' }] }, seen.surface)
  expect((seen.surface.state as Seen).duet).toBe(undefined)
  expect((seen.surface.state as Seen).actors.krux!.track).toBe(before)
})

test('a reaction by the hearth at rest plays to its end before the clock stops', () => {
  const { surface, tick } = surfaceOf()
  const rest: ForgeProps = { ...FLOOR, rest: true, orcs: [{ ...KRUX, scene: 'watch' }] }
  draw(rest, surface)
  expect((surface.state as Seen).idle).toBe(true)
  const hit: ForgeProps = { ...rest, cues: [{ key: 'krux', kind: 'test-fail', until: 9_000_000 }] }
  draw(hit, surface)
  expect((surface.state as Seen).idle).toBe(false)
  for (let i = 0; i < 20 && !(surface.state as Seen).idle; i++) { tick(); draw(hit, surface) }
  expect((surface.state as Seen).idle).toBe(true)
  expect((surface.state as Seen).frame).toBeGreaterThanOrEqual(14)
})

// ——— Odwiedziny i nora zwiadu ———

type Visiting = Seen & { visit?: string; visitDue?: number; visitor?: string; duet?: Seen['duet'] & { meet?: number } }

const until = (seen: ReturnType<typeof surfaceOf>, props: ForgeProps, done: (state: Visiting) => boolean, limit: number): Visiting => {
  for (let i = 0; i < limit && !done(seen.surface.state as Visiting); i++) { seen.tick(); draw(props, seen.surface) }
  return seen.surface.state as Visiting
}

// Piksele płótna: półbloki z koloru i tła, wiersz komórek to dwa wiersze pikseli.
type Drawn = { props: { color?: string; backgroundColor?: string; children?: readonly (Drawn | string)[] } }
const pixelsOf = (tree: unknown): (string | null)[][] => ((tree as Drawn).props.children as Drawn[]).flatMap(row => {
  const top: (string | null)[] = []
  const bottom: (string | null)[] = []
  for (const run of (row.props.children ?? []) as Drawn[]) {
    for (const char of [...((run.props.children ?? []) as string[]).join('')]) {
      top.push(char === '▀' || char === '█' ? run.props.color! : char === '▄' ? (run.props.backgroundColor ?? null) : null)
      bottom.push(char === '▄' || char === '█' ? run.props.color! : char === '▀' ? (run.props.backgroundColor ?? null) : null)
    }
  }
  return [top, bottom]
})
// Środek drzwi kwater w wierszach nad głową orka w progu: ciemność, gdy stoją otworem.
const doorOpen = (tree: unknown) => [1, 2, 3, 4].every(y => pixelsOf(tree)[y]![quartersDoor(140, true)! + 1] === PALETTE.I)

// Znaki wiersza płótna po kolei, piksele i ramka dymka po jednej kolumnie.
const rowText = (tree: unknown, y: number) => (((tree as Drawn).props.children as Drawn[])[y]!.props.children as Drawn[]).map(run => ((run.props.children ?? []) as string[]).join('')).join('')

test('the bubble tail points at the head, also of Krux lying on the chaise', () => {
  const { surface } = surfaceOf()
  // W bezruchu dymek stoi od razu w całości, a Krux leży w pierwszej pozie czekania.
  const tree = draw({ ...FLOOR, still: true, orcs: [{ ...KRUX, scene: 'lounge' }], bubble: { key: 'krux', text: 'Krux czekać na hordę', speaker: 'Krux' } }, surface)
  const pixels = pixelsOf(tree)
  // Czubek głowy: pierwszy od góry ciąg czterech pikseli skóry na podłodze (wiersze 6–11).
  const crownY = pixels.findIndex((row, y) => y >= 6 && row.some((_, x) => [0, 1, 2, 3].every(dx => row[x + dx] === PALETTE.g)))
  const crown = pixels[crownY]!.findIndex((_, x) => [0, 1, 2, 3].every(dx => pixels[crownY]![x + dx] === PALETTE.g))
  const tail = rowText(tree, 2).indexOf('┬')
  expect([crown, tail >= crown && tail <= crown + 3]).toEqual([crown, true])
})

test('bubble text stays readable: the terminal draws it in its own color, the desktop light on a dark fill', () => {
  // Terminal: ramka w kolorze mówcy, tekst bez koloru, więc w kolorze tekstu terminala.
  const { surface } = surfaceOf()
  const said = { key: 'a1', text: 'Grom: kuć ostrze', speaker: 'Grom' } as const
  const tree = JSON.stringify(draw({ ...FLOOR, still: true, orcs: [{ ...KRUX, scene: 'hammer' }, GROM], bubble: said }, surface))
  expect(tree).toContain(JSON.stringify({ type: 'Text', props: { children: ['Grom: kuć ostrze'] } }))
  expect(tree).toContain(JSON.stringify({ type: 'Text', props: { color: SPEAKER_COLOR.Grom, children: ['│ '] } }))
  // Desktop: kontrast tekstu do wnętrza dymka co najmniej 4,5:1 dla każdego mówcy w obu motywach.
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  }
  const mix = (top: string, opacity: number, under: string) => `#${[1, 3, 5].map(i => Math.round(parseInt(top.slice(i, i + 2), 16) * opacity + parseInt(under.slice(i, i + 2), 16) * (1 - opacity)).toString(16).padStart(2, '0')).join('')}`
  const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
  const weak: string[] = []
  for (const speaker of Object.keys(SPEAKER_COLOR) as (keyof typeof SPEAKER_COLOR)[]) {
    const desk = headless()
    const svg = svgOf(drawHeadless(Forge, { ...FLOOR, still: true, orcs: [{ ...KRUX, scene: 'hammer' }], bubble: { key: 'krux', text: 'kuć ostrze', speaker } }, desk), 7).source
    const group = svg.slice(svg.indexOf('<g shape-rendering="geometricPrecision"'))
    const fill = /^<g [^>]*fill="(#[0-9a-f]{6})"/u.exec(group)![1]!
    const opacity = Number(/<rect [^>]*fill-opacity="([\d.]+)"/u.exec(group)![1])
    const ink = /<text [^>]*fill="(#[0-9a-f]{6})"/u.exec(group)?.[1] ?? fill
    for (const page of ['#1e1e1e', '#ffffff']) if (contrast(ink, mix(fill, opacity, page)) < 4.5) weak.push(`${speaker} on ${page}`)
  }
  expect(weak).toEqual([])
})

test('now and then a mate drops in from the quarters: Krux puts the hammer down, walks over, they play and he goes back', () => {
  const seen = surfaceOf()
  const work: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }
  draw(work, seen.surface)
  const forge = (seen.surface.state as Seen).actors.krux!.home
  const called = until(seen, work, state => state.visit !== undefined, 400)
  // Pierwsze odwiedziny po 30 s życia płótna, gdy Krux od 6 s sam stoi przy robocie.
  expect(called.frame).toBeGreaterThanOrEqual(200)
  const key = called.visit!
  const face = called.visitor as ForgeOrc['face']
  expect(key).toBe(`visit:${face}`)
  expect(called.actors[key]).toMatchObject({ rise: 1, from: doorX(face, 140, true), leftAt: null })
  // Gość staje za rekwizytem Kruxa, a Krux odkłada robotę przy nim i podchodzi.
  const playing = until(seen, work, state => state.duet?.at !== null && state.duet?.at !== undefined, 200)
  const krux = playing.actors.krux!
  expect(playing.duet!.meet).toBeGreaterThan(forge)
  expect([krux.home, krux.left?.x]).toEqual([playing.duet!.meet, forge])
  expect(playing.actors[key]!.home).toBe(playing.duet!.meet! + DUET_GAP)
  // Po scence gość wraca tą samą drogą i znika, Krux wraca do kowadła i kuje dalej.
  const gone = until(seen, work, state => state.visit === undefined, 300)
  expect(gone.actors[key]).toBe(undefined)
  const back = until(seen, work, state => state.actors.krux!.pending === undefined && state.actors.krux!.left === undefined, 200)
  expect([back.actors.krux!.home, back.actors.krux!.track.scene, back.actors.krux!.track.stops]).toEqual([forge, 'hammer', undefined])
  // Następny gość dopiero po co najmniej 90 s i nigdy ten sam dwa razy z rzędu.
  expect(back.visitDue! - called.frame).toBeGreaterThanOrEqual(600)
  const next = until(seen, work, state => state.visit !== undefined, 1400)
  expect(next.visitor).not.toBe(face)
})

test('no mate drops in while another one works on the floor, and a call to work sends the visitor home', () => {
  const busy = surfaceOf()
  const pair: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...GROM, scene: 'pick' }] }
  draw(pair, busy.surface)
  for (let i = 0; i < 900; i++) {
    busy.tick()
    draw(pair, busy.surface)
    expect((busy.surface.state as Visiting).visit).toBe(undefined)
  }
  const seen = surfaceOf()
  const work: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }
  draw(work, seen.surface)
  const key = until(seen, work, state => state.visit !== undefined, 400).visit!
  seen.tick()
  draw(pair, seen.surface)
  const sent = seen.surface.state as Visiting
  expect(sent.duet).toBe(undefined)
  expect(sent.actors[key]!.leftAt).toBe(sent.frame)
  const home = until(seen, pair, state => state.actors[key] === undefined, 100)
  expect(home.visit).toBe(undefined)
  expect(home.actors.a1).toBeDefined()
})

test('a visit due as the turn ends meets Krux by the hearth and keeps the clock alive until the visitor is gone', () => {
  const seen = surfaceOf()
  const work: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }
  draw(work, seen.surface)
  for (let i = 0; i < 190; i++) { seen.tick(); draw(work, seen.surface) }
  expect((seen.surface.state as Visiting).visit).toBe(undefined)
  const rest: ForgeProps = { ...FLOOR, rest: true, orcs: [{ ...KRUX, scene: 'watch' }] }
  let met = false
  for (let i = 0; i < 400 && !(seen.surface.state as Seen).idle; i++) {
    seen.tick()
    draw(rest, seen.surface)
    const state = seen.surface.state as Visiting
    // Przy ogniu nie ma rekwizytu: gość podchodzi do samego Kruxa.
    met ||= state.duet?.at !== null && state.duet?.at !== undefined && state.duet.meet === undefined && state.actors.krux!.home === 12
  }
  const done = seen.surface.state as Visiting
  expect(met).toBe(true)
  expect(done.idle).toBe(true)
  expect(Object.keys(done.actors)).toEqual(['krux'])
  expect(done.actors.krux!.track.scene).toBe('watch')
})

test('the scout lives in a burrow: Niuch comes out of the shaft and the door of the quarters stays shut', () => {
  for (const [mate, opens] of [[GROM, true], [NIUCH, false]] as const) {
    const seen = surfaceOf()
    draw({ ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }, seen.surface)
    const joined: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...mate, scene: 'pick' }] }
    let open = doorOpen(draw(joined, seen.surface))
    expect([mate.face, (seen.surface.state as Seen).actors.a1!.from]).toEqual([mate.face, doorX(mate.face, 140, true)])
    for (let i = 0; i < 20; i++) { seen.tick(); open ||= doorOpen(draw(joined, seen.surface)) }
    expect([mate.face, open]).toEqual([mate.face, opens])
  }
  expect(doorX('Niuch', 140, true)).not.toBe(quartersDoor(140, true))
})

test('without room right of Krux and his kit nobody drops in, and the visit waits for a better moment', () => {
  const seen = surfaceOf()
  // Wąska podłoga bez paleniska: za kowadłem Kruxa gość by się nie zmieścił.
  const tight: ForgeProps = { ...BAND, slots: 2, floor: 46, orcs: [{ ...KRUX, scene: 'hammer' }] }
  draw(tight, seen.surface)
  const state = until(seen, tight, () => false, 400)
  expect(state.frame).toBeGreaterThan(300)
  expect(state.visit).toBe(undefined)
  // Termin nie przeskakuje bez odwiedzin: zapis stanu bez zmiany na płótnie przybliżał odpięcie.
  expect(state.visitDue).toBe(200)
})

test('Krux calling the horde or waiting for it takes no guests: the mate is out at work, maybe off the canvas', () => {
  for (const scene of ['lounge', 'horn'] as const) {
    const seen = surfaceOf()
    const waiting: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene }] }
    draw(waiting, seen.surface)
    const state = until(seen, waiting, state => state.visit !== undefined, 600)
    expect([scene, state.visit]).toEqual([scene, undefined])
  }
})

// Jak silnik: po zapisie stanu rysunek jeszcze raz; łańcuch to zapisy bez tyknięcia.
const drawChain = (seen: ReturnType<typeof surfaceOf>, props: ForgeProps): number => {
  let chain = 0
  for (let pass = 0; pass < 5; pass += 1) {
    const before = seen.surface.state
    draw(props, seen.surface)
    if (seen.surface.state === before) break
    chain += 1
  }
  return chain
}

test('a change of the floor during a visit ends it at once, without a third write before the clock ticks', () => {
  const phases = {
    approach: (state: Visiting) => state.visit !== undefined,
    walk: (state: Visiting) => state.actors.krux!.left !== undefined && state.duet?.at === null,
    play: (state: Visiting) => state.duet?.at !== null && state.duet?.at !== undefined,
  }
  for (const [phase, reached] of Object.entries(phases)) {
    for (const width of [46, 64, 200]) {
      const seen = surfaceOf()
      const work: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }
      draw(work, seen.surface)
      expect([phase, until(seen, work, reached, 600).visit]).not.toEqual([phase, undefined])
      const resized: ForgeProps = { ...work, floor: width, slots: width >= 94 ? 4 : 2 }
      let worst = 0
      for (let i = 0; i < 150; i++) { seen.tick(); worst = Math.max(worst, drawChain(seen, resized)) }
      const end = seen.surface.state as Visiting
      const krux = end.actors.krux!
      // Krux może być akurat w drodze po nowy sprzęt, ale nie stoi z dala od rekwizytu bez drogi powrotnej.
      const stranded = krux.left !== undefined && krux.left.x !== krux.home && krux.pending === undefined
      expect([phase, width, worst, end.visit, end.duet, Object.keys(end.actors), stranded]).toEqual([phase, width, Math.min(worst, 2), undefined, undefined, ['krux'], false])
    }
  }
})

test('a mate called to work in the apron of the visitor comes out only after the visitor is back in the quarters', () => {
  const seen = surfaceOf()
  const work: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }
  draw(work, seen.surface)
  const visited = until(seen, work, state => state.visit !== undefined, 400)
  const twin: ForgeProps = { ...work, orcs: [{ ...KRUX, scene: 'hammer' }, { key: 'a7', face: visited.visitor as ForgeOrc['face'], scene: 'read', mood: 'calm' }] }
  let both = false
  for (let i = 0; i < 120 && (seen.surface.state as Visiting).actors.a7 === undefined; i++) {
    seen.tick()
    draw(twin, seen.surface)
    const state = seen.surface.state as Visiting
    both ||= state.actors.a7 !== undefined && state.actors[visited.visit!] !== undefined
  }
  const state = seen.surface.state as Visiting
  expect([both, state.visit, state.actors.a7 !== undefined]).toEqual([false, undefined, true])
})

test('a call to work in the middle of a toast lets Krux hand his mug back before the visitor leaves', () => {
  const seen = surfaceOf()
  const work: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }
  draw(work, seen.surface)
  const mid = until(seen, work, state => state.duet?.kind === 'toast' && state.duet.at !== null && state.frame - state.duet.at >= 12, 3000)
  expect(mid.duet?.kind).toBe('toast')
  const other = MATES.find(mate => mate !== mid.visitor)!
  const called: ForgeProps = { ...work, orcs: [{ ...KRUX, scene: 'hammer' }, { key: 'a8', face: other, scene: 'read', mood: 'calm' }] }
  seen.tick()
  draw(called, seen.surface)
  const after = seen.surface.state as Visiting
  // Toast przeskakuje do kufli trzymanych nisko i dogrywa oddanie, dopiero potem gość odchodzi.
  expect(after.duet?.at).toBe(after.frame - TOAST_RETURN)
  const gone = until(seen, called, state => state.duet === undefined, 40)
  expect(gone.frame - after.frame).toBe(DUET_FRAMES - TOAST_RETURN)
  expect(gone.actors[mid.visit!]?.leftAt).toBe(gone.frame)
})

test('a visit called just before the act changes puts down the kit the guest stands behind, and Krux plays standing', () => {
  // Scena pytania ma czynności z rekwizytem i bez: termin odwiedzin pada tuż przed zmianą rekwizytu,
  // więc czynność zmieniłaby się w drodze gościa.
  for (const ahead of [4, 8, 12]) {
    const seen = surfaceOf()
    const work: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'ask' }] }
    draw(work, seen.surface)
    let armed = false
    let played = 0
    for (let i = 0; i < 1200; i++) {
      seen.tick()
      draw(work, seen.surface)
      const state = seen.surface.state as Visiting
      const krux = state.actors.krux!
      if (!armed && state.visit === undefined && krux.pending === undefined && krux.errand === undefined && krux.track.stops === undefined && state.frame - krux.arrived >= 40 && kitAt(krux.track, state.frame + 1) !== kitAt(krux.track, state.frame + 1 + ahead)) {
        ;(seen.surface.state as Visiting).visitDue = state.frame + 1
        armed = true
      }
      if (state.visit === undefined || state.duet === undefined || state.duet.at === null || state.frame < state.duet.at) continue
      played += 1
      const guest = state.actors[state.visit]!
      // Krux gra scenkę, gdy już doszedł, a gość stoi za rekwizytem, nie na nim. Kto podszedł, ten
      // zostawił rekwizyt na ziemi.
      const arrived = krux.enter + Math.ceil(Math.abs(krux.home - krux.from) / 7)
      expect([ahead, state.frame >= arrived, state.duet.meet === undefined || krux.left !== undefined]).toEqual([ahead, true, true])
      if (krux.left !== undefined) expect([ahead, guest.home - 2 >= krux.left.x + kitReach(krux.left.rows as string[])]).toEqual([ahead, true])
    }
    expect([ahead, armed, played > 0]).toEqual([ahead, true, true])
  }
})
