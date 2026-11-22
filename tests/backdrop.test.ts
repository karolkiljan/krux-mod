import { expect, test } from 'claude-code/testing'
import { HEARTH_X, WIDE, backdropSvg, backdropValues } from '../hooks/backdrop'

test('the backdrop numbers are session state: glow at work, dust on red tests, gold when Krux is proud', () => {
  expect(backdropValues({ working: false, red: false, mood: 'calm' })).toEqual({ heat: 0.3, dust: 0, gold: 0 })
  expect(backdropValues({ working: true, red: true, mood: 'grumpy' })).toEqual({ heat: 1, dust: 1, gold: 0 })
  expect(backdropValues({ working: false, red: false, mood: 'proud' })).toEqual({ heat: 0.3, dust: 0, gold: 1 })
})

test('the backdrop scene is one small pure-vector Svg the engine accepts, the same on every call', () => {
  const svg = backdropSvg()
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg.length).toBeLessThan(131_072)
  expect(backdropSvg()).toBe(svg)
  // Silnik odmawia obrazków, obcych adresów, skryptów i ukośnika wstecz; `url()` tylko do lokalnego `#`.
  for (const banned of ['<image', 'data:', 'base64', 'foreignObject', '@import', '@font-face', '<script', '\\', '<?', '<!']) expect([banned, svg.includes(banned)]).toEqual([banned, false])
  expect((svg.match(/url\(/gu) ?? []).length).toBe((svg.match(/url\(#/gu) ?? []).length)
  expect(svg).not.toMatch(/NaN|undefined/u)
})

test('the hearth stands clear of the app sidebar and the rock carries no loose ore', () => {
  // Lista sesji aplikacji zakrywa lewy brzeg okna (około jednej piątej): palenisko stoi dalej w prawo.
  expect(HEARTH_X / WIDE).toBeGreaterThan(0.25)
  expect(HEARTH_X / WIDE).toBeLessThan(0.4)
  // Żyła rudy zniknęła: pod szkłem paneli zostawało z niej kilka luźnych pikseli jak brud na ekranie.
  const svg = backdropSvg()
  for (const ore of ['#d9a520', '#8a5a2b']) expect([ore, svg.includes(ore)]).toEqual([ore, false])
})
