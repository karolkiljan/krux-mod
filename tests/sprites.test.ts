import { expect, test } from 'claude-code/testing'

import { GESTURES } from '../hooks/fidget'
import { MATES } from '../hooks/roster'
import { ACTS, BUBBLE_TEXT, CATCH_X, CUE_FRAMES, FRAME_MS, HOLD_FRAMES, actsFor, routeOf, trackDozing, trackFace, ORC_GAP, ORC_WIDTH, PALETTE, bandColumns, behind, bubbleLines, canvasColumns, catchStep, caughtScroll, dress, frameGrid, forgeColumns, runsOf, slotX, stageGrid, tossFrames, trackGrid, trackOff, trackStart, trackTo, walkerRows, withCatch, withCue, withEffort, withNap } from '../hooks/sprites'
import type { StageScene } from '../hooks/sprites'
import { H, STAND, W, actFrame, head, legAt, moodOf, pad, stander } from '../hooks/stage'

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
      const frames = [...act.intro, ...Array.from({ length: act.length }, (_, t) => act.loop(t, t))]
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

test('a waiting scene sends the old one off at double speed, still ending on the stand', async () => {
  for (const scene of Object.keys(ACTS) as StageScene[]) {
    const track = trackStart(scene, 'krux', 0, 0)
    const calm = trackOff(track, 30).since - 30
    const hurried = trackTo(track, scene === 'read' ? 'pick' : 'read', 'krux', 30, false)
    expect([scene, hurried.since - 30]).toEqual([scene, Math.ceil(calm / 2)])
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
const MATE_SCENES = (Object.keys(ACTS) as StageScene[]).filter(scene => scene !== 'horn' && scene !== 'lounge')

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
  for (const gesture of GESTURES) {
    for (const [scene, acts] of Object.entries(ACTS)) {
      for (const act of acts) {
        for (let t = 0; t < gesture.length; t += 1) {
          const rows = gesture.apply(act.loop(0, 0), t)
          const label = `${gesture.name}/${scene}/${act.name}/${t}`
          const cells = rows.join('')
          expect([label, rows.length <= H && rows.every(row => row.length <= W)]).toEqual([label, true])
          expect([label, [...cells].every(cell => cell === '.' || (PALETTE[cell] !== undefined && !mates.has(cell)))]).toEqual([label, true])
          expect([label, [0, 2].includes([...cells].filter(cell => cell === 'r').length)]).toEqual([label, true])
          expect([label, cells.includes('b')]).toEqual([label, true])
        }
      }
    }
  }
  const route = routeOf('hammer', 'Krux', 0)
  const act = route.legs[0]!.act
  const lead = 1 + act.intro.length
  const changed = Array.from({ length: 150 }, (_, i) => lead + i).some(step => actFrame(route, step, step).join('') !== act.loop((step - lead) % act.length, step).join(''))
  expect(changed).toBe(true)
})

test('the bubble sits over its speaker, clipped to forty characters, inside the canvas', async () => {
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

const framesOf = (act: { intro: readonly (readonly string[])[]; length: number; loop: (t: number, frame: number) => readonly string[] }) => [
  ...act.intro,
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

test('the chaise brings the mug in on its seat, nothing pops up beside Krux', async () => {
  const chaise = ACTS.lounge.find(act => act.name === 'szezlong')!
  // Pierwsza klatka po stójce: obok Kruxa pusto, szezlong dopiero wjeżdża zza krawędzi.
  const first = pad(chaise.intro[0]!)
  expect(first.every(row => row.slice(6, 20) === '.'.repeat(14))).toBe(true)
  // Dopóki Krux nie siada, kufel jedzie razem z szezlongiem (wjazd, potem marsz do niego).
  const chaiseX = [20, 16, 12, 9, 7, 6, 6, 6, 6, 6, 6, 6, 6]
  chaise.intro.slice(0, chaiseX.length).forEach((rows, i) => {
    const mug = chaiseX[i]! + 7
    expect([i, pad(rows)[3]!.indexOf('y')]).toEqual([i, mug < W ? mug : -1])
  })
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

for (const [scene, acts] of Object.entries(ACTS)) {
  test(`event effects preserve eyes and apron in every ${scene} pose`, () => {
    for (const act of acts) {
      for (const frame of framesOf(act)) {
        const rows = pad(frame)
        const eyes = [...rows.join('')].filter(cell => cell === 'r').length
        for (const kind of ['test-pass', 'test-fail', 'build-pass', 'build-fail', 'commit', 'tear', 'zawał'] as const) {
          for (let t = 0; t < CUE_FRAMES; t++) {
            const cue = withCue(rows, kind, t)
            expect([scene, act.name, kind, t, [...cue.join('')].filter(cell => cell === 'r').length]).toEqual([scene, act.name, kind, t, eyes])
            expect(cue.join('')).toContain('b')
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
