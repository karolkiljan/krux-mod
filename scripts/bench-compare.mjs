#!/usr/bin/env node
// Porównanie serii voice-bench: średnia, odchylenie i test permutacyjny różnicy
// każdej serii względem pierwszej. Metryki liczy od nowa z `responses.json` tym
// samym kodem co `voice-bench.mjs` (źródło ładowane w vm, jak w testach skryptów),
// więc przebiegi ze starszej wersji benchu liczą się tak samo jak nowe. Liczniki
// z transkryptu (kotwice, notki) bierze z `report.json`, bo transkryptu już nie ma.
//
//   node scripts/bench-compare.mjs baza=<katalog> wariant=<katalog> [--model <id>] [--scenario cache|smrod] [--turn N]
//
// <katalog> to katalog z przebiegami (np. `benchmarks/voice-bench`): każdy podkatalog
// z `report.json` i `responses.json`. `--turn N` wypisuje odpowiedź z tury N
// każdego przebiegu, do czytania oczami (np. decyzja o wydaniu w `smrod`).

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function benchMetrics() {
  const source = fs.readFileSync(path.join(here, 'voice-bench.mjs'), 'utf8')
    .split('\n').filter(line => !/^import\s/u.test(line)).join('\n')
    .replace(/\nmain\(\)\.catch\([\s\S]*$/u, '\n')
    .replaceAll('import.meta.url', "'file:///voice-bench.mjs'")
  const context = vm.createContext({ fs, path, process: { argv: [], env: {} }, fileURLToPath: () => path.join(here, 'voice-bench.mjs') })
  vm.runInContext(source, context)
  return vm.runInContext('({ buildReport })', context)
}

function parseArgs(argv) {
  const series = []
  const options = { model: null, scenario: null, turn: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--model' || arg === '--scenario' || arg === '--turn') {
      options[arg.slice(2)] = argv[index + 1]
      index += 1
    } else if (arg.includes('=')) {
      const [label, ...rest] = arg.split('=')
      series.push({ label, dirs: rest.join('=').split(',') })
    } else throw new Error(`Nieznany argument: ${arg}`)
  }
  if (series.length === 0) throw new Error('Podaj co najmniej jedną serię: etykieta=<katalog>[,<katalog>]')
  return { series, options }
}

function runsIn(dirs, { model, scenario }) {
  const runs = []
  for (const dir of dirs) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const base = path.join(dir, entry.name)
      if (!fs.existsSync(path.join(base, 'report.json')) || !fs.existsSync(path.join(base, 'responses.json'))) continue
      const report = JSON.parse(fs.readFileSync(path.join(base, 'report.json'), 'utf8'))
      if (report.status !== 'COMPLETE') continue
      if (model && report.model !== model) continue
      if (scenario && (report.scenario ?? 'cache') !== scenario) continue
      runs.push({ id: entry.name, report, responses: JSON.parse(fs.readFileSync(path.join(base, 'responses.json'), 'utf8')) })
    }
  }
  return runs
}

const sum = values => values.reduce((total, value) => total + value, 0)
const mean = values => (values.length ? sum(values) / values.length : NaN)
function sd(values) {
  if (values.length < 2) return NaN
  const m = mean(values)
  return Math.sqrt(sum(values.map(value => (value - m) ** 2)) / (values.length - 1))
}

