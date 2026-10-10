#!/usr/bin/env node
// Pomiar głosu moda: 12 tur jednej sesji, mod ładowany wyłącznie przez
// --plugin-dir. `--mode stream` (domyślnie) trzyma jeden proces
// `claude -p --input-format stream-json`, jak sesja interaktywna: `$.state`
// żyje między turami. `--mode resume` odpala proces na turę z `--resume`,
// czyli sprawdza odtwarzanie stanu z historii. Port `scripts/context-smoke.js` z pluginu
// Krux 3.8.0 (host `claude`, scenariusz `cache`): te same prompty, fixture
// i metryki 1:1, żeby liczby dało się położyć obok serii pluginu.
//
// Różnice wobec pluginu: persona moda siedzi w prompcie systemowym, nie w
// transkrypcie, więc bramka `hookEvents.persona === 1` odpada. Zamiast niej
// raport liczy kotwice z `prompt.submit`: pełną (`VOICE_ANCHOR`) i krótką
// (`VOICE_SHORT`), oraz notki o hordzie i o nastroju.
//
// Scenariusz `smrod` (7 tur) daje modelowi testy do puszczenia i naprawy: kronika
// dostaje smród i zielone, więc widać, co mod dokłada po zdarzeniu, i jak model
// odpowiada na decyzję o wydaniu zaraz po wygranej.
//
//   node scripts/voice-bench.mjs --model claude-opus-5-5 [--mode stream|resume] [--scenario cache|smrod] [--plugin-dir <katalog>]

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAX_OUTPUT = 32 * 1024 * 1024

function parseArgs(argv) {
  const parsed = {}
  const flags = { '--model': 'model', '--plugin-dir': 'pluginDir', '--mode': 'mode', '--scenario': 'scenario' }
  for (let index = 0; index < argv.length; index += 2) {
    const key = flags[argv[index]]
    const value = argv[index + 1]
    if (!key) throw new Error(`Nieznany argument: ${argv[index]}`)
    if (!value || value.startsWith('--')) throw new Error(`Wymagana wartość dla ${argv[index]}`)
    parsed[key] = value
  }
  if (!parsed.model) throw new Error('Wymagane --model <model-id>')
  const pluginDir = path.resolve(parsed.pluginDir ?? repo)
  if (!fs.existsSync(path.join(pluginDir, 'hooks', 'hooks.json'))) throw new Error(`Brak hooks/hooks.json w ${pluginDir}`)
  const mode = parsed.mode ?? 'stream'
  if (mode !== 'stream' && mode !== 'resume') throw new Error(`--mode stream|resume, nie ${mode}`)
  const scenario = parsed.scenario ?? 'cache'
  if (!Object.hasOwn(SCENARIOS, scenario)) throw new Error(`--scenario ${Object.keys(SCENARIOS).join('|')}, nie ${scenario}`)
  return { model: parsed.model, pluginDir, mode, scenario }
}

// Prompty i fixture scenariusza `cache` — bez zmian względem pluginu.
const PROMPTS = [
  'W tym katalogu jest projekt z cache przed bazą. Coś działa nie tak — zbadaj kod i powiedz, co widzisz.',
  'Sprawdź dokładnie app.rb i config/settings.yml — co dokładnie jest przyczyną?',
  'Jakie masz opcje naprawy? Wypisz je z plusami i minusami.',
  'Zerknij jeszcze na README.md, czy jest tam coś istotnego o architekturze.',
  'Który wariant polecasz i dlaczego?',
  'A co z wydajnością przy dużym ruchu, ma to znaczenie w tym przypadku?',
  'Sprawdź, czy w projekcie są jakieś testy dla tej funkcji.',
  'Podsumuj krótko dotychczasowe ustalenia.',
  'Czy jest ryzyko utraty danych przy takiej zmianie?',
  'Jak byś to poukładał na dziś, gdybyś miał zaczynać teraz?',
  'Masz jeszcze jakieś pytanie, zanim zaczniesz wprowadzać zmianę?',
  'Zrób krótkie podsumowanie całej rozmowy.',
]

