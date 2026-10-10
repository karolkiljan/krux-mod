# Kontrakt utrzymania moda Krux

Pełny kontrakt leży w `hooks/CLAUDE.md`: drzewo plików z opisem każdego modułu, macierz zdarzeń (zdarzenie, warunek, skutek) i niezmienniki z uzasadnieniami z benchu. Claude Code dociąga go dopiero przy czytaniu plików z `hooks/`. Przed zmianą zachowania moda przeczytaj go w całości i zaktualizuj tam odpowiedni wiersz macierzy albo niezmiennik. Poniżej tylko skrót zasad, które obowiązują także poza `hooks/`.

## Drzewo plików

```text
.claude-plugin/{plugin.json,marketplace.json}  manifest i lokalny marketplace (wersja w obu)
hooks/hooks.json                              wskazuje hooks module (`modules`)
hooks/register.ts                             wszystkie hooki moda; jedyne miejsce z `$`
hooks/*.ts, hooks/acts/*.ts                   czyste moduły: głos, horda, pas, scena, Sztolnia, git, wątki, raport (opis w `hooks/CLAUDE.md`)
hooks/CLAUDE.md                               pełny kontrakt: drzewo, macierz zdarzeń, niezmienniki
voice/{persona,konkret,flow}.md               jedyne źródło tekstów trafiających do promptu
agents/*.md                                   kumple jako typy subagentów `krux-mod:<ROSTER.agent>`
skills/krux-horda/SKILL.md                    horda na żądanie: kiedy wołać kumpla i którym typem
types/index.d.ts                              kontrakt `$.state` (`krux-mod.*`)
tests/*.test.ts                               testy `claude plugin test`
tests/scripts-regression.mjs                  testy skryptów i plików `agents/`
scripts/                                      act-sheet (arkusz klatek), voice-bench i bench-compare (pomiar głosu), tui-shot.py (zrzut ekranu)
benchmarks/                                   surowe przebiegi benchu
docs/research/, docs/adr/, docs/plans/        źródła zmian głosu, decyzje trudne do cofnięcia, plany gałęzi
CONTEXT.md                                    słownik głosu, hordy i strażnika
```

`.claude-plugin/types/` pisze silnik przy każdym załadowaniu z `--plugin-dir` — nie edytować, jest w `.gitignore`.

## Zasady przekrojowe

- Głos prowadzi mod (od 0.3.0); pomysł z moda można przenieść do pluginu Krux, ale nie odwrotnie z automatu. Instrukcje piszemy poprawną polszczyzną, głos niosą pary przykładów. Łamiemy ramę zdania, nie dane: negacja, liczby, ścieżki i komunikaty błędów dosłownie.
- `VOICE_ANCHOR` mieści się w 1000 znaków, a para „Robak siedzieć”, nie „Robak siedzi” stoi w `VOICE_ANCHOR` i `VOICE_SHORT` (testy). Zmiana kotwicy, linii nastroju albo notki o hordzie wymaga A/B co najmniej 2 na 2 przebiegi: `node scripts/voice-bench.mjs` (~$0,45 za przebieg).
- O tym, kiedy odzywa się kumpel i gdzie stoi wstawka, decyduje kod (`lifeNote`, `QUIET_TURNS`, rotacja miejsc), nie kotwica ani persona. Bench i `lore.ts` mają ten sam `QUIET_TURNS` i tę samą rotację (test skryptów).
- Przykłady w `voice/persona.md` nie powtarzają formuły zamknięcia: model kopiuje powierzchnię przykładów. O Morrze i o kumplach bez rodzaju („Morra wybrać”).
- Sekcje moda idą zawsze na końcu, jako `session`: tekst zmienny nie może siedzieć po stronie `shared` cache'a.
- Nowy kumpel: wpis w `ROSTER`, imię w `KruxMate`, plik w `agents/`, linia w `skills/krux-horda/SKILL.md`, wzorce imienia w benchu (pilnuje `tests/scripts-regression.mjs`). Pliki `agents/` zastępują prompt systemowy kumpla: neutralna polszczyzna, bez rodzaju, opisy wszystkich kumpli razem najwyżej 700 znaków, Niuch, Piryt i Młot bez narzędzi edycji. Słowa fachu (`ROSTER.words`) to same rzeczowniki.
- Trwały stan to wyłącznie tryby w `$.store`, każdy pod `mode.<tryb>`; reszta żyje w `$.state` sesji. Nowy tryb wymaga wpisu w `MODES`, `DEFAULT_MODES` i `types/index.d.ts`.
- `$` przekazujemy tylko do funkcji z najwyższego poziomu `register.ts`; pozostałe moduły go nie znają i testy idą przez ich interfejsy (`bandPlan`, `crewAfter`, `shaftTree`), nie przez piksele.
- Ścieżka modułu `Client` to literał `'./forge.ts'`: silnik czyta go ze źródła, zmienną odrzuca.
- Tabliczki, kreska odpowiedzi, pas nad promptem, płótno i czat stoją tylko na `terminal`; Desktop dostaje natywną odpowiedź silnika. Żaden przodek treści silnika (`next(e)`) nie ma `width` — silnik odrzuca takie drzewo, a `claude plugin test` tego nie łapie.
- Zgody na narzędzia obsługuje wyłącznie silnik: mod nie rejestruje `tool.check`.
- `isDestructive` rozpoznaje komendy, nie słowa; przy wątpliwości flaga zostaje. Każda komenda ma przykład i bezpiecznego sąsiada w `tests/voice.test.ts`.
- Wersja stoi w dwóch miejscach: `.claude-plugin/plugin.json` i `.claude-plugin/marketplace.json`.