// Ziarno stałe: ten sam wynik przy każdym wywołaniu.
function random(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Dwustronny test permutacyjny różnicy średnich.
function permutationP(a, b, rounds = 20000) {
  if (a.length === 0 || b.length === 0) return NaN
  const observed = Math.abs(mean(b) - mean(a))
  const pooled = [...a, ...b]
  const next = random(1234)
  let extreme = 0
  for (let round = 0; round < rounds; round += 1) {
    for (let index = pooled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(next() * (index + 1))
      ;[pooled[index], pooled[swap]] = [pooled[swap], pooled[index]]
    }
    if (Math.abs(mean(pooled.slice(a.length)) - mean(pooled.slice(0, a.length))) >= observed - 1e-12) extreme += 1
  }
  return (extreme + 1) / (rounds + 1)
}

const METRICS = [
  ['słowa', r => r.outputWords],
  ['głos/1k', r => r.voiceDensityPerThousand],
  ['bezok./100 sł.', r => (r.outputWords ? (100 * r.infinitiveHitsTotal) / r.outputWords : 0)],
  ['„jest”/100 sł.', r => r.copulaPerHundredWords],
  ['2. osoba', r => r.secondPersonHitsTotal],
  ['śr. zdanie', r => r.averageSentenceWords],
  ['krótkie zdania', r => r.shortSentenceRatio],
  ['powt. otwarcia', r => r.repeatedOpenings],
  ['powt. zamknięcia', r => r.repeatedClosings],
  ['gwara', r => r.mineHitsTotal],
  ['okrzyki', r => r.interjectionsTotal],
  ['wykrzykniki', r => r.exclamationsTotal],
  ['powtórzenie dla nacisku', r => r.emphasisTotal],
  ['ścieżki spoza fixture', r => sum(r.foreignPathsPerTurn.map(paths => paths.length))],
  ['nastrój w odpowiedziach', r => sum(r.moodHitsPerTurn)],
  ['echo „nastrój”', r => r.moodWordEcho],
  ['tury z hordą', r => r.turnsWithHorde],
  ['zdania o kumplu', r => r.mateSentences],
  ['…z słowem fachu', r => r.mateSentencesWithTrade],
  ['kumpel w ostatnim akapicie', r => r.hordeClosings],
  ['notki „w środku”', r => r.middleNotes],
  ['…kumpel w tej turze', r => r.middleMates],
  ['…w ostatnim zdaniu', r => r.middleClosings],
  ['notki o hordzie', r => r.hordeNotes],
  ['notki o nastroju', r => r.moodNotes ?? 0],
  ['poprawki dryfu', r => r.driftFixes],
  ['akceptacja', r => (r.accepted ? 1 : 0)],
]

function format(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function main() {
  const { series, options } = parseArgs(process.argv.slice(2))
  const { buildReport } = benchMetrics()
  const scored = series.map(({ label, dirs }) => {
    const runs = runsIn(dirs, options)
    const reports = runs.map(({ id, report, responses }) => ({
      id,
      ...buildReport({
        model: report.model, mode: report.mode, pluginDir: '.', responses,
        stats: { fullAnchors: report.fullAnchors, shortAnchors: report.shortAnchors, driftFixes: report.driftFixes,
          hordeNotes: report.hordeNotes, moodNotes: report.moodNotes ?? 0, hookContextChars: report.hookContextChars },
        costUsd: report.costUsd, visibleTokens: [], scenarioName: report.scenario ?? 'cache',
      }),
    }))
    return { label, runs, reports }
  })
  const [base, ...others] = scored
  const header = ['metryka', ...scored.map(({ label, reports }) => `${label} (n=${reports.length})`), ...others.map(({ label }) => `Δ ${label}`), ...others.map(({ label }) => `p ${label}`)]
  const lines = [`| ${header.join(' | ')} |`, `|${header.map((_, index) => (index === 0 ? '---' : '---:')).join('|')}|`]
  for (const [name, pick] of METRICS) {
    const values = scored.map(({ reports }) => reports.map(pick).filter(Number.isFinite))
    const cells = values.map(list => `${format(mean(list))} ± ${format(sd(list))}`)
    const deltas = values.slice(1).map(list => format(mean(list) - mean(values[0])))
    const ps = values.slice(1).map(list => format(permutationP(values[0], list), 3))
    lines.push(`| ${[name, ...cells, ...deltas, ...ps].join(' | ')} |`)
  }
  process.stdout.write(`${lines.join('\n')}\n`)
  if (options.turn !== null) {
    const index = Number(options.turn) - 1
    for (const { label, runs } of scored) {
      for (const { id, responses } of runs) process.stdout.write(`\n### ${label} ${id} — tura ${index + 1}\n\n${responses[index] ?? '(brak)'}\n`)
    }
  }
  if (base.reports.length === 0) process.exitCode = 1
}

main()
