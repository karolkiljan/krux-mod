import { expect, test } from 'claude-code/testing'

import { GESTURES, headOf } from '../hooks/fidget'
import { MATE_APRONS } from '../hooks/palette'
import { MATES } from '../hooks/roster'
import { ACTS, BUBBLE_TEXT, WALL_MIN, WALL_ROOMY, depthSpot, wallSpans, errandPose, farPose, CATCH_X, DUET_FRAMES, DUET_GAP, carried, doorX, dayPhase, duetPose, floorHomes, kitAt, kitReach, quartersDoor, roomGrid, hasHearth, stationX, CUE_FRAMES, FRAME_MS, HOLD_FRAMES, actsFor, routeOf, trackDozing, trackFace, ORC_GAP, ORC_WIDTH, PALETTE, bandColumns, behind, bubbleLines, canvasColumns, catchStep, caughtScroll, dress, frameGrid, forgeColumns, runsOf, slotX, stageGrid, tossFrames, trackGrid, trackOff, trackStart, trackTo, walkerRows, withCatch, withCue, withEffort, withNap } from '../hooks/sprites'
import type { DayPhase, StageScene } from '../hooks/sprites'
import { H, STAND, W, actFrame, entryOf, head, kitLead, legAt, moodOf, pad, settleFrames, stander } from '../hooks/stage'
import type { Frame } from '../hooks/stage'

test('every forge frame is a rectangle and two pixels make one cell', async () => {
  const width = forgeColumns('band', 1)
  for (let frame = 0; frame < 60; frame += 1) {
    for (const variant of ['band', 'pane'] as const) {
      const grid = frameGrid(frame, variant)
      expect(grid.length).toBe(6)
      expect(new Set(grid.map(row => row.length)).size).toBe(1)
    }
    for (const scene of Object.keys(ACTS) as StageScene[]) {
      const grid = frameGrid(frame, 'band', scene)
      expect(grid.length).toBe(6)
      expect(grid.every(row => row.length === width)).toBe(true)
    }
  }
  const lines = runsOf(frameGrid(3, 'band'), 1)
  expect(lines.length).toBe(3)
  expect(lines[0]!.map(run => run.text).join('').length).toBe(forgeColumns('band', 1))
  expect(runsOf(frameGrid(3, 'pane'), 2).length).toBe(6)
})

test('a grumpy orc frowns and a proud one has golden eyes that never blink', async () => {
  const calm = frameGrid(0, 'band', 'hammer', 'calm')
  const grumpy = frameGrid(0, 'band', 'hammer', 'grumpy')
  // Stójka: głowa w kolumnach 0–5, brwi nad oczami.
  expect(calm[0]!.slice(0, 6)).toBe('.gggg.')
  expect(grumpy[0]!.slice(0, 6)).toBe('.GggG.')
  for (let frame = 0; frame < 5 * 8; frame += 1) {
    const proud = frameGrid(frame, 'band', 'hammer', 'proud')
    expect(proud[1]!.slice(0, 6)).toBe('gyggyg')
  }
})

test('each mate wears an apron of their own color, Krux keeps the leather one', async () => {
  const rows = frameGrid(0, 'band', 'hammer')
  expect(dress(rows, 'Krux')).toEqual(rows)
  expect(dress(rows, 'Niuch').join('')).toContain('N')
  expect(dress(rows, 'Niuch').join('')).not.toContain('b')
  expect(dress(rows, null).join('')).toContain('u')
})

test('each orc owns a fixed rectangle and a walker past the edge is clipped', async () => {
  const width = bandColumns(4)
  const krux = frameGrid(0, 'band', 'hammer')
  const grid = stageGrid([{ rows: krux, x: slotX(0) }, { rows: dress(krux, 'Młot'), x: slotX(2) }, { rows: walkerRows(1, 'Niuch'), x: width - 2 }], width)
  expect(grid.length).toBe(6)
  expect(grid.every(row => row.length === width)).toBe(true)
  expect(grid[3]!.slice(slotX(2), slotX(2) + ORC_WIDTH)).toBe(dress(krux, 'Młot')[3])
  expect(grid[3]!.slice(slotX(1), slotX(1) + ORC_WIDTH)).toBe('.'.repeat(ORC_WIDTH))
  expect(grid[3]!.slice(width - 2)).toBe('gN')
  expect(bandColumns(1)).toBe(ORC_WIDTH)
  expect(bandColumns(3)).toBe(3 * ORC_WIDTH + 2 * ORC_GAP)
  expect(slotX(1)).toBe(ORC_WIDTH + ORC_GAP)
})

test('moods follow the eyes wherever the head goes', async () => {
  for (const scene of Object.keys(ACTS) as StageScene[]) {
    for (let step = 0; step < 120; step += 7) {
      const calm = frameGrid(step, 'band', scene, 'calm', 0, step).join('')
      const proud = frameGrid(step, 'band', scene, 'proud', 0, step).join('')
      expect(proud).not.toContain('r')
      if (calm.includes('r')) expect(frameGrid(step, 'band', scene, 'grumpy', 0, step).join('')).not.toBe(calm)
    }
  }
})

test('every act starts from the stand, has two eyes, keeps to the palette and the rectangle', async () => {
  const mates = new Set(['N', 'M', 'P', 'O', 'L', 'T', 'u'])
  for (const [scene, acts] of Object.entries(ACTS)) {
    expect([scene, acts.length >= 3]).toEqual([scene, true])
    for (const act of acts) {
      const frames = [...entryOf(act), ...Array.from({ length: act.length }, (_, t) => act.loop(t, t))]
      for (const rows of frames) {
        const label = `${scene}/${act.name}`
        expect([label, rows.length <= H]).toEqual([label, true])
        expect([label, rows.every(row => row.length <= W)]).toEqual([label, true])
        const cells = rows.join('')
        expect([label, [...cells].every(cell => cell === '.' || (PALETTE[cell] !== undefined && !mates.has(cell)))]).toEqual([label, true])
        expect([label, [0, 2].includes([...cells].filter(cell => cell === 'r').length)]).toEqual([label, true])
        expect([label, cells.includes('b')]).toEqual([label, true])
      }
    }
  }
})

test('an interrupted scene walks back to the stand before the next one starts', async () => {
  for (const scene of Object.keys(ACTS) as StageScene[]) {
    const track = trackStart(scene, 'krux', 0, 0)
    const next = trackTo(track, scene === 'read' ? 'pick' : 'read', 'krux', 30, false)
    expect([scene, next.leaving !== null && next.since > 30]).toEqual([scene, true])
    expect(trackGrid(next, next.since - 1, 'band', 'calm', false)).toEqual(pad(STAND))
  }
})

// Pożyczona czynność gra w dwóch scenach naraz: przejście między nimi zagrałoby ją od nowa.
test('each act belongs to one scene', async () => {
  const acts = Object.values(ACTS).flat()
  expect(new Set(acts).size).toBe(acts.length)
})

test('a waiting scene sends the old one off faster, still ending on the stand', async () => {
  // Wejście wstecz idzie dwa razy szybciej; pętla domyka się krok po kroku, bo skok byłby widać.
  for (const scene of Object.keys(ACTS) as StageScene[]) {
    const track = trackStart(scene, 'krux', 0, 0)
    const calm = trackOff(track, 30).since - 30
    const hurried = trackTo(track, scene === 'read' ? 'pick' : 'read', 'krux', 30, false)
    expect([scene, hurried.since - 30 < calm, hurried.since - 30 >= Math.ceil(calm / 2)]).toEqual([scene, true, true])
    expect(trackGrid(hurried, hurried.since - 1, 'band', 'calm', false)).toEqual(pad(STAND))
  }
})

test('a scene holds a second and a half, and waits out a walk or a settle', async () => {
  const track = trackStart('hammer', 'krux', 0, 0)
  expect(trackTo(track, 'read', 'krux', HOLD_FRAMES - 1, false)).toBe(track)
  const reading = trackTo(track, 'read', 'krux', 30, false)
  // Zwój jeszcze nie wszedł, bo młot schodzi: nowa scena czeka, młot nie znika skokiem.
  expect(trackTo(reading, 'pick', 'krux', reading.since - 1, false)).toBe(reading)
  expect(trackTo(reading, 'pick', 'krux', reading.since + HOLD_FRAMES, false).scene).toBe('pick')
  // W marszu do slotu (`since` w przyszłości) też czeka.
  const walking = trackStart('hammer', 'a1', 0, 20)
  expect(trackTo(walking, 'read', 'a1', 15, false)).toBe(walking)
  // W bezruchu od razu, bez zejścia.
  expect(trackTo(track, 'read', 'krux', 1, true)).toMatchObject({ scene: 'read', since: 1, leaving: null })
})

// Sceny, do których wchodzi kumpel: rogu i czekania na hordę nie gra.
const MATE_SCENES = (Object.keys(ACTS) as StageScene[]).filter(scene => scene !== 'horn' && scene !== 'lounge' && scene !== 'watch')

test('every orc has at least three acts of its own in each scene it can enter', async () => {
  for (const scene of Object.keys(ACTS) as StageScene[]) expect([scene, actsFor(scene, 'Krux').length >= 3]).toEqual([scene, true])
  for (const face of [...MATES, null]) {
    for (const scene of MATE_SCENES) expect([scene, face, actsFor(scene, face).length >= 3]).toEqual([scene, face, true])
  }
})