## Komendy przed wydaniem

```bash
claude plugin validate .
claude plugin test .
node --test tests/scripts-regression.mjs
tsc -p .
git diff --check
```

Wygląd (ramki, kolory, układ) `claude plugin test` nie widzi: testy sprawdzają drzewo, nie farbę silnika. Zrzut prawdziwego ekranu, z modem z tego folderu i tanim modelem (transkrypt sesji dziecka się nie zapisuje):

```bash
python3 -m venv .venv && .venv/bin/pip install pyte
.venv/bin/python scripts/tui-shot.py --cols 120 --rows 40 --cmd 'claude --model haiku' \
  'until:Try:30' 'type:Powiedz: tak.' 'key:enter' 'until:done:120' 'wait:4' 'shot' 'fg:⚒ Krux'
```

Szerokość pod 144 kolumny pokazuje pas bez panelu Sztolni, 180 z panelem. Przy podpowiedzi komend `key:esc` przed `key:enter`, inaczej Enter bierze podświetloną. Sesja dziecka dzieli `$.store` z prawdziwymi: przełączony tryb trzeba przełączyć z powrotem i sprawdzić `/krux status`. Odrzucone drzewo `ui.render` silnik zgłasza w transkrypcie tylko przy `--plugin-dir .` (`--cmd 'claude --model haiku --plugin-dir .'`); bez tego cicho rysuje swoje. Sesja z `--plugin-dir` ma osobny `$.store`, więc tryby trzeba w niej włączyć.

Typy (`tsc`) — po pierwszym załadowaniu z `--plugin-dir` silnik kładzie deklaracje w `.claude-plugin/types/`, wtedy `npx -p typescript@5 tsc -p .`.

## Agent skills

Konfiguracja pluginu [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, © 2026 Matt Pocock), z którego maintainer korzysta przy rozwoju moda. Pliki w `docs/agents/` to szablony wygenerowane przez ten plugin; mod ich nie czyta i do działania ich nie potrzebuje.

### Issue tracker

Issues i specy jako pliki markdown w `.scratch/<feature>/` w repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Pięć kanonicznych ról, napis etykiety = nazwa roli, zapisany w linii `Status:` pliku issue. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` i `docs/adr/` w korzeniu repo. See `docs/agents/domain.md`.

Nowy termin trafia do `CONTEXT.md`, gdy się ustali; ADR powstaje tylko dla decyzji trudnej do cofnięcia, zaskakującej bez kontekstu i wybranej spośród realnych opcji. `.scratch/` powstaje leniwie, gdy skill pierwszy raz go potrzebuje; jego brak to stan zamierzony, nie błąd do zgłoszenia.
