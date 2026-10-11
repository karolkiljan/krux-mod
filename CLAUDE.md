# Kontrakt utrzymania moda Krux

Pełny kontrakt leży w `hooks/CLAUDE.md`: macierz zdarzeń (zdarzenie, warunek, skutek) i niezmienniki; uzasadnienia z benchu leżą w `docs/research/2026-10-11-uzasadnienia-niezmiennikow.md`. Claude Code dociąga go dopiero przy czytaniu plików z `hooks/`. Przed zmianą zachowania moda przeczytaj go w całości i zaktualizuj tam odpowiedni wiersz macierzy albo niezmiennik. Poniżej mapa repo i skrót zasad, które obowiązują także poza `hooks/`.

## Mapa repo

```text
.claude-plugin/{plugin.json,marketplace.json}  manifest i lokalny marketplace (wersja w obu)
hooks/                                         moduły moda; kontrakt, macierz i niezmienniki w `hooks/CLAUDE.md`
voice/{persona,konkret,flow}.md                jedyne źródło tekstów trafiających do promptu
agents/*.md                                    kumple jako typy subagentów `krux-mod:<ROSTER.agent>`
skills/krux-horda/SKILL.md                     horda na żądanie: kiedy wołać kumpla i którym typem
types/index.d.ts                               kontrakt `$.state` (`krux-mod.*`)
tests/*.test.ts                                testy `claude plugin test`
tests/scripts-regression.mjs                   testy skryptów i plików `agents/`
scripts/                                       act-sheet (arkusz klatek), voice-bench i bench-compare (pomiar głosu), tui-shot.py (zrzut ekranu)
benchmarks/                                    surowe przebiegi benchu
docs/research/, docs/adr/, docs/plans/         źródła zmian głosu, decyzje trudne do cofnięcia, plany gałęzi
CONTEXT.md                                     słownik głosu, hordy i strażnika
```

## Zasady przekrojowe

- `.claude-plugin/types/` pisze silnik przy każdym załadowaniu z `--plugin-dir` — nie edytować, jest w `.gitignore`.
- Głos prowadzi mod (od 0.3.0); pomysł z moda można przenieść do pluginu Krux, ale nie odwrotnie z automatu. Instrukcje piszemy poprawną polszczyzną, głos niosą pary przykładów. Łamiemy ramę zdania, nie dane: negacja, liczby, ścieżki i komunikaty błędów dosłownie.
- `VOICE_ANCHOR` mieści się w 1000 znaków, a para „Robak siedzieć”, nie „Robak siedzi” stoi w `VOICE_ANCHOR` i `VOICE_SHORT` (testy). Zmiana kotwicy, linii nastroju albo notki o hordzie wymaga A/B co najmniej 2 na 2 przebiegi: `node scripts/voice-bench.mjs` (~$0,45 za przebieg).
- Przykłady w `voice/persona.md` nie powtarzają formuły zamknięcia: model kopiuje powierzchnię przykładów. O Morrze i o kumplach bez rodzaju („Morra wybrać”).
- Nowy kumpel: wpis w `ROSTER`, imię w `KruxMate`, plik w `agents/`, linia w `skills/krux-horda/SKILL.md`, wzorce imienia w benchu (pilnuje `tests/scripts-regression.mjs`). Pliki `agents/` zastępują prompt systemowy kumpla: neutralna polszczyzna, bez rodzaju, opisy wszystkich kumpli razem najwyżej 700 znaków, Niuch, Piryt i Młot bez narzędzi edycji. Słowa fachu (`ROSTER.words`) to same rzeczowniki.
- Trwały stan to wyłącznie tryby w `$.store`, każdy pod `mode.<tryb>`; reszta żyje w `$.state` sesji. Nowy tryb wymaga wpisu w `MODES`, `DEFAULT_MODES` i `types/index.d.ts`.
- Wersja stoi w dwóch miejscach: `.claude-plugin/plugin.json` i `.claude-plugin/marketplace.json`.

## Przed wydaniem

Komendy przed wydaniem i zrzut ekranu są w skillu `przed-wydaniem` (`.claude/skills/przed-wydaniem/SKILL.md`).

## Agent skills

Konfiguracja pluginu [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, © 2026 Matt Pocock), z którego maintainer korzysta przy rozwoju moda. Pliki w `docs/agents/` to szablony wygenerowane przez ten plugin; mod ich nie czyta i do działania ich nie potrzebuje.

### Issue tracker

Issues i specy jako pliki markdown w `.scratch/<feature>/` w repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Pięć kanonicznych ról, napis etykiety = nazwa roli, zapisany w linii `Status:` pliku issue. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` i `docs/adr/` w korzeniu repo. See `docs/agents/domain.md`.

Nowy termin trafia do `CONTEXT.md`, gdy się ustali; ADR powstaje tylko dla decyzji trudnej do cofnięcia, zaskakującej bez kontekstu i wybranej spośród realnych opcji. `.scratch/` powstaje leniwie, gdy skill pierwszy raz go potrzebuje; jego brak to stan zamierzony, nie błąd do zgłoszenia.