test('at work an act plays about thirty seconds before the next one of the same scene', async () => {
  const route = routeOf('hammer', 'Krux', 0)
  const thirty = Math.round(30_000 / FRAME_MS)
  for (let step = 0; step < thirty - 20; step += 10) expect([step, legAt(route, step)]).toEqual([step, 0])
  expect(legAt(route, thirty + 20)).toBe(1)
})

test('the next episode of a scene starts from the act after the one it left', async () => {
  const first = trackStart('hammer', 'krux', 0, 0)
  const reading = trackTo(first, 'read', 'krux', 30, false)
  expect(reading.memory.hammer).toBe(first.first + 1)
  const back = trackTo(reading, 'hammer', 'krux', reading.since + HOLD_FRAMES, false)
  expect(back.first).toBe(first.first + 1)
  // Scena bez pamięci zaczyna od losu.
  expect(reading.first).toBe(reading.seed)
})

test('waiting for the horde moves only forward and ends at the campfire', async () => {
  const seen = new Set<string>()
  for (let seed = 0; seed < 40; seed += 1) {
    const route = routeOf('lounge', 'Krux', seed)
    const names = route.legs.map(leg => leg.act.name)
    expect(route.cyclic).toBe(false)
    expect(['fotel', 'szezlong']).toContain(names[0])
    expect(['ryby', 'szezlong']).toContain(names[1])
    expect(names[3]).toBe('ognisko')
    for (let i = 1; i < names.length; i += 1) expect(names[i]).not.toBe(names[i - 1])
    const ends = route.legs.slice(0, 3).reduce<number[]>((sum, leg) => [...sum, (sum.at(-1) ?? 0) + leg.frames], [])
    ends.forEach((end, i) => {
      const seconds = (end * FRAME_MS) / 1000
      const at = [20, 60, 180][i]!
      expect([seed, i, seconds >= at * 0.74 && seconds <= at * 1.26]).toEqual([seed, i, true])
    })
    // Odcinki nigdy nie wracają: indeks odcinka rośnie z czasem.
    let last = 0
    for (let step = 0; step < 3000; step += 50) {
      const leg = legAt(route, step)
      expect(leg >= last).toBe(true)
      last = leg
    }
    expect(last).toBe(3)
    seen.add(names.join('>'))
  }
  expect(seen.size > 2).toBe(true)
})

test('waiting ends at the campfire however many times the story is asked to go on', async () => {
  const track = trackStart('lounge', 'krux', 0, 0)
  expect(routeOf('lounge', 'Krux', track.seed, track.first, 9).legs.map(leg => leg.act.name)).toEqual(['ognisko'])
})

test('Krux dozes off by the campfire after a minute, not before', async () => {
  const track = trackStart('lounge', 'krux', 0, 0)
  const route = routeOf('lounge', 'Krux', track.seed)
  let campfire = 0
  while (legAt(route, campfire) < 3) campfire += 1
  expect(trackDozing(track, campfire + 10)).toBe(false)
  expect(trackDozing(track, campfire + Math.round(70_000 / FRAME_MS))).toBe(true)
  expect(trackDozing(trackStart('hammer', 'krux', 0, 0), 5000)).toBe(false)
})

test('gestures keep the frame rules on every loop pose and show up while working', async () => {
  const mates = new Set(['N', 'M', 'P', 'O', 'L', 'T', 'u'])
  // Gest gra na bieżącej pozie pętli; obieg wiercenia to pełne pętle, więc krok gestu `t`
  // trafia zawsze na pozę `t` modulo długość pętli.
  const broken: string[] = []
  for (const gesture of GESTURES) {
    for (const [scene, acts] of Object.entries(ACTS)) {
      for (const act of acts) {
        for (let t = 0; t < gesture.length; t += 1) {
          const rows = gesture.apply(act.loop(t % act.length, t), t)
          const cells = rows.join('')
          const keeps = rows.length <= H && rows.every(row => row.length <= W) && [...cells].every(cell => cell === '.' || (PALETTE[cell] !== undefined && !mates.has(cell))) && [0, 2].includes([...cells].filter(cell => cell === 'r').length) && cells.includes('b')
          if (!keeps) broken.push(`${gesture.name}/${scene}/${act.name}/${t}`)
        }
      }
    }
  }
  expect(broken).toEqual([])
  const route = routeOf('hammer', 'Krux', 0)
  const act = route.legs[0]!.act
  const lead = 1 + act.intro.length
  const changed = Array.from({ length: 150 }, (_, i) => lead + i).some(step => actFrame(route, step, step).join('') !== act.loop((step - lead) % act.length, step).join(''))
  expect(changed).toBe(true)
})

test('a fidget on the live loop pose plays its whole round or not at all: nothing blinks on and off', () => {
  // Gest gra na bieżącej pozie, więc musi mieścić się na każdej pozie obiegu tak jak na pierwszej.
  const blinking: string[] = []
  const changed = (out: Frame, pose: Frame) => (out.join() === pose.join() ? '0' : '1')
  for (const acts of Object.values(ACTS)) {
    for (const act of acts) {
      for (const gesture of GESTURES) {
        const route = { legs: [{ act, frames: Infinity }], cyclic: false, gestures: [gesture], every: 1, seed: 0 }
        const lead = 1 + entryOf(act).length
        const live = Array.from({ length: gesture.length }, (_, t) => changed(actFrame(route, lead + t, t), act.loop(t % act.length, t))).join('')
        // Wzór gestu na pierwszej pozie pętli: tak gest zaprojektowano, z zamierzonymi przerwami (węszenie).
        const first = act.loop(0, 0)
        const meant = Array.from({ length: gesture.length }, (_, t) => changed(gesture.apply(first, t), first)).join('')
        if (live.includes('1') && live !== meant) blinking.push(`${act.name}/${gesture.name}: ${live} != ${meant}`)
      }
    }
  }
  expect(blinking).toEqual([])
})

// Ile pikseli różni dwie klatki.
const pixelsApart = (a: Frame, b: Frame) => {
  const other = pad(b)
  return pad(a).reduce((sum, row, y) => sum + [...row].filter((cell, x) => cell !== other[y]![x]).length, 0)
}
// O ile przesunęła się głowa; bez głowy w którejś klatce 0.
const headApart = (a: Frame, b: Frame) => {
  const from = headOf(a)
  const to = headOf(b)
  return from === null || to === null ? 0 : Math.max(Math.abs(from.x - to.x), Math.abs(from.top - to.top))
}
const widest = (frames: readonly Frame[], apart: (a: Frame, b: Frame) => number) => frames.slice(1).reduce((most, rows, i) => Math.max(most, apart(frames[i]!, rows)), 0)

test('an act interrupted anywhere in its loop settles back without a jump bigger than its own steps', () => {
  const jumps: string[] = []
  for (const [scene, acts] of Object.entries(ACTS)) {
    for (const act of acts) {
      const entry = entryOf(act)
      const loop = Array.from({ length: act.length }, (_, t) => act.loop(t, t))
      // Własne kroki czynności: od stójki przez wejście i cały obieg pętli z powrotem do jej początku.
      const natural = [STAND, ...entry, ...loop, loop[0]!]
      const pixels = widest(natural, pixelsApart)
      const heads = widest(natural, headApart)
      const route = { legs: [{ act, frames: 100_000 }], cyclic: true, gestures: [], every: 3, seed: 0 }
      for (const kept of act.kit === undefined ? [false] : [false, true]) {
        for (let i = 0; i <= act.length; i += 1) {
          const step = 1 + entry.length + i
          const shown = i === 0 ? entry[entry.length - 1]! : act.loop(i - 1, step - 1)
          const way = [shown, ...settleFrames(route, step, kept, step)]
          if (widest(way, pixelsApart) > pixels || widest(way, headApart) > heads) jumps.push(`${scene}/${act.name}/${i}/${kept}`)
        }
      }
    }
  }
  expect(jumps).toEqual([])
})

test('a hurried settle (a new scene waits) still closes the loop pose by pose and only rushes the way back through the entry', () => {
  const jumps: string[] = []
  for (const [scene, acts] of Object.entries(ACTS)) {
    for (const act of acts) {
      const entry = entryOf(act)
      const loop = Array.from({ length: act.length }, (_, t) => act.loop(t, t))
      const natural = [STAND, ...entry, ...loop, loop[0]!]
      const pixels = widest(natural, pixelsApart)
      const heads = widest(natural, headApart)
      const route = { legs: [{ act, frames: 100_000 }], cyclic: true, gestures: [], every: 3, seed: 0 }
      for (let i = 1; i <= act.length; i += 1) {
        const step = 1 + entry.length + i
        const shown = (i - 1) % act.length
        // Pozy od tej sprzed przerwy do pierwszej pozy pętli, krótszą drogą.
        const closing = Math.min(shown, act.length - shown)
        const way = [act.loop(shown, step - 1), ...settleFrames(route, step, false, step, true)]
        const loopWay = way.slice(0, closing + 1)
        if (widest(loopWay, pixelsApart) > pixels || widest(loopWay, headApart) > heads) jumps.push(`${scene}/${act.name}/${i}`)
        // Reszta to wejście wstecz co drugą klatką, ze stójką na końcu.
        const slow = [...entry].reverse()
        const rushed = [...slow, STAND].filter((_, j, all) => j % 2 === 1 || j === all.length - 1)
        expect([scene, act.name, i, way.slice(closing + 1)]).toEqual([scene, act.name, i, rushed])
      }
    }
  }
  expect(jumps).toEqual([])
  // Patrol przerwany w środku pętli przez nową scenę: zejście z osi jak na płaskim pasie.
  const patrol = Array.from({ length: 400 }, (_, s) => trackStart('scout', 'krux', s, 'in-loop')).find(track => routeOf('scout', 'Krux', track.seed, track.first, track.done).legs[0]!.act.name === 'patrol')!
  const act = routeOf('scout', 'Krux', patrol.seed, patrol.first, patrol.done).legs[0]!.act
  const at = patrol.since + 1 + entryOf(act).length + 13
  const off = trackTo({ ...patrol, setAt: -100 }, 'read', 'krux', at, false)
  const frames = [trackGrid(patrol, at - 1, 'band', 'calm', false), ...Array.from({ length: off.since - at }, (_, k) => trackGrid(off, at + k, 'band', 'calm', false))]
  const natural = widest([STAND, ...entryOf(act), ...Array.from({ length: act.length }, (_, t) => act.loop(t, t)), act.loop(0, 0)], pixelsApart)
  const closing = Math.min(12 % act.length, act.length - (12 % act.length))
  expect(widest(frames.slice(0, closing + 1), pixelsApart)).toBeLessThanOrEqual(natural)
})

