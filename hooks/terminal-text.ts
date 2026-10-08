// Tekst terminala: całe grafemy, szerokość w komórkach, bez normalizacji znaków.
// Segmentacja: Intl.Segmenter (UAX #29). Szerokie znaki: East_Asian_Width W/F;
// niejednoznaczne pozostają w jednej komórce, jak ramki terminala.
//
// Tablica W/F z wcwidth 0.9.2, Unicode 18.0.0 (EastAsianWidth-18.0.0.txt).
// https://github.com/jquast/wcwidth
// https://www.unicode.org/reports/tr11/
//
// Copyright (c) 2014 Jeff Quast <contact@jeffquast.com>
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x2329, 0x232a], [0x23e9, 0x23ec],
  [0x23f0, 0x23f0], [0x23f3, 0x23f3], [0x25fd, 0x25fe], [0x2614, 0x2615],
  [0x2630, 0x2637], [0x2648, 0x2653], [0x267f, 0x267f], [0x268a, 0x268f],
  [0x2693, 0x2693], [0x26a1, 0x26a1], [0x26aa, 0x26ab], [0x26bd, 0x26be],
  [0x26c4, 0x26c5], [0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x26ea, 0x26ea],
  [0x26f2, 0x26f3], [0x26f5, 0x26f5], [0x26fa, 0x26fa], [0x26fd, 0x26fd],
  [0x2705, 0x2705], [0x270a, 0x270b], [0x2728, 0x2728], [0x274c, 0x274c],
  [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797],
  [0x27b0, 0x27b0], [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50],
  [0x2b55, 0x2b55], [0x2e80, 0x2e99], [0x2e9b, 0x2ef3], [0x2f00, 0x2fd5],
  [0x2ff0, 0x3029], [0x3030, 0x303e], [0x3041, 0x3096], [0x309b, 0x30ff],
  [0x3105, 0x312f], [0x3131, 0x3163], [0x3165, 0x318e], [0x3190, 0x31e5],
  [0x31ef, 0x321e], [0x3220, 0x3247], [0x3250, 0xa48c], [0xa490, 0xa4c6],
  [0xa960, 0xa97c], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe10, 0xfe19],
  [0xfe30, 0xfe52], [0xfe54, 0xfe66], [0xfe68, 0xfe6b], [0xff01, 0xff60],
  [0xffe0, 0xffe6], [0x16fe0, 0x16fe3], [0x16ff2, 0x16ff6], [0x17000, 0x18cda],
  [0x18cff, 0x18d20], [0x18d80, 0x18df2], [0x18e00, 0x19191], [0x191a0, 0x191d2],
  [0x1aff0, 0x1aff3], [0x1aff5, 0x1affb], [0x1affd, 0x1affe], [0x1b000, 0x1b128],
  [0x1b132, 0x1b132], [0x1b150, 0x1b152], [0x1b155, 0x1b155], [0x1b164, 0x1b168],
  [0x1b170, 0x1b2fb], [0x1d300, 0x1d356], [0x1d360, 0x1d376], [0x1f004, 0x1f004],
  [0x1f0cf, 0x1f0cf], [0x1f18e, 0x1f18e], [0x1f191, 0x1f19a], [0x1f1ae, 0x1f1ae],
  [0x1f1e6, 0x1f202], [0x1f210, 0x1f23b], [0x1f240, 0x1f248], [0x1f250, 0x1f251],
  [0x1f260, 0x1f265], [0x1f300, 0x1f320], [0x1f32d, 0x1f335], [0x1f337, 0x1f37c],
  [0x1f37e, 0x1f393], [0x1f3a0, 0x1f3ca], [0x1f3cf, 0x1f3d3], [0x1f3e0, 0x1f3f0],
  [0x1f3f4, 0x1f3f4], [0x1f3f8, 0x1f43e], [0x1f440, 0x1f440], [0x1f442, 0x1f4fc],
  [0x1f4ff, 0x1f53d], [0x1f54b, 0x1f54e], [0x1f550, 0x1f567], [0x1f57a, 0x1f57a],
  [0x1f595, 0x1f596], [0x1f5a4, 0x1f5a4], [0x1f5fb, 0x1f64f], [0x1f680, 0x1f6c5],
  [0x1f6cc, 0x1f6cc], [0x1f6d0, 0x1f6d2], [0x1f6d5, 0x1f6d9], [0x1f6dc, 0x1f6df],
  [0x1f6eb, 0x1f6ec], [0x1f6f4, 0x1f6fc], [0x1f7da, 0x1f7da], [0x1f7e0, 0x1f7eb],
  [0x1f7f0, 0x1f7f0], [0x1f90c, 0x1f93a], [0x1f93c, 0x1f945], [0x1f947, 0x1f9ff],
  [0x1fa70, 0x1fa7c], [0x1fa80, 0x1fac6], [0x1fac8, 0x1fac8], [0x1facc, 0x1fadd],
  [0x1fadf, 0x1faeb], [0x1faef, 0x1fafa], [0x20000, 0x2fffd], [0x30000, 0x3fffd],
]

const SEGMENTS = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const ZERO_WIDTH = /[\p{Mark}\p{Default_Ignorable_Code_Point}\p{Control}]/u
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|[0-9#*]\uFE0F?\u20E3/u

function wide(point: number): boolean {
  let low = 0
  let high = WIDE_RANGES.length - 1
  while (low <= high) {
    const middle = (low + high) >>> 1
    const [from, to] = WIDE_RANGES[middle]!
    if (point < from) high = middle - 1
    else if (point > to) low = middle + 1
    else return true
  }
  return false
}

function columnsOf(grapheme: string): number {
  const visible = [...grapheme].find(char => !ZERO_WIDTH.test(char))
  if (visible === undefined) return 0
  // Emoji z ZWJ, odcieniem skóry, flagi i keycapy zajmują jeden szeroki grafem.
  if (EMOJI.test(grapheme)) return 2
  return wide(visible.codePointAt(0)!) ? 2 : 1
}

// Całe grafemy tekstu: flaga, rodzina z ZWJ i litera ze znakiem łączącym to jeden element.
export function graphemes(text: string): string[] {
  return [...SEGMENTS.segment(text)].map(({ segment }) => segment)
}

// Zwraca tekst z ewentualnym wielokropkiem i jego faktyczną szerokość.
// Szeroki grafem nie zawsze wypełni ostatnią dostępną komórkę.
export function terminalText(text: string, maxColumns: number): { text: string; columns: number } {
  const spans = [...SEGMENTS.segment(text)].map(({ segment }) => ({ text: segment, columns: columnsOf(segment) }))
  const columns = spans.reduce((sum, span) => sum + span.columns, 0)
  const room = Math.max(0, Number.isFinite(maxColumns) ? Math.floor(maxColumns) : 0)
  if (columns <= room) return { text, columns }
  if (room === 0) return { text: '', columns: 0 }
  let clipped = ''
  let used = 0
  for (const span of spans) {
    if (used + span.columns > room - 1) break
    clipped += span.text
    used += span.columns
  }
  return { text: clipped + '…', columns: used + 1 }
}

