// Drzewo wiadomości czatu: orkowie z lewej, Morra z prawej.
// Okablowanie dostarcza mówcę i czas; treść pozostaje drzewem silnika.

import type { BoxProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import { AVATAR_COLUMNS, avatarRows, speakerColor } from './avatar'
import type { AvatarSpeaker } from './avatar'

export type ChatElements = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps> }

export type ChatData = {
  speaker: AvatarSpeaker
  // Gotowe HH:MM z chwili wiadomości; renderowanie nie odczytuje zegara.
  time: string
  // Kolumny rozmowy, z pomiaru viewportu, po odjęciu paneli silnika.
  columns: number
  // Wynik `next(e)`, także nieprzezroczysty węzeł `engine`.
  content: RenderElement
}

export function chatTree({ Box, Text }: ChatElements, data: ChatData): RenderElement {
  const columns = Math.max(AVATAR_COLUMNS + 2, Math.floor(data.columns))
  const room = columns - AVATAR_COLUMNS - 1
  const right = data.speaker === 'Morra'
  const width = right ? Math.min(room, Math.floor(columns * 0.7)) : room
  const color = speakerColor(data.speaker)
  const avatar = Box({
    key: 'chat-avatar',
    flexDirection: 'column',
    flexShrink: 0,
    width: AVATAR_COLUMNS,
    minWidth: AVATAR_COLUMNS,
    height: 2,
    children: avatarRows(data.speaker).map(row => Text({
      color,
      wrap: 'truncate-end',
      children: row.map(({ text, ...colors }) => Text({ ...colors, children: [text] })),
    })),
  })
  // Silnik odrzuca drzewo, gdy jego treść (`engine`) leży pod Boxem z `width`.
  // Dymek bierze więc resztę wiersza (`flexGrow`), a Morrę odsuwa `paddingLeft`.
  const message = Box({
    key: 'chat-message',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    children: [
      // `quote` daje pusty wiersz nad i pod treścią. Jak w tabliczkach,
      // wyrównujemy te odstępy, żeby kreska zaczynała się pod nagłówkiem.
      Box({
        key: 'chat-body',
        borderStyle: 'quote',
        borderColor: color,
        marginBottom: -1,
        children: [Box({ key: 'chat-content', flexDirection: 'column', marginTop: -1, children: [data.content] })],
      }),
      // Silnik stawia pusty wiersz nad wiadomością; nagłówek leży na nim
      // jak tabliczka, więc nie dokłada wiersza między sobą a treścią.
      Box({
        key: 'chat-header',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        children: [Text({ bold: true, color, wrap: 'truncate-end', children: [`${data.speaker ?? 'ork'} · ${data.time}`] })],
      }),
    ],
  })
  return Box({
    key: 'chat',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
    justifyContent: right ? 'flex-end' : 'flex-start',
    columnGap: 1,
    paddingLeft: room - width,
    children: right ? [message, avatar] : [avatar, message],
  })
}
