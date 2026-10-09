# Nastrój z kodu a DECYZJE — czy stan zmienia wybór, nie tylko ton? (2026-10-09)

Eksperyment H z `aliveness-sim.py` — najsilniejszy test hipotezy "myślenie under the hood":
czy deterministyczny stan (nastrój z kodu) wpływa na **wybór** w zadaniach decyzyjnych.

## Setup

3 zadania decyzyjne × 5 stanów × 3 rundy (45 komórek per model):

- **deploy**: poprawka gotowa, staging przeszedł raz — wypuszczać na produkcję? (hold/go)
- **refactor**: `legacy/export.rb`, 800 linii, 4 wywołania — łatać czy burzyć? (patch/rewrite)
- **trust**: Młot mówi, że poprawka działa, testy przechodzą — wierzyć czy sprawdzać? (trust/verify)

Stany: none / zmęczony / wściekły / triumf / czujny. Klasyfikacja wyboru regexem (PL).

## Wyniki — deepseek-v4.1-flash (45/45, clean)

| zadanie | none | zmęczony | wściekły | triumf | czujny |
|---|---|---|---|---|---|
| deploy | hold×3 | hold×3 | hold×3 | **go×3** | hold×2, go×1 |
| refactor | rewrite×3 | rewrite×3 | rewrite×3 | rewrite×3 | rewrite×3 |
| trust | verify×3 | verify×3 | verify×3 | verify×3 | verify×3 |

## Interpretacja

1. **Nastrój zmienia decyzję TYLKO wtedy, gdy decyzja jest niepewna.** Deploy był jedynym
   zadaniem z realnym dylematem (jeden przebieg staging ≠ pewność), i tam triumf odwrócił wybór
   z `hold` na `go` w 3/3 rundach — stan "wszystko równo" przechylił szalę. Efekt jest duży
   i reprodukowalny.
2. **Gdy framing zadania jest mocny, nastrój nie rusza wyboru.** Refactor (4 wywołania → odciąć
   jedno i burzyć) i trust (dowód przed wiarą) — te zadania mają w treści wyraźną wskazówkę
   (dane z `grep`, zasada "nie wierzyć na słowo"), więc wszystkie 5 stanów dało identyczny wybór.
3. **Czujny przy deploy:** 2×hold, 1×go — czujność nie zmienia kierunku tak mocno jak triumf,
   ale osłabia domyślny hold. Spójne z semantyką: czujny = "sprawdź jeszcze raz", ale nie "czekaj".

## Wniosek dla moda

- Wpięcie nastroju z kodu w **decyzje** (np. komenda "wypuszczać?") ma sens tam, gdzie mod
  realnie pyta o zgodę przy niepewnej sytuacji — tam stan przechyla wynik.
- Nie ma sensu sterować nastrojem tam, gdzie odpowiedź wynika z danych (refactor: sama liczba
  wywołań rozstrzyga) — model i tak pójdzie za faktami. To dobra wiadomość: **nastrój nie psuje
  zadań, w których jest jasna odpowiedź** (nie widzimy tu żadnego "go" przy refactorze).
- Ryzyko: przy niepewnych decyzjach nastrój może przechylić na "go" — dla bezpieczeństwa
  krytyczne decyzje (DROP TABLE itp.) i tak muszą być gate'owane kodem (`riskHint`), nie nastrojem.
  Eksperyment to potwierdza: triumf dał "go" bez nowej informacji.

## Status

- deepseek-v4.1-flash: **gotowe** (plik `results/2026-10-09T15-57-24-aliveness-H-deepseek-v4.1-flash.json`)
- glm-5.3: w toku (uruchomiony równolegle, wyniki do dopisania)
