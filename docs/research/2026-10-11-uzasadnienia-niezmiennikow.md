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

## Nastrój

- Forma zdania „Krux + bezokolicznik”, bez słowa „nastrój”: przy „jednym zdaniu o tym nastroju” Haiku pisał formy osobowe i powtarzał słowo z linii (po zmianie w `smrod` bezokolicznik/100 sł. 2,45 → 3,44, „jest” 0,92 → 0,56, echo 2 → 0; `docs/research/2026-10-10-straznik-horda-nastroj.md`).
- Linia nie idzie przy decyzji o wydaniu, planie ani ruchu nieodwracalnym: w symulacjach triumf przestawiał „wstrzymać” na „wypuszczać”, a w A/B na Haiku z „dumny” obok pytania o wydanie 2 z 10 odpowiedzi traciło radę o wstrzymaniu (bez linii 0 z 21).
- Bez linii Haiku nie pokazywał nastroju wcale, z nią średnio 1,9 raza na 7 tur.

## Stan i rysowanie

- Każdy tryb w `$.store` stoi pod osobnym kluczem `mode.<tryb>`, żeby dwie sesje przełączające różne tryby nie nadpisały się nawzajem.
- Tabliczki, kreska, pas i płótno stoją tylko na `terminal` (`GRID_SURFACE`): liczą siatkę znaków (pusty wiersz nad wiadomością, piksele z półbloków), a Desktop rysuje je krzywo — tabliczka wchodzi na tekst, piksele mają przerwy (zrzut z 2026-10-06).
- `ui.panes` nie subskrybuje zmian, a zakładki silnika nie mają zdarzenia, stąd jeden zegar widoczności co 250 ms.
