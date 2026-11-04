import { expect, test } from 'claude-code/testing'

import { ACTS } from '../hooks/sprites'
import type { StageScene } from '../hooks/sprites'
import { entryOf, kitLead, pad } from '../hooks/stage'
import type { Act } from '../hooks/stage'

// Ruch w czynnościach kuźni, próby, pieczęci, budowy i rozbiórki: zasady, których
// tablica klatek nie sprawdza (rozmiar, paleta, oczy), a które widać na pasie.

function actOf(scene: StageScene, name: string): Act {
  const act = ACTS[scene].find(each => each.name === name)
  if (act === undefined) throw new Error(`brak czynności ${scene}/${name}`)
  return act
}

// Od rekwizytu na ziemi przez wejście do końca pętli: to, co widać po kolei.
function played(act: Act): string[][] {
  const entry = entryOf(act).slice(Math.max(0, kitLead(act) - 1))
  return [...entry, ...Array.from({ length: act.length }, (_, t) => act.loop(t, t))].map(rows => pad(rows))
}

function loopOf(act: Act): string[][] {
  return Array.from({ length: act.length }, (_, t) => pad(act.loop(t, t)))
}

function changed(a: readonly string[], b: readonly string[]): number {
  let n = 0
  for (let y = 0; y < a.length; y += 1) for (let x = 0; x < a[y]!.length; x += 1) if (a[y]![x] !== b[y]![x]) n += 1
  return n
}

// Obrót tarczy szlifierki z dwóch kresek naprzeciw siebie; pola wokół piasty w kolejności zegara.
const RING = [[1, 1], [2, 1], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [1, 2]] as const
function wheelTurn(rows: readonly string[]): number {
  const left = rows[2]!.indexOf('S', 10) - 2
  const turn = [0, 1, 2, 3].find(i => [i, i + 4].every(k => rows[RING[k]![1]]![left + RING[k]![0]] === 'q'))
  if (turn === undefined) throw new Error(`nie widać tarczy: ${rows.join('/')}`)
  return turn
}

test('the grinding wheel never turns back from the kit into the loop, nor on the way back', () => {
  const act = actOf('hammer', 'szlifierka')
  const frames = played(act)
  const loop = loopOf(act)
  const ahead = [...frames, loop[0]!].map(wheelTurn)
  const lead = Math.max(0, kitLead(act) - 1)
  const back = [loop[loop.length - 1]!, ...entryOf(act).slice(lead).reverse().map(rows => pad(rows))].map(wheelTurn)
  for (const turns of [ahead, back]) {
    const steps = turns.slice(1).map((turn, i) => (turn - turns[i]! + 4) % 4)
    expect([turns.join(','), steps.every(step => step === 0 || step === 1)]).toEqual([turns.join(','), true])
  }
})

test('the load crank keeps its hub and turns with the hand, not as one flickering pixel', () => {
  const act = actOf('test', 'obciążenie')
  // Piasta korby stoi w jednym miejscu od rekwizytu na ziemi do końca pętli.
  for (const rows of [pad(act.kit!), ...played(act)]) expect([rows.join('/'), rows[2]![10]]).toEqual([rows.join('/'), 'S'])
  const loop = loopOf(act)
  loop.forEach((rows, t) => {
    const next = loop[(t + 1) % loop.length]!
    expect([t, changed(rows, next) === 1]).toEqual([t, false])
  })
})

// Składowe spójne niepustych pikseli (z przekątnymi), które nie sięgają dolnego wiersza.
function hanging(rows: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  rows.forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell === '.' || seen.has(`${x},${y}`)) return
    const part: [number, number][] = []
    const queue: [number, number][] = [[x, y]]
    seen.add(`${x},${y}`)
    while (queue.length > 0) {
      const [cx, cy] = queue.pop()!
      part.push([cx, cy])
      for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
        const nx = cx + dx
        const ny = cy + dy
        if ((rows[ny]?.[nx] ?? '.') === '.' || seen.has(`${nx},${ny}`)) continue
        seen.add(`${nx},${ny}`)
        queue.push([nx, ny])
      }
    }
    if (!part.some(([, py]) => py === rows.length - 1)) out.push(part.map(([px, py]) => `${px}:${py}`).join(' '))
  }))
  return out
}

test('a kit of the forge, the trials and the seal stands on the ground: no part of it hangs in the air', () => {
  for (const scene of ['hammer', 'build', 'test', 'seal'] as const) {
    for (const act of ACTS[scene]) {
      if (act.kit === undefined) continue
      expect([`${scene}/${act.name}`, hanging(pad(act.kit))]).toEqual([`${scene}/${act.name}`, []])
    }
  }
})