function seedFixture(workdir) {
  fs.mkdirSync(path.join(workdir, 'config'), { recursive: true })
  fs.writeFileSync(
    path.join(workdir, 'app.rb'),
    [
      'class Cache',
      '  def initialize',
      '    @store = {}',
      '  end',
      '',
      '  def fetch(key)',
      '    return @store[key] if @store[key]',
      '    value = Database.query(key)',
      '    @store[key] = value',
      '    value',
      '  end',
      '',
      '  def invalidate(key)',
      '    @store[key] = nil',
      '  end',
      'end',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(path.join(workdir, 'config', 'settings.yml'), ['cache:', '  ttl_seconds: 0', 'database:', '  pool_size: 5', ''].join('\n'))
  fs.writeFileSync(
    path.join(workdir, 'README.md'),
    ['# Cache przed bazą', '', 'Prosty cache przed zapytaniami do bazy danych.', '`ttl_seconds: 0` w `config/settings.yml` oznacza brak automatycznego wygasania wpisów.', ''].join('\n'),
  )
}

// Scenariusz `smrod`: ten sam robak co w `cache` (fałszywa wartość nie trafia do
// cache), ale w JS z testem, który go łapie. Model puszcza testy, naprawia i
// puszcza znowu, więc kronika moda dostaje `test-fail`, edycję i `test-pass`.
const SMROD_PROMPTS = [
  'Puść testy w tym projekcie (node --test) i powiedz, co widzisz.',
  'Co dokładnie jest przyczyną?',
  'Napraw to i puść testy jeszcze raz.',
  'Jak poszło?',
  'Wypuszczamy to dziś na produkcję? Staging przeszedł raz.',
  'Co jeszcze warto sprawdzić przed wydaniem?',
  'Zrób krótkie podsumowanie.',
]

function seedSmrod(workdir) {
  fs.writeFileSync(path.join(workdir, 'package.json'), `${JSON.stringify({ name: 'cache', type: 'module', scripts: { test: 'node --test' } }, null, 2)}\n`)
  fs.writeFileSync(
    path.join(workdir, 'cache.js'),
    [
      '// Cache przed bazą: wpis żyje ttlMs milisekund.',
      'export class Cache {',
      '  constructor(db, ttlMs = 1000) {',
      '    this.db = db',
      '    this.ttlMs = ttlMs',
      '    this.store = new Map()',
      '  }',
      '',
      '  get(key, now = Date.now()) {',
      '    const hit = this.store.get(key)',
      '    if (hit && hit.value && now - hit.at < this.ttlMs) return hit.value',
      '    const value = this.db.query(key)',
      '    this.store.set(key, { value, at: now })',
      '    return value',
      '  }',
      '}',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(workdir, 'cache.test.js'),
    [
      "import { test } from 'node:test'",
      "import assert from 'node:assert/strict'",
      "import { Cache } from './cache.js'",
      '',
      'function fakeDb(values) {',
      '  const db = { calls: 0, query: key => { db.calls += 1; return values[key] } }',
      '  return db',
      '}',
      '',
      "test('drugi odczyt bierze z cache', () => {",
      "  const db = fakeDb({ user: 'Morra' })",
      '  const cache = new Cache(db)',
      "  cache.get('user', 0)",
      "  assert.equal(cache.get('user', 10), 'Morra')",
      '  assert.equal(db.calls, 1)',
      '})',
      '',
      "test('wpis wygasa po ttl', () => {",
      "  const db = fakeDb({ user: 'Morra' })",
      '  const cache = new Cache(db, 100)',
      "  cache.get('user', 0)",
      "  cache.get('user', 150)",
      '  assert.equal(db.calls, 2)',
      '})',
      '',
      "test('zero też zostaje w cache', () => {",
      '  const db = fakeDb({ licznik: 0 })',
      '  const cache = new Cache(db)',
      "  cache.get('licznik', 0)",
      "  assert.equal(cache.get('licznik', 10), 0)",
      '  assert.equal(db.calls, 1)',
      '})',
      '',
    ].join('\n'),
  )
}

// Pliki, które istnieją w fixture: ścieżka spoza tej listy w odpowiedzi to plik,
// którego model nie widział (propozycja albo zmyślenie — raport tego nie rozstrzyga).
const SCENARIOS = {
  cache: { prompts: PROMPTS, seed: seedFixture, tools: 'Read,Glob,Grep', allowed: [], files: ['app.rb', 'config/settings.yml', 'settings.yml', 'README.md'] },
  smrod: {
    prompts: SMROD_PROMPTS,
    seed: seedSmrod,
    tools: 'Read,Glob,Grep,Bash,Edit',
    // Bash tylko do testów; edycja bez pytania, bo `-p` nie ma komu pokazać okna zgody.
    allowed: ['Bash(node --test *)', 'Bash(npm test *)', 'Bash(npm test)', 'Edit'],
    files: ['package.json', 'cache.js', 'cache.test.js'],
  },
}

// ---- Metryki: kopia 1:1 z context-smoke.js pluginu (tam stoi kalibracja). ----

function wordCount(text) {
  const clean = String(text || '').trim()
  return clean ? clean.split(/\s+/u).length : 0
}

const voicePattern = new RegExp(
  '(?<!\\p{L})(?:stal|robak\\p{L}*|glist\\p{L}*|trup\\p{L}*|gni[ćj]\\p{L}*|zaraz[ay]\\p{L}*' +
    '|plugaw\\p{L}*|granit\\p{L}*|kut[aey]\\p{L}*|hartow\\p{L}*|wyku[ćłt]\\p{L}*|węsz\\p{L}*' +
    '|wywęsz\\p{L}*|kilof\\p{L}*|warow\\p{L}*|rozłup\\p{L}*|zgni[eo]\\p{L}*|smr[oó]d\\p{L}*' +
    '|śmierdz\\p{L}*|wieprz\\p{L}*|strażnik\\p{L}*|naskrob\\p{L}*|sztolni\\p{L}*|zawał\\p{L}*' +
    '|kanark?\\p{L}*|chodnik\\p{L}*|hord[aęy]|[Mm]orr[aęoy]|kopalni\\p{L}*|wynocha|boli|padać' +
    ')(?!\\p{L})',
  'giu',
)

const voiceHits = text => (String(text || '').match(voicePattern) || []).length

const hordePattern = new RegExp(
  '(?<!\\p{L})(?:Niuch(?:a|owi|em|u)?|Grom(?:a|owi|em|ie)?|Piry(?:t|ta|towi|tem|cie)' +
    '|Ochr(?:a|y|ze|ę|ą|o)|Mło(?:t|ta|towi|tem|cie)|Lon(?:t|ta|towi|tem|cie))(?!\\p{L})',
  'gu',
)

// Łącznik „jest/są” poza kodem: kotwica każe go wyrzucać.
function copulaHits(text) {
  return (plainProse(text).match(/(?<!\p{L})(?:jest|są)(?!\p{L})/giu) ?? []).length
}

// „Krux” poza kodem: 3 tokeny za wzmiankę, klimat niesie już pierwsza.
function kruxHits(text) {
  return (plainProse(text).match(/(?<!\p{L})Krux(?:a|owi|em)?(?!\p{L})/gu) ?? []).length
}

// Zamknięcie odpowiedzi: ostatnie zdanie prozy. Szablon („Morra powie „zgoda””)
// powtarzany co turę sam się wzmacnia, więc liczymy tury, które zamykają tak
// samo jak któraś wcześniejsza (pierwsze 2 słowa ostatniego zdania).
function closingKey(text) {
  const sentences = plainProse(text).split(/(?<=[.!?])\s+|\n+/u).map(line => line.trim()).filter(line => /\p{L}/u.test(line))
  const last = sentences.at(-1) ?? ''
  return last.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/u).filter(Boolean).slice(0, 2).join(' ')
}

function repeatedClosings(responses) {
  const seen = new Set()
  let repeats = 0
  for (const response of responses) {
    const key = closingKey(response)
    if (!key) continue
    if (seen.has(key)) repeats += 1
    seen.add(key)
  }
  return repeats
}

// Wstawki o hordzie: zdania z imieniem kumpla. Liczymy te, które zaczynają
// się tak samo jak któraś wcześniejsza (pierwsze 2 słowa, imię jako „X”).
function repeatedHordeOpenings(responses) {
  const seen = new Set()
  let repeats = 0
  for (const response of responses) {
    for (const sentence of plainProse(response).split(/(?<=[.!?])\s+|\n+/u)) {
      if (!new RegExp(hordePattern.source, 'u').test(sentence)) continue
      const key = sentence.replace(new RegExp(hordePattern.source, 'gu'), 'X').toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/u).filter(Boolean).slice(0, 2).join(' ')
      if (seen.has(key)) repeats += 1
      seen.add(key)
    }
  }
  return repeats
}

// Wstawka o hordzie w ostatnim akapicie: kumpel jako stałe zamknięcie odpowiedzi.
// Przed miejscem z kodu tak kończyło się 31 z 32 tur z hordą.
function hordeClosing(text) {
  const paragraphs = plainProse(String(text || '')).split(/\n\s*\n/u).filter(paragraph => /\p{L}/u.test(paragraph))
  return paragraphs.length > 0 && new RegExp(hordePattern.source, 'u').test(paragraphs.at(-1))
}

function plainProse(text) {
  return text.replace(/```[\s\S]*?```/gu, ' ').replace(/`[^`]*`/gu, ' ')
}

function hordeHits(text) {
  const prose = String(text || '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`]*`/gu, ' ')
  return (prose.match(hordePattern) || []).length
}

const secondPersonPattern = new RegExp(
  '(?<!\\p{L})(?:\\p{L}*(?:asz|esz|isz|ysz)|ty|ci[eę]|ciebie|tobie|tob[ąa]|twoj\\p{L}*)(?!\\p{L})',
  'giu',
)

function secondPersonHits(text) {
  const prose = String(text || '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`]*`/gu, ' ')
    .replace(/„[^„”"\n]*[”"]/gu, ' ')
  return (prose.match(secondPersonPattern) || []).length
}

const subjectInfinitivePattern = new RegExp(
  '(?<![\\n\\r*\\-]\\s?)(?<!\\d[.)]\\s?)(?<![\\p{L}])' + '([\\p{L}`_.]{2,})\\s+(?:nie\\s+)?(\\p{L}+(?:ać|eć|ić|yć|ąć|uć|ść|źć))(?![\\p{L}])',
  'gu',
)

