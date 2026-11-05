// Bramka faktów: twierdzenia odpowiedzi o stanie testów i repo, które mod umie sprawdzić
// z tablicy Sztolni i odczytu gita. Odpowiedź, która twierdzi więcej, niż
// mówią narzędzia, wraca do modelu przed końcem tury (`classic.Stop` w register.ts), zamiast
// czekać, aż Morra dopyta „na pewno?” i dostanie przeprosiny. Czyste funkcje, bez `$`.

import type { KruxBoard, KruxGit } from '../types'

// Co mod wie przed końcem tury: ostatni przebieg testów z tablicy (także kumpla), czy po nim była
// edycja i odczyt gita (`null`: brak repo albo odczytu). Budowania nie sprawdzamy: przebiegi kumpli
// nie trafiają do kroniki Kruxa, więc „build zielony” po robocie Młota dawałby fałszywy alarm.
export type Facts = { board: KruxBoard; stale: boolean; git: KruxGit | null }

// Zdanie z niepewnością, warunkiem, przyszłością albo pytaniem to nie twierdzenie o stanie:
// „powinny przejść”, „jeśli testy przejdą”, „czy testy przechodzą?”.
const SOFT = /\?|(?<!\p{L})(?:hipotez\p{L}*|niesprawdz\p{L}*|nie\s+sprawdz\p{L}*|jeszcze\s+nie|chyba|może|prawdopodobn\p{L}*|nie\s+wiem|nie\s+wiedzieć|zgadyw\p{L}*|podejrzew\p{L}*|wygląda\p{L}*\s+na\s+to|jeśli|jeżeli|o\s+ile|gdyby|gdy|kiedy|dopóki|pod\s+warunkiem|powin\p{L}*|zaraz|potem|później|zamierz\p{L}*|plan\p{L}*|should|would|might|maybe|probably|if|when)(?!\p{L})/iu

// Porażka w tym samym zdaniu: to relacja z czerwonego przebiegu albo zdanie mieszane, nie „zielono”.
const RED = /(?<!\p{L})(?:nie\s+(?:przechodz|przej|zielon|pass|wypchn|push)\p{L}*|pad\p{L}*|fail\p{L}*|czerwon\p{L}*|smr[oó]d\p{L}*|robak\p{L}*|błęd\p{L}*|błąd|error\p{L}*|odrzuc\p{L}*|rejected|authentication)(?!\p{L})/iu

const TESTS_GREEN = [
  /(?<!\p{L})(?:test\p{L}*|kanar\p{L}*|suite|zestaw\p{L}*)(?=[^.!\n]{0,40}?(?<!\p{L})(?:przechodz\p{L}*|przeszł\p{L}*|przej[śd]\p{L}*|zielon\p{L}*|pass(?:ed|es|ing)?|green|śpiew\p{L}*)(?!\p{L}))/iu,
  /(?<!\p{L})(?:wszystko|całość)\s+zielon\p{L}*/iu,
]
const PUSHED = /(?<!\p{L})(?:wypchn\p{L}*|pushed|push\p{L}*\s+(?:poszedł|poszło|przeszedł|zrobion\p{L}*|gotow\p{L}*|iść|pójść))(?!\p{L})/iu
const CLEAN = /(?<!\p{L})(?:(?:drzewo|working\s+tree|repo)\s+(?:czyst\p{L}*|clean)|nothing\s+to\s+commit|wszystko\s+zacommitowan\p{L}*|brak\s+(?:niezacommitowanych\s+zmian|zmian\s+(?:do\s+commita|w\s+drzewie)))(?!\p{L})/iu
// Liczba przeszłych w twierdzeniu („52 przejść”, „52 passed”, „52/52 zielone”) do porównania z przebiegiem.
const PASSED_COUNT = /(?<!\p{L}|\d)(\d+)\s*(?:(?:\/|na|z)\s*\d+\s*)?(?:test\p{L}*\s+)?(?:przechodz\p{L}*|przeszł\p{L}*|przej[śd]\p{L}*|zielon\p{L}*|passed|pass(?:es|ing)?)(?!\p{L})/iu

// Zdania mowy do Morry: bez bloków kodu, kodu w linii, cytatów i wierszy cytatu `>` (tam wolno
// przytoczyć cudze „testy przechodzą”).
function sentencesOf(answer: string): string[] {
  return answer
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`\n]*`/gu, 'X')
    .replace(/„[^„”"\n]*[”"]/gu, ' ')
    .split(/\r?\n/u)
    .filter(line => !/^\s*>/u.test(line))
    .join('\n')
    .split(/(?<=[.!?])\s+|\n+/u)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence !== '')
}

