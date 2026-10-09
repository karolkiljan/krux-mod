# Mod + Claude Code + Ollama — pełny E2E na tanich modelach (2026-10-09)

Przełom tej sesji: **mod Krux da się odpalać w prawdziwym harnessie Claude Code, wskazanym na ollama
(deepseek-v4.1-flash, glm-5.3-flash, glm-5.3)** — bez Anthropic, bez OAuth, na kluczu `OLLAMA_API_KEY`.
Dotąd mod był mierzony albo surowym API (`ork-sim.py`), albo na Claude. Teraz jest trzecia droga:
pełny stos (hooki, kotwica, miernik dryfu, plugin) × prawdziwy harness × tani model.

## Jak to działa (zweryfikowane empirycznie)

Ollama ma **natywne API Anthropic** (`/v1/messages`): messages, streaming, system prompts, tools,
tool results, thinking. Sprawdzone: `curl https://ollama.com/v1/messages` zwraca HTTP 200 z blokiem
`thinking` i `text` dla `deepseek-v4.1-flash`.

Konfiguracja dla Claude Code:

```bash
export ANTHROPIC_BASE_URL="https://ollama.com"
export ANTHROPIC_AUTH_TOKEN="$OLLAMA_API_KEY"   # bearer, NIE x-api-key
export ANTHROPIC_API_KEY=""                     # wyczyścić, żeby nie nadpisał
claude --model deepseek-v4.1-flash ...
```

Uwagi:
- Cloud wymaga **`Authorization: Bearer`** — sam `x-api-key` nie przechodzi.
- `anthropic-version: 2023-06-01` (starsze odrzucane).
- Ustawienia w `~/.claude/settings.json` mogą nadpisać env — sprawdzać `/status`.
- Model musi wspierać tools (deepseek-v4.1-flash i glm-5.3-flash wspierają).
- **Tryby i hooki moda działają**: w transkrypcie widać `hook_additional_context` z pełną kotwicą
  (`Krux pamiętać: …`) i personą — czyli `prompt.compose`/`prompt.submit` wchodzą normalnie.

## Wyniki E2E: `voice-bench.mjs` na ollama (12 tur, scenariusz `cache`, tryb resume)

| model | akcept | głos/1k | bezok | 2os | cop/100 | avgSł | krótkie% | kotwice (pełne/krótkie) | poprawki dryfu |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|
| deepseek-v4.1-flash | **TAK** | 22,9 | 89 | 0 | 0,00 | 7,2 | 74% | 3 / 9 | 1 |
| glm-5.3-flash | **TAK** | **35,2** | 93 | 0 | 0,09 | 11,5 | 33% | 8 / 4 | 7 |
| **glm-5.3 (full)** | **TAK** | 28,0 | 100 | 0 | 0,00 | **7,4** | 67% | 4 / 8 | 2 |
| *baseline Opus 5.5 (38 przebiegów)* | *TAK* | *15–30* | *55–202* | *0–1* | *0–0,4* | *7–8,7* | *53–76%* | *—* | *—* |

**Czytanie:**

1. **Wszystkie trzy tanie modele przechodzą bramkę moda** (`accepted: True`): gęstość głosu ≥ 6, zero drugiej
   osoby, kotwica dochodzi. To pierwszy raz, gdy mod zaliczył E2E na modelach innych niż Claude.
2. **Deepseek przez CC wypada niemal jak Opus**: głos 22,9 (mediana Opusa ~20), avgSł 7,2 (Opus 7–8,7),
   krótkie zdania 74% (Opus 53–76%), copula 0,00, zero drugiej osoby. **Tryb resume z kotwicą działa.**
3. **glm-5.3 (full) to najlepszy z taniej trójki**: głos 28,0, zdania 7,4 słowa, 67% krótkich, copula 0 —
   profil niemal kopiuje Opusa, przy 100 bezokolicznikach (najwięcej z wszystkich). „Mądrzejszy model
   ogarnia lepiej" — potwierdzone empirycznie.
4. **glm-5.3-flash mówi najbardziej „orkowo"** (głos 35,2 — powyżej całego zakresu Opusa!), ale **rozciąga
   zdania** (avgSł 11,5, krótkie tylko 33%) — czyli łamie regułę „zdanie do 8 słów". Miernik dryfu złapał
   to 7 razy (vs 1–2 u pozostałych) — mod sam korygował, ale model wracał do długich zdań. Wniosek:
   glm-flash nadaje się na barwę, nie na zwięzłość.
5. **Koszt liczony przez CC jest fikcyjny** (`costUSD` liczy po cenach Anthropic dla nieznanego modelu);
   realny koszt to ryczałt ollama Pro (limit 5h wspólny dla konta). Traktować jako zero-dodatkowy, gdy
   mieści się w limicie.

## Przykłady z transkryptów (głos w praktyce)

Deepseek (tura 2, przyczyna):
> Przyczyna: `app.rb` nie mieć żadnego styku z `settings.yml` — grep po `ttl|yaml|settings` trafiać tylko
> w README i sam config, w kodzie ani raz. Dowód: brak `require "yaml"`, brak `YAML.load_file`…

glm-5.3-flash (tura 1):
> Krux obejrzeć całą sztolnię — 3 pliki… **Robak główny — `nil` nigdy nie siedzieć w cache.** `app.rb:7`:
> `return @store[key] if @store[key]`. To sprawdzać prawdziwość, nie obecność.

Oba trzymają kontrakt: bezokoliczniki, bez copuli, słownik (robak, sztolnia, smród), dane (ścieżki, numery
linii) dosłownie. To dokładnie cel moda.

## Co to znaczy dla projektu

1. **Mod można rozwijać i testować bez tokenów Anthropic** — iteracje promptu/hooków na deepseek lub glm
   przez ollama, w prawdziwym harnessie, za zero dodatkowych kosztów (w ramach Pro).
2. **A/B na kotwicach (wymóg niezmiennika moda: 2×2) da się robić tanio** — `voice-bench.mjs` przyjmuje
   `--model`, a env ollama przechodzi przez `cleanEnvironment` (sprawdzone: pełne przebiegi zakończone).
3. **Miernik dryfu (`gauge.ts`) działa na tanich modelach** — poprawki dryfu wchodziły (1× ds, 7× glm-flash),
   czyli mechanizm nie zależy od tego, kto pisze.
4. **Nowa ścieżka weryfikacji przed wydaniem**: mod na Claude (docelowy) + mod na deepseek/glm przez ollama
   (tanio, na każdą iterację). Rozjazd między nimi = sygnał, że kotwica jest zbyt słaba dla tańszych modeli.

## Replikacja

```bash
set -a; . /root/.hermes/.env; set +a
export ANTHROPIC_BASE_URL="https://ollama.com"
export ANTHROPIC_AUTH_TOKEN="$OLLAMA_API_KEY"
export ANTHROPIC_API_KEY=""
cd /root/projects/krux-mod
node scripts/voice-bench.mjs --model deepseek-v4.1-flash --mode resume
node scripts/voice-bench.mjs --model glm-5.3-flash --mode resume
# glm-5.3 (full) — w toku; droższy, „mądrzejszy"
```

Raporty lądują w `benchmarks/voice-bench/<data>/report.json` (już w repo: 2026-10-09T13-28 i 13-29).
Transkrypty (z hookami) w `/tmp/vb-ollama/transcript-*.jsonl`.
