// Arkusz klatek czynności do oglądania i sprawdzania. PNG zapisuje sam (`node:zlib`),
// bez zewnętrznych narzędzi, więc arkusz i walidacja klatek działają na każdej platformie.
//   npx tsx scripts/act-sheet.ts <scena> [plik.png] [nazwa czynności]
//   npx tsx scripts/act-sheet.ts hooks/acts/<plik>.ts:<EKSPORT> [plik.png] [nazwa czynności]
//   npx tsx scripts/act-sheet.ts gesty [plik.png] [nazwa gestu]
// Drugi zapis czyta sam plik czynności, bez katalogu scen: nową scenę widać i da się
// ją sprawdzić, zanim trafi do `ACTS`. Każda czynność to wiersze klatek: stójka,
// wejście, pętla; między czynnościami pusty wiersz. Trzeci zapis rysuje gesty wiercenia
// (`hooks/fidget.ts`): każdy gest na kilku pozach bazowych (stójka i początki pętli
// różnych czynności, także siedzącej i pochylonej), wiersz to poza i wszystkie kroki gestu;
// sprawdza go na początku pętli każdej czynności z `ACTS`. Skrypt wypisuje złamane zasady
// klatek (te same, które pilnuje `tests/sprites.test.ts`) i wtedy kończy się kodem 1.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

import { dress } from '../hooks/apron.ts'
import { MATE_APRONS, PALETTE } from '../hooks/palette.ts'
import { GESTURES, headOf } from '../hooks/fidget.ts'
import { H, STAND, W, entryOf, moodOf, pad } from '../hooks/stage.ts'
import type { Act, Frame } from '../hooks/stage.ts'

const PER_ROW = 5
const SCALE = 9
const GAP = 2

async function actsOf(source: string): Promise<readonly Act[]> {
  const colon = source.lastIndexOf(':')
  if (!source.endsWith('.ts') && colon > 0 && source.slice(0, colon).endsWith('.ts')) {
    const module = (await import(pathToFileURL(resolve(source.slice(0, colon))).href)) as Record<string, unknown>
    const acts = module[source.slice(colon + 1)]
    if (!Array.isArray(acts)) throw new Error(`${source}: brak tablicy czynności pod tym eksportem`)
    return acts as Act[]
  }
  const { ACTS } = (await import('../hooks/sprites.ts')) as { ACTS: Record<string, readonly Act[]> }
  const acts = ACTS[source]
  if (acts === undefined) throw new Error(`nie ma sceny „${source}”: ${Object.keys(ACTS).join(', ')}`)
  return acts
}

// Etykieta wskazuje pierwszego orka z `who`, tak jak fartuch na arkuszu.
function labelOf({ name, who }: Pick<Act, 'name' | 'who'>): string {
  return `${name}${who?.[0] === undefined ? '' : ` (${who[0]})`}`
}

// Klatki czynności: wyjęcie rekwizytu, wejście i pętla, pętla w dwóch chwilach zegara, bo ogień i woda szumią.
function framesOf(act: Act): { label: string; rows: Frame }[] {
  const label = labelOf(act)
  return [
    ...entryOf(act).map((rows, i) => ({ label: `${label} wejście ${i}`, rows })),
    ...Array.from({ length: act.length }, (_, t) => ({ label: `${label} pętla ${t}`, rows: act.loop(t, t) })),
    ...Array.from({ length: act.length }, (_, t) => ({ label: `${label} pętla ${t} (zegar ${t + 17})`, rows: act.loop(t, t + 17) })),
  ]
}