test('a gesture rides on the running loop and changes only a few pixels of the pose the clock plays', () => {
  const frozen: string[] = []
  for (const scene of Object.keys(ACTS) as StageScene[]) {
    for (const face of ['Krux', 'Grom'] as const) {
      if (actsFor(scene, face).length === 0) continue
      for (const seed of [0, 1]) {
        const route = routeOf(scene, face, seed)
        const bare = { ...route, gestures: [] }
        for (let step = 0; step < 300; step += 1) {
          if (pixelsApart(actFrame(route, step, step), actFrame(bare, step, step)) > 12) frozen.push(`${scene}/${face}/${seed}/${step}`)
        }
      }
    }
  }
  expect(frozen).toEqual([])
})

test('effort paints only on the background: gear held at the head stays gear', () => {
  const painted: string[] = []
  for (const [scene, acts] of Object.entries(ACTS)) {
    for (const act of acts) {
      for (let k = 0; k < act.length; k += 1) {
        const rows = pad(act.loop(k, k))
        // Jeden obieg potu i ocieranie czoła.
        for (const age of [...Array.from({ length: 12 }, (_, i) => 67 + i), 200, 201, 202, 203]) {
          const effort = withEffort(rows, age)
          if (!effort.every((row, y) => [...row].every((cell, x) => cell === rows[y]![x] || rows[y]![x] === '.'))) painted.push(`${scene}/${act.name}/${k}/${age}`)
        }
      }
    }
  }
  expect(painted).toEqual([])
})

test('the bubble sits over its speaker, clipped to forty terminal cells, inside the canvas', async () => {
  const width = canvasColumns(3, true)
  const short = bubbleLines('Trop w lore.ts', 1, width)
  expect(short.length).toBe(3)
  expect(short.every(line => line.length === width)).toBe(true)
  const tail = short[2]!.indexOf('┬')
  expect(tail).toBe(ORC_WIDTH + ORC_GAP + 2)
  const long = bubbleLines(`Hmm, ${'a/'.repeat(40)}x.ts`, 0, canvasColumns(1, true))
  expect(long[1]!.trim().length).toBe(BUBBLE_TEXT + 4)
  expect(long[1]).toContain('…')
  expect(long.every(line => line.length === canvasColumns(1, true))).toBe(true)
})

// Oczekiwane ramki policzone w komórkach, niezależnie od pomocników produkcji:
// 19 szerokich znaków + wielokropek to 39 komórek; 40 á to 40 komórek.
for (const [name, text, body, top, bottom, padding] of [
  ['CJK', '漢'.repeat(40), '漢'.repeat(19) + '…', `╭${'─'.repeat(41)}╮ `, `╰─┬${'─'.repeat(39)}╯ `, ' '],
  ['emoji', '😀'.repeat(40), '😀'.repeat(19) + '…', `╭${'─'.repeat(41)}╮ `, `╰─┬${'─'.repeat(39)}╯ `, ' '],
  ['combining marks', 'a\u0301'.repeat(40), 'a\u0301'.repeat(40), `╭${'─'.repeat(42)}╮`, `╰─┬${'─'.repeat(40)}╯`, ''],
  ['joined emoji', '👩‍💻'.repeat(30), '👩‍💻'.repeat(19) + '…', `╭${'─'.repeat(41)}╮ `, `╰─┬${'─'.repeat(39)}╯ `, ' '],
  ['flags', '🇵🇱'.repeat(30), '🇵🇱'.repeat(19) + '…', `╭${'─'.repeat(41)}╮ `, `╰─┬${'─'.repeat(39)}╯ `, ' '],
  ['keycaps', '1️⃣'.repeat(30), '1️⃣'.repeat(19) + '…', `╭${'─'.repeat(41)}╮ `, `╰─┬${'─'.repeat(39)}╯ `, ' '],
] as const) {
  test(`the bubble fits ${name} in forty-four terminal cells and preserves graphemes`, () => {
    expect(bubbleLines(text, 0, 44)).toEqual([top, `│ ${body} │${padding}`, bottom])
  })
}

test('homes on the shared floor keep the orcs apart and inside it', () => {
  expect(stationX('hammer', 140, true)).toBe(12)
  expect(stationX('pick', 140, true)).toBe(118)
  expect(stationX('pick', 22, false)).toBe(0)
  const homes = floorHomes([{ key: 'a', want: 118, slot: 0 }, { key: 'b', want: 118, slot: 1 }, { key: 'c', want: 118, slot: 2 }, { key: 'd', want: 0, slot: 3 }], 140)
  expect(homes).toEqual({ d: 0, a: 70, b: 94, c: 118 })
  expect(floorHomes([{ key: 'a', want: 40, slot: 0 }, { key: 'b', want: 41, slot: 1 }], bandColumns(2))).toEqual({ a: 0, b: 24 })
  expect(hasHearth(bandColumns(3), 3)).toBe(false)
  expect(hasHearth(140, 3)).toBe(true)
  expect(hasHearth(140, 1)).toBe(false)
})

test('a pinned orc is an obstacle on the floor: the others stand in the nearest free gap, never on it', () => {
  // Krux idzie do kuźni, przy której już stoi przypięty kumpel: staje obok, nie na nim.
  expect(floorHomes([{ key: 'krux', want: 12, slot: 0 }, { key: 'a1', want: 12, slot: 1, fixed: true }], 140, 12)).toEqual({ a1: 12, krux: 36 })
  // Rekwizyt zostawiony przy scence też stoi: trzeci ork nie wchodzi na niego.
  expect(floorHomes([{ key: 'a2', want: 40, slot: 2 }, { key: 'a1#left', want: 40, slot: 1, fixed: true }, { key: 'krux', want: 12, slot: 0, fixed: true }], 140, 12)).toEqual({ krux: 12, 'a1#left': 40, a2: 64 })
  // Bez wolnej luki ork zostaje na swoim domu, a nowy staje tam, gdzie najmniej nachodzi.
  expect(floorHomes([{ key: 'krux', want: 4, slot: 0, stay: 20 }, { key: 'a1', want: 15, slot: 1, fixed: true }], 50)).toEqual({ a1: 15, krux: 20 })
  expect(floorHomes([{ key: 'a1', want: 15, slot: 1 }, { key: 'krux', want: 15, slot: 0, fixed: true }], 50)).toEqual({ krux: 15, a1: 0 })
})

test('the room lives on its own and answers the chronicle', () => {
  const calm = roomGrid(120, 7, true)
  expect(calm).toHaveLength(12)
  expect(calm.every(row => row.length === 120)).toBe(true)
  expect(calm.join('')).toContain('Z')
  const frames = Array.from({ length: 240 }, (_, frame) => roomGrid(120, frame, true))
  expect(new Set(frames.map(room => room.join(''))).size).toBeGreaterThan(20)
  expect(roomGrid(120, 7, true, { feel: { kind: 'test-fail', age: 2 } }).join('')).toContain('R')
  expect(roomGrid(120, 7, true, { feel: { kind: 'zawał', age: 2 } }).join('').split('q').length).toBeGreaterThan(5)
  // Spokojna ściana: rusza się tylko dym, kanarek i płomienie pochodni. Żadnych wózków, szczurów,
  // nietoperzy ani mrugającej rudy, które mieszały się ze sprzętem.
  const moving = new Set<string>()
  for (let y = 0; y < 12; y += 1) for (let x = 0; x < 120; x += 1) {
    const seen = new Set(frames.map(room => room[y]![x]!))
    if (seen.size > 1) for (const cell of seen) moving.add(cell)
  }
  expect([...moving].sort()).toEqual(['.', 'Q', 'V', 'Z'])
})

test('the window shows the sky of the hour, and the room has no background', () => {
  // Pora roku przesuwa świt i zmierzch: w listopadzie o 17 już noc, w czerwcu jeszcze dzień.
  const hours = [0, 4, 6, 7, 12, 16, 17, 20, 21, 22]
  expect(hours.map(hour => dayPhase(hour, 11))).toEqual(['night', 'night', 'dawn', 'day', 'day', 'dusk', 'night', 'night', 'night', 'night'])
  expect(hours.map(hour => dayPhase(hour, 6))).toEqual(['night', 'day', 'day', 'day', 'day', 'day', 'day', 'day', 'dusk', 'night'])
  expect(hours.map(hour => dayPhase(hour, 12))).toEqual(['night', 'night', 'night', 'dawn', 'day', 'night', 'night', 'night', 'night', 'night'])
  const room = (phase: DayPhase) => roomGrid(160, 8, true, { phase }).join('')
  expect(room('day')).toContain('9')
  expect(room('night')).toContain('7')
  expect(room('dusk')).toContain('0')
  expect(room('dawn')).toContain('8')
  // Tła nie ma: większość pokoju to puste komórki terminala.
  expect(room('day').split('.').length - 1).toBeGreaterThan(160 * 12 * 0.8)
})