const infinitiveFalsePositives = new Set([
  'nić', 'sieć', 'płeć', 'część', 'gość', 'kość', 'maść', 'treść', 'wieść',
  'śmierć', 'pamięć', 'chęć', 'gałąź', 'rzeź', 'zamieć', 'opowieść', 'korzyść',
])

const infinitiveLicensers = new Set([
  'trzeba', 'można', 'warto', 'należy', 'wolno', 'wystarczy', 'łatwo', 'trudno',
  'musi', 'muszę', 'musimy', 'może', 'mogę', 'możemy', 'możesz', 'chce', 'chcę',
  'chcemy', 'umie', 'umiem', 'potrafi', 'potrafię', 'powinien', 'powinna',
  'zaczyna', 'zacznie', 'próbuje', 'pozwala', 'pomaga', 'zamierza', 'planuje',
  'lubi', 'woli', 'da', 'się', 'by', 'aby', 'żeby', 'zamiast', 'bez', 'będzie',
  'lepiej', 'czas', 'i', 'oraz', 'lub', 'albo', 'potem', 'najpierw',
  'to', 'co', 'go', 'ją', 'je', 'ich', 'nam', 'im', 'mu', 'jej', 'tego', 'tym',
  'tam', 'jak', 'gdy', 'kiedy', 'czy', 'niż', 'tylko', 'już', 'też', 'także',
  'jeszcze', 'znów', 'znowu', 'wreszcie', 'dopiero', 'nigdy', 'zawsze', 'wtedy',
])

