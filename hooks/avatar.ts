// Awatar rozmowy: cztery piksele w pionie to dwa wiersze półbloków.
// Głowa i znaki fachu pochodzą z tych samych rysunków co płótno hordy.

import { dress } from './apron'
import type { Face } from './apron'
import { runsOf, SPEAKER_COLOR } from './sprites'
import type { Run } from './sprites'
import { head, STAND } from './stage'

export type AvatarSpeaker = Face | 'Morra'

export const AVATAR_COLUMNS = 6
export const MORRA_COLOR = '#5b9bd5'

// Imię i ramka mówią kolorem fartucha; Krux iskrą, Morra błękitem.
export function speakerColor(speaker: AvatarSpeaker): string {
  return speaker === 'Morra' ? MORRA_COLOR : SPEAKER_COLOR[speaker ?? 'ork']
}

export function avatarRows(speaker: AvatarSpeaker): Run[][] {
  if (speaker === 'Morra') {
    // Człowiek bez kłów i uszu orka; przezroczyste piksele tworzą oczy.
    return runsOf(['.gggg.', '.g..g.', '.gggg.', '..gg..'], 1).map(row => row.map(run => ({
      ...run,
      ...(run.color === undefined ? {} : { color: MORRA_COLOR }),
      ...(run.backgroundColor === undefined ? {} : { backgroundColor: MORRA_COLOR }),
    })))
  }
  // Nos Niucha i pędzel Ochry wychodzą poza głowę. Ubieramy szerszą
  // siatkę przed przycięciem: ich prawa krawędź zastępuje lewe ucho.
  // Lont zachowuje lewą kolumnę, w której tli się jego znak fachu.
  const grid = [...head(), STAND[3]!].map(row => row.padEnd(AVATAR_COLUMNS + 1, '.'))
  const left = speaker === 'Niuch' || speaker === 'Ochra' ? 1 : 0
  const rows = dress(grid, speaker).map(row => row.slice(left, left + AVATAR_COLUMNS))
  return runsOf(rows, 1)
}
