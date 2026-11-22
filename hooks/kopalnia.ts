// Ruch tła Desktopu (tryb `tlo`): iskry znad paleniska, pył ze stropu i błysk rudy nad sceną
// z `backdrop.ts`. Język shaderów silnika ('claude-code/shader'): silnik czyta ten plik i go nie
// uruchamia. Liczby `heat`, `dust`, `gold` podaje mod (`backdropValues`); czas liczy aplikacja.

import { abs, clamp, floor, fract, max, mod, picture, shader, sin, size, smoothstep, step, time, values, vec2, vec3, vec4 } from 'claude-code/shader'

const state = values({ heat: [0, 1], dust: [0, 1], gold: [0, 1] })

// Gruby piksel tła w punktach okna: ziarna są kwadratami jak na pasie.
const CELL = 5
const LAYERS = 3
// Pole rysunku i palenisko z `backdrop.ts` (`WIDE`, `TALL`, `HEARTH_X`, wysokość `HEARTH_TOP` od
// dołu): ten plik nie może niczego importować, więc liczby stoją tu drugi raz.
const VIEW_WIDE = 320
const VIEW_TALL = 200
const HEARTH_X = 96
const HEARTH_UP = 34

// Los z liczby. Mnożnik mały: liczby to 32-bitowe floaty i przy 43758 ułamek miał 256 stopni,
// więc co 256. kolumna losowała równe 0 i świeciła na stałe, choć próg też był 0.
function hash(n: number): number {
  return fract(sin(n * 127.1 + 311.7) * 437.585453)
}

const mine = picture(p => {
  const cell = vec2(floor(p.point / CELL))
  const rows = max(1, floor(size.y / CELL))
  // Okno przycina rysunek do swoich proporcji, środek w środku: stąd wylot paleniska w punktach okna.
  const scale = max(size.x / VIEW_WIDE, size.y / VIEW_TALL)
  const mouth = vec2(size.x * 0.5 + (HEARTH_X - VIEW_WIDE * 0.5) * scale, size.y * 0.5 + (HEARTH_UP - VIEW_TALL * 0.5) * scale)
  // Iskry lecą tylko nad paleniskiem: słup wąski u wylotu, szerszy wyżej. Poza nim nie ma żadnej,
  // bo pojedyncze piksele rozsiane po oknie wyglądały jak brud, nie jak ogień.
  const up = cell.y - floor(mouth.y / CELL)
  const reach = max(4, rows * 0.45)
  const wide = max(1, scale * (8 + 16 * clamp(up / reach, 0, 1)))
  const near = (1 - smoothstep(0, 1, abs(p.point.x - mouth.x) / wide)) * step(0, up)
  let color = vec3(0)
  let alpha = 0
  for (let layer = 0; layer < LAYERS; layer += 1) {
    const seed = cell.x * 1.37 + layer * 57.3
    const rise = mod(hash(seed + 3.1) * reach + time * (3 + 5 * hash(seed + 9.7)), reach * 1.4)
    const sparks = step(hash(seed), 0.5 * near * state.heat) * step(0.001, near) * step(abs(up - floor(rise)), 0.5) * clamp(1 - rise / reach, 0, 1)
    color = vec3(color + vec3(1, 0.55 + 0.3 * hash(seed + 1.9), 0.12) * sparks)
    alpha = alpha + sparks
    // Pył: ziarna spadają ze stropu, gdy testy czerwone.
    const fall = mod(hash(seed + 21.7) * rows + time * (2 + 4 * hash(seed + 33.3)), rows)
    const grains = step(hash(seed + 44.1), 0.12 * state.dust) * step(0.001, state.dust) * step(abs(cell.y - (rows - floor(fall))), 0.5) * 0.55
    color = vec3(color + vec3(0.62, 0.57, 0.5) * grains)
    alpha = alpha + grains
  }
  // Ruda: pojedyncze piksele błyskają na zmianę, gdy Krux dumny.
  const grain = hash(cell.x * 13.1 + cell.y * 71.7)
  const blink = fract(grain * 9 + time * 0.6)
  const glint = step(0.994, grain) * smoothstep(0, 0.15, blink) * (1 - smoothstep(0.15, 0.5, blink)) * state.gold
  color = vec3(color + vec3(0.95, 0.76, 0.3) * glint)
  alpha = alpha + glint
  // Żar: ciepła poświata wokół paleniska przy robocie, czerwieńsza przy czerwonych testach.
  const warm = (1 - smoothstep(0, 0.45, p.uv.y)) * (1 - smoothstep(0, size.x * 0.5, abs(p.point.x - mouth.x))) * 0.14 * state.heat
  color = vec3(color + vec3(0.95, 0.45 - 0.25 * state.dust, 0.1) * warm)
  alpha = alpha + warm
  return vec4(color, clamp(alpha, 0, 1))
})

export default shader({ fps: 30, passes: [mine] })