test('duet poses stay in the palette, keep both eyes and open with the partner in reach', () => {
  for (const kind of ['fence', 'pass', 'highfive', 'argue', 'toast'] as const) {
    for (let t = 0; t < DUET_FRAMES; t += 1) {
      const { host, guest, prop } = duetPose(kind, t)
      for (const rows of [host, guest, prop]) expect([...rows.join('')].every(cell => cell === '.' || PALETTE[cell] !== undefined)).toBe(true)
      expect(host.join('').split('r').length - 1).toBe(2)
      expect(guest.join('').split('r').length - 1).toBe(2)
    }
  }
  expect(duetPose('fence', 0).prop.join('')).toContain('s')
  expect(duetPose('pass', 2).prop.join('')).toContain('R')
  // Kufle: gość przynosi oba i z oboma odchodzi, stuk nad środkiem pryska pianą między nimi.
  for (let t = 0; t < DUET_FRAMES; t += 1) expect(duetPose('toast', t).prop.join('').split('h').length - 1).toBe(2)
  for (const t of [0, DUET_FRAMES - 1]) expect(pad(duetPose('toast', t).prop)[3]!.slice(7, 14)).toBe('....hh.')
  expect(pad(duetPose('toast', 12).prop)[0]!.slice(8, 12)).toBe('jjjj')
  expect(pad(duetPose('toast', 9).prop)[0]!.slice(8, 12)).toBe('j..j')
  // Piątka: w klatce przybicia ręce gospodarza i gościa (od kolumny 12) łączy błysk, bez luki.
  const touch = Array.from({ length: DUET_FRAMES }, (_, t) => duetPose('highfive', t)).find(pose => pose.prop.length > 0)!
  const clap = stageGrid([{ rows: touch.host, x: 0 }, { rows: touch.guest, x: DUET_GAP - 2 }, { rows: pad(touch.prop), x: 0 }], 30)
  expect(clap.slice(0, 3).map(row => row.slice(6, 14))).toEqual(['..gyyg..', '.g.oo.g.', 'g......g'])
})

test('the kit left on the ground is the one of the act playing, and its reach is measured from the orc', () => {
  const track = trackStart('hammer', 'krux', 0, 0)
  const kit = kitAt(track, 40)
  expect(kit).toBe(routeOf('hammer', 'Krux', track.seed).legs[0]!.act.kit)
  expect(kitReach(['......', '.....hh'])).toBe(7)
  expect(kitReach(STAND)).toBe(6)
  expect(kitAt(trackOff(track, 40, true), 80)).toBe(kit)
})

test('the wall shows the state of the work: the canary and the door of the quarters', () => {
  const count = (rows: string[], cell: string) => rows.join('').split(cell).length - 1
  const well = roomGrid(160, 8, true)
  const faint = roomGrid(160, 8, true, { red: true })
  expect(count(faint, 'V')).toBeGreaterThan(count(well, 'V'))
  expect(count(faint, 'Z')).toBeLessThan(count(well, 'Z'))
  // Drzwi kwater stoją otworem, gdy ktoś w nich przechodzi: w środku ciemność zamiast desek.
  expect(count(roomGrid(160, 8, true, { door: true }), 'I')).toBeGreaterThan(count(well, 'I'))
})

test('a load rides at the hand on the side of the march, and a trial leaves empty-handed', () => {
  expect(carried('pick', 40, true)).toMatchObject({ x: 46 })
  expect(carried('pick', 40, false)).toMatchObject({ x: 38 })
  expect(carried('read', 40, false)).toMatchObject({ x: 37 })
  expect(carried('test', 40, true)).toBe(null)
  expect(caughtScroll(7, 3, 50)?.x).toBe(50 + CATCH_X)
})

test('a wide-text bubble keeps its tail over later slots in a seventy-cell canvas', () => {
  const body = '漢'.repeat(19) + '…'
  expect(bubbleLines('漢'.repeat(40), 1, 70)).toEqual([
    `     ╭${'─'.repeat(41)}╮${' '.repeat(22)}`,
    `     │ ${body} │${' '.repeat(22)}`,
    `     ╰${'─'.repeat(20)}┬${'─'.repeat(20)}╯${' '.repeat(22)}`,
  ])
  expect(bubbleLines('漢'.repeat(40), 2, 70)).toEqual([
    `${' '.repeat(27)}╭${'─'.repeat(41)}╮`,
    `${' '.repeat(27)}│ ${body} │`,
    `${' '.repeat(27)}╰${'─'.repeat(22)}┬${'─'.repeat(18)}╯`,
  ])
})

const framesOf = (act: Parameters<typeof entryOf>[0]) => [
  ...entryOf(act),
  ...Array.from({ length: act.length }, (_, t) => act.loop(t, t)),
]

test('a grumpy orc frowns with both brows whichever way it looks', async () => {
  for (const look of ['mid', 'left', 'right'] as const) {
    const top = moodOf(stander(look), 'grumpy', false)[0]!
    expect([look, [...top].filter(cell => cell === 'G').length]).toEqual([look, 2])
  }
  expect(moodOf(head('left'), 'grumpy', false)[0]).toBe('.GgGg.')
  expect(moodOf(head('right'), 'grumpy', false)[0]).toBe('.gGgG.')
  // Każda poza z dwojgiem oczu: dokładnie dwie brwi, tylko skóra ciemnieje.
  for (const [scene, acts] of Object.entries(ACTS)) {
    for (const act of acts) {
      for (const rows of framesOf(act)) {
        const grid = pad(rows)
        if ([...grid.join('')].filter(cell => cell === 'r').length !== 2) continue
        const frown = pad(moodOf(grid, 'grumpy', false))
        const changed = grid.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === frown[y]![x] ? [] : [`${cell}${frown[y]![x]}`])))
        expect([`${scene}/${act.name}`, changed]).toEqual([`${scene}/${act.name}`, ['gG', 'gG']])
      }
    }
  }
})

test('the chaise is brought with the mug on its seat, nothing pops up beside Krux', async () => {
  const chaise = ACTS.lounge.find(act => act.name === 'szezlong')!
  // Rekwizyt to szezlong z kuflem na siedzisku, bez orka.
  const kit = pad(chaise.kit!)
  expect(kit.every(row => row.slice(0, 6) === '.'.repeat(6))).toBe(true)
  expect(kit[3]!.indexOf('y')).toBe(13)
  // Dopóki Krux nie siada, kufel stoi na siedzisku.
  for (const rows of chaise.intro.slice(0, 6)) expect(pad(rows)[3]!.indexOf('y')).toBe(13)
})

test('a prop never slides in by itself: an act stands at its kit, and without a room the kit leaves from under the orc', async () => {
  for (const [scene, acts] of Object.entries(ACTS)) {
    for (const act of acts) {
      if (act.kit === undefined) continue
      const entry = entryOf(act)
      const lead = kitLead(act)
      const label = `${scene}/${act.name}`
      // Rekwizyt stoi przed orkiem, nie na nim; wyjątek to krzaki i stołek, za którymi ork się chowa.
      expect([label, pad(entry[lead - 1]!).slice(0, 3).every(row => row.slice(0, 6) === pad(STAND)[0]!.slice(0, 6) || row.slice(0, 6) === pad(STAND)[1]!.slice(0, 6) || row.slice(0, 6) === pad(STAND)[2]!.slice(0, 6))]).toEqual([label, true])
      // Wysuwanie idzie spod orka: prawa krawędź rekwizytu rośnie, a nie maleje jak przy wjeździe z prawej.
      const right = (rows: readonly string[]) => Math.max(...pad(rows).map(row => row.replace(/\.+$/u, '').length))
      const edges = entry.slice(0, lead).map(right)
      expect([label, edges.every((edge, i) => i === 0 || edge >= edges[i - 1]!)]).toEqual([label, true])
      // Pierwsza klatka chowa cały rekwizyt za orkiem: nic nie stoi obok niego od razu.
      expect([label, pad(entry[0]!).every(row => row.slice(6) === '.'.repeat(W - 6))]).toEqual([label, true])
    }
  }
})

test('at the kit an act settles back to the kit, so the orc can carry it away', async () => {
  for (const scene of Object.keys(ACTS) as StageScene[]) {
    const track = trackStart(scene, 'krux', 0, 0)
    const act = routeOf(scene, 'Krux', track.seed).legs[0]!.act
    const parked = trackOff(track, 30, true)
    expect([scene, parked.stops]).toEqual([scene, act.kit === undefined ? 'bare' : 'kit'])
    const last = trackGrid(parked, parked.since, 'band', 'calm', false)
    expect([scene, last]).toEqual([scene, pad(act.kit === undefined ? STAND : entryOf(act)[kitLead(act) - 1]!)])
  }
})

test('the horde rests behind the door of the quarters, not on the floor: no sleeper pixels in the room', () => {
  for (const width of [70, 94, 120, 200]) {
    const door = quartersDoor(width, false)!
    // Kumple wychodzą tymi samymi drzwiami, w obrębie podłogi; zwiad i bezimienny z nory w sztolni.
    for (const mate of MATES) expect([mate, doorX(mate, width, false)]).toEqual([mate, mate === 'Niuch' ? doorX(null, width, false) : door])
    expect(door + 3).toBeLessThanOrEqual(width)
    expect(doorX(null, width, false)).not.toBe(door)
  }
  // Bez miejsca na drzwi kumple, jak bezimienny, wychodzą ze sztolni.
  expect(quartersDoor(46, false)).toBe(null)
  expect(doorX('Grom', 46, false)).toBe(doorX(null, 46, false))
  const room = roomGrid(200, 8, false).join('')
  for (const apron of ['N', 'M', 'P', 'O', 'L', 'T', 'u']) expect(room).not.toContain(apron)
})

