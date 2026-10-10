# Plan: strażnik, horda jako agenci, forma linii nastroju i miejsce kumpla

Gałąź `feat/straznik-horda-dryf` (PR #3), od `main` po PR #2 (`cdd1044`). Robota zaczęta na VPS,
dokończona na komputerze Morry 2026-10-10. Dowody i liczby:
`docs/research/2026-10-10-straznik-horda-nastroj.md`.

## Stan gałęzi

| commit | co | sprawdzone |
|---|---|---|
| `strażnik: ruch nieodwracalny poza gitem i SQL` | `isDestructive` i `RISK_WORDS` w `hooks/voice.ts` | przykłady i sąsiedzi w `tests/voice.test.ts` |
| `horda: kumple jako typy subagentów w agents/` | `agents/*.md`, `ROSTER.agent`, `mateOfType`, skill `krux-horda` | testy `mood`, `mod`, `scripts-regression`; na żywo `claude -p` z Haiku uruchomił `krux-mod:niuch` |
| `bench: scenariusz smrod, metryki moda i bench-compare…` | bench z `experiments/haiku-ab` (ta gałąź nie trafiła do `main`) | testy skryptów |
| `nastrój: forma zdania z kodu…` (punkt 3) | linia nastroju „Krux + bezokolicznik”, bez słowa „nastrój” | Haiku `smrod` n = 10 i Opus `smrod` n = 4: zostaje |
| `horda: środek notki mówi „nie na końcu”…` (punkt 4) | środek notki o hordzie z „nie na końcu odpowiedzi” | Haiku `smrod` 4 z 9 → 1 z 9, powtórka `cache` bez wzrostu dryfu: zostaje |
| `docs: plan przekazania gałęzi…` | notatka z wynikami, ten plan, surowe przebiegi S | — |
| `strażnik: łańcuch komend, wielolinijkowy UPDATE…` | poprawki z przeglądu (TDD) | testy strażnika |
| `test: tsc bez błędu…` | TS18048 w `tests/gauge.test.ts` | `tsc -p .` czysty |
| `docs: słownik CONTEXT.md i ADR…` | `CONTEXT.md`, `docs/adr/0001-lont-zakaz-w-prompcie.md` | — |
| `bench: harmonogram notek z odpowiedzi…` | `middleClosings` i `moodWordEcho` w raporcie, bez `mate-closings.py` | testy skryptów, także zgodność reguły z `hooks/lore.ts` |
| `horda: krótsze opisy kumpli…` | opisy 873 → 629 znaków, prompt bez rodzaju, Lont na czystych plikach | testy skryptów i `mod` (typ w apelu i w czacie) |
| `test: bench-compare…` | próba porównania z przebiegiem ERROR | testy skryptów |
| `docs: wyniki powtórki cache i Opusa…` | notatka, ten plan, surowe przebiegi `pc/` i `opus/` | — |
| `strażnik i horda: poprawki z drugiego przeglądu` | regresje w poprawkach: wcięty SQL, cytowane separatory, `mkfs` w prośbie; opcje globalne; Lont bez `git rm`; granice w opisach kumpli | 71 groźnych komend, 56 sąsiadów, 5 polskich próśb; porównanie wersji na 1317 napisach |

Sprawdzenia na komputerze Morry (Claude Code 2.1.296): `claude plugin validate .` z jednym
ostrzeżeniem, `claude plugin test .` 482/482 (na VPS 477/480 przez timeouty), `node --test
tests/scripts-regression.mjs` 25/25 (8 pominiętych bez `pyte`), `tsc -p .` i `git diff --check`
czyste.

## Decyzje

Lista „do podjęcia przez Morrę” zamknięta tak:

- **Lont i komendy nieodwracalne:** zakaz zostaje w prompcie, zgody daje silnik.
  `docs/adr/0001-lont-zakaz-w-prompcie.md` zapisuje odrzucone opcje (`tool.check`,
  `hooks.PreToolUse` i `disallowedTools` w pliku agenta) i kiedy wrócić.
- **Model Niucha i Młota:** `haiku` zostaje; skill każe podać `model` przy trudnym zadaniu.
- **`rm -rf build` z flagą:** zostaje — fałszywy alarm to tura pełnych zdań, przeoczenie to dane.
- **Dane `benchmarks/haiku-ab/` i `benchmarks/straznik/`:** zostają w repo, jak
  `benchmarks/voice-bench/`; `bench-compare.mjs` odtwarza z nich każdą liczbę z notatek.

## Zostało: wydanie po merge

Osobny commit jak przy 0.11.3: wersja w `.claude-plugin/plugin.json` i
`.claude-plugin/marketplace.json`. W `main` od 0.11.3 doszły PR #2 i ta gałąź (nowe typy
agentów), więc kandydat to 0.12.0. Desktop czyta kopię z cache pluginów, więc po wydaniu
`claude plugin update krux-mod@krux-mod-marketplace` i restart sesji Desktop.

## Poza tą gałęzią

- **Twardy zakaz u Lonta:** hook w pliku agenta z `isDestructive`, gdy Lont ma pracować bez
  nadzoru człowieka (warunek z ADR 0001), z testem na prawdziwym silniku.
- **Bezokolicznik na Opusie** w turach bez linii nastroju (−23% przy p = 0,37, n = 4): przy
  następnym A/B na Opusie policzyć osobno tury z linią i bez.
- **Licznik nastroju w benchu** liczy przymiotniki. Po zmianie formy potrzebny inny licznik
  (zdanie „Krux + bezokolicznik” w turze po notce nastroju) albo ocena ręczna.
- **Telefon i Desktop**: orki i tabliczki rysują się tylko w terminalu. Najpierw skrót
  Sztolni tekstem dla innych powierzchni, potem orki jako `Svg` z `register.ts`.
- **Porządki**: PR #1 (`experiments/ork-speech-deepseek`) nie ma `merge-base` z `main` —
  zamknąć albo przenieść notatki osobnym PR. Na VPS zostały worktree `krux-arms/*`,
  `krux-mod-ab`, `krux-bench`, `krux-base`, `krux-mod-straznik` i lokalne gałęzie `arm/*`,
  `experiments/haiku-ab*`; po przeniesieniu wyników do repo do usunięcia.
- **`register.ts`** ma ponad 1100 linii: podział na głos, scenę i Sztolnię.
- **Raport benchu:** liczniki kotwic leżą płasko i `bench-compare.mjs` składa je z powrotem
  (każde nowe pole kotwic trzeba dopisać w dwóch miejscach); loader źródła benchu w
  `bench-compare.mjs` powtarza `sourceOf` z testów skryptów.