const infinitiveEnding = /(?:ać|eć|ić|yć|ąć|uć|ść|źć)$/u

function infinitiveHits(text) {
  let hits = 0
  for (const match of String(text || '').matchAll(subjectInfinitivePattern)) {
    const subject = match[1].toLowerCase().replace(/[`_.]/gu, '')
    const verb = match[2].toLowerCase()
    if (infinitiveFalsePositives.has(verb)) continue
    if (infinitiveLicensers.has(subject)) continue
    if (infinitiveEnding.test(subject)) continue
    hits += 1
  }
  return hits
}

// ---- Metryki moda, których plugin nie ma. ----

function proseSentences(text) {
  return plainProse(String(text || '')).split(/(?<=[.!?])\s+|\n+/u).map(line => line.trim()).filter(line => /\p{L}/u.test(line))
}

function wordsOf(sentence) {
  return sentence.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/u).filter(Boolean)
}

// Otwarcie odpowiedzi: pierwsze 2 słowa pierwszego zdania prozy, jak `closingKey`
// z drugiej strony. Liczymy tury, które zaczynają tak samo jak któraś wcześniejsza.
function repeatedOpenings(responses) {
  const seen = new Set()
  let repeats = 0
  for (const response of responses) {
    const key = wordsOf(proseSentences(response)[0] ?? '').slice(0, 2).join(' ')
    if (!key) continue
    if (seen.has(key)) repeats += 1
    seen.add(key)
  }
  return repeats
}

// Gwara kopalni spoza słownika pluginu.
const minePattern = /(?<!\p{L})(?:szycht\p{L}*|przod(?:ek|ku|kiem|ka)|fedru\p{L}*|urob(?:ek|ku|kiem)|brygad\p{L}*)(?!\p{L})/giu
const mineHits = text => (plainProse(String(text || '')).match(minePattern) ?? []).length

// Okrzyk: zapisane brzmienie, którego persona każe używać najwyżej raz.
const interjectionPattern = /(?<!\p{L})(?:h+r{2,}\p{L}*|g+r{2,}\p{L}*|w+a{2,}g+h*\p{L}*|u+a{2,}\p{L}*)(?!\p{L})/giu
const interjectionHits = text => (plainProse(String(text || '')).match(interjectionPattern) ?? []).length
const exclamationHits = text => (plainProse(String(text || '')).match(/!/gu) ?? []).length

// Powtórzenie dla nacisku: zdanie z 1–2 słów, a następne zaczyna się tym samym słowem
// („Robak. Robak w pętli.”). Figura mowy, nie copy bias między turami.
function emphasisHits(text) {
  const sentences = proseSentences(text)
  let hits = 0
  for (let index = 1; index < sentences.length; index += 1) {
    const before = wordsOf(sentences[index - 1])
    const after = wordsOf(sentences[index])
    if (before.length >= 1 && before.length <= 2 && after.length > before.length && after[0] === before.at(-1)) hits += 1
  }
  return hits
}

// Nastrój nazwany w odpowiedzi.
const moodPattern = /(?<!\p{L})(?:zadziorn\p{L}*|wście\p{L}*|wkurz\p{L}*|triumf\p{L}*|dum(?:a|ny|na|nie|ą|y)|zadowol\p{L}*|czujn\p{L}*|skupion\p{L}*|zmęcz\p{L}*|radoś\p{L}*|złoś\p{L}*)(?!\p{L})/giu
const moodHits = text => (plainProse(String(text || '')).match(moodPattern) ?? []).length

// Ścieżki w kodzie inline, których nie ma w fixture: plik zaproponowany albo zmyślony.
const PATH_TOKEN = /^[\w./-]+\.(?:rb|ya?ml|md|m?js|ts|json|py|txt|sql|sh|toml|lock)$/u
function foreignPaths(text, files) {
  const found = new Set()
  for (const match of String(text || '').matchAll(/`([^`\n]+)`/gu)) {
    const token = match[1].trim().replace(/:\d+(?::\d+)?$/u, '')
    if (!PATH_TOKEN.test(token) || files.includes(token) || files.includes(path.basename(token))) continue
    found.add(token)
  }
  return [...found]
}

// Słowa fachu kumpla w zdaniu, które go wymienia: czy kumpel mówi swoim językiem.
const MATE_WORDS = {
  Niuch: /(?<!\p{L})(?:ślad\p{L}*|trop\p{L}*|nor[aęyz]\p{L}*|węsz\p{L}*|niuch\p{L}*)(?!\p{L})/iu,
  Grom: /(?<!\p{L})(?:stal\p{L}*|palenisk\p{L}*|przepal\p{L}*|kowad\p{L}*)(?!\p{L})/iu,
  Piryt: /(?<!\p{L})(?:pęknię\p{L}*|rys[aęyi]?\p{L}*|skaz\p{L}*|zrzęd\p{L}*)(?!\p{L})/iu,
  Ochra: /(?<!\p{L})(?:brzeg\p{L}*|równ\p{L}*|barw\p{L}*|kolor\p{L}*|krawęd\p{L}*)(?!\p{L})/iu,
  Młot: /(?<!\p{L})(?:dwa razy|policz\p{L}*|liczy\p{L}*|dowod\p{L}*|dowód|rachun\p{L}*|prób\p{L}*)(?!\p{L})/iu,
  Lont: /(?<!\p{L})(?:lont\p{L}*|miar\p{L}*|mierz\p{L}*|trzy razy|gruz\p{L}*)(?!\p{L})/iu,
}
const MATE_NAMES = {
  Niuch: /(?<!\p{L})Niuch(?:a|owi|em|u)?(?!\p{L})/u, Grom: /(?<!\p{L})Grom(?:a|owi|em|ie)?(?!\p{L})/u,
  Piryt: /(?<!\p{L})Piry(?:t|ta|towi|tem|cie)(?!\p{L})/u, Ochra: /(?<!\p{L})Ochr(?:a|y|ze|ę|ą|o)(?!\p{L})/u,
  Młot: /(?<!\p{L})Mło(?:t|ta|towi|tem|cie)(?!\p{L})/u, Lont: /(?<!\p{L})Lon(?:t|ta|towi|tem|cie)(?!\p{L})/u,
}
function mateIdiolect(responses) {
  let sentences = 0
  let withTrade = 0
  for (const response of responses) {
    for (const sentence of proseSentences(response)) {
      const named = Object.keys(MATE_NAMES).filter(name => MATE_NAMES[name].test(sentence))
      if (named.length === 0) continue
      sentences += 1
      // Słowo fachu liczymy bez imienia: „Lont” to imię, nie lont.
      const rest = Object.values(MATE_NAMES).reduce((text, pattern) => text.replace(new RegExp(pattern.source, 'gu'), ' '), sentence)
      if (named.some(name => MATE_WORDS[name].test(rest))) withTrade += 1
    }
  }
  return { mateSentences: sentences, mateSentencesWithTrade: withTrade }
}

// Tury notek o hordzie odtworzone z odpowiedzi regułą moda (`lifeNote` i `recordAnswer`
// w hooks/lore.ts): notka przychodzi po QUIET_TURNS turach bez kumpla, a miejsce rotuje
// z numerem tury (`pick(PLACES, tura + 1)`), więc „w środku” wypada w turach nieparzystych.
// Transkrypt podaje tylko liczbę notek; zgodność reguły pilnuje test skryptów.
const QUIET_TURNS = 2
function middleNoteTurns(responses) {
  const turns = []
  let quiet = 0
  responses.forEach((response, turn) => {
    if (quiet >= QUIET_TURNS && turn % 2 === 1) turns.push(turn)
    quiet = hordeHits(response) > 0 ? 0 : quiet + 1
  })
  return turns
}

// Kumpel w ostatnim zdaniu tury, w której notka każe „w środku”: wstawka uciekła na
// koniec. `hordeClosings` liczy ostatni akapit we wszystkich turach z hordą, także tam,
// gdzie notka sama każe „na końcu”, a odpowiedź z jednego akapitu zawsze się tam łapie.
function middleClosings(responses) {
  const middle = middleNoteTurns(responses)
  const withMate = middle.filter(turn => hordeHits(responses[turn]) > 0)
  const closing = withMate.filter(turn => new RegExp(hordePattern.source, 'u').test(proseSentences(responses[turn]).at(-1) ?? ''))
  return { middleNotes: middle.length, middleMates: withMate.length, middleClosings: closing.length }
}

// Słowo „nastrój” z linii nastroju powtórzone w prozie odpowiedzi.
const moodWordHits = text => (plainProse(String(text || '')).match(/(?<!\p{L})nastr[oó]\p{L}*/giu) ?? []).length

const SHORT_SENTENCE_WORDS = 8

function sentenceLengths(text) {
  const prose = String(text || '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`]*`/gu, 'X')
    .split(/\r?\n/u)
    .filter(line => (line.match(/\|/gu) || []).length < 2)
    .join('\n')
  return prose
    .split(/(?<=[.!?])\s+/u)
    .map(sentence => wordCount(sentence))
    .filter(words => words > 1)
}

const LONG_SENTENCE_WORDS = 20
const SUBORDINATE_WORDS = 15
const SUBORDINATE_COMMAS = 2
const PARENTHETICAL_WORDS = 5

function readabilityDefectRatio(text) {
  const sentences = String(text || '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .split(/\r?\n/u)
    .filter(line => (line.match(/\|/gu) || []).length < 2)
    .join('\n')
    .split(/(?<=[.!?])\s+/u)
    .map(sentence => sentence.trim())
    .filter(sentence => wordCount(sentence) > 1)
  if (!sentences.length) return null
  let defects = 0
  for (const sentence of sentences) {
    const words = wordCount(sentence)
    if (words > LONG_SENTENCE_WORDS) defects += 1
    if (words >= SUBORDINATE_WORDS && (sentence.match(/,/gu) || []).length >= SUBORDINATE_COMMAS) defects += 1
    for (const aside of sentence.matchAll(/\(([^)]+)\)/gu)) {
      if (wordCount(aside[1]) > PARENTHETICAL_WORDS) defects += 1
    }
  }
  return defects / sentences.length
}

function shortSentenceRatio(text) {
  const lengths = sentenceLengths(text)
  if (!lengths.length) return null
  return lengths.filter(words => words <= SHORT_SENTENCE_WORDS).length / lengths.length
}

function averageSentenceWords(text) {
  const lengths = sentenceLengths(text)
  if (!lengths.length) return null
  return lengths.reduce((sum, words) => sum + words, 0) / lengths.length
}

// ---- Kotwice moda w transkrypcie. ----

// Teksty kotwic bierze z mierzonego katalogu, więc pomiar starego commita liczy
// jego własne kotwice. Node od 22.18 wczytuje .ts bez kroku budowania.
async function anchorsOf(pluginDir) {
  const voice = await import(pathToFileURL(path.join(pluginDir, 'hooks', 'voice.ts')).href)
  return { full: voice.VOICE_ANCHOR, short: voice.VOICE_SHORT ?? null }
}

// Każdy napis w rekordzie transkryptu, gdziekolwiek leży: format zapisu
// kontekstu hooka moda nie jest częścią kontraktu, więc skan nie zgaduje pola.
function stringsIn(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, out)
  else if (value && typeof value === 'object') for (const item of Object.values(value)) stringsIn(item, out)
  return out
}

function anchorStats(transcript, anchors) {
  const stats = { fullAnchors: 0, shortAnchors: 0, driftFixes: 0, hordeNotes: 0, moodNotes: 0, hookContextChars: 0 }
  for (const line of transcript.split(/\r?\n/u).filter(Boolean)) {
    const record = JSON.parse(line)
    if (record.type === 'assistant') continue
    // Ten sam wpis leży w rekordzie kilka razy (osobno i sklejony z resztą
    // `context`), więc każdy rodzaj liczymy najwyżej raz na rekord.
    const texts = stringsIn(record)
    const first = test => texts.find(test)
    const full = first(text => text.startsWith(anchors.full))
    const short = anchors.short === null ? undefined : first(text => text.startsWith(anchors.short))
    const horde = first(text => text.startsWith('Życie hordy:'))
    const mood = first(text => text.startsWith('Nastrój Kruxa:'))
    for (const text of [full, short, horde, mood]) if (text) stats.hookContextChars += text.length
    if (full) stats.fullAnchors += 1
    if (full?.includes(`${anchors.full} Ostatni`)) stats.driftFixes += 1
    if (short) stats.shortAnchors += 1
    if (horde) stats.hordeNotes += 1
    if (mood) stats.moodNotes += 1
  }
  return stats
}

// ---- Przebieg. ----

// Zmienne sesji rodzica: z nimi zagnieżdżony `claude` uważa się za jej część.
const NESTED = new Set([
  'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
])

function cleanEnvironment(environment) {
  const clean = {}
  for (const [key, value] of Object.entries(environment)) {
    if (key.startsWith('KRUX_') || key.startsWith('CLAUDE_PLUGIN_') || key === 'CLAUDE_CODE_PLUGIN_DIRS') continue
    if (key === 'PLUGIN_ROOT' || key === 'PLUGIN_DATA' || NESTED.has(key)) continue
    clean[key] = value
  }
  return clean
}

// Izolacja jak w pluginie: ustawienia tylko z pustego katalogu roboczego, więc
// bez pluginów użytkownika (także `krux` i zainstalowanego `krux-mod`), hooków,
// CLAUDE.md i MCP. Mod wchodzi wyłącznie przez --plugin-dir.
function isolation(model, pluginDir, scenario = SCENARIOS.cache) {
  return [
    '--model', model,
    '--plugin-dir', pluginDir,
    '--setting-sources', 'local',
    '--strict-mcp-config',
    // `--allowedTools` i `--tools` łykają kolejne argumenty, więc stoją na końcu.
    ...(scenario.allowed.length ? ['--allowedTools', ...scenario.allowed] : []),
    '--tools', scenario.tools,
  ]
}

function invocation(index, model, sessionId, pluginDir, scenario = SCENARIOS.cache) {
  return [
    '-p', scenario.prompts[index],
    index === 0 ? '--session-id' : '--resume', sessionId,
    '--output-format', 'json',
    ...isolation(model, pluginDir, scenario),
  ]
}

// Jeden proces na całą rozmowę: prompt idzie na stdin dopiero po zdarzeniu
// `result` poprzedniej tury, więc tury nie zlewają się w jedną.
function converse({ model, sessionId, pluginDir, cwd, env, onResult, scenario = SCENARIOS.cache }) {
  const TURNS = scenario.prompts.length
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--session-id', sessionId,
    ...isolation(model, pluginDir, scenario),
  ]
  const child = spawn('claude', args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  const results = []
  let stderr = ''
  let buffer = ''
  let waiting = null
  return new Promise((resolve, reject) => {
    let failure = null
    let killTimer
    const fail = error => {
      if (failure) return
      failure = error
      clearTimeout(timer)
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1000)
      killTimer.unref?.()
    }
    const timer = setTimeout(() => fail(new Error(`Przekroczony czas po ${results.length} turach`)), 300_000 * TURNS)
    const send = index => {
      const message = { type: 'user', message: { role: 'user', content: scenario.prompts[index] } }
      try {
        child.stdin.write(`${JSON.stringify(message)}\n`)
      } catch (error) {
        fail(new Error(`claude stdin: ${error.message}`))
      }
    }
    // Błąd strumienia też kończy proces; cleanup czeka na jego `close`.
    child.stdin.on('error', error => fail(new Error(`claude stdin: ${error.message}`)))
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.stdout.on('data', chunk => {
      if (failure) return
      buffer += chunk
      let newline
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        let event
        try {
          event = JSON.parse(line)
        } catch {
          continue
        }
        if (event?.type !== 'result') continue
        try {
          onResult(checkResult(event, sessionId))
        } catch (error) {
          fail(error)
          return
        }
        results.push(event)
        process.stderr.write(`tura ${results.length}/${TURNS}\n`)
        if (results.length < TURNS) send(results.length)
        else child.stdin.end()
      }
    })
    child.on('error', error => {
      fail(new Error(`claude: ${error.message}`))
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      if (failure) reject(failure)
      else if (code === 0 && results.length === TURNS) resolve(results)
      else reject(new Error(`claude → exit ${code ?? signal} po ${results.length} turach: ${stderr.trim().slice(0, 500)}`))
    })
    send(0)
  })
}

function run(args, options) {
  const result = spawnSync('claude', args, { encoding: 'utf8', shell: false, maxBuffer: MAX_OUTPUT, timeout: 300_000, ...options })
  if (result.error) throw new Error(`claude: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || 'brak komunikatu').trim().slice(0, 500)
    throw new Error(`claude → exit ${result.status}: ${detail}`)
  }
  return result
}

function parseResult(stdout, sessionId) {
  const parsed = JSON.parse(String(stdout || ''))
  const events = Array.isArray(parsed) ? parsed : [parsed]
  return checkResult(events.filter(event => event?.type === 'result').at(-1), sessionId)
}

function checkResult(result, sessionId) {
  if (!result) throw new Error('Brak zdarzenia result w wyjściu Claude')
  if (result.is_error === true) throw new Error(`Claude zwrócił błąd: ${String(result.result || '').slice(0, 200)}`)
  if (result.session_id !== sessionId) throw new Error('Zmiana session_id w turze')
  if (typeof result.result !== 'string' || !result.result.trim()) throw new Error('Pusty final response w turze')
  const usage = result.usage ?? {}
  const thinking = usage.output_tokens_details?.thinking_tokens ?? 0
  return {
    text: result.result.trim(),
    costUsd: typeof result.total_cost_usd === 'number' ? result.total_cost_usd : 0,
    // Tokeny odpowiedzi bez myślenia: ile kosztuje sam głos.
    visibleTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens - thinking : null,
  }
}

function findTranscript(sessionId) {
  const projects = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects')
  if (!fs.existsSync(projects)) return null
  for (const entry of fs.readdirSync(projects, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(projects, entry.name, `${sessionId}.jsonl`)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function buildReport({ model, mode, pluginDir, responses, stats, costUsd, costUsdPerResult, visibleTokens, status = 'COMPLETE', reason, scenarioName = 'cache' }) {
  const scenario = SCENARIOS[scenarioName]
  const TURNS = scenario.prompts.length
  const outputWords = responses.reduce((sum, response) => sum + wordCount(response), 0)
  const voiceHitsPerTurn = responses.map(voiceHits)
  const secondPersonHitsPerTurn = responses.map(secondPersonHits)
  const infinitiveHitsPerTurn = responses.map(infinitiveHits)
  const hordeHitsPerTurn = responses.map(hordeHits)
  const voiceHitsTotal = voiceHitsPerTurn.reduce((sum, hits) => sum + hits, 0)
  const voiceDensityPerThousand = outputWords ? (1000 * voiceHitsTotal) / outputWords : 0
  const secondPersonHitsTotal = secondPersonHitsPerTurn.reduce((sum, hits) => sum + hits, 0)
  const joined = responses.join('\n\n')
  const report = {
    status,
    model,
    mode,
    scenario: scenarioName,
    host: 'claude',
    plugin: pluginDir === repo ? 'repo' : path.basename(pluginDir),
    turns: responses.length,
    outputWords,
    ...stats,
    voiceHitsPerTurn,
    voiceHitsTotal,
    voiceDensityPerThousand,
    secondPersonHitsPerTurn,
    secondPersonHitsTotal,
    infinitiveHitsPerTurn,
    infinitiveHitsTotal: infinitiveHitsPerTurn.reduce((sum, hits) => sum + hits, 0),
    averageSentenceWords: averageSentenceWords(joined),
    shortSentenceRatio: shortSentenceRatio(joined),
    readabilityDefectRatio: readabilityDefectRatio(joined),
    copulaPerHundredWords: outputWords ? (100 * responses.reduce((sum, response) => sum + copulaHits(response), 0)) / outputWords : 0,
    kruxPerTurn: responses.length ? responses.reduce((sum, response) => sum + kruxHits(response), 0) / responses.length : 0,
    visibleTokens: (visibleTokens ?? []).every(n => typeof n === 'number') ? (visibleTokens ?? []).reduce((sum, n) => sum + n, 0) : null,
    tokensPerWord:
      outputWords && (visibleTokens ?? []).length && visibleTokens.every(n => typeof n === 'number')
        ? visibleTokens.reduce((sum, n) => sum + n, 0) / outputWords
        : null,
    hordeHitsPerTurn,
    turnsWithHorde: hordeHitsPerTurn.filter(hits => hits > 0).length,
    repeatedClosings: repeatedClosings(responses),
    repeatedHordeOpenings: repeatedHordeOpenings(responses),
    hordeClosings: responses.filter(hordeClosing).length,
    consentClosings: responses.filter(response => /zgod/iu.test(response.slice(-160))).length,
    repeatedOpenings: repeatedOpenings(responses),
    mineHitsTotal: responses.reduce((sum, response) => sum + mineHits(response), 0),
    interjectionsTotal: responses.reduce((sum, response) => sum + interjectionHits(response), 0),
    exclamationsTotal: responses.reduce((sum, response) => sum + exclamationHits(response), 0),
    emphasisTotal: responses.reduce((sum, response) => sum + emphasisHits(response), 0),
    moodHitsPerTurn: responses.map(moodHits),
    foreignPathsPerTurn: responses.map(response => foreignPaths(response, scenario.files)),
    ...mateIdiolect(responses),
    ...middleClosings(responses),
    moodWordEcho: responses.reduce((sum, response) => sum + moodWordHits(response), 0),
    // Bramka głosu pluginu, bez warunku na emisję persony (mod trzyma ją w
    // prompcie systemowym); w zamian kotwica musi dojść co najmniej raz.
    accepted:
      status === 'COMPLETE' &&
      responses.length === TURNS &&
      (stats?.fullAnchors ?? 0) >= 1 &&
      voiceDensityPerThousand >= 6 &&
      secondPersonHitsTotal <= 1 &&
      voiceHitsPerTurn.slice(Math.ceil(voiceHitsPerTurn.length / 2)).reduce((sum, hits) => sum + hits, 0) > 0,
  }
  if (reason) report.reason = reason
  if (typeof costUsd === 'number') report.costUsd = costUsd
  if (costUsdPerResult?.length) report.costUsdPerResult = costUsdPerResult
  return report
}

function reportDirectory() {
  const parent = path.join(repo, 'benchmarks', 'voice-bench')
  fs.mkdirSync(parent, { recursive: true })
  const id = new Date().toISOString().replace(/[:.]/gu, '-')
  for (let attempt = 0; ; attempt += 1) {
    const directory = path.join(parent, attempt ? `${id}-${attempt}` : id)
    try {
      fs.mkdirSync(directory)
      return directory
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  }
}

async function main() {
  const { model, pluginDir, mode, scenario: scenarioName } = parseArgs(process.argv.slice(2))
  const scenario = SCENARIOS[scenarioName]
  const TURNS = scenario.prompts.length
  const anchors = await anchorsOf(pluginDir)
  process.stderr.write(`voice-bench: model ${model}, szacunkowy koszt ~$0.45 za przebieg\n`)
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-voice-bench-'))
  const workdir = path.join(scratch, 'work')
  const sessionId = crypto.randomUUID()
  const responses = []
  let costUsd = 0
  const costUsdPerResult = []
  const visibleTokens = []
  let stats = null
  let report
  let transcript
  try {
    fs.mkdirSync(workdir, { recursive: true })
    scenario.seed(workdir)
    const env = cleanEnvironment(process.env)
    if (mode === 'stream') {
      // W strumieniu `total_cost_usd` rośnie narastająco: liczy się ostatni.
      await converse({ model, sessionId, pluginDir, cwd: workdir, env, scenario,
        onResult: parsed => {
          costUsd = Math.max(costUsd, parsed.costUsd)
          costUsdPerResult.push(parsed.costUsd)
          visibleTokens.push(parsed.visibleTokens)
          responses.push(parsed.text)
        },
      })
    } else {
      for (let index = 0; index < TURNS; index += 1) {
        const result = run(invocation(index, model, sessionId, pluginDir, scenario), { cwd: workdir, env })
        const parsed = parseResult(result.stdout, sessionId)
        costUsd += parsed.costUsd
        visibleTokens.push(parsed.visibleTokens)
        responses.push(parsed.text)
        process.stderr.write(`tura ${index + 1}/${TURNS}\n`)
      }
    }
    transcript = findTranscript(sessionId)
    if (!transcript) throw new Error(`Brak transkryptu sesji ${sessionId}`)
    // KRUX_BENCH_KEEP=<plik> zostawia kopię transkryptu do obejrzenia.
    if (process.env.KRUX_BENCH_KEEP) fs.copyFileSync(transcript, process.env.KRUX_BENCH_KEEP)
    stats = anchorStats(fs.readFileSync(transcript, 'utf8'), anchors)
    report = buildReport({ model, mode, pluginDir, responses, stats, costUsd, costUsdPerResult, visibleTokens, scenarioName })
  } catch (error) {
    report = buildReport({ model, mode, pluginDir, responses, stats, costUsd, costUsdPerResult, visibleTokens, status: 'ERROR', reason: error.message, scenarioName })
  } finally {
    // Transkrypt ląduje w projektach Claude Code; sprzątamy tylko katalog tego przebiegu.
    transcript = transcript || findTranscript(sessionId)
    const project = transcript && path.dirname(transcript)
    if (project && path.basename(project).includes('krux-voice-bench-')) fs.rmSync(project, { recursive: true, force: true })
    fs.rmSync(scratch, { recursive: true, force: true })
  }
  const directory = reportDirectory()
  fs.writeFileSync(path.join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  if (responses.length) fs.writeFileSync(path.join(directory, 'responses.json'), `${JSON.stringify(responses, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (!report.accepted) process.exitCode = 1
}

main().catch(error => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