test('wall furniture never overlaps on any room width, and each torch keeps a free column on both sides', () => {
  // Pokój stoi na każdym pasie z wierszami dymka: płótno z dymkiem nie bywa węższe od ściany.
  expect(WALL_MIN).toBeLessThanOrEqual(canvasColumns(1, true))
  for (let width = WALL_MIN; width <= 300; width += 1) {
    for (const hearth of [false, true]) {
      const label = `${width}:${hearth}`
      const spans = wallSpans(width, hearth)
      const [forge, table, trial, mine] = spans
      // Meble bez nachodzenia; kuźnia, regał i skrzynia w płótnie, a za prawą krawędź wychodzi
      // tylko sztolnia, i to tak, że w płótnie zostaje oprawa z otworem i całym sprzętem (8 kolumn).
      expect([label, spans.every(([left, right], i) => left >= 0 && (i === spans.length - 1 ? left + 8 <= width : right <= width) && (i === 0 || left >= spans[i - 1]![1]))]).toEqual([label, true])
      // Od `WALL_ROOMY` każdy mebel ma przerwę, a za sztolnią zostaje wolna kolumna.
      if (width >= WALL_ROOMY) expect([label, spans.every(([left, right], i) => right < width && (i === 0 || left > spans[i - 1]![1]))]).toEqual([label, true])
      // Węższa ściana nie dosuwa kuźni do regału: belka weszłaby w księgę, a haki w półkę.
      expect([label, table![0] > forge![1]]).toEqual([label, true])
      const room = roomGrid(width, 0, hearth)
      // Sztolnia za krawędzią ciągnie się dalej: ostatnia kolumna płótna to jej otwór, sprzęt albo oprawa, nie pusta ściana.
      if (mine![1] > width) expect([label, room.slice(2, 6).every(row => row[width - 1] !== '.')]).toEqual([label, true])
      // Pochodnia zwiadu, przed sztolnią albo w jej otworze, nie przykleja się ani do skrzyni z kanarkiem,
      // ani do oprawy sztolni: obok niej nie ma drewna.
      const taken = roomGrid(width, 0, hearth, { taken: ['torch'] })
      const flame = [...room[2]!].findIndex((cell, x) => cell !== taken[2]![x])
      expect([label, flame > trial![1] && flame < width]).toEqual([label, true])
      expect([label, [1, 2, 3, 4].every(y => room[y]![flame - 1] !== 'E' && room[y]![flame + 1] !== 'E')]).toEqual([label, true])
      // Pochodnia między kuźnią a regałem: tylko w przerwie, nigdy na rogu półki.
      const torches = [...room[3]!].flatMap((cell, x) => (cell === 'E' && room[4]![x] === 'E' && x >= forge![1] && x < table![0] ? [x] : []))
      expect([label, torches.every(x => x > forge![1] && x < table![0] - 1)]).toEqual([label, true])
      for (let frame = 0; frame < 12; frame += 1) {
        const grid = roomGrid(width, frame, hearth)
        const burning = grid.slice(0, 6).some(row => /[QZ]/u.test(row.slice(table![0], table![1])))
        expect([label, frame, burning]).toEqual([label, frame, false])
      }
    }
  }
})

test('the depth spot reaches its stash and every exit stays on the canvas, on narrow and wide room widths', () => {
  // Przy ścianie, w drzwiach i w wylocie sztolni ork jest najmniejszy: szerszy staje się dopiero bliżej podłogi.
  const deep = farPose(1, 0, 0, null).rows[0]!.length
  // Skarbnik z lampą na szerokiej ścianie: tyle pikseli zmienia jego zjawa.
  const blessed = { blessed: true, feel: { kind: 'test-pass' as const, age: 4 } }
  const ghost = (width: number) => {
    const plain = roomGrid(width, 4, false, { feel: blessed.feel })
    return roomGrid(width, 4, false, blessed).flatMap((row, y) => [...row].flatMap((cell, x) => (cell !== plain[y]![x] ? [x] : [])))
  }
  const whole = ghost(140).length
  // Każda szerokość wąskiej ściany, dalej co kilka kolumn: tam meble stoją już przy stanowiskach.
  const widths = Array.from({ length: 301 - WALL_MIN }, (_, i) => WALL_MIN + i).filter(width => width <= WALL_ROOMY + 30 || width % 13 === 0)
  for (const width of widths) {
    for (const hearth of [false, true]) {
      const label = `${width}:${hearth}`
      const [, , trial, mine] = wallSpans(width, hearth)
      // Kilka klatek, bo dym znad paleniska chwilami zasłania sprzęt kuźni.
      const frames = hearth ? [0, 2, 4, 6, 8] : [0]
      const walls = frames.map(frame => roomGrid(width, frame, hearth).slice(0, 6))
      for (const scene of Object.keys(ACTS) as StageScene[]) {
        // Ork w głębi zawsze cały w płótnie, także przy kuźni dosuniętej do lewej krawędzi.
        const spot = depthSpot(scene, width, hearth)
        expect([label, scene, spot >= 0 && spot + deep <= width]).toEqual([label, scene, true])
        // Sprzęt sceny to piksele, które znikają ze ściany, gdy ork go zdejmie; ork w głębi staje tuż przed nim,
        // a przy krawędzi płótna tuż przy niej.
        const gone = frames.flatMap((frame, i) => {
          const taken = roomGrid(width, frame, hearth, { taken: [scene] })
          return walls[i]!.flatMap((row, y) => row === taken[y] ? [] : [...row].flatMap((cell, x) => (cell !== taken[y]![x] ? [x] : [])))
        })
        if (gone.length === 0) continue
        expect([label, scene, Math.max(0, Math.min(width - deep, Math.min(...gone) - 1))]).toEqual([label, scene, spot])
        expect([label, scene, Math.max(...gone) < width]).toEqual([label, scene, true])
      }
      // Wyjście z kwater albo ze sztolni mieści orka w głębi; drzwi stoją między skrzynią a sztolnią albo ich nie ma.
      for (const face of [null, ...MATES]) {
        const x = doorX(face, width, hearth)
        expect([label, face, x >= 0 && x + deep <= width]).toEqual([label, face, true])
      }
      // Nora w otworze sztolni, za jej oprawą, choćby sztolnia wychodziła za kadr.
      expect([label, doorX(null, width, hearth) > mine![0] + 1]).toEqual([label, true])
      const door = quartersDoor(width, hearth)
      expect([label, door === null || (door - 1 > trial![1] && door + 4 < mine![0] - 1)]).toEqual([label, true])
    }
    // Skarbnik staje z lampą cały, także w sztolni za krawędzią kadru.
    expect([width, ghost(width).length, Math.max(...ghost(width)) < width]).toEqual([width, whole, true])
  }
})

test('a kit carried into the depth shrinks with the orc and never swells: thin lines do not double', () => {
  const swollen: string[] = []
  for (const [scene, acts] of Object.entries(ACTS)) {
    for (const act of acts) {
      if (act.kit === undefined) continue
      const full = act.kit.join('').replace(/\./gu, '').length
      // Krok 0, 3 i 6 wyprawy: ork w głębi ma 5, 4 i 3 piksele wysokości.
      for (const t of [0, 3, 6]) {
        const [kit, orc] = errandPose(t, 0, { spot: 10, back: 10, took: act.kit }, 'Krux')
        if (kit!.rows.length !== orc!.rows.length || kit!.rows.join('').replace(/\./gu, '').length > full) swollen.push(`${scene}/${act.name}/${t}`)
      }
    }
  }
  expect(swollen).toEqual([])
  // Najbliższy ork w głębi ma szczękę jak ork na podłodze: oczy nie leżą na fartuchu.
  for (const step of [0, 1]) {
    const near = farPose(0.1, 0, step, 'Krux').rows
    expect(near.findIndex(row => row.includes('b')) - near.findIndex(row => row.includes('r'))).toBe(2)
  }
})

test('gear leaves the wall when an orc takes it and the wall keeps the gap', () => {
  const full = roomGrid(120, 8, true).join('')
  const taken = roomGrid(120, 8, true, { taken: ['seal', 'read'] }).join('')
  expect(taken.split('.').length).toBeGreaterThan(full.split('.').length)
  expect(full).toContain('d')
  expect(roomGrid(120, 8, true, { taken: ['torch'] }).join('').split('Q').length + roomGrid(120, 8, true, { taken: ['torch'] }).join('').split('Z').length).toBeLessThan(full.split('Q').length + full.split('Z').length)
})

test("Lont's fuse glows beside his head in every pose, never on his apron or skin", async () => {
  // Stójka: z lewej od żuchwy.
  expect(dress(pad(STAND), 'Lont')[2]!.slice(0, 6)).toBe('otggt.')
  for (const [scene, acts] of Object.entries(ACTS)) {
    for (const act of acts) {
      for (const rows of framesOf(act)) {
        const grid = pad(rows)
        const lont = dress(grid, 'Lont')
        const sparks = lont.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === 'o' && grid[y]![x] !== 'o' ? [[x, y] as const] : [])))
        const label = `${scene}/${act.name}: ${grid.join('/')}`
        expect([label, sparks.length]).toEqual([label, 1])
        const [x, y] = sparks[0]!
        expect([label, 'gGrytb'.includes(grid[y]![x]!)]).toEqual([label, false])
        // Tuż obok głowy: skóra, oko albo kieł w sąsiednim pikselu.
        const near = [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => 'gGrt'.includes(grid[y + dy]?.[x + dx] ?? '.')))
        expect([label, near]).toEqual([label, true])
      }
    }
  }
})

