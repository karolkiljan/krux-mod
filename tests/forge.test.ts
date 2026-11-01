import { expect, test } from 'claude-code/testing'

import Forge from '../hooks/forge'
import type { ForgeOrc, ForgeProps } from '../hooks/forge'
import { DUET_FRAMES, DUET_GAP, ERRAND_FRAMES, PALETTE, carried, trackGrid } from '../hooks/sprites'
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

type Seen = { frame: number; idle: boolean; duet?: { host: string; guest: string; kind: string; at: number | null }; duetAt?: number; snoozing?: boolean; actors: Record<string, { leftAt: number | null; slot: number; home: number; arrived: number; from: number; pending?: string; errand?: { at: number; spot: number }; enter: number; track: Track; handoff?: { at: number; flight: number }; cue?: { id: string; at: number }; effortAt?: number }> }

const KRUX: ForgeOrc = { key: 'krux', face: 'Krux', scene: 'lounge', mood: 'calm' }
const NIUCH: ForgeOrc = { key: 'a1', face: 'Niuch', scene: 'scout', mood: 'calm' }
const BAND: ForgeProps = { variant: 'band', scale: 1, still: false, rest: false, slots: 2, bubbleRows: true, orcs: [KRUX, NIUCH], bubble: null }

const draw = (props: ForgeProps, surface: ReturnType<typeof surfaceOf>['surface']) => Forge(props, surface as never)

test('the last mate done at rest marches out right and the clock runs until it is gone', () => {
  const { surface, tick } = surfaceOf()
  draw(BAND, surface)
  const after: ForgeProps = { ...BAND, rest: true, orcs: [{ ...KRUX, scene: 'hammer' }] }
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

test('with reduced motion a mate who is done leaves without a march', () => {
  const { surface } = surfaceOf()
  draw({ ...BAND, still: true }, surface)
  draw({ ...BAND, still: true, rest: true, orcs: [KRUX] }, surface)
  expect((surface.state as Seen).actors.a1).toBe(undefined)
  expect((surface.state as Seen).idle).toBe(true)
})

test('a mate who is done settles to the stand in its slot before the march, props never vanish in one frame', () => {
  const { surface, tick } = surfaceOf()
  draw(BAND, surface)
  const after: ForgeProps = { ...BAND, orcs: [KRUX] }
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
  draw(BAND, surface)
  const after: ForgeProps = { ...BAND, rest: true, orcs: [KRUX], cues: [{ key: 'a1', kind: 'handoff', until: 4000 }] }
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

test('a new station takes the prop down first, then Krux walks there and only then starts', () => {
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
  expect(going.home).toBe(118)
  expect(going.enter).toBeGreaterThanOrEqual((surface.state as Seen).frame)
  let shrunk = false
  for (let i = 0; i < 70 && (surface.state as Seen).actors.krux!.pending !== undefined; i++) {
    tick()
    // Wyprawa w głąb: mniejszy ork na ścianie, wyżej niż dolna połowa pasa.
    shrunk ||= (surface.state as Seen).actors.krux!.errand !== undefined
    draw(mine, surface)
  }
  expect(shrunk).toBe(true)
  const there = surface.state as Seen
  expect(there.actors.krux!.pending).toBe(undefined)
  expect(there.actors.krux!.track.scene).toBe('pick')
  expect(there.actors.krux!.track.since).toBe(there.frame)
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
  const narrow: ForgeProps = { ...FLOOR, rest: true, floor: 70 }
  draw(narrow, surface)
  expect((surface.state as Seen).actors.krux!.home).toBe(0)
  const wide: ForgeProps = { ...FLOOR, rest: true }
  draw(wide, surface)
  expect((surface.state as Seen).actors.krux!.home).toBe(12)
  for (let i = 0; i < 30 && (surface.state as Seen).actors.krux!.pending !== undefined; i++) { tick(); draw(wide, surface) }
  expect((surface.state as Seen).actors.krux!.pending).toBe(undefined)
  const still = surfaceOf()
  const frozen = JSON.stringify(draw({ ...FLOOR, still: true }, still.surface))
  expect(frozen).not.toContain(PALETTE.k)
})

test('the room stands behind everyone, and the bubble lies on the wall without shifting it', () => {
  const { surface } = surfaceOf()
  const props: ForgeProps = { ...FLOOR, bubble: { key: 'krux', text: 'Gotowe.', speaker: 'Krux' }, rest: true }
  const tree = draw(props, surface) as unknown as { props: { children: { props: { key: string; children: { props: { children: string[] } }[] } }[] } }
  const rows = tree.props.children
  expect(rows.map(row => row.props.key)).toEqual(['bubble-0', 'bubble-1', 'bubble-2', 'row-0', 'row-1', 'row-2'])
  for (const row of rows) expect([...row.props.children.flatMap(text => text.props.children).join('')].length).toBe(140)
  expect(JSON.stringify(tree)).toContain(PALETTE.A)
})

test('a low band stays flat: no room where no rows are left for it', () => {
  const { surface } = surfaceOf()
  expect(JSON.stringify(draw({ ...FLOOR, bubbleRows: false }, surface))).not.toContain(PALETTE.A)
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

test('an errand comes back on its own and goes at most once in fifteen seconds', () => {
  const { surface, tick } = surfaceOf()
  const at = (scene: ForgeOrc['scene']): ForgeProps => ({ ...FLOOR, orcs: [{ ...KRUX, scene }] })
  draw(at('hammer'), surface)
  for (let i = 0; i < 21 + 40 + ERRAND_FRAMES; i++) { tick(); draw(at('pick'), surface) }
  const back = (surface.state as Seen).actors.krux!
  expect(back.pending).toBe(undefined)
  expect(back.errand).toBe(undefined)
  for (let i = 0; i < 24; i++) { tick(); draw(at('read'), surface) }
  for (let i = 0; i < 30 && (surface.state as Seen).actors.krux!.pending !== undefined; i++) {
    tick()
    draw(at('read'), surface)
    expect((surface.state as Seen).actors.krux!.errand).toBe(undefined)
  }
  expect((surface.state as Seen).actors.krux!.track.scene).toBe('read')
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
  for (let i = 0; i < 40 && (surface.state as Seen).actors.krux!.pending === undefined; i++) { tick(); draw(back, surface) }
  expect((surface.state as Seen).actors.krux!.home).toBe(0)
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
    expect((seen.surface.state as Seen).actors.krux!.errand).toBe(undefined)
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
  for (let i = 0; i < ERRAND_FRAMES + 2 && (seen.surface.state as Seen).actors.krux!.pending !== undefined; i++) { seen.tick(); draw(hit, seen.surface) }
  expect((seen.surface.state as Seen).actors.krux!.cue!.at).toBe((seen.surface.state as Seen).actors.krux!.arrived)
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
  draw({ ...FLOOR, rest: true, floor: 70 }, surface)
  const wide: ForgeProps = { ...FLOOR, rest: true }
  expect(JSON.stringify(draw(wide, surface))).not.toContain(PALETTE.k)
  for (let i = 0; i < 12; i++) { tick(); draw(wide, surface) }
  expect(JSON.stringify(draw(wide, surface))).toContain(PALETTE.k)
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
