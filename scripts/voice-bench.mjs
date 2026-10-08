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
// (`VOICE_SHORT`), oraz notki o hordzie.
//
//   node scripts/voice-bench.mjs --model claude-opus-5-5 [--mode stream|resume] [--plugin-dir <katalog>]

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TURNS = 12
const MAX_OUTPUT = 32 * 1024 * 1024

function parseArgs(argv) {
  const parsed = {}
  const flags = { '--model': 'model', '--plugin-dir': 'pluginDir', '--mode': 'mode' }
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
  return { model: parsed.model, pluginDir, mode }
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
  const stats = { fullAnchors: 0, shortAnchors: 0, driftFixes: 0, hordeNotes: 0, hookContextChars: 0 }
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
    for (const text of [full, short, horde]) if (text) stats.hookContextChars += text.length
    if (full) stats.fullAnchors += 1
    if (full?.includes(`${anchors.full} Ostatni`)) stats.driftFixes += 1
    if (short) stats.shortAnchors += 1
    if (horde) stats.hordeNotes += 1
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
function isolation(model, pluginDir) {
  return [
    '--model', model,
    '--plugin-dir', pluginDir,
    '--setting-sources', 'local',
    '--strict-mcp-config',
    // `--tools` łyka kolejne argumenty, więc stoi na końcu.
    '--tools', 'Read,Glob,Grep',
  ]
}

function invocation(index, model, sessionId, pluginDir) {
  return [
    '-p', PROMPTS[index],
    index === 0 ? '--session-id' : '--resume', sessionId,
    '--output-format', 'json',
    ...isolation(model, pluginDir),
  ]
}

// Jeden proces na całą rozmowę: prompt idzie na stdin dopiero po zdarzeniu
// `result` poprzedniej tury, więc tury nie zlewają się w jedną.
function converse({ model, sessionId, pluginDir, cwd, env, onResult }) {
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--session-id', sessionId,
    ...isolation(model, pluginDir),
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
      const message = { type: 'user', message: { role: 'user', content: PROMPTS[index] } }
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

function buildReport({ model, mode, pluginDir, responses, stats, costUsd, costUsdPerResult, visibleTokens, status = 'COMPLETE', reason }) {
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
    scenario: 'cache',
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
  const { model, pluginDir, mode } = parseArgs(process.argv.slice(2))
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
    seedFixture(workdir)
    const env = cleanEnvironment(process.env)
    if (mode === 'stream') {
      // W strumieniu `total_cost_usd` rośnie narastająco: liczy się ostatni.
      await converse({ model, sessionId, pluginDir, cwd: workdir, env,
        onResult: parsed => {
          costUsd = Math.max(costUsd, parsed.costUsd)
          costUsdPerResult.push(parsed.costUsd)
          visibleTokens.push(parsed.visibleTokens)
          responses.push(parsed.text)
        },
      })
    } else {
      for (let index = 0; index < TURNS; index += 1) {
        const result = run(invocation(index, model, sessionId, pluginDir), { cwd: workdir, env })
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
    report = buildReport({ model, mode, pluginDir, responses, stats, costUsd, costUsdPerResult, visibleTokens })
  } catch (error) {
    report = buildReport({ model, mode, pluginDir, responses, stats, costUsd, costUsdPerResult, visibleTokens, status: 'ERROR', reason: error.message })
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