// Zasady klatki: prostokąt, paleta bez fartuchów kumpli, fartuch 'b', 0 albo 2 oczy,
// dwie brwi przy złości, jeden lont Lonta tuż przy głowie.
function problemsOf(label: string, rows: Frame, wick = true): string[] {
  const out: string[] = []
  if (rows.length > H) out.push(`${label}: ${rows.length} wierszy, najwyżej ${H}`)
  rows.forEach((row, y) => {
    if (row.length > W) out.push(`${label}: wiersz ${y} ma ${row.length} pikseli, najwyżej ${W}`)
  })
  const cells = [...rows.join('')]
  const strange = [...new Set(cells.filter(cell => cell !== '.' && (PALETTE[cell] === undefined || MATE_APRONS.has(cell))))]
  if (strange.length > 0) out.push(`${label}: znaki spoza palety albo fartuchy kumpli: ${strange.join('')}`)
  const eyes = cells.filter(cell => cell === 'r').length
  if (eyes !== 0 && eyes !== 2) out.push(`${label}: oczu ${eyes}, ma być 0 albo 2`)
  if (!cells.includes('b')) out.push(`${label}: brak fartucha 'b'`)
  const grid = pad(rows)
  if (eyes === 2) {
    const frown = pad(moodOf(grid, 'grumpy', false))
    const changed = grid.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === frown[y]![x] ? [] : [`${cell}${frown[y]![x]}`])))
    if (changed.join(',') !== 'gG,gG') out.push(`${label}: brwi przy złości zmieniają ${changed.join(',') || 'nic'}, mają dokładnie dwa piksele skóry 'g' nad oczami`)
  }
  if (!wick) return out
  const lont = dress(grid, 'Lont')
  const sparks = lont.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === 'o' && grid[y]![x] !== 'o' ? [[x, y] as const] : [])))
  if (sparks.length !== 1) {
    out.push(`${label}: lont Lonta nie ma miejsca przy głowie (kły 'tggt' albo czubek 'gggg' i wolny piksel z lewej)`)
  } else {
    const [x, y] = sparks[0]!
    const near = [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => 'gGrt'.includes(grid[y + dy]?.[x + dx] ?? '.')))
    if ('gGrytb'.includes(grid[y]![x]!) || !near) out.push(`${label}: lont Lonta siada na ciele albo z dala od głowy (${x}, ${y})`)
  }
  return out
}

// Paski czynności: stójka, wejście, pętla, po `PER_ROW` klatek w wierszu.
function actStrips(acts: readonly Act[]): string[][][] {
  const strips: string[][][] = []
  for (const act of acts) {
    const frames = [STAND, ...entryOf(act), ...Array.from({ length: act.length }, (_, t) => act.loop(t, t))].map(rows => dress(pad(rows), act.who?.[0] ?? 'Krux'))
    for (let i = 0; i < frames.length; i += PER_ROW) strips.push(frames.slice(i, i + PER_ROW))
    strips.push([])
  }
  return strips
}

// PNG z pikseli RGB: sygnatura, IHDR (8 bitów, RGB), jeden IDAT z wierszami po bajcie
// filtra 0, skompresowany przez deflate, i IEND; każdy kawałek z CRC-32 typu i danych.
function png(width: number, height: number, rgb: Buffer): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body) >>> 0, body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

function sheet(strips: readonly (readonly string[][])[], out: string, perRow = PER_ROW, S = SCALE): void {
  const width = perRow * (W + GAP) * S
  const height = strips.length * (H + GAP) * S
  const px = Buffer.alloc(width * height * 3, 30)
  strips.forEach((strip, r) =>
    strip.forEach((grid, c) =>
      grid.forEach((row, y) =>
        [...row].forEach((cell, x) => {
          const hex = PALETTE[cell] ?? (cell === '.' ? '#262626' : '#ff00ff')
          const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
          for (let dy = 0; dy < S; dy++)
            for (let dx = 0; dx < S; dx++) px.set(rgb, (((r * (H + GAP) + y) * S + dy) * width + (c * (W + GAP) + x) * S + dx) * 3)
        }),
      ),
    ),
  )
  writeFileSync(out, png(width, height, px))
}

// Pozy bazowe arkusza gestów: stójka i początki pętli, w tym poza siedząca, leżąca i pochylona.
const GESTURE_POSES: readonly (readonly [string, string])[] = [
  ['hammer', 'kowadło'],
  ['torch', 'węszenie'],
  ['lounge', 'fotel'],
  ['lounge', 'szezlong'],
  ['read', 'księga'],
  ['scout', 'luneta'],
]

// Zmiana pozy, której gest robić nie wolno: piksel rekwizytu albo fartucha poza głową.
function trespassOf(label: string, base: Frame, rows: Frame): string[] {
  const head = headOf(base)
  const before = pad(base)
  const after = pad(rows)
  const near = (x: number, y: number) => head !== null && y >= head.top && y <= head.top + 2 && x >= head.x - 1 && x <= head.x + 4
  const hit = before.flatMap((row, y) =>
    [...row].flatMap((cell, x) => (cell === after[y]![x] || cell === '.' || (near(x, y) && 'gGrt'.includes(cell)) ? [] : [`${cell}→${after[y]![x]} (${x}, ${y})`])),
  )
  return hit.length > 0 ? [`${label}: gest zasłania rekwizyt albo fartuch: ${hit.join(', ')}`] : []
}

