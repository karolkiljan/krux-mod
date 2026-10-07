// Drzewo wiadomości czatu: każdy mówca z lewej, awatar przy nagłówku.
// Okablowanie dostarcza mówcę i czas; treść pozostaje drzewem silnika.

import type { BoxProps, ElementConstructor, RenderElement, TextProps } from 'claude-code'

import { AVATAR_COLUMNS, avatarRows, speakerColor } from './avatar'
import type { AvatarSpeaker } from './avatar'

// Kolumna, od której zaczyna się dymek: awatar i odstęp. Wiersze narzędzi
// w czacie stoją od niej, równo z ramkami.
export const CHAT_INDENT = AVATAR_COLUMNS + 1

export type ChatElements = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps> }

export type ChatData = {
  speaker: AvatarSpeaker
  // Gotowe HH:MM z chwili wiadomości; renderowanie nie odczytuje zegara.
  time: string
  // Wynik `next(e)`, także nieprzezroczysty węzeł `engine`.
  content: RenderElement
}

export function chatTree({ Box, Text }: ChatElements, data: ChatData): RenderElement {
  const color = speakerColor(data.speaker)
  const avatar = Box({
    key: 'chat-avatar',
    flexDirection: 'column',
    flexShrink: 0,
    width: AVATAR_COLUMNS,
    minWidth: AVATAR_COLUMNS,
    height: 2,
    // Głowa stoi przy pierwszym wierszu treści, pod krawędzią z nagłówkiem.
    marginTop: 1,
    children: avatarRows(data.speaker).map(row => Text({
      color,
      wrap: 'truncate-end',
      children: row.map(({ text, ...colors }) => Text({ ...colors, children: [text] })),
    })),
  })
  // Silnik odrzuca drzewo, gdy jego treść (`engine`) leży pod Boxem z `width`.
  // Dymek bierze więc resztę wiersza (`flexGrow`).
  const message = Box({
    key: 'chat-message',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    // Prawa krawędź ramki nie styka się z panelem obok.
    marginRight: 1,
    children: [
      // Ramka dzieli rozmowę na dymki. Silnik stawia pusty wiersz nad
      // wiadomością; w ramce byłby zbędny, więc treść wchodzi na niego.
      Box({
        key: 'chat-body',
        borderStyle: 'round',
        borderColor: color,
        paddingX: 1,
        children: [Box({ key: 'chat-content', flexDirection: 'column', marginTop: -1, children: [data.content] })],
      }),
      // Nagłówek leży na górnej krawędzi ramki, jak tytuł, bez własnego wiersza.
      Box({
        key: 'chat-header',
        position: 'absolute',
        top: 0,
        left: 2,
        right: 2,
        height: 1,
        children: [Text({ bold: true, color, wrap: 'truncate-end', children: [` ${data.speaker ?? 'ork'} · ${data.time} `] })],
      }),
    ],
  })
  return Box({
    key: 'chat',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
    columnGap: CHAT_INDENT - AVATAR_COLUMNS,
    // Pusty wiersz nad dymkiem oddziela go od poprzedniego i od wierszy narzędzi.
    marginTop: 1,
    children: [avatar, message],
  })
}

// Wiersz narzędzi między dymkami stoi pod tekstem dymków. Bez ramki: treść
// silnika bywa pusta (silnik wciąga grupę do wiersza poprzedniego narzędzia),
// a ramki wokół niej nie da się zwinąć, więc zostałby pusty prostokąt.
export const TOOL_INDENT = CHAT_INDENT + 2

export function toolIndent({ Box }: ChatElements, content: RenderElement): RenderElement {
  return Box({ key: 'chat-tool', paddingLeft: TOOL_INDENT, children: [content] })
}
