// Horda w jednej tabeli: nowy kumpel to jeden wpis tutaj i jedno imię w `KruxMate`.
// Typ pilnuje kompletności, a reszta modułów liczy swoje tabele z tej.

import type { KruxMate } from '../types'

export type MateEntry = {
  // Fach w panelu /krux.
  trade: string
  // Imię w każdej odmianie, poza kodem: kto padł w odpowiedzi i kogo wysłano.
  pattern: RegExp
  // „zdanie o X” i „nie X: o X była ostatnia wstawka” w notce o hordzie.
  locative: string
  accusative: string
  // Charakter w notce o hordzie: sam czasownik, bez rodzaju, żeby kumpel
  // brzmiał tak samo w każdej sesji, a model nie zgadywał, kto on czy ona.
  trait: string
  // Słowa fachu do notki, same rzeczowniki: w symulowanych rozmowach kumpel ze
  // słowami swojego fachu brzmiał jak on sam. Czasowniki („przepalić”) ciągnęły
  // model w opowieść w czasie przeszłym z rodzajem („przepalił”).
  words: string
  // Znak palety, którym kumpel podmienia skórzany fartuch.
  apron: string
}

export const ROSTER: Record<KruxMate, MateEntry> = {
  Niuch: { trade: 'zwiad, debug, przyczyna błędu', pattern: /(?<!\p{L})Niuch(?:a|owi|em|u)?(?!\p{L})/u, locative: 'Niuchu', accusative: 'Niucha', trait: 'węszy wszędzie i mówi półsłówkami', words: 'ślad, trop, nora', apron: 'N' },
  Grom: { trade: 'kuźnia: backend, API, dane', pattern: /(?<!\p{L})Grom(?:a|owi|em|ie)?(?!\p{L})/u, locative: 'Gromie', accusative: 'Groma', trait: 'mówi głośno i każdą sprawę chce wykuć od nowa', words: 'stal, palenisko, kowadło', apron: 'M' },
  Piryt: { trade: 'ocena: review, ryzyko', pattern: /(?<!\p{L})Piry(?:t|ta|towi|tem|cie)(?!\p{L})/u, locative: 'Pirycie', accusative: 'Piryta', trait: 'zrzędzi i w każdej stali widzi pęknięcie', words: 'pęknięcie, rysa, skaza', apron: 'P' },
  Ochra: { trade: 'frontend, UI', pattern: /(?<!\p{L})Ochr(?:a|y|ze|ę|ą|o)(?!\p{L})/u, locative: 'Ochrze', accusative: 'Ochrę', trait: 'pilnuje równych brzegów i kolorów', words: 'brzeg, barwa, krawędź', apron: 'O' },
  Młot: { trade: 'testy, weryfikacja', pattern: /(?<!\p{L})Mło(?:t|ta|towi|tem|cie)(?!\p{L})/u, locative: 'Młocie', accusative: 'Młota', trait: 'liczy wszystko dwa razy i nie wierzy na słowo', words: 'dowód, rachunek, próba', apron: 'L' },
  Lont: { trade: 'rozbiórka: martwy kod, refaktor', pattern: /(?<!\p{L})Lon(?:t|ta|towi|tem|cie)(?!\p{L})/u, locative: 'Loncie', accusative: 'Lonta', trait: 'kocha rozbiórkę, ale lont mierzy trzy razy', words: 'lont, miara, gruz', apron: 'T' },
}

// Kolejność wpisów to kolejność w panelu i przy szukaniu imienia.
export const MATES = Object.keys(ROSTER) as KruxMate[]
