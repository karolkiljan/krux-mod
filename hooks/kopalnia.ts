// Ruch tła Desktopu (tryb `tlo`): iskry znad paleniska, pył ze stropu i błysk rudy nad sceną
// z `backdrop.ts`. Język shaderów silnika ('claude-code/shader'): silnik czyta ten plik i go nie
// uruchamia. Liczby `heat`, `dust`, `gold` podaje mod (`backdropValues`); czas liczy aplikacja.

import { abs, clamp, floor, fract, max, mod, picture, shader, sin, size, smoothstep, step, time, values, vec2, vec3, vec4 } from 'claude-code/shader'

const state = values({ heat: [0, 1], dust: [0, 1], gold: [0, 1] })

// Gruby piksel tła w punktach okna: ziarna są kwadratami jak na pasie.
const CELL = 5
const LAYERS = 3

function hash(n: number): number {
  return fract(sin(n * 127.1 + 311.7) * 43758.5453)
}

const mine = picture(p => {
  const cell = vec2(floor(p.point / CELL))
  const rows = max(1, floor(size.y / CELL))
  let color = vec3(0)
  let alpha = 0
  for (let layer = 0; layer < LAYERS; layer += 1) {
    const seed = cell.x * 1.37 + layer * 57.3
    const lane = hash(seed)
    // Iskry: rzadkie kolumny, każda w swoim tempie; gasną z wysokością i gęstnieją przy lewym brzegu.
    const rise = mod(hash(seed + 3.1) * rows + time * (3 + 5 * hash(seed + 9.7)), rows * 1.5)
    const near = 1 - smoothstep(0, 0.6, p.uv.x)
    const sparks = step(lane, (0.03 + 0.1 * near) * state.heat) * step(abs(cell.y - floor(rise)), 0.5) * clamp(1 - rise / (rows * 0.7), 0, 1)
    color = vec3(color + vec3(1, 0.55 + 0.3 * hash(seed + 1.9), 0.12) * sparks)
    alpha = alpha + sparks
    // Pył: ziarna spadają ze stropu, gdy testy czerwone.
    const fall = mod(hash(seed + 21.7) * rows + time * (2 + 4 * hash(seed + 33.3)), rows)
    const grains = step(hash(seed + 44.1), 0.12 * state.dust) * step(abs(cell.y - (rows - floor(fall))), 0.5) * 0.55
    color = vec3(color + vec3(0.62, 0.57, 0.5) * grains)
    alpha = alpha + grains
  }
  // Ruda: pojedyncze piksele błyskają na zmianę, gdy Krux dumny.
  const grain = hash(cell.x * 13.1 + cell.y * 71.7)
  const blink = fract(grain * 9 + time * 0.6)
  const glint = step(0.994, grain) * smoothstep(0, 0.15, blink) * (1 - smoothstep(0.15, 0.5, blink)) * state.gold
  color = vec3(color + vec3(0.95, 0.76, 0.3) * glint)
  alpha = alpha + glint
  // Żar: ciepła poświata od dołu przy robocie, czerwieńsza przy czerwonych testach.
  const warm = (1 - smoothstep(0, 0.45, p.uv.y)) * 0.1 * state.heat
  color = vec3(color + vec3(0.95, 0.45 - 0.25 * state.dust, 0.1) * warm)
  alpha = alpha + warm
  return vec4(color, clamp(alpha, 0, 1))
})

export default shader({ fps: 30, passes: [mine] })
