# Uzasadnienia niezmienników

Zdania z pomiarów i obserwacji, które do 0.12.0 stały w niezmiennikach `CLAUDE.md`. Reguły zostały w `CLAUDE.md` i `hooks/CLAUDE.md`; tu leży, dlaczego tak, żeby kontrakt ładowany do sesji nie niósł liczb z benchu. Tekst przeniesiony bez zmian z `git show 5d76e5d:CLAUDE.md`.

## Głos

- `voice/persona.md` wyszedł z body `skills/krux/SKILL.md` pluginu Krux 3.8.0.
- Kotwica jedzie co turę, bo pomiar pluginu na Claude pokazał, że bez niej gramatyka orka wygasa.
- Para „Robak siedzieć”, nie „Robak siedzi” musi zostać w kotwicy: bez niej przebieg zgubił bezokoliczniki (55 zamiast ~160). Ta sama para stoi w `VOICE_SHORT`: z nią środek sesji trzyma bezokoliczniki bez poprawek dryfu (A/B w `docs/research/2026-10-04-komunikacja.md`).
- Pomiar tokenów pokazał, że gramatyka orka jest tokenowo obojętna — oszczędza tylko krótsze zdanie i wycięte słowa (np. „jest”).
- `isDestructive`: fałszywy alarm kosztuje jedną turę pełnych zdań, przeoczenie — dane, więc przy wątpliwości flaga zostaje.

## Horda

- Spośród kumpli z faktem notka wybiera seed, nie ostatnie zdarzenie, bo inaczej przy częstych commitach gadał w kółko Piryt.
- Charakter (`trait`), miejsce i formę wstawki daje kod: model brał „jeśli pasuje” za rozkaz i stawiał kumpla na końcu w 31 z 32 tur benchu.
- Miejsca rotują, więc część tur sama każe „na końcu”; środek mówi wprost „nie na końcu odpowiedzi”, bo przy samym „w środku” Haiku stawiał kumpla w ostatnim zdaniu w 2 z 11 do 4 z 9 takich tur (`smrod`).
- O tym, w której turze odzywa się kumpel, decyduje kod, nie kotwica: model nie wykona instrukcji częstotliwości typu „co kilka odpowiedzi”. Kotwica i persona nie zapraszają hordy bez notki. Źródła: `docs/research/2026-10-04-komunikacja.md`.
- Przykłady w `voice/persona.md` nie mogą powtarzać tej samej formuły zamknięcia: model kopiuje powierzchnię przykładów.
- Słowa fachu kumpla to same rzeczowniki: czasowniki („przepalić”) ciągnęły model w opowieść w czasie przeszłym z rodzajem. W A/B na Haiku zdań o kumplu ze słowem fachu było 87% zamiast 62% (`docs/research/2026-10-10-haiku-ab.md`).
- Opisy kumpli idą na listę typów narzędzia `Agent` w każdej turze, więc mają budżet: razem najwyżej 700 znaków. Treść pliku `agents/` zastępuje prompt systemowy kumpla, więc persona moda do niego nie trafia.
- Metoda fachu stoi w pliku kumpla (2026-11-04), bo kumpel dostaje tylko swój prompt i dane środowiska, bez promptu systemowego Claude Code (sub-agents, „What loads at startup”; typy silnika: „it replaces the session's”). Wzorce z „Prompting best practices” Anthropic: czytać kod przed wnioskiem, niezależne wywołania naraz, rozwiązanie ogólne zamiast pisanego pod test, najmniejsza zmiana bez abstrakcji na zapas.
- Bez nakazów „sprawdź jeszcze raz”: na Opus 5 takie instrukcje dają nadmiarową weryfikację bez zysku jakości („Prompting Claude Opus 5”, „Task scope and over-verification”). Prompt mówi, co jest dowodem i kiedy koniec.
- Piryt zgłasza wszystko, co umie pokazać, a odsiew zostaje Kruxowi: przy prośbie o same poważne uwagi Opus 5 bierze ją dosłownie i zgłasza mniej („Code review and bug-finding”).
- Niuch ma `effort: high`: Haiku 5.5 bez pola chodzi na `medium`, a `high` poleca do dłuższych zadań agenta i ścisłego trzymania instrukcji („Prompting Claude Haiku 5.5”). Kumpel na modelu rodzica nie ma `effort`, bo pole nadpisuje poziom sesji (sub-agents, „Supported frontmatter fields”). Próba na żywo (`claude -p --plugin-dir . --model haiku`, sesja na domyślnym poziomie): `echo EFFORT=$CLAUDE_EFFORT` w Bash Niucha daje `EFFORT=high`, więc pole działa także na modelu innym niż sesji. Jakości kumpli bench nie mierzy: scenariusze nie dają modelowi narzędzia `Agent`.
- Szukanie tekstu narzędziem Grep (przegląd 2026-11-05): opis tego narzędzia w silniku 2.1.295 mówi „ALWAYS use Grep for search tasks. NEVER invoke `grep` or `rg` as a Bash command”, więc prompt z `rg -n` w Bash dawał Niuchowi dwie sprzeczne instrukcje. `rg` bywa poza PATH, a Bash z argumentem rozwijanym przez powłokę (gwiazdka) idzie przez zgodę. `git grep` bez `--untracked` przeszukuje tylko pliki śledzone, więc dowód martwego kodu Lonta nie widział nowych plików, na przykład tych, które obok tworzy Grom.
- Limit tur w prompcie (przegląd 2026-11-05): kumpel, który dojdzie do `maxTurns`, wraca z dopiskiem silnika „-turn limit before finishing. The text below is PARTIAL output” albo „It was still calling tools and had produced no report” (silnik 2.1.295). Młot powtarzał każdy padły test osobno, więc przy kilkunastu padłych 30 tur mogło nie starczyć na raport; teraz jedna powtórka samych padłych, a Niuch i Młot znają swój limit. Ucięty meldunek dokańcza się przez `SendMessage` do tego samego kumpla (skill `krux-horda`).

## Nastrój

- Forma zdania „Krux + bezokolicznik”, bez słowa „nastrój”: przy „jednym zdaniu o tym nastroju” Haiku pisał formy osobowe i powtarzał słowo z linii (po zmianie w `smrod` bezokolicznik/100 sł. 2,45 → 3,44, „jest” 0,92 → 0,56, echo 2 → 0; `docs/research/2026-10-10-straznik-horda-nastroj.md`).
- Linia nie idzie przy decyzji o wydaniu, planie ani ruchu nieodwracalnym: w symulacjach triumf przestawiał „wstrzymać” na „wypuszczać”, a w A/B na Haiku z „dumny” obok pytania o wydanie 2 z 10 odpowiedzi traciło radę o wstrzymaniu (bez linii 0 z 21).
- Bez linii Haiku nie pokazywał nastroju wcale, z nią średnio 1,9 raza na 7 tur.

## Stan i rysowanie

- Każdy tryb w `$.store` stoi pod osobnym kluczem `mode.<tryb>`, żeby dwie sesje przełączające różne tryby nie nadpisały się nawzajem.
- Tabliczki, kreska, pas i płótno stoją tylko na `terminal` (`GRID_SURFACE`): liczą siatkę znaków (pusty wiersz nad wiadomością, piksele z półbloków), a Desktop rysuje je krzywo — tabliczka wchodzi na tekst, piksele mają przerwy (zrzut z 2026-10-06).
- `ui.panes` nie subskrybuje zmian, a zakładki silnika nie mają zdarzenia, stąd jeden zegar widoczności co 250 ms.