async function gestureSheet(out: string, only: string | undefined): Promise<string[]> {
  const { ACTS } = (await import('../hooks/sprites.ts')) as { ACTS: Record<string, readonly Act[]> }
  const gestures = GESTURES.filter(gesture => only === undefined || gesture.name === only)
  if (gestures.length === 0) throw new Error(`brak gestu „${only}”: ${GESTURES.map(gesture => gesture.name).join(', ')}`)
  const shown = GESTURE_POSES.flatMap(([scene, name]) => ACTS[scene]?.filter(act => act.name === name).map(act => act.loop(0, 0)) ?? [])
  const bases = [STAND, ...shown]
  // Fartuch dopiero na podglądzie; niżej zasady sprawdzają surową klatkę gestu.
  const strips = gestures.flatMap(gesture => [...bases.map(base => Array.from({ length: gesture.length }, (_, t) => dress(pad(gesture.apply(base, t)), gesture.who?.[0] ?? 'Krux'))), []])
  sheet(strips, out, Math.max(...gestures.map(gesture => gesture.length)), 5)
  const problems: string[] = []
  const poses = [{ label: 'stójka', rows: STAND }, ...Object.entries(ACTS).flatMap(([scene, acts]) => acts.map(act => ({ label: `${scene}/${act.name}`, rows: act.loop(0, 0) })))]
  for (const gesture of gestures) {
    // Lont nosi lont tylko w gestach, które sam gra.
    const wick = gesture.who === undefined || gesture.who.includes('Lont')
    let moved = 0
    let checked = 0
    for (const pose of poses) {
      // Poza, która sama łamie zasady, to sprawa jej czynności, nie gestu.
      if (problemsOf(pose.label, pose.rows, wick).length > 0) continue
      checked += 1
      let changed = false
      for (let t = 0; t < gesture.length; t += 1) {
        const rows = gesture.apply(pose.rows, t)
        const label = `${labelOf(gesture)}/${pose.label}/${t}`
        problems.push(...problemsOf(label, rows, wick), ...trespassOf(label, pose.rows, rows))
        if (pad(rows).join('') !== pad(pose.rows).join('')) changed = true
      }
      if (changed) moved += 1
      else if (pose.rows === STAND) problems.push(`${gesture.name}: nie widać go na stójce`)
    }
    console.log(`${labelOf(gesture)}: ${gesture.length} kroków, widać na ${moved}/${checked} pozach`)
    if (moved * 2 < checked) problems.push(`${gesture.name}: widać go na mniej niż połowie póz (${moved}/${checked})`)
  }
  return problems
}

async function main(): Promise<void> {
  const source = process.argv[2] ?? 'lounge'
  const only = process.argv[4]
  if (source === 'gesty') {
    const out = process.argv[3] ?? join(mkdtempSync(join(tmpdir(), 'act-sheet-output-')), 'gesty.png')
    const problems = await gestureSheet(out, only)
    console.log(out)
    report(problems)
    return
  }
  const all = await actsOf(source)
  const acts = all.filter(act => only === undefined || act.name === only)
  if (acts.length === 0) throw new Error(`brak czynności „${only}”: ${all.map(act => act.name).join(', ')}`)
  const problems: string[] = []
  if (only === undefined && all.length < 3) problems.push(`scena ma ${all.length} czynności, najmniej 3`)
  const names = all.map(act => act.name)
  if (new Set(names).size !== names.length) problems.push(`powtórzone nazwy czynności: ${names.join(', ')}`)
  for (const act of acts) {
    if (act.length < 1) problems.push(`${act.name}: pętla bez klatek`)
    for (const { label, rows } of framesOf(act)) problems.push(...problemsOf(label, rows))
  }
  const out = process.argv[3] ?? join(mkdtempSync(join(tmpdir(), 'act-sheet-output-')), 'sheet.png')
  sheet(actStrips(acts), out)
  console.log(out)
  for (const act of acts) console.log(`${labelOf(act)}: wejście ${entryOf(act).length}, pętla ${act.length}`)
  report(problems)
}

function report(problems: readonly string[]): void {
  if (problems.length > 0) {
    console.log(`\nZłamane zasady (${problems.length}):\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log('Zasady klatek: wszystkie trzymać.')
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