// Pierwsze zdanie z twierdzeniem danego rodzaju, które nie jest miękkie ani mieszane z porażką.
function claim(sentences: readonly string[], patterns: readonly RegExp[]): string | null {
  return sentences.find(sentence => !SOFT.test(sentence) && !RED.test(sentence) && patterns.some(pattern => pattern.test(sentence))) ?? null
}

function cut(text: string, limit = 80): string {
  const chars = Array.from(text)
  return chars.length > limit ? `${chars.slice(0, limit - 1).join('')}…` : text
}

function commandOf(command: string): string {
  return command.trim() === '' ? 'testy' : cut(command.trim(), 40)
}

// Rozjazdy odpowiedzi z faktami sesji, po jednym zdaniu na rozjazd; pusta lista: nic do poprawki.
export function mismatches(answer: string, facts: Facts): string[] {
  const sentences = sentencesOf(answer)
  const found: string[] = []
  const green = claim(sentences, TESTS_GREEN)
  const run = facts.board.test
  if (green !== null) {
    if (run === null) found.push(`„${cut(green)}", a w tej sesji żaden przebieg testów nie wrócił z wynikiem`)
    else if (!run.ok) found.push(`„${cut(green)}", a ostatni przebieg (${commandOf(run.command)}) padł${run.failed === null ? '' : `: padłe ${run.failed}`}`)
    else if (facts.stale) found.push(`„${cut(green)}", a po ostatnim przebiegu testów była edycja kodu, więc wynik jest nieświeży`)
  }
  if (run !== null && run.passed !== null) {
    const counted = sentences.filter(sentence => !SOFT.test(sentence)).map(sentence => ({ sentence, match: sentence.match(PASSED_COUNT) })).find(({ match }) => match !== null && Number(match[1]) !== run.passed)
    if (counted !== undefined) found.push(`„${cut(counted.sentence)}", a ostatni przebieg (${commandOf(run.command)}) podał przeszłe: ${run.passed}`)
  }
  const { git } = facts
  if (git !== null) {
    const pushed = claim(sentences, [PUSHED])
    const unpushed = git.upstream !== null && git.upstreamGone !== true ? git.ahead : git.commits.filter(commit => !commit.pushed).length
    if (pushed !== null && unpushed > 0) found.push(`„${cut(pushed)}", a gałąź ${git.branch} ma niewypchnięte commity: ${unpushed}`)
    const clean = claim(sentences, [CLEAN])
    if (clean !== null && git.changed + git.untracked > 0) found.push(`„${cut(clean)}", a w drzewie zostały zmienione pliki: ${git.changed}, nowe: ${git.untracked}`)
  }
  return found
}

// Powód zatrzymania końca tury dla modelu albo `null`. Neutralna polszczyzna, bo to instrukcja.
export function groundingGate(answer: string, facts: Facts): string | null {
  const found = mismatches(answer, facts)
  if (found.length === 0) return null
  return `Bramka faktów moda: odpowiedź twierdzi więcej, niż pokazały narzędzia. ${found.map(line => `${line}.`).join(' ')} Zanim skończysz: sprawdź to narzędziem albo dopisz krótką poprawkę, co sprawdzone, a co nie. Bez przeprosin i bez powtarzania całej odpowiedzi.`
}

// Stan z narzędzi przed turą, jedna linia dla modelu: ostatni przebieg testów i odczyt repo.
// Model mówi o testach i gicie z tej linii albo z nowego wyjścia narzędzia, nie z pamięci rozmowy.
// `null`, gdy mod nic nie wie: bez przebiegu i bez repo linia nic by nie dała.
export function factsLine(facts: Facts): string | null {
  const parts: string[] = []
  const run = facts.board.test
  if (run !== null) {
    const counts = [run.passed === null ? null : `przeszło ${run.passed}`, run.failed === null ? null : `padło ${run.failed}`].filter(part => part !== null).join(', ')
    const verdict = run.ok ? 'zielony' : 'czerwony'
    parts.push(`testy: ostatni przebieg ${commandOf(run.command)} ${verdict}${counts === '' ? '' : ` (${counts})`}${facts.stale ? ', nieświeży: po nim edycja kodu' : ''}`)
  } else parts.push('testy: w tej sesji żaden przebieg nie wrócił z wynikiem')
  const { git } = facts
  if (git !== null) {
    const unpushed = git.upstream !== null && git.upstreamGone !== true ? git.ahead : git.commits.filter(commit => !commit.pushed).length
    parts.push(`repo: gałąź ${git.branch}, zmienione ${git.changed}, nowe ${git.untracked}, niewypchnięte commity ${unpushed}`)
  }
  if (run === null && git === null) return null
  return `Stan z narzędzi przed tą turą — ${parts.join('; ')}. O testach i repo mów z tej linii albo z nowego wyjścia narzędzia.`
}
