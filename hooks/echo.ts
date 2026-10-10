// Echo prośby: gdy tura długo pracuje, tabliczka odpowiedzi niesie cytat z prośby
// Morry, bo odpowiedź po przewinięciu odjeżdża od pytania. Czyste funkcje; stan
// (`lastPrompt`, `strikes`, `turnAt`) czyta register.ts.

import { terminalText } from './terminal-text'

// Próg: tyle uderzeń narzędzi w turze albo tyle czasu od jej początku.
export const ECHO_STRIKES = 4
export const ECHO_MS = 120_000
// Cytat w komórkach terminala, nie w punktach kodowych.
export const ECHO_COLUMNS = 60

// Prośba w jednym wierszu. Pusta albo nie-tekstowa daje brak echa.
export function echoPrompt(text: unknown): string | null {
  if (typeof text !== 'string') return null
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat === '' ? null : flat
}

// Cytat, gdy praca jest długa; krótka wymiana nie dostaje nic.
export function echoLine(prompt: string | null, strikes: number, elapsedMs: number): string | null {
  if (prompt === null) return null
  const long = strikes >= ECHO_STRIKES || (Number.isFinite(elapsedMs) && elapsedMs >= ECHO_MS)
  return long ? terminalText(prompt, ECHO_COLUMNS).text : null
}