test('Grom gets a helmet, Niuch a nose, Ochra a brush, and no mark covers an eye', async () => {
  const rows = pad(STAND)
  expect(dress(rows, 'Grom')[0]!.slice(1, 5)).toBe('SsSS')
  expect(dress(rows, 'Niuch')[2]!.slice(5, 7)).toBe('gg')
  expect([2, 3, 4].map(y => dress(rows, 'Ochra')[y]![6])).toEqual(['j', 'h', 'h'])
  for (const [scene, acts] of Object.entries(ACTS)) {
    for (const act of acts) {
      for (const frame of framesOf(act)) {
        const grid = pad(frame)
        const eyes = [...grid.join('')].filter(cell => cell === 'r').length
        for (const mate of ['Grom', 'Niuch', 'Ochra'] as const) {
          const marked = [...dress(grid, mate).join('')].filter(cell => cell === 'r').length
          expect([scene, act.name, mate, marked]).toEqual([scene, act.name, mate, eyes])
        }
      }
    }
  }
})

// ——— Czytelność czynności: rekwizyt przy dłoni, nic nie znika, znaki fachu i oczy widać ———
const actOf = (scene: StageScene, name: string) => ACTS[scene].find(act => act.name === name)!
const loopOf = (act: ReturnType<typeof actOf>) => Array.from({ length: act.length }, (_, t) => pad(act.loop(t, t)))
const count = (rows: readonly string[], cells: string) => [...rows.join('')].filter(cell => cells.includes(cell)).length

// Odległość barw ΔE76 w CIELAB (sRGB, D65). Oko 'r' i rozgrzaną stal 'R' dzieli 6,7: na półbloku to ten sam kolor.
function deltaE(a: string, b: string): number {
  const lab = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92)) as [number, number, number]
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116)
    const [x, y, z] = [(0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * bl, (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883].map(f) as [number, number, number]
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
  }
  const [p, q] = [lab(a), lab(b)]
  return Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!)
}

test('red cloth never touches an eye, so the orc keeps both eyes', () => {
  // Koc sygnałów dymnych stał tuż przy prawym oku i robił z oka i koca jeden czerwony pas.
  for (const [scene, acts] of Object.entries(ACTS)) {
    for (const act of acts) {
      for (const frame of framesOf(act)) {
        const grid = pad(frame)
        const touching = grid.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === 'r' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy!]?.[x + dx!] === 'd') ? [[x, y]] : [])))
        expect([scene, act.name, touching]).toEqual([scene, act.name, []])
      }
    }
  }
})

test("Grom's helmet stays on his crown through every gesture that keeps the head still", () => {
  // `dress` szuka czubka od lewej: dłoń gestu tuż z lewej od czubka przesuwała hełm na dłoń.
  // Przeciąganie przechyla głowę, więc hełm jedzie z czubkiem; reszta gestów hełmu nie rusza.
  const steel = (rows: readonly string[]) => dress(rows, 'Grom').flatMap((row, y) => [...row].flatMap((cell, x) => ('Ss'.includes(cell) ? [`${x},${y}`] : [])))
  const gestures = GESTURES.filter(gesture => (gesture.who === undefined || gesture.who.includes('Grom')) && gesture.name !== 'przeciąganie')
  for (const scene of MATE_SCENES) {
    for (const act of actsFor(scene, 'Grom')) {
      const pose = pad(act.loop(0, 0))
      const worn = new Set(steel(pose))
      for (const gesture of gestures) {
        for (let t = 0; t < gesture.length; t += 1) {
          const moved = steel(pad(gesture.apply(pose, t))).filter(cell => !worn.has(cell))
          expect([scene, act.name, gesture.name, t, moved]).toEqual([scene, act.name, gesture.name, t, []])
        }
      }
    }
  }
})

test('at the campfire the stick stays in the hand and the sausage moves at most two pixels a frame', () => {
  const campfire = actOf('lounge', 'ognisko')
  const frames = loopOf(campfire)
  // Kiełbasa: brąz, czerwień albo surowa czerwień nad polanami, poza płomieniem (od x 13 w wierszach 2–3).
  const sausage = (rows: readonly string[]) => rows.slice(0, 4).flatMap((row, y) => [...row].flatMap((cell, x) => ('xdR'.includes(cell) && !(y >= 2 && x >= 13) ? [[x, y] as const] : [])))
  frames.forEach((rows, t) => {
    expect([t, rows[4]!.slice(6, 8)]).toEqual([t, 'gh'])
    expect([t, sausage(rows).length]).toEqual([t, 2])
    const [[x, y]] = sausage(rows) as [readonly [number, number]]
    const [[px, py]] = sausage(frames[(t + frames.length - 1) % frames.length]!) as [readonly [number, number]]
    expect([t, Math.max(Math.abs(x - px), Math.abs(y - py)) <= 2]).toEqual([t, true])
  })
})

test('the armchair pipe sits in the corner of the mouth, at the right fang', () => {
  for (const [t, rows] of loopOf(actOf('lounge', 'fotel')).entries()) {
    const stem = rows[2]!.indexOf('h')
    expect([t, rows[2]![stem - 1]]).toEqual([t, 't'])
  }
})

test('the fishing rod starts at the hand of the sitting orc', () => {
  for (const [t, rows] of loopOf(actOf('lounge', 'ryby')).entries()) expect([t, rows[4]!.slice(6, 8)]).toEqual([t, 'gh'])
})

test('the trowel never vanishes from the burrow: in the hand, then laid by the mound', () => {
  const burrow = actOf('scout', 'nora')
  // Od klatki z łopatką na ziemi; wcześniej bez pokoju wysuwa się spod orka.
  for (const [i, frame] of framesOf(burrow).slice(kitLead(burrow) - 1).entries()) {
    const rows = pad(frame)
    // Łopatka 'hS' ma jedną stal; uniesiona (wiersz 4) siedzi tuż przy dłoni.
    expect([i, count(rows, 'S')]).toEqual([i, 1])
    const y = rows.findIndex(row => row.includes('S'))
    if (y === 4) expect([i, rows[4]![rows[4]!.indexOf('S') - 2]]).toEqual([i, 'g'])
  }
})

test('Niuch raises a wet finger a pixel apart from his nose', () => {
  for (const [t, rows] of loopOf(actOf('scout', 'wiatr')).entries()) {
    const head = headOf(rows)!
    // Nos z `dress` stoi w (x + 4, x + 5) wiersza żuchwy; tuż za nim tło, nie dłoń.
    const jaw = dress(rows, 'Niuch')[head.top + 2]!
    expect([t, jaw.slice(head.x + 4, head.x + 7)]).toEqual([t, 'gg.'])
  }
})

test('each apron stands apart from every other, and a mate apron from the steel of the tools', () => {
  // Szary fartuch Młota zlewał się z bezimiennym, z Lontem i z obuchem: horda w sześciu pikselach.
  const aprons = [...MATE_APRONS]
  for (const a of aprons) {
    for (const b of aprons) if (a < b) expect([a, b, deltaE(PALETTE[a]!, PALETTE[b]!) >= 18]).toEqual([a, b, true])
    if (a !== 'u') expect([a, 'S', deltaE(PALETTE[a]!, PALETTE.S!) >= 15]).toEqual([a, 'S', true])
  }
})

test('stretching arms leave air beside the head, so they do not read as ears', () => {
  for (const [t, rows] of loopOf(actOf('watch', 'przeciąganie')).entries()) {
    const { top, x } = headOf(rows)!
    expect([t, rows[top]![x - 1], rows[top]![x + 4], rows[top + 1]![x - 2], rows[top + 1]![x + 5]]).toEqual([t, '.', '.', '.', '.'])
  }
})

test('the bow reads as a bow: no solid block where the string meets the stave', () => {
  const archery = actOf('raven', 'łuk')
  // Bez strzały w kadrze (bez grotu 'S') zostaje sam łuk; rekwizyt to łuk ze strzałą na ziemi.
  const idle = [pad(archery.kit!), ...loopOf(archery).filter(rows => count(rows, 'S') === 0)]
  for (const rows of idle) {
    const solid = rows.slice(0, -1).some((row, y) => [...row].some((cell, x) => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => 'hj'.includes(rows[y + dy!]![x + dx!] ?? '.')) && cell !== '.'))
    expect([rows.join('/'), solid]).toEqual([rows.join('/'), false])
  }
})

test('the raven carries the scroll right under its body in every wingbeat', () => {
  const frames = loopOf(actOf('raven', 'kruk'))
  for (let t = 18; t < 30; t += 1) {
    const rows = frames[t]!
    const y = rows.findIndex(row => row.includes('p'))
    expect([t, rows[y - 1]?.[rows[y]!.indexOf('p')]]).toEqual([t, 'w'])
  }
})

test('the question sign sways whole, its handle never sinks into the floor', () => {
  const sign = actOf('ask', 'tabliczka')
  const whole = count(pad(sign.kit!), 'pnh')
  for (const [t, rows] of loopOf(sign).entries()) expect([t, count(rows, 'pnh')]).toEqual([t, whole])
})

