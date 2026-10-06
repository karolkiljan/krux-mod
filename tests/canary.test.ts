import { expect, test } from 'claude-code/testing'

import { TEST_ACTS, canaryResult } from '../hooks/acts/test'
import { MATE_APRONS, PALETTE } from '../hooks/palette'

const canary = TEST_ACTS.find(act => act.name === 'kanarek')!

test('a real canary result recognizes every hop and preserves the orc and cage', () => {
  for (let step = 0; step < canary.length; step += 1) {
    const before = canary.loop(step, step)
    for (const passed of [false, true]) {
      for (let t = 0; t < 14; t += 1) {
        const after = canaryResult(before, passed, t)!
        expect(after).not.toBe(null)
        expect(after.length).toBe(6)
        expect(after.every(row => row.length <= 22)).toBe(true)
        expect(after.map(row => row.slice(0, 12))).toEqual(before.map(row => row.slice(0, 12)))
        expect(after[0]!.slice(12, 21)).toBe(before[0]!.slice(12, 21))
        expect(after[5]!).toBe(before[5]!)
        expect(after[4]!.slice(12, 21)).toBe(before[4]!.slice(12, 21))
        expect(after.join('').split('r').length - 1).toBe(2)
        expect(after.join('').includes('b')).toBe(true)
        expect([...after.join('')].every(cell => cell === '.' || (PALETTE[cell] !== undefined && !MATE_APRONS.has(cell)))).toBe(true)
      }
    }
  }
})

test('success sings with moving wings and failure leaves a fallen closed eye', () => {
  const before = canary.loop(4, 4)
  const singing = canaryResult(before, true, 6)!
  const wing = canaryResult(before, true, 7)!
  const fallen = canaryResult(before, false, 6)!
  expect(singing).not.toEqual(wing)
  expect(singing).not.toEqual(fallen)
  expect(singing[2]![21]).toBe('j')
  expect(fallen[3]!).toContain('yGyo')
  expect(fallen[1]!.slice(13, 20)).not.toContain('y')
  expect(canaryResult(canary.loop(0, 0), false, 6)![3]!.slice(12, 21)).toBe(fallen[3]!.slice(12, 21))
})

test('result recognition rejects other trials, clipped cages and unrelated times', () => {
  for (const act of TEST_ACTS.filter(act => act !== canary)) {
    for (let t = 0; t < act.length; t += 1) expect(canaryResult(act.loop(t, t), true, 5)).toBe(null)
  }
  expect(canaryResult(canary.intro[0]!, true, 5)).toBe(null)
  expect(canaryResult(canary.loop(0, 0), true, -1)).toBe(null)
  expect(canaryResult(canary.loop(0, 0), true, 14)).toBe(null)
})