// Zasięg ręki: najdalszy piksel skóry na prawo od tułowia, połączony z nim przez skórę.
function reach(rows: readonly string[]): number {
  const top = rows.findIndex(row => row.includes('gggg'))
  if (top < 0) return 0
  const edge = rows[top]!.indexOf('gggg') + 4
  const seen = new Set<string>()
  const queue: [number, number][] = rows.flatMap((row, y) => (row[edge + 1] === 'g' ? [[edge + 1, y] as [number, number]] : []))
  for (const [x, y] of queue) seen.add(`${x},${y}`)
  let far = 0
  while (queue.length > 0) {
    const [x, y] = queue.pop()!
    far = Math.max(far, x - edge)
    for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
      const nx = x + dx
      const ny = y + dy
      if (nx <= edge || rows[ny]?.[nx] !== 'g' || seen.has(`${nx},${ny}`)) continue
      seen.add(`${nx},${ny}`)
      queue.push([nx, ny])
    }
  }
  return far
}

// Przy kowadle ręka ma 2–3 piksele; ten sam ork nie wyciąga jej na pół warsztatu przy innym sprzęcie:
// rekwizyt stoi pod dłonią.
test('in the forge, the trials, the seal, the build and the teardown a hand reaches at most six pixels', () => {
  for (const scene of ['hammer', 'build', 'test', 'seal', 'tear'] as const) {
    for (const act of ACTS[scene]) {
      for (const rows of played(act)) {
        expect([`${scene}/${act.name}`, reach(rows) <= 6]).toEqual([`${scene}/${act.name}`, true])
      }
    }
  }
})

test('the pipette keeps its length and drips into the liquid, not onto the glass', () => {
  const act = actOf('test', 'fiolki')
  const kit = pad(act.kit!)
  const handles = loopOf(act).map(rows => rows.slice(0, 4).join('').split('h').length - 1)
  expect(new Set(handles).size).toBe(1)
  for (const rows of loopOf(act)) {
    rows.forEach((row, y) => [...row].forEach((cell, x) => {
      if (cell !== 'W' || kit[y]![x] === 'W') return
      expect([`${x}:${y}`, 'fdj'.includes(kit[y]![x]!)]).toEqual([`${x}:${y}`, true])
    }))
  }
})

test('the file, the steel in the vise and the jaws have three colors, and the file makes two strokes a loop', () => {
  const loop = loopOf(actOf('hammer', 'pilnik'))
  const handles = loop.map(rows => rows[2]!.indexOf('hh', 6))
  for (const [t, rows] of loop.entries()) {
    const vise = rows[5]!.indexOf('xxxx', 12)
    const blade = rows[2]![handles[t]! + 2]!
    expect([t, blade === rows[2]![vise + 2], blade === rows[4]![vise + 1]]).toEqual([t, false, false])
  }
  // Pchnięcie i powrót to dwie zmiany kierunku; dwa pociągnięcia to cztery.
  const moves = handles.map((x, t) => handles[(t + 1) % handles.length]! - x).filter(step => step !== 0)
  const turns = moves.filter((step, i) => Math.sign(step) !== Math.sign(moves[(i + 1) % moves.length]!)).length
  expect(turns).toBeGreaterThanOrEqual(4)
})

test('the broken wall sinks and the new one rises a row or two a frame, nothing vanishes at once', () => {
  const loop = loopOf(actOf('tear', 'mur'))
  const top = (rows: readonly string[]) => {
    const y = rows.findIndex(row => /[kqc]/u.test(row))
    return y < 0 ? rows.length : y
  }
  loop.forEach((rows, t) => {
    const next = loop[(t + 1) % loop.length]!
    expect([t, Math.abs(top(next) - top(rows)) <= 2]).toEqual([t, true])
  })
})

test('the gilding brush shows its wet tip on the gilded frame it paints', () => {
  const act = actOf('hammer', 'złocenie')
  const kit = pad(act.kit!)
  for (const [t, rows] of loopOf(act).entries()) {
    // Czubek tuż za białą skuwką pędzla.
    const y = rows.findIndex(row => row.includes('j'))
    const x = rows[y]!.indexOf('j') + 1
    expect([t, rows[y]![x] === kit[y]![x]]).toEqual([t, false])
  }
})

test('an orc pushing a tool shuffles its feet only while it moves', () => {
  for (const [scene, name] of [['hammer', 'hebel'], ['hammer', 'złocenie'], ['build', 'kęs'], ['tear', 'gruz']] as const) {
    const loop = loopOf(actOf(scene, name))
    const at = (rows: readonly string[]) => rows[0]!.indexOf('gggg') - 1
    loop.forEach((rows, t) => {
      const next = loop[(t + 1) % loop.length]!
      if (at(rows) !== at(next)) return
      expect([`${scene}/${name}`, t, next[5]!.slice(at(next), at(next) + 6)]).toEqual([`${scene}/${name}`, t, rows[5]!.slice(at(rows), at(rows) + 6)])
    })
  }
})