test('the spyglass never shrinks while it opens and the bird never crosses its glass', () => {
  const spy = actOf('scout', 'luneta')
  const tube = entryOf(spy).map(rows => count(pad(rows), 'hSi'))
  expect(tube.every((n, i) => i === 0 || n >= tube[i - 1]!)).toBe(true)
  for (const [t, rows] of loopOf(spy).entries()) expect([t, count(rows, 'i')]).toEqual([t, 1])
})

test("Niuch's scent trail runs along the nose row and ends at its tip", () => {
  const sniff = GESTURES.find(gesture => gesture.name === 'węszenie')!
  const { top, x } = headOf(pad(STAND))!
  for (let t = 1; t <= 4; t += 1) {
    const rows = pad(sniff.apply(STAND, t))
    const scent = rows.flatMap((row, y) => [...row].flatMap((cell, at) => (cell === 'm' ? [[at, y]] : [])))
    expect([t, scent.length > 0 && scent.every(([, y]) => y === top + 2)]).toEqual([t, true])
  }
  // Ostatni krok smugi kończy się tuż za czubkiem nosa Niucha.
  expect(dress(pad(sniff.apply(STAND, 4)), 'Niuch')[top + 2]!.slice(x + 4, x + 7)).toBe('ggm')
})

test("Piryt's squint dims the eyes visibly, not to the red of hot steel", () => {
  const squint = GESTURES.find(gesture => gesture.name === 'mrużenie')!
  const { top, x } = headOf(pad(STAND))!
  const eye = pad(squint.apply(STAND, 3))[top + 1]![x]!
  expect(deltaE(PALETTE[eye]!, PALETTE.r!)).toBeGreaterThan(10)
})

test('Lont walks back along the bench at most two pixels a frame', () => {
  const frames = loopOf(actOf('tear', 'miarka'))
  frames.forEach((rows, t) => {
    const prev = headOf(frames[(t + frames.length - 1) % frames.length]!)!
    expect([t, Math.abs(headOf(rows)!.x - prev.x) <= 2]).toEqual([t, true])
  })
})

test('Krux reaches for the scroll a frame before it lands and holds it in the landing frame', async () => {
  for (const flight of [3, 5, 8]) {
    const land = tossFrames(flight) - 2
    expect([catchStep(land - 2, flight), catchStep(land - 1, flight), catchStep(land, flight), catchStep(land + 2, flight)]).toEqual([null, -1, 0, null])
    expect(caughtScroll(land, flight)).not.toBe(null)
    expect(caughtScroll(land + 2, flight)).toBe(null)
  }
  const rows = pad(STAND)
  expect([withCatch(rows, -1)[2]![CATCH_X], withCatch(rows, -1)[3]![CATCH_X]]).toEqual(['.', 'g'])
  expect([withCatch(rows, 0)[2]![CATCH_X], withCatch(rows, 0)[3]![CATCH_X]]).toEqual(['g', 'g'])
  expect(withCatch(rows, 2)).toEqual(rows)
  // Na szezlongu Krux leży poza swoim miejscem: nie zrywa się skokiem, zwój chowa się za nim.
  const lying = pad(ACTS.lounge.find(act => act.name === 'szezlong')!.loop(0, 0))
  expect(withCatch(lying, 0)).toEqual(lying)
})

test('a catch keeps both eyes, the apron and the palette in every pose', async () => {
  for (const [scene, acts] of Object.entries(ACTS)) {
    for (const act of acts) {
      for (const frame of framesOf(act)) {
        const rows = pad(frame)
        const eyes = [...rows.join('')].filter(cell => cell === 'r').length
        for (const k of [-1, 0, 1]) {
          const caught = withCatch(rows, k)
          expect([scene, act.name, k, [...caught.join('')].filter(cell => cell === 'r').length]).toEqual([scene, act.name, k, eyes])
          expect([scene, act.name, k, caught.join('').includes('b')]).toEqual([scene, act.name, k, true])
          expect([scene, act.name, k, [...caught.join('')].every(cell => cell === '.' || PALETTE[cell] !== undefined)]).toEqual([scene, act.name, k, true])
        }
      }
    }
  }
})

test('a scroll passes behind skin, face and apron, so it never lands on an eye', async () => {
  const orc = { rows: pad(STAND), x: 0 }
  expect(behind({ rows: ['', 'hhhhhhh'], x: 0 }, orc).rows[1]).toBe('......h')
  expect(behind({ rows: ['hph'], x: 6 }, orc).rows[0]).toBe('hph')
})

test('effort preserves both eyes in every look, and naps close proud eyes too', () => {
  for (const look of ['mid', 'left', 'right'] as const) {
    const rows = pad(stander(look))
    expect(withEffort(rows, 66)).toEqual(rows)
    // Sweat starts cycling after 67 frames, falling beside the face.
    expect(withEffort(rows, 72)[1]![6]).toBe('i')
    expect(withEffort(rows, 75)[2]![6]).toBe('i')
    for (let age = 67; age < 200; age++) {
      const effort = withEffort(rows, age)
      expect([look, age, effort[0]![6], effort[1]![7]]).toEqual([look, age, '.', '.'])
    }
    // A hand wipes the forehead for four frames in each 40-frame period.
    for (const start of [200, 240]) {
      const period = Array.from({ length: 40 }, (_, phase) => withEffort(rows, start + phase))
      const wipes = period.filter(frame => frame[0]![6] === 'g' && frame[1]![7] === 'g')
      expect([look, start, wipes.length]).toEqual([look, start, 4])
      expect(wipes[0]).not.toEqual(rows)
    }
    for (const age of [67, 72, 200, 202, 240]) expect([...withEffort(rows, age).join('')].filter(cell => cell === 'r').length).toBe(2)
    const proud = pad(moodOf(rows, 'proud', false))
    expect(withNap(proud)[1]!.includes('y')).toBe(false)
  }
})

test('event overlays finish cleanly and stay within the pixel palette', () => {
  const rows = pad(STAND)
  for (const kind of ['test-pass', 'test-fail', 'build-pass', 'build-fail', 'commit', 'tear', 'zawał'] as const) {
    expect(withCue(rows, kind, CUE_FRAMES)).toEqual(rows)
    for (let t = 0; t < CUE_FRAMES; t++) {
      const cue = withCue(rows, kind, t)
      expect(cue.every(row => row.length === W)).toBe(true)
      expect([...cue.join('')].every(cell => cell === '.' || PALETTE[cell] !== undefined)).toBe(true)
      expect([...cue.join('')].filter(cell => cell === 'r').length).toBe(2)
      expect(cue.join('')).toContain('b')
    }
  }
})

test('results move the body: crouch, celebrate, stomp and return to the working pose', () => {
  const rows = pad(STAND)
  expect(withCue(rows, 'test-pass', 2).slice(0, 4).join('')).not.toBe(rows.slice(0, 4).join(''))
  expect(withCue(rows, 'zawał', 4)[0]!.slice(0, 6)).toBe('......')
  expect(withCue(rows, 'test-fail', 7)[5]!.slice(0, 7)).toBe('.G.....')
  expect(withCue(rows, 'test-fail', 9)[5]!.slice(0, 7)).toBe('.G..GGG')
  expect(withCue(rows, 'test-fail', 13).slice(0, 6)).toEqual(rows)
})

test('a reaction leaves Krux lying on the chaise and sitting in the armchair', () => {
  const body = (grid: readonly string[]) => grid.map(row => [...row].map(cell => ('gGrtb'.includes(cell) ? cell : '.')).join(''))
  for (const name of ['szezlong', 'fotel']) {
    const act = ACTS.lounge.find(one => one.name === name)!
    for (let t = 0; t < act.length; t++) {
      const rows = pad(act.loop(t, t))
      for (const kind of ['test-pass', 'test-fail', 'zawał'] as const) {
        for (let k = 0; k < CUE_FRAMES; k++) expect([name, t, kind, k, body(withCue(rows, kind, k))]).toEqual([name, t, kind, k, body(rows)])
      }
    }
  }
})

test('test events animate the real canary and retain the cage through the body reaction', () => {
  const canary = ACTS.test.find(act => act.name === 'kanarek')!
  for (let phase = 0; phase < canary.length; phase++) {
    const rows = pad(canary.loop(phase, phase))
    for (let t = 0; t < CUE_FRAMES; t++) {
      const passed = withCue(rows, 'test-pass', t)
      const failed = withCue(rows, 'test-fail', t)
      expect(passed[5]!.slice(12)).toEqual(rows[5]!.slice(12))
      expect(failed[5]!.slice(12)).toEqual(rows[5]!.slice(12))
      if (t >= 4) expect(failed[3]).toContain('yGyo')
      expect([...failed.join('')].filter(cell => cell === 'r').length).toBe(2)
      expect([...passed.join('')].filter(cell => cell === 'r').length).toBe(2)
    }
    expect(withCue(rows, 'test-pass', 6)[2]![21]).toBe('j')
    expect(withCue(rows, 'test-fail', CUE_FRAMES)).toEqual(rows)
  }
})

// One event per test keeps the exhaustive matrix below the runner's time limit.
for (const kind of ['test-pass', 'test-fail', 'build-pass', 'build-fail', 'commit', 'tear', 'zawał'] as const) {
  test(`${kind} effects preserve eyes and apron in every distinct act pose`, () => {
    const seen = new Set<string>()
    for (const [scene, acts] of Object.entries(ACTS)) {
      for (const act of acts) {
        for (const frame of framesOf(act)) {
          const rows = pad(frame)
          // withCue depends on the entire grid, event and phase, not its source act.
          const key = rows.join('\n')
          if (seen.has(key)) continue
          seen.add(key)
          const eyes = (rows.join('').match(/r/g) ?? []).length
          for (let t = 0; t < CUE_FRAMES; t++) {
            const cells = withCue(rows, kind, t).join('')
            expect([scene, act.name, kind, t, (cells.match(/r/g) ?? []).length]).toEqual([scene, act.name, kind, t, eyes])
            expect(cells).toContain('b')
          }
        }
      }
    }
  })
}

