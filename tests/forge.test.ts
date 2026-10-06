import { expect, test } from 'claude-code/testing'

import Forge from '../hooks/forge'
import type { ForgeOrc, ForgeProps } from '../hooks/forge'
import { trackGrid } from '../hooks/sprites'
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

type Seen = { frame: number; idle: boolean; snoozing?: boolean; actors: Record<string, { leftAt: number | null; slot: number; enter: number; track: Track; handoff?: { at: number; flight: number }; cue?: { id: string; at: number }; effortAt?: number }> }

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

test('reduced motion freezes reactions, typing and naps as well as walking', () => {
  const { surface, tick } = surfaceOf()
  const props: ForgeProps = { ...BAND, still: true, rest: true, orcs: [KRUX], cues: [{ key: 'krux', kind: 'test-pass', until: 4000 }], bubble: { key: 'krux', text: 'Gotowe.', speaker: 'Krux' } }
  const before = draw(props, surface)
  for (let i = 0; i < 240; i++) { tick(); draw(props, surface) }
  expect(draw(props, surface)).toEqual(before)
  expect((surface.state as Seen).frame).toBe(0)
})
