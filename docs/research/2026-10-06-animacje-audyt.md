# Audyt dokończenia animacji

Zakres porównano z ośmioma punktami rozmowy przerwanej w Claude Code. Dokończono sześć scen oraz integrację głównego wątku. Jeden pomysł pozostaje poza możliwościami udostępnionego API: animowanie oczekiwania na okno zgody silnika.

| Punkt rozmowy | Wynik | Implementacja i dowód |
| --- | --- | --- |
| 1. Scena według komendy, MCP jako kruk | Gotowe | `voice.ts`: mapowanie `shellKind`; `test`, `seal`, `build`, `tear`; `trail`/`look` jako `torch`; zewnętrzne MCP jako `raven`. Testy `voice.test.ts` i `mod.test.ts`. |
| 2. Myślenie i odpowiedź | Gotowe | `register.ts`: obserwacja `turn.step`, sceny `think` i `write` dla Kruxa oraz agentów. Testy przekazania wszystkich fragmentów, wyniku strumienia i zamknięcia przy przerwaniu. |
| 2. Oczekiwanie na zgodę | Nie wdrożono: ograniczenie API | Typy silnika opisują dialog zgody jako rysowany wyłącznie przez silnik (`.claude-plugin/types/claude-code/index.d.ts`, opis `RenderComponent`). Sam wynik `ask` z `tool.check` nie gwarantuje oczekiwania na człowieka ani nie daje sygnału zamknięcia dialogu. `ask` pozostaje sceną `AskUserQuestion`. |
| 3. Szybsze zejście sceny | Gotowe | `sprites.ts`: pomijanie co drugiej klatki zejścia przy oczekującej zmianie; końcowa stójka zachowana. Testy śledzenia scen. |
| 4. Reakcje ciała i wyniku | Gotowe | `withCue`: przysiad, triumf, przydeptanie robaka, osłona przed zagrożeniem oraz efekty zdarzeń. Kanarek śpiewa po sukcesie i opada po porażce. Testy wszystkich pozycji ptaka i integracji z reakcją ciała. Pozy leżące i pochylone zachowują sprzęt oraz bazowy ruch. |
| 5. Oddanie raportu | Gotowe | `crew.ts` i `forge.ts`: odłożenie sprzętu, rzut zwoju, chwyt przez Kruxa, odejście. Testy kolejności i spóźnionego zdarzenia zakończenia. |
| 6. Długa praca | Gotowe | Początek pojedynczej aktywności steruje potem po około 10 s i ocieraniem czoła po 30 s. Nowe wywołanie zeruje zmęczenie także przy tej samej scenie. |
| 7. Sylwetki hordy | Gotowe | `apron.ts`: hełm Groma, nos Niucha, pędzel Ochry. Zachowane oczy, brwi, fartuchy i lont Lonta. |
| 8. Dymek i drzemka | Gotowe | Odsłanianie 3 znaków co 150 ms, zakończenie pisania przed zamrożeniem, drzemka po 30 s bezczynności. Testy zegara i ograniczonego ruchu. |

Każda z sześciu nowych scen ma trzy czynności. Wszystkie podłączono do katalogu `ACTS`, bez zastępczych mapowań. Arkusze sześciu scen, kanarka i reakcji ciała wyrenderowano i obejrzano. Walidator klatek sprawdza rozmiar, paletę, fartuch, oczy, brwi i miejsce na lont.

W ostatnim audycie uzupełniono dwie pominięte części: reakcję kanarka na rzeczywisty wynik oraz zmianę postawy całego ciała. Poprzednie stwierdzenie o pełnym ukończeniu było zbyt szerokie. Niezależny przegląd wykrył też zasłanianie oczu przez efekty przy przesuniętym orku; kompozycja chroni teraz skórę, twarz i fartuch. Testy sprawdzają każdą klatkę każdej czynności ze wszystkimi zdarzeniami i całą długością reakcji.

## Weryfikacja 2026-10-06

- `claude plugin test .`: 256 testów, 0 porażek, 13 plików.
- TypeScript: `tsc -p .`, kod zakończenia 0.
- `claude plugin validate .`: kod zakończenia 0. Pozostają wcześniejsze uwagi dotyczące rootowego `CLAUDE.md` i hooków bez obsługi `.catch`.
- `git diff --check`: bez błędów.
- Arkusze klatek: wszystkie reguły zachowane.

Weryfikacja używa harnessu silnika i arkuszy. Nie zastępuje obserwacji nowego pluginu w pełnej interaktywnej sesji terminala lub aplikacji Desktop.

## Drugi przegląd 2026-10-06

Niezależny przegląd całej zmiany znalazł usterki, które powyższa weryfikacja przepuściła. Wszystkie poprawiono; każda poprawka ma test, który pada po jej cofnięciu (sprawdzone mutacją na kopii repozytorium).

| Usterka | Poprawka |
| --- | --- |
| Kawałek `tool` ze strumienia opisywał `Bash` bez argumentów, więc każda komenda zaczynała od kilofa, a właściwa scena czekała 1,5 s. | `describeToolAhead`: dla `Bash` scena czeka na `tool.call`. |
| Scena `Bash` szła za `shellKind`, kronika za `workOf`: `ls && ./deploy.sh` świecił pochodnią. Do tego `make test`, `uv run pytest`, `pnpm vitest run`, `env CI=1 npm test` i `git -C repo commit` mijały swój rodzaj. | Wspólny `bashKind`; `shellParts` zdejmuje `env`, `uv run`, `git -C`. |
| Narzędzia silnika spadały do młota z surową nazwą: kumpel tuż przed rzutem zwoju „dłubał SubagentHandback”. | Własne sceny dla `SubagentHandback`, `TaskCreate`, `TaskUpdate`, `TaskOutput`, `ReadNotifications`, `SendMessage`, `Monitor`. |
| Miech grał w scenie młota i pieca naraz; scena `build` pożyczała go z `hammer.ts`. | Miech mieszka w `build.ts`; test: czynność należy do jednej sceny. |
| Po oddaniu zwoju przy `Agent` na pierwszym planie Krux wracał do rogu i łapał zwój, dmąc. „Chwyt” był samym zwojem w stałym miejscu. | Świeży znak `handoff` przy rogu trzyma szezlong; stojący Krux łapie zwój dłonią (`withCatch`), zwój leci za skórą i twarzą (`behind`). |
| Reakcja ciała prostowała Kruxa leżącego na szezlongu i siedzącego w fotelu: sama szczęka nad fartuchem nie odróżnia stania od leżenia. | `standingX` wymaga nóg na ziemi. |
| `effortAt` bez `workAt` liczył się od zera epoki; rzut zwoju liczono w dwóch miejscach; szablony myśli `think`/`write` z celem były martwe. | Wiek pracy tylko przy `workAt`; jedna funkcja `tossFrom`; pula myśli bez martwych wpisów. |
| Testy nie sprawdzały szybszego zejścia, znaków fachu, `workAt` i filtra znaków w `bandPlan` ani kawałka `tool`. | Testy dopisane. |

Hipoteza, że wyjątek w obserwacji `turn.step` utnie odpowiedź modelu, się nie potwierdziła: silnik sprawdza kawałki między hakami i odpowiedzi `$`, więc w harnessie nie dało się wywołać wyjątku w obserwacji. `try` w `register.ts` zostaje jako bezpiecznik bez testu.

- `claude plugin test .`: 274 testy, 0 porażek, 13 plików.
- `tsc -p .`: kod zakończenia 0.