test('a nap shuts only the eyes, the campfire in the same row keeps its flame', () => {
  const rows = ['.gggg....', 'grggrg..y', '.tggt..yo', 'bbbbbb...', '.bGGb....', '.G..G....']
  const napped = withNap(rows)
  expect(napped[1]!.slice(0, 6)).toBe('gGggGg')
  expect(napped[1]![8]).toBe('y')
})

test('a mate named while working settles the old act to the stand, then plays its own trade', () => {
  const track = trackStart('hammer', 'a0', 0, 0, null)
  const named = trackFace(track, 'Grom', 'a0', 185, false)
  expect(named.face).toBe('Grom')
  expect(named.leaving?.face).toBe(null)
  expect(trackGrid(named, named.since - 1, 'band', 'calm', false)).toEqual(pad(STAND))
  // W marszu albo w bezruchu podmiana od razu.
  expect(trackFace(trackStart('hammer', 'a1', 0, 20, null), 'Grom', 'a1', 5, false)).toMatchObject({ face: 'Grom', leaving: null })
})

test('gear on the forge rack hangs from hooks, and an empty hook marks the place of gear in use', () => {
  const room = roomGrid(120, 8, true)
  const used = roomGrid(120, 8, true, { taken: ['hammer'] })
  // Belka nad hakami: pod nią w każdym wierszu tyle haków, ile sprzętu na kuźni.
  const beam = room[1]!.indexOf('E')
  const hooks = [...room[2]!.slice(beam, beam + 14)].flatMap((cell, x) => (cell === 'C' ? [x] : []))
  expect(hooks).toEqual([1, 4, 7, 10, 13])
  // Zdjęty młot znika ze ściany, hak nad nim zostaje.
  expect(used[2]).toBe(room[2])
  expect(used.slice(3, 6).map(row => row.slice(beam, beam + 2))).toEqual(['..', '..', '..'])
  expect(room.slice(3, 6).map(row => row.slice(beam, beam + 2))).not.toEqual(['..', '..', '..'])
})

test('outside the holidays the free wall before the door of the quarters stays empty', () => {
  // Bez proporca i trofeów: ściana to meble i sprzęt, stan sesji pokazuje Sztolnia.
  const room = roomGrid(160, 8, true)
  const door = quartersDoor(160, true)! - 1
  for (const row of room.slice(0, 6)) expect(row.slice(door - 10, door - 1)).toBe('.'.repeat(9))
})

test('the window follows the winter and one holiday thing stands by the door', () => {
  const at = (month: number, day: number, phase: DayPhase = 'day') => roomGrid(160, 8, true, { date: { month, day }, phase })
  const differs = (a: string[], b: string[]) => a.join('') !== b.join('')
  expect(differs(at(1, 15), at(6, 15))).toBe(true)
  // Poza zimą i świętami pora roku nie zmienia ściany.
  expect(differs(at(10, 10), at(6, 15))).toBe(false)
  expect(differs(at(4, 10), at(6, 15))).toBe(false)
  // Choinka z lampkami w grudniu, dynia na Zaduszki: zielone igły i pomarańczowa dynia.
  expect(at(12, 24).join('')).toContain('l')
  expect(at(6, 15).join('').split('l').length).toBeLessThan(at(12, 24).join('').split('l').length)
  expect(at(10, 31).join('').split('o').length).toBeGreaterThan(at(6, 15).join('').split('o').length)
  // Choinka stoi przy drzwiach kwater, nie na środku wolnej ściany: igły tuż przed framugą.
  expect(quartersDoor(160, true)! - 1 - at(12, 24)[4]!.lastIndexOf('l')).toBe(3)
})

test('Skarbnik comes only in a green moment after failures, and the night shows only in the window', () => {
  const feel = { kind: 'test-pass' as const, age: 5 }
  expect(roomGrid(160, 8, true, { feel, blessed: true }).join('')).not.toBe(roomGrid(160, 8, true, { feel }).join(''))
  expect(roomGrid(160, 8, true, { feel: { kind: 'test-fail', age: 5 }, blessed: true }).join('')).toBe(roomGrid(160, 8, true, { feel: { kind: 'test-fail', age: 5 } }).join(''))
  const night = roomGrid(160, 8, true, { phase: 'night' })
  const day = roomGrid(160, 8, true, { phase: 'day' })
  const changed = night.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === day[y]![x] ? [] : [`${cell}${day[y]![x]}`])))
  expect(new Set(changed)).toEqual(new Set(['79', 'j9']))
})

const actNamed = (scene: StageScene, name: string) => ACTS[scene].find(act => act.name === name)!
const cellsOf = (rows: readonly string[], wanted: string) => pad(rows).flatMap((row, y) => [...row].flatMap((cell, x) => (wanted.includes(cell) ? [[x, y] as const] : [])))

test('a kit stands on the floor and holds no part of the orc', () => {
  for (const [scene, acts] of Object.entries(ACTS)) {
    for (const act of acts) {
      if (act.kit === undefined) continue
      const label = `${scene}/${act.name}`
      // Skóra, oczy i fartuch należą do orka: na ziemi zostałaby ucięta dłoń.
      expect([label, cellsOf(act.kit, 'gGrb')]).toEqual([label, []])
      // Najniższy piksel rekwizytu leży na podłodze, nic nie wisi w powietrzu.
      const lowest = Math.max(...pad(act.kit).flatMap((row, y) => (row.replaceAll('.', '') === '' ? [] : [y])))
      expect([label, lowest]).toEqual([label, H - 1])
    }
  }
})

test('crouching over the battle plan, Krux shuffles a pixel at a time', () => {
  const ground = actNamed('plan', 'patyk')
  // Głowa przykucniętego orka: pierwszy wiersz z czterema pikselami skóry obok siebie.
  const headX = (rows: readonly string[]) => pad(rows).map(row => row.indexOf('gggg')).find(x => x >= 0)!
  const frames = [entryOf(ground).at(-1)!, ...Array.from({ length: ground.length + 1 }, (_, t) => ground.loop(t % ground.length, t))]
  for (let i = 1; i < frames.length; i += 1) expect([i, Math.abs(headX(frames[i]!) - headX(frames[i - 1]!)) <= 1]).toEqual([i, true])
})

test('the finger leaves the runes it lit in sight', () => {
  const runes = actNamed('read', 'tablica')
  const glowing = (t: number, rows: readonly number[]) => cellsOf(runes.loop(t, t), 'y').filter(([, y]) => rows.includes(y)).length
  // Koniec wiersza: palec stoi na ostatniej runie, reszta zapalonych świeci na widoku.
  expect(glowing(5, [2])).toBeGreaterThanOrEqual(3)
  expect(glowing(13, [2, 4])).toBeGreaterThanOrEqual(7)
})

// Ramię liczone od prawego brzegu orka: piksele skóry na prawo od jego sześciu kolumn.
function reachOf(rows: readonly string[]): number {
  const x = pad(rows)[0]!.indexOf('gggg') - 1
  return cellsOf(rows, 'g').filter(([cx]) => cx >= x + 6).length
}

test('Piryt steps after the tuning fork and the lens, so the arm stays short', () => {
  for (const name of ['kamerton', 'rysa pod lupą']) {
    const act = actNamed('think', name)
    for (let t = 0; t < act.length; t += 1) expect([name, t, reachOf(act.loop(t, t)) <= 5]).toEqual([name, t, true])
  }
})

test('Piryt keeps both eyes open on the crack while it glows in the lens', () => {
  const crack = actNamed('think', 'rysa pod lupą')
  const found = Array.from({ length: crack.length }, (_, t) => crack.loop(t, t)).filter(rows => cellsOf(rows, 'R').length > 0)
  expect(found.length).toBeGreaterThan(0)
  for (const rows of found) expect(cellsOf(rows, 'r')).toHaveLength(2)
})

test('the candle goes down from the hand, and the book comes out from behind the apron', () => {
  const candle = actNamed('read', 'świeca')
  const entry = entryOf(candle).slice(kitLead(candle))
  for (const [i, rows] of entry.entries()) {
    // Spodek świecy: trzy piksele drewna pod najniższym pikselem wosku.
    const wax = cellsOf(rows, 'j')
    if (wax.length === 0) continue
    const [x, y] = wax.at(-1)!
    const hands = cellsOf(rows, 'g')
    const held = [x - 1, x, x + 1].some(sx => hands.some(([gx, gy]) => Math.abs(gx - sx) <= 1 && Math.abs(gy - y - 1) <= 1))
    expect([i, y + 1 === H - 1 || held]).toEqual([i, true])
  }
  // Książka wychodzi zza fartucha: w pierwszej klatce z nią widać najwyżej jej skrawek.
  const first = entry.find(rows => cellsOf(rows, 'nB').length > 0)!
  expect(cellsOf(first, 'pnB').length).toBeLessThan(3)
})

test('the map hangs under the top bar of the easel, which stays in sight', () => {
  const easel = actNamed('plan', 'sztaluga')
  for (let t = 0; t < easel.length; t += 1) expect([t, pad(easel.loop(t, t))[0]!.slice(9, 19)]).toEqual([t, 'h'.repeat(10)])
})
