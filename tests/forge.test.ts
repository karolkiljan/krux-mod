import { expect, test } from 'claude-code/testing'

import Forge from '../hooks/forge'
import type { ForgeOrc, ForgeProps } from '../hooks/forge'
import { ACTS, DUET_FRAMES, DUET_GAP, ERRAND_FRAMES, PALETTE, RISE_FRAMES, carried, doorX, trackGrid } from '../hooks/sprites'
import type { Track } from '../hooks/sprites'
import { STAND, pad } from '../hooks/stage'

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

type Seen = { frame: number; idle: boolean; duet?: { host: string; guest: string; kind: string; at: number | null }; duetAt?: number; snoozing?: boolean; actors: Record<string, { leftAt: number | null; slot: number; home: number; arrived: number; from: number; pending?: string; errand?: { at: number; from: number; spot: number; took?: readonly string[]; brings?: readonly string[] }; enter: number; track: Track; handoff?: { at: number; flight: number }; cue?: { id: string; at: number }; effortAt?: number; rise?: number; door?: number; left?: { x: number } }> }

const KRUX: ForgeOrc = { key: 'krux', face: 'Krux', scene: 'lounge', mood: 'calm' }
const NIUCH: ForgeOrc = { key: 'a1', face: 'Niuch', scene: 'scout', mood: 'calm' }
const BAND: ForgeProps = { variant: 'band', scale: 1, still: false, rest: false, slots: 2, bubbleRows: true, orcs: [KRUX, NIUCH], bubble: null }
// Niski pas nie ma pokoju: bez ściany rekwizyt wysuwa się spod orka, a kumpel schodzi w prawo.
const FLAT: ForgeProps = { ...BAND, bubbleRows: false }

const draw = (props: ForgeProps, surface: ReturnType<typeof surfaceOf>['surface']) => Forge(props, surface as never)

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
  const start: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...NIUCH, scene: 'pick' }] }
  draw(start, surface)
  const after: ForgeProps = { ...FLOOR, rest: true, orcs: [{ ...KRUX, scene: 'watch' }] }
  draw(after, surface)
  const going = (surface.state as Seen).actors.a1!
  expect(going.errand?.took).toBeDefined()
  expect(going.leftAt).toBeGreaterThanOrEqual(going.errand!.at + ERRAND_FRAMES)
  expect(going.door).toBe(doorX('Niuch', 140, true))
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
  expect(JSON.stringify(draw(after, surface))).not.toContain(PALETTE.N)
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
  const joined: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...NIUCH, scene: 'pick' }] }
  draw(joined, surface)
  const up = (surface.state as Seen).actors.a1!
  expect(up).toMatchObject({ rise: 1, from: doorX('Niuch', 140, true), pending: 'pick', enter: (surface.state as Seen).frame + RISE_FRAMES })
  let deep = false
  for (let i = 0; i < 100 && (surface.state as Seen).actors.a1!.pending !== undefined; i++) {
    tick()
    draw(joined, surface)
    deep ||= (surface.state as Seen).actors.a1!.errand !== undefined
  }
  expect(deep).toBe(true)
  expect((surface.state as Seen).actors.a1!.track.scene).toBe('pick')
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
    expect(JSON.stringify(draw(props, surface))).toContain(`│ ab${grapheme} │`)
    tick()
    expect(JSON.stringify(draw(props, surface))).toContain(`│ ab${grapheme}cde │`)
    tick()
    expect(JSON.stringify(draw(props, surface))).toContain(`│ ab${grapheme}cdef │`)
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
  expect((surface.state as Seen).actors.a1!.pending).toBe('pick')
  let deep = false
  for (let i = 0; i < 70 && (surface.state as Seen).actors.a1!.pending !== undefined; i++) {
    tick()
    draw(joined, surface)
    deep ||= (surface.state as Seen).actors.a1!.errand !== undefined
  }
  expect(deep).toBe(true)
  expect((surface.state as Seen).actors.a1!.track.scene).toBe('pick')
})

test('a mate who finishes deep in the room comes back before marching off, without a jump', () => {
  const { surface, tick } = surfaceOf()
  draw(FLOOR, surface)
  const joined: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }, { ...NIUCH, scene: 'pick' }] }
  draw(joined, surface)
  for (let i = 0; i < 70 && (surface.state as Seen).actors.a1!.errand === undefined; i++) { tick(); draw(joined, surface) }
  const started = (surface.state as Seen).actors.a1!.errand!.at
  const done: ForgeProps = { ...FLOOR, orcs: [{ ...KRUX, scene: 'hammer' }] }
  draw(done, surface)
  expect((surface.state as Seen).actors.a1!.leftAt).toBeGreaterThanOrEqual(started + ERRAND_FRAMES)
  for (let i = 0; i < 70 && (surface.state as Seen).actors.a1 !== undefined; i++) { tick(); draw(done, surface) }
  expect((surface.state as Seen).actors.a1).toBe(undefined)
})

test('an event deep in the room still speaks, and the reaction plays on the way back', () => {
  const seen = surfaceOf()
  untilErrand(onFloor, seen)
  const at = (seen.surface.state as Seen).actors.krux!.errand!.at
  const hit: ForgeProps = { ...onFloor('pick'), bubble: { key: 'krux', text: 'Zawał! Komenda paść.', speaker: 'Krux' }, cues: [{ key: 'krux', kind: 'zawał', until: 9_000_000 }] }
  seen.tick()
  expect(JSON.stringify(draw(hit, seen.surface))).toContain('Za')
  const cueAt = (seen.surface.state as Seen).actors.krux!.cue!.at
  expect(cueAt).toBeGreaterThan(at)
  for (let i = 0; i < ERRAND_FRAMES + 2; i++) { seen.tick(); draw(hit, seen.surface) }
  expect((seen.surface.state as Seen).actors.krux!.cue!.at).toBe(at + ERRAND_FRAMES)
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
  expect(state().actors.a1!.home).toBe(state().actors.krux!.home + DUET_GAP)
  for (let i = 0; i < 80 && state().duet?.at === null; i++) { seen.tick(); draw(pair, seen.surface) }
  const started = state().duet!.at!
  expect(started).toBeGreaterThanOrEqual(state().frame)
  for (let i = 0; i < DUET_FRAMES + 30 && state().duet !== undefined; i++) { seen.tick(); draw(pair, seen.surface) }
  expect(state().duet).toBe(undefined)
  expect(state().duetAt).toBeGreaterThanOrEqual(started + DUET_FRAMES)
  expect(state().actors.a1!.pending).toBe('pick')
  for (let i = 0; i < 40 && state().actors.a1!.pending !== undefined; i++) { seen.tick(); draw(pair, seen.surface) }
  expect(state().actors.a1!.home).toBeGreaterThan(state().actors.krux!.home + DUET_GAP)
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
  expect([after.home, after.rise, after.leftAt]).toEqual([before.home, undefined, null])
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
