// Tło Desktopu (tryb `tlo`): kopalnia za rozmową, na całe okno. Silnik rysuje je tylko w aplikacji
// Desktop i mobilnej (`Backdrop`); terminal tła nie ma. Rysunek to czysty wektor (`Svg`), a ruch
// gra `Shader` z `kopalnia.ts`: mod podaje mu tylko stan sesji w liczbach, bez zegara.

import type { KruxMood } from '../types'

export const BACKDROP_SCENE = 'kopalnia'
export const BACKDROP_ALT = 'Chodnik kopalni Kruxa: stemple, tory i żar paleniska.'
// Szkło paneli nad tłem: ciemne i dość kryjące, żeby tekst rozmowy zostawał czytelny.
export const BACKDROP_GLASS = { blur: 10, tint: '#14110f', opacity: 0.78 } as const

// Liczby dla shadera, każda 0–1: `heat` żar przy robocie, `dust` pył przy czerwonych testach,
// `gold` błysk rudy, gdy Krux dumny. To stan, nie strumień: aplikacja sama płynnie do nich dochodzi.
export type BackdropValues = { heat: number; dust: number; gold: number }

export function backdropValues(input: { working: boolean; red: boolean; mood: KruxMood }): BackdropValues {
  return { heat: input.working ? 1 : 0.3, dust: input.red ? 1 : 0, gold: input.mood === 'proud' ? 1 : 0 }
}

const WIDE = 320
const TALL = 200
// Stemple co tyle jednostek, tory na dole, żyła rudy w skale.
const BAY = 64

function rect(x: number, y: number, w: number, h: number, fill: string, opacity = 1): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${opacity === 1 ? '' : ` opacity="${opacity}"`}/>`
}

// Los z numeru: ten sam rysunek przy każdym wywołaniu.
function noise(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// Skończona scena: `Svg` stoi sam przy ograniczonym ruchu i tam, gdzie shader nie gra.
export function backdropSvg(): string {
  const parts: string[] = [rect(0, 0, WIDE, TALL, '#14110f')]
  // Warstwy skały: pasy o różnej ciemności i pojedyncze kamienie.
  for (let band = 0; band < 6; band += 1) parts.push(rect(0, 18 + band * 28, WIDE, 2, '#1d1915'))
  for (let n = 0; n < 90; n += 1) {
    const x = Math.floor(noise(n) * WIDE)
    const y = Math.floor(noise(n + 500) * (TALL - 30))
    parts.push(rect(x, y, 2 + Math.floor(noise(n + 900) * 4), 2, noise(n + 1300) < 0.5 ? '#211c17' : '#1a1612'))
  }
  // Żyła rudy: ukośny pas złotych i miedzianych ziaren.
  for (let n = 0; n < 26; n += 1) {
    const x = 150 + n * 5 + Math.floor(noise(n + 40) * 4)
    const y = 44 + Math.floor(n * 1.6) + Math.floor(noise(n + 80) * 6)
    parts.push(rect(x, y, 2, 2, noise(n + 120) < 0.35 ? '#d9a520' : '#8a5a2b', 0.8))
  }
  // Stemple z kapą.
  for (let x = 8; x < WIDE; x += BAY) {
    parts.push(rect(x, 6, 4, TALL - 22, '#3d2b1f'), rect(x + 4, 6, 1, TALL - 22, '#2a1e16'))
    parts.push(rect(x - 6, 6, 16, 4, '#4a3423'))
  }
  parts.push(rect(0, 6, WIDE, 3, '#3d2b1f'))
  // Lampy na co drugim stemplu.
  for (let x = 8 + BAY; x < WIDE; x += BAY * 2) parts.push(rect(x + 6, 12, 1, 6, '#2a1e16'), rect(x + 5, 18, 3, 4, '#f2c14e'), rect(x + 5, 22, 3, 1, '#b5651d'))
  // Tory: podkłady i dwie szyny.
  for (let x = 2; x < WIDE; x += 10) parts.push(rect(x, TALL - 12, 6, 3, '#3d2b1f'))
  parts.push(rect(0, TALL - 14, WIDE, 2, '#6b6b70'), rect(0, TALL - 9, WIDE, 1, '#4c4c52'))
  parts.push(rect(0, TALL - 6, WIDE, 6, '#0f0d0b'))
  // Palenisko w lewym dolnym rogu: kamień, węgiel i żar.
  parts.push(rect(10, TALL - 34, 30, 20, '#5a5a5f'), rect(13, TALL - 31, 24, 14, '#0f0d0b'), rect(13, TALL - 21, 24, 4, '#b22222'), rect(16, TALL - 24, 6, 3, '#f28c28'), rect(26, TALL - 25, 5, 4, '#f2c14e'))
  const glow = `<defs><radialGradient id="zar" cx="0.08" cy="0.9" r="0.5"><stop offset="0" stop-color="#f28c28" stop-opacity="0.22"/><stop offset="1" stop-color="#f28c28" stop-opacity="0"/></radialGradient></defs>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDE} ${TALL}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges">${glow}${parts.join('')}<rect x="0" y="0" width="${WIDE}" height="${TALL}" fill="url(#zar)"/></svg>`
}
