// Arkusz klatek czynności do oglądania i sprawdzania. Wymaga `sips` (macOS).
//   npx tsx scripts/act-sheet.ts <scena> [plik.png] [nazwa czynności]
//   npx tsx scripts/act-sheet.ts hooks/acts/<plik>.ts:<EKSPORT> [plik.png] [nazwa czynności]
// Drugi zapis czyta sam plik czynności, bez katalogu scen: nową scenę widać i da się
// ją sprawdzić, zanim trafi do `ACTS`. Każda czynność to wiersze klatek: stójka,
// wejście, pętla; między czynnościami pusty wiersz. Skrypt wypisuje złamane zasady
// klatek (te same, które pilnuje `tests/sprites.test.ts`) i wtedy kończy się kodem 1.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { dress } from '../hooks/apron.ts'
import { MATE_APRONS, PALETTE } from '../hooks/palette.ts'
import { H, STAND, W, moodOf, pad } from '../hooks/stage.ts'
import type { Act, Frame } from '../hooks/stage.ts'

const PER_ROW = 5
const S = 9
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

// Klatki czynności: wejście i pętla, pętla w dwóch chwilach zegara, bo ogień i woda szumią.
function framesOf(act: Act): { label: string; rows: Frame }[] {
  return [
    ...act.intro.map((rows, i) => ({ label: `${act.name} wejście ${i}`, rows })),
    ...Array.from({ length: act.length }, (_, t) => ({ label: `${act.name} pętla ${t}`, rows: act.loop(t, t) })),
    ...Array.from({ length: act.length }, (_, t) => ({ label: `${act.name} pętla ${t} (zegar ${t + 17})`, rows: act.loop(t, t + 17) })),
  ]
}

// Zasady klatki: prostokąt, paleta bez fartuchów kumpli, fartuch 'b', 0 albo 2 oczy,
// dwie brwi przy złości, jeden lont Lonta tuż przy głowie.
function problemsOf(label: string, rows: Frame): string[] {
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

function sheet(acts: readonly Act[], out: string): void {
  const strips: string[][][] = []
  for (const act of acts) {
    const frames = [STAND, ...act.intro, ...Array.from({ length: act.length }, (_, t) => act.loop(t, t))].map(pad)
    for (let i = 0; i < frames.length; i += PER_ROW) strips.push(frames.slice(i, i + PER_ROW))
    strips.push([])
  }
  const width = PER_ROW * (W + GAP) * S
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
  const rowBytes = Math.ceil((width * 3) / 4) * 4
  const bmp = Buffer.alloc(54 + rowBytes * height)
  bmp.write('BM')
  bmp.writeUInt32LE(bmp.length, 2)
  bmp.writeUInt32LE(54, 10)
  bmp.writeUInt32LE(40, 14)
  bmp.writeInt32LE(width, 18)
  bmp.writeInt32LE(height, 22)
  bmp.writeUInt16LE(1, 26)
  bmp.writeUInt16LE(24, 28)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = ((height - 1 - y) * width + x) * 3
      const o = 54 + y * rowBytes + x * 3
      bmp[o] = px[i + 2]!
      bmp[o + 1] = px[i + 1]!
      bmp[o + 2] = px[i]!
    }
  const directory = mkdtempSync(join(tmpdir(), 'act-sheet-'))
  try {
    const tmp = join(directory, 'sheet.bmp')
    writeFileSync(tmp, bmp, { flag: 'wx' })
    execFileSync('sips', ['-s', 'format', 'png', tmp, '--out', out], { stdio: 'ignore' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Arkusz PNG wymaga macOS i polecenia sips; ta platforma nie jest obsługiwana.')
  const source = process.argv[2] ?? 'lounge'
  const only = process.argv[4]
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
  sheet(acts, out)
  console.log(out)
  for (const act of acts) console.log(`${act.name}: wejście ${act.intro.length}, pętla ${act.length}`)
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
