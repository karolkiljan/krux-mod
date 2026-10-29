# Kontrakt hooków moda Krux

Pełny kontrakt moda: rola każdego modułu, macierz zdarzeń i niezmienniki z uzasadnieniami. Claude Code dociąga ten plik dopiero przy czytaniu plików z `hooks/`, więc nie obciąża startu każdej sesji. `.claude/CLAUDE.md` (kontekst projektu; w korzeniu pluginu `claude plugin validate --strict` go odrzuca) trzyma mapę repo, skrót zasad przekrojowych i wskazanie skilla przed wydaniem.

Zmiana zachowania moda aktualizuje odpowiedni wiersz macierzy albo niezmiennik w tym pliku. Zasady przekrojowe stoją w `.claude/CLAUDE.md`. Tu leżą reguły dotyczące wyłącznie `hooks/`.

## Moduły i skrypty

Moduły `hooks/` z rolą i skrypty z instrukcją użycia.

```text
hooks/hooks.json          wiring modułu (`modules`)
hooks/register.ts         wszystkie hooki moda
hooks/voice.ts            czyste funkcje głosu i ryzyka (`isCommitCommand`, `asksRelease`)
hooks/roster.ts           horda: fach, odmiana, charakter, typ subagenta
hooks/band.ts             plan pasa nad promptem
hooks/avatar.ts           awatar rozmowy
hooks/chat.ts             drzewo czatu
hooks/echo.ts             echo prośby przy długiej turze
hooks/journal.ts          dziennik narzędzi
hooks/crew.ts             przejścia sceny poza Kruxem
hooks/forge.ts            powierzchnia `Client`: płótno, sloty, marsz, reakcje
hooks/sprites.ts          katalog scen, oś czynności (`Track`), dymek
hooks/palette.ts          kolory pikseli (`PALETTE`) i zarezerwowane fartuchy kumpli (`MATE_APRONS`)
hooks/apron.ts            fartuchy i znaki fachu (`dress`)
hooks/stage.ts            warsztat czynności i oś czasu (`Route`)
hooks/fidget.ts           gesty wiercenia
hooks/acts/*.ts           czynności scen dla orków, także test/seal/build/tear/think/write; `rest.ts` to czekanie na hordę
hooks/mood.ts             humor orków i teksty dymków
hooks/gauge.ts            miernik głosu odpowiedzi
hooks/lore.ts             kronika sesji, notka o hordzie i pamięć hordy między sesjami
hooks/outcome.ts          decyzja o nieukończonym Bash: `run_in_background` albo `backgroundTaskId` wyniku
hooks/terminal-text.ts    szerokość komórek terminala
hooks/board.ts            tablica Sztolni: `boardAfter`, `testRunOf`, `usageOf`; plan, testy, gotowość
hooks/muster.ts           apel hordy w Sztolni
hooks/git.ts              czysty odczyt `git status --porcelain=v2 --branch` i `git log` (`gitOf`: liczby, pliki, commity z `pushed`); `GIT_CHECK` i `GIT_CHECK_CACHED` dla `diff --check` drzewa i indeksu; `--no-optional-locks` (nie ruszają indeksu Morry), `core.fsmonitor=false` (bez komendy z `.git/config`), `core.quotePath=false`
hooks/threads.ts          wątki Sztolni
hooks/report.ts           raport dnia (`dayReport`)
hooks/shaft.ts            panel Sztolni
scripts/act-sheet.ts                          arkusz PNG i walidacja klatek: `npx tsx scripts/act-sheet.ts <scena|plik.ts:EKSPORT|gesty> <plik.png> [czynność|gest]`; czynność z `who` w fartuchu pierwszego orka z `who`
scripts/voice-bench.mjs                       pomiar głosu na modelu (A/B kotwicy), scenariusze `cache` (12 tur, sam odczyt) i `smrod` (7 tur: testy, naprawa, decyzja o wydaniu); tury notek o hordzie odtwarza z odpowiedzi (`middleClosings`)
scripts/bench-compare.mjs                     porównanie ramion: metryki od nowa z `responses.json`, test permutacyjny, odpowiedzi z wybranej tury
```

## Macierz zdarzeń

Macierz mówi, co uruchamia zdarzenie i jakich pułapek silnika pilnować. Progi, mapy narzędzi na sceny, glify i teksty stoją w kodzie i testach; nazwa w nawiasie wskazuje, gdzie. Pełna dawna wersja z każdym szczegółem: `git show 5d76e5d:CLAUDE.md`.

### Start, prompt i tryby

| Zdarzenie | Warunek | Skutek |
|---|---|---|
| `session.start` | zawsze | tryby z `$.store` do `$.state`, teksty z `voice/`, `prefersReducedMotion`, ostrzeżenie o pluginie `krux`, rejestracja `/krux` i narzędzia `watki` (`mcp__krux-mod__watki`); odczyt zużycia i repo zegarem po rejestracji (`$.clock.after(0)`), bo silnik czeka na ten hook przed pierwszym promptem (test); wznawia zegar apelu (są biegnący) i planu (zadanie w toku), także po reloadzie modułu |
| `classic.SessionStart` | `clear`, `resume`, `fork` | tryby, `prefersReducedMotion` i repo od nowa: te komendy zerują `$.state` |
| `prompt.compose` | dowolny | na końcu sekcje `krux-mod:persona`, `krux-mod:konkret`, `krux-mod:flow` aktywnych trybów, `scope: session`; konkret przy `modes.konkret \|\| autoKonkret` |
| `prompt.submit` | od człowieka (`fromPerson`), także przełącznik | `lastPrompt = echoPrompt(text)` (spoza Morry `null`), `seenAt`; po przerwie ≥ 30 min toast `returnNote` (pusty nie); nic dla modelu |
| `prompt.submit` | dokładna fraza `włącz/wyłącz krux/konkret/flow` od człowieka | zapis trybu, neutralna notka, bez kotwicy; `włącz krux` (też `/krux on`, przycisk) zeruje licznik tur, więc wraca pełna kotwica; cytat w raporcie subagenta nie przełącza |
| `prompt.submit`, `/krux zapisz`, `/krux raport` | pierwszy odczyt historii po starcie, `/resume` albo restarcie | `replay` z `$.session.messages()`: licznik tur, kronika, dryf, tablica (`replayBoard`), wątki (`replayThreads`); wejście narzędzia bez wyniku to nie fakt; sprawdzenie i zapis `replayed` w jednym `update` |
| `prompt.submit` | inny tekst, persona `on` | kotwica w `context`: pełna w turze 0, co `REFRESH_TURNS` i po dryfie (z poprawką), inaczej `VOICE_SHORT`. Od człowieka dodatkowo: notka o hordzie po `QUIET_TURNS` (`lifeNote`; póki w sesji nie padł żaden kumpel, z wspomnieniem z `recallFor`; humor kumpla nie przy planie ani wydaniu), linia nastroju (`moodNote`, raz na zdarzenie, nie przy ryzyku, planie ani wydaniu), `formatHint`; prośba o ruch nieodwracalny (`riskHint`) dostaje `RISK_HINT` zamiast notki. Raport subagenta, inna sesja, harmonogram: sama kotwica |
| `prompt.submit` | są notki z panelu | notki przed kotwicą, jednorazowo |
| `session.compact` | wątek główny, persona `on` | `COMPACT_NOTE` w instrukcjach; po kompakcji (nie `precompute`) licznik tur na 0 |
| zużycie (`applyUsage`) | odczyt `refreshUsage` po `session.start`, potem liczby pchane w `session.measure` (po każdej turze i przy ruchu limitu o pełny punkt); mod nie pyta po narzędziu ani turze | okno limitu ≥ 80% włącza `autoKonkret`, wszystkie poniżej gaszą; toast tylko przy zmianie flagi; `$.store` nietknięty; wyścigi rozstrzyga wersja żądania (niezmienniki) |

### Komendy

| Zdarzenie | Warunek | Skutek |
|---|---|---|
| `command.run` `/krux` | argumenty | przełącznik z notką w `context`, `status`, pomoc albo panel |
| `/krux status` | zawsze | stan trybów; konkret `on`, `auto` (sam `autoKonkret`) albo `off`; bez zapisu |
| `/krux zapisz <tekst>` | niepusta notatka | `replay`, potem `saveThread` w `update` (id wspólne z `watki`), toast „Wątek #N zapisany.”; duplikat: „Notatka już w otwartych wątkach.”; pusty tekst daje pomoc |
| `/krux raport` | zawsze | `replay`, potem `{ text: dayReport(git, board, threads, lore) }`; bez modelu i panelu |
| `/krux czat`, przycisk 7 | zawsze | przełącznik `czat` (domyślnie off, `mode.czat`), neutralna notka |
| `/krux sztolnia`, przycisk 6, `session.start` | tryb `sztolnia` | panel `sztolnia` (`columns: 56`); bez pytania silnik stawia go od 144 kolumn |
| `/krux dziennik` | zawsze | `shaftTab = dziennik`; zamknięta, czekająca albo ukryta Sztolnia dostaje tryb on i `open` |
| `ui.close` `sztolnia` | krzyżyk Morry (`origin: person`) | `mode.sztolnia` off, toast z drogą powrotu |

### Tura i narzędzia

| Zdarzenie | Warunek | Skutek |
|---|---|---|
| `turn.start` | wątek główny | `turnAt`; znak tury dla tabliczki w pamięci modułu; zdarzenie kumpla nie resetuje tury |
| `turn.start`, `tool.call`, `turn.complete` | wątek główny | licznik uderzeń tury i sesji, opis roboty dla paska; wynik `tool.call` do kroniki |
| `turn.step` | główny albo kumpel na scenie | `thinking` → `think`, `text` → `write`, `tool` → `describeToolAhead` (poza `Bash`: jego rodzaj zna dopiero `tool.call`); `startedAt` tylko przy zmianie rodzaju; błąd obserwacji gubi scenę, nie strumień |
| `tool.call` | główny, zdarzenie kroniki | humor (`mood.ts`), wtręt kumpla z fachem na 4 s (`$.clock.after` po zapisie dymka), znak reakcji Kruxa w `cues`; bez zdarzenia humor gaśnie po 8 wywołaniach. Zdarzenia rozpoznaje `workOf`: kolor testów jak tablica (`testPassed`), commit tylko prawdziwy `git commit`, zawał nie z samych odczytów; Bash w tle nie daje ukończonych faktów |
| `tool.call` | główny, bez `deny` | tablica (`boardAfter`): plan z `TodoWrite`/`TaskCreate`/`TaskUpdate`; przebieg testów (`workOf` = `test`, nie w tle) z ostatniego podsumowania, z nazwami padłych i `✗` mimo kodu 0; zapis przy zmianie |
| `tool.call` | główny albo kumpel, edycja lub testy, bez `deny` | jeden `$.clock.now()` na `boardStep`; edycja poza dokumentacją → `editedAt`, przebieg → `test.at`; późniejsza edycja kodu daje `◌ nieświeże` |
| `tool.call` z planem | zadanie `in_progress` ze `startedAt` | `tickBoard`: zapis `musterNow` przy 15 min, potem co pełną minutę; nowy plan unieważnia stary harmonogram, brak zadań w toku kończy zegar |
| `tool.call` | `test-fail`, główny albo kumpel | `CrewEvent.failure?` niesie nazwę padłego testu z bieżącego wyniku do `eventLine` |
| `tool.call` | dowolny wątek, bez `deny` | `journalAfter` w `update`: `tool_use_id`, `agentId`, kto, czas końca; także przy czacie off |
| `tool.call` | dowolny wątek, `changesRepo` (`voice.ts`, z `workOf`): edycje i Bash poza samym odczytem (`look`, `trail` bez przekierowania do pliku, `find -delete` ani `git branch` z nazwą); bez `deny` | `refreshGit` (status, log, `GIT_CHECK`, `GIT_CHECK_CACHED`, przy upstream `GIT_UNPUSHED`; 5 s na komendę); zapis przy zmianie, poza repo `null`; wzrost `behind` daje toast „origin ma N nowych commitów — git pull.” |
| `tool.call` `mcp__krux-mod__watki` | model otwiera albo zamyka wątki | `threadsAfter` w `update`, wynik tekstem (obiekt silnik odrzuca); rejestracja z `isDeferred: false`, więc model widzi pełny opis co turę zamiast samej nazwy za wyszukiwaniem narzędzi (v2.1.293+, test) |
| `turn.complete` | wątek główny | `turnAt` na zero; `e.durationMs` ≥ 300 s daje toast „Krux skończyć po N min.”; odczyt repo |
| `turn.complete` | główny, `reason: answer`, persona `on` | werdykt miernika zastępuje `drift` (`null` przy za krótkiej odpowiedzi i ostrzeżeniu przed ruchem nieodwracalnym); kumple z odpowiedzi do kroniki |
| `turn.complete` | główny, kronika z robotą (`traceOf`) | `remember`: ślad sesji do `$.store` pod `memory.<$.session.root()>` (`rememberAfter`); bez roboty bez zapisu; awaria magazynu do debug logu |

### Horda

| Zdarzenie | Warunek | Skutek |
|---|---|---|
| `agent.spawn` | pętla główna, silnik dał `agentId` | ork wbiega z prawej do slotu; wpis w apelu (`muster`); kumpel z typu (`mateOfType`), potem `mateIn` z opisu i promptu, inaczej szary ork; zegar apelu co 1 s (`musterNow`), póki ktoś biega według zdarzeń i `$.agent.list()`; póki tyka, pas bierze jego ostatnią listę (`knownRunning`) zamiast `$.agent.list()` przy każdym rysunku (test); ostatni tyk zdejmuje orków spoza `running`; błąd `$.agent.list()` zatrzymuje zegar, niepotwierdzony bieg najwyżej 30 min |
| `tool.call` | `agentId` orka na scenie albo w apelu | poza ze sceny narzędzia (kumpel zamiast rogu młot), dymek z krokiem; ostatnie narzędzie w apelu; zdarzenie z jego wyniku zmienia tylko jego humor (`mateMoodAfter`), wtręt 4 s i znak w `cues`, kronika Kruxa go nie liczy; jego testy idą na tablicę z imieniem, jego lista zadań nie rusza planu |
| `tool.call` | `agentId` biegu z apelu po oddaniu zwoju (wznowienie przez `SendMessage` nie odpala `agent.spawn`) | `rejoinMate`: ork wraca na scenę i do apelu z imieniem i opisem z apelu, zegar apelu rusza; obcy `agentId` (pętla zagnieżdżona, fork) nic nie zmienia (test) |
| `turn.complete` | `agentId` orka na scenie albo w apelu | stójka w slocie, zwój do Kruxa (`handoff`), marsz w prawo; slot należy do niego do końca marszu; sam ubytek w `running` to nie oddanie zwoju; koniec w apelu (pierwszy zostaje), dymek znika |

### Rysowanie

| Zdarzenie | Warunek | Skutek |
|---|---|---|
| `ui.render` `Spinner` | persona `on`, brak `message` | orkowe słowo, stałe w obrębie tury |
| `ui.render` `SessionMode` | aktywne tryby | `krux`, `konkret` (sam `autoKonkret`: `konkret (auto)`), `flow`, `czat` |
| `ui.render` `AssistantMessage` | terminal, czat off, persona `on` | kreska `borderStyle: 'quote'` w kolorze Kruxa; `quote` dokłada pusty wiersz nad i pod, więc treść `marginTop: -1`, blok `marginBottom: -1` |
| `ui.render` `AssistantMessage` | j.w., pierwszy blok z kropką w turze (`isFirstOfReply`) | tabliczka `⚒ Krux` na pustym wierszu silnika nad wiadomością (`absolute`, `top: 0`). Silnik stawia kropkę po każdej grupie narzędzi, a w renderze nie wolno zapisać stanu, więc `turn.start` znaczy turę w pamięci modułu, a blok bierze tabliczkę po `requestId`; historia sprzed pierwszej żywej tury ma tabliczkę na każdej kropce. Echo prośby (`echoLine`) w tym samym wierszu, raz na turę, od 4 uderzeń albo 120 s; decyzja przy pierwszym rysunku (`echoAt`) |
| `ui.render` `UserMessage` | terminal, czat off, persona `on`, `fromPerson` | tabliczka `Morra` (`#5b9bd5`) tak samo |
| `ui.render` `AssistantMessage`, `UserMessage` | terminal, czat on, zmierzona szerokość | `chatTree` zamiast tabliczek: awatar, nagłówek ` Imię · HH:MM ` na górnej krawędzi ramki `round` w kolorze mówcy; raport kumpla po `task.id` z apelu albo `$.agent.list()`, hand-back (`origin: peer`) natywnie; treść `next(e)` bez zmian, poza prośbą Morry bez komendy (`isCommandText`: `/` albo `!` na początku), którą mod rysuje gołym `Text` z `e.props.text`, bez podświetlonego wiersza silnika |
| `ui.render` `ToolUse`, `ToolResult`, `ToolGroup` | terminal, czat on | wiersz narzędzia z wcięciem `toolIndent`, bez ramki: treść silnika bywa pusta i ramka zostawała pustym prostokątem; grupa zapisuje id swoich wywołań przed `next`, więc jej wiersze nie dostają drugiego wcięcia; nowe id dają `$.ui.invalidate('ui.render')` |
| `ui.render` `ToolUse`, `ToolResult`, `ToolGroup` | j.w. + karta Dziennik widoczna (`isPlaced && isShown`), komplet wpisów po `tool_use_id` | jedna linia `toolLine` (`✗` na czerwono); dopasowany `ToolResult` to pusty `Box`; brak choć jednego wpisu daje natywny wiersz |
| zegar widoczności | czat, Sztolnia i Dziennik aktywne | co 250 ms porównuje `isPlaced && isShown`, unieważnia render tylko przy zmianie; póki biegnie, wiersze narzędzi biorą jego odczyt (`journalVisible`) zamiast `$.ui.panes()` (test); kończy go wyłączenie trybu, karta Stan albo start |
| `ui.render` `AbovePrompt` | terminal, persona i animacje `on`, bez ankiety; w spoczynku także `kowal` `on` | pas liczy `bandPlan`: szara kreska, podpis 28 kolumn (tytuł, cel, `+N z hordy`, bez liczników), płótno `Client` (`forge.ts`): Krux i do 3 kumpli z `running` w stałych slotach, dymek nad ostatnim mówcą. Scena z narzędzia (`describeTool`, `Bash` przez `bashKind`) albo z `turn.step`; Krux czeka na hordę (szezlong, „Krux czekać na hordę”) przy `Agent` w toku, kumplu na scenie w spoczynku albo świeżym `handoff`. Czynności (`actsFor`) po ok. 30 s z pamięcią orka (`Track.memory`), czekanie tylko naprzód (`waitLegs`, drzemka `trackDozing`), gesty (`GESTURES`) co 3.–4. obieg; nowa scena po ≥ 1,5 s, stara schodzi 2× szybciej. Wysokość stała: 6 wierszy plus kreska; `maxRows < 7` daje 3 wiersze z dymkiem w podpisie (`Imię: tekst`), `< 3` jedną linię; kreska tylko, gdy mieści się w `maxRows`; za wąsko najpierw znikają kumple, potem tekst; po zwężeniu kumpel za ostatnim slotem wchodzi do wolnego albo schodzi. W spoczynku zegar stoi, chyba że ktoś maszeruje albo kuje agent w tle. Gdy panelu Sztolni nie widać i zostaje ≥ 18 kolumn, w pustym slocie skrót tablicy (`shaftDigest`, do `DIGEST_MAX`), bez spychania kumpli i zmiany wysokości |
| `ui.fault` | płótno `forge.ts` padło (`load`, `render`, `run`) | `forgeFault`: pas i panel `/krux` rysują sam tekst do reloadu modułu (`/clear` modułu nie przeładowuje); linia do debug logu; miejsce rysuje od nowa silnik (test w `scripts-regression.mjs`: zestaw `claude plugin test` nie odpala `ui.fault`) |
| `ui.render` `Pane` `krux` | panel otwarty | palenisko, przyciski 1–7 w komórkach `MODE_CELL`, zawijane do szerokości, horda |
| `ui.render` `Pane` `sztolnia` | karta Stan | `shaftTabs` nad `shaftTree`; „Git” i „Commity” na górze, pod nimi „Wątki”, „Plan”, „Testy”, „Horda”, więc góra nie skacze; każda sekcja tylko z treścią, listy rosną z `scroll.bodyRows`; w doku „Kontekst” przypięty do dołu (okno, tokeny, limity, koszt), nad promptem (`inline`) `bodyRows` to limit, więc panel rośnie z treścią bez `minHeight`; bez roboty „Tablica pusta”; diff zostaje dla `/diff` |
| `ui.render` `Pane` `sztolnia` | karta Dziennik | `shaftTabs` nad `journalTree`; przyciski zmieniają `shaftTab` (przy fokusie panelu klawisze `1` Stan, `2` Dziennik), początkowo Stan |

## Niezmienniki

Uzupełniają zasady przekrojowe z `.claude/CLAUDE.md` i ich nie powtarzają. Uzasadnienia z pomiarów (liczby z benchu, A/B, zrzuty) leżą w `docs/research/2026-10-11-uzasadnienia-niezmiennikow.md`; pełna dawna wersja: `git show 5d76e5d:CLAUDE.md` (wtedy w korzeniu).

### Reguły hooks/

- `$` przekazujemy tylko do funkcji z najwyższego poziomu `register.ts`; pozostałe moduły go nie znają i testy idą przez ich interfejsy (`bandPlan`, `crewAfter`, `shaftTree`), nie przez piksele.
- Ścieżka modułu `Client` to literał `'./forge.ts'`: silnik czyta go ze źródła, zmienną odrzuca.
- Matchery w `on` to literały (`{ tool: 'mcp__krux-mod__watki' }`): `claude plugin validate` czyta je ze źródła, a stałą pokazuje jako `tool=?` (test zgodności z `THREAD_TOOL_NAME`).
- Zgody na narzędzia obsługuje wyłącznie silnik: mod nie rejestruje `tool.check`.
- Hooki nie mają `.catch`: awarię przed `next` silnik pomija, po `next` zostawia wynik i sam pisze linię (debug log w zainstalowanej sesji, transkrypt przy `--plugin-dir`). Hook nie woła `next` drugi raz (test). Własne błędy powtarzalne (zegar, strumień, odtworzenie historii) idą przez `$.ui.log(…, { to: 'debug' })`; do transkryptu tylko jednorazowe błędy instalacji (brak `voice/`, rejestracja `/krux` i `watki`). Tekst logu bez prefiksu `krux-mod:`: silnik dokleja nazwę moda sam.
- `isDestructive` rozpoznaje komendy, nie słowa; przy wątpliwości flaga zostaje. Każda komenda ma przykład i bezpiecznego sąsiada w `tests/voice.test.ts`.
- Sekcje moda idą na końcu jako `session`: tekst zmienny nie może siedzieć po stronie `shared` cache'a.
- Żaden przodek treści silnika (`next(e)`) nie ma `width`: silnik odrzuca takie drzewo, a `claude plugin test` tego nie łapie.

### Głos i miernik

- Kotwica jedzie co turę; mod skraca ją do `VOICE_SHORT`, tylko gdy miernik (`hooks/gauge.ts`) nie widzi dryfu. Bench w trybie `stream`.
- `orcish` w `gauge.ts` przepisuje tylko formy z pewną regułą (`-łem/-łam`, zdanie od `-am/-uję`, słownik 3. osoby); czego nie umie bez błędu, nie rusza (test). Rzeczowniki podobne do `-łem` („zawałem”, „hasłem”) stoją w `NOUN_LEM`.
- Miernik nie sądzi odpowiedzi z ostrzeżeniem przed ruchem nieodwracalnym ani cytatu `>`: tam kontrakt persony każe pełne zdania, więc poprawka dryfu nie może za nie ciąć następnej tury (test).
- Metryki w `gauge.ts` to port `scripts/context-smoke.js` pluginu; zmiana progu wymaga przykładu w `tests/gauge.test.ts`.
- Bench liczy `repeatedClosings` i `consentClosings` (formuły zamknięcia w persona).
- `isDestructive` obejmuje git (historia zdalna i lokalna, drzewo robocze, schowki, reflog), pliki i dyski, SQL i narzędzia baz, infrastrukturę, kontenery i kubełki w chmurze. `UPDATE … SET` tylko bez `WHERE` (zdanie SQL ciągnie się przez wiersz po przecinku albo od `WHERE`, `AND`, `SET`…; sam wcięty kod nie), `git restore` poza samym `--staged`. Łańcuch sądzony komenda po komendzie: okno flagi (`ARG`) nie przechodzi przez `&&`, `;`, `|` poza cudzysłowem i `\`. Opcje globalne (`git -C`, `compose -f`, `helm -n`, `terraform -chdir`) nie chowają podkomendy; sama nazwa `mkfs`/`shred` daje flagę, `--help` i `--version` nie. Polskie prośby łapie `RISK_WORDS` (czasownik niszczenia + rzeczownik danych, historii albo infrastruktury). Także `rm -rf build` zostaje flagą.

### Horda w prompcie i nastrój

- Notka o hordzie: imię i fakt z kroniki, bez faktu prośba o coś z dnia kumpla; nigdy robota w repo. Fakt ma każdy fach: testy Młot, commity Piryt, zawał Niuch, budowanie albo edycje Grom, pliki interfejsu Ochra, rozbiórka Lont; spośród kumpli z faktem wybiera seed, nie ostatnie zdarzenie. Charakter (`trait`), miejsce i formę daje kod; miejsca rotują (`pick(PLACES, tura + 1)`), a środek mówi wprost „nie na końcu odpowiedzi”.
- Ucieczkę kumpla na koniec mierzy `middleClosings` (ostatnie zdanie w turach „w środku”), nie `hordeClosings`. Bench odtwarza tury notek regułą `lifeNote` i `recordAnswer`: kumpel wymieniony bez notki przesuwa harmonogram. Bench i `lore.ts` dzielą `QUIET_TURNS` i rotację miejsc (test skryptów).
- Piąta forma to spór: wymiana zdań z parą z `ROSTER.spar` o `ROSTER.feud`. Pary symetryczne, spór pary ten sam z obu stron (test).
- Humor kumpla w notce to jego mina z `moodsAfter` dla ostatniego zdarzenia kroniki, jako czasownik bez rodzaju („burczeć”, „puszyć się”); spokojny kumpel humoru nie dostaje. Plan i wydanie idą bez humoru, ryzyko bez notki.
- Pamięć hordy: `$.store` pod `memory.<katalog projektu>` trzyma `KruxMemory`, ślad sesji, która pisała ostatnia, i ślad przed nią. Ta sama sesja nadpisuje swój ślad, nowa spycha go do `before`; wznowiona sesja sięga więc do `before`, nie do siebie. Ślad to liczby kroniki, ostatnie zdarzenie bez zawału i pierwszy padły test ostatniego czerwonego przebiegu Kruxa (jeden wiersz, bez cudzysłowów, do 48 znaków). Wspomnienie bierze tylko wstawka, póki w sesji nie padł żaden kumpel (`lastMate === null`), i tylko do 30 dni kalendarza; obcy kształt w magazynie to brak pamięci (test).
- Charakter kumpla to sam czasownik, notka nie mówi „był” (test). Liczby w tekstach moda stoją przy bezokoliczniku albo w etykiecie („2 na 2 padać”, „padłe: 2”), bez odmiany (test).
- Humor na ekranie liczy `mood.ts`; model dostaje osobną linię `moodNote` (`lore.ts`): nastrój ostatniego zdarzenia kroniki z faktem, jedno zdanie, raz na zdarzenie (`moodSeen`); zielone bez wcześniejszego smrodu nie daje linii. Forma z kodu: „Krux + bezokolicznik”, bez słowa „nastrój”. Linia mówi, że nastrój nie zmienia ocen ani decyzji, i nie idzie przy wydaniu, planie ani ruchu nieodwracalnym. Po wznowieniu `moodSeen` pusty, więc ostatnie zdarzenie daje linię jeszcze raz.
- Kumple: wzorce imienia w benchu (`hordePattern`, `MATE_NAMES`, `MATE_WORDS`) to przyrząd pomiaru, stały między ramionami A/B. Niuch i Młot chodzą na `haiku`, reszta na modelu rodzica. Kolor kumpla (`color`) to najbliższy z 8 kolorów silnika do jego fartucha, każdy inny; Niuch bez `CLAUDE.md` (`omitClaudeMd`, jak wbudowany Explore), Młot z nim, bo tam stoją komendy testów; oboje z `maxTurns` jako bezpiecznikiem (test). Bash tylko do odczytu i czyste pliki Lonta stoją w prompcie, zgody daje silnik (`docs/adr/0001-lont-zakaz-w-prompcie.md`). Opis kumpla: fach, warunek wysłania, granica; bramka korzyści zostaje w skillu `krux-horda`.

### Stan i tablica

- Kilka zapisów `$.state` w jednym zdarzeniu (np. `tool.call`) nie daje kilku rysunków: silnik przerysowuje czytające miejsca w tempie odświeżania (10/s, w terminalu do 30/s) i łączy szybsze zmiany (typy `ui.render`: „at the redraw rate”; mods-reference „Limits”). Atomów nie scalamy dla liczby przerysowań; kosztem jest tylko wywołanie API.
- Stary obiekt `modes` w `$.store` służy tylko za źródło trybów jeszcze niezapisanych pod `mode.<tryb>`. Lista kluczy `$.state`: `types/index.d.ts`; apel nie wraca po wznowieniu. Kronikę liczymy w środku `update`, nie przez osobny odczyt i zapis.
- Po wznowieniu (`--resume`, restart) `replay` odtwarza raz na pusty `$.state`: kronikę, dryf, licznik tur i humor z ostatniego zdarzenia (sceny nie); `replayBoard` plan i ostatni przebieg testów (na Kruxa: historia nie mówi, który ork wołał); `replayThreads` wątki z oryginalnymi id, więc przycięta historia nie przenumerowuje. Równoległe odtworzenia czekają na wspólny wynik, pusta historia niczego nie nadpisuje.
- Rodzaj roboty narzędzia rozstrzyga tylko `workOf` (`voice.ts`); tablica, scena i podpis `Bash` (`bashKind`) biorą go z tej samej decyzji (test).
- Czas tablicy: jeden odczyt zegara w `boardStep`; edycje główne i kumpla (także błąd bez `deny`) → `editedAt`, testy → `at`. Dokumentacja (`.md`, `.mdx`, `.txt`, `.rst`, `.adoc`, bez wielkości liter) nie zmienia `editedAt`; brak znanej ścieżki to edycja. `deny` nie rusza tablicy; plan należy do głównego wątku. `testsStale` wymaga obu czasów i `editedAt > test.at`.
- `startedAt` zadania: wejście w `in_progress`, zostaje przy powtórzeniu statusu, znika przy wyjściu. `stuckMinutes` daje pełne minuty od 15 min. Stary harmonogram zegara planu nie nadpisze nowego; `musterNow` to wspólna zależność panelu i skrótu pasa.
- Odczyty gita koalescowane: równoległe żądania czekają na wspólny odczyt, potem najwyżej jeden zaległy. Każda komenda 5 s, `--no-optional-locks` i `-c core.fsmonitor=false`: git moda biegnie poza sandboksem, więc nie uruchamia komendy z konfiguracji repo (test na prawdziwym repo). `whitespace` z kodów obu kontroli: dowolne 2 → `false`, dwa 0 → `true`, reszta `null`. Toast `behind` porównuje zapisane odczyty; pierwszy, równy i mniejszy milczą.
- `readiness`: zielone i świeże testy, `whitespace !== false`, brak konfliktów; nieznane białe znaki nie blokują. Linia gotowości tylko przy `changed + untracked > 0`; każdy brak ma tekst i znak.
- `autoKonkret`, `turnAt`, `seenAt`, `lastPrompt` żyją tylko w `$.state` (`lastPrompt` nie wraca po `replay`). Auto konkret wynika z limitów planu, nie kontekstu; każdy odczyt i pomiar ma rosnącą wersję, flagę przypisuje w `update` tylko najnowszy, start sesji i `clear/resume/fork` unieważniają starsze. Ręczny konkret przeżywa reset limitów i ma pierwszeństwo w `statusLine`. Kumple nie ruszają zegara głównej tury; `seenAt` zmieniają tylko prompty z `fromPerson`. Toasty czasu i powrotu nic nie dokładają do modelu.
- `saveThread` dzieli numerację, deduplikację i limity z `watki`; duplikat nie zużywa id. Raport dnia: wyłącznie dane sesji, do 10 commitów, bez modelu i głosu orka.

### Pas, scena i dymek

- Skrót pasa pokazuje tylko zapełnienie kontekstu (alarm od 80% kontekstu, nie limitów); okna limitów zostają w Sztolni, nazwa okna zawsze `5h`. Kolejność: wątki, repo, gotowość, plan, testy, kontekst.
- Podpis pasa nie pokazuje `strikes` ani `sessionStrikes`; osobno tylko `+N z hordy`. Opis narzędzia zawsze zaczyna się od „Krux”; kumpla nie dopisujemy do roboty, której nikt mu nie zlecił (test).
- Moduł `Client` dostaje tabelę terminala bez `Svg`: orki dla Desktopu musiałyby iść jako `Svg` z `register.ts`. `bandPlan` z `hasClient` na terminalu bez `Client` liczy kreskę dla jednej linii tekstu i tam daje dymek.
- Sztolnia pokazuje stan roboty, nie statystykę: bez wykresów, osi i zliczeń; czego silnik daje natywnie (`/diff`), nie dubluje. Każdy stan ma znak, nie tylko kolor (`✓`, `▸`, `·`, `✗`, `●`).
- Fartuch Lonta (`T`) to jaśniejszy grafit, odróżniony od bezimiennego `u` (`#555555`) i skóry/rekwizytów.
- Dymek liczy komórki terminala przez `terminalText`, nie dzieli grafemów (CJK i emoji: 2 komórki, znaki łączące: 0). Podaje tylko fakty z sesji; kumpel mówi wyłącznie na scenie, o swoim kroku, wyniku albo zdarzeniu kroniki (test). Dymek wisi po kluczu (`agentId` albo `krux`), nie po imieniu. Teksty dymków w `mood.ts`, bo nie trafiają do promptu. Nazwa testu w dymku pochodzi z bieżącego wyniku, nigdy z poprzedniego przebiegu tablicy; `eventLine` ucina do 24 znaków Unicode z `…`, bez kropki.
- `KruxCrew.bubble` trzyma tylko `step` albo `event` (myśl powstaje w rysunku). `KruxCrew.cues`: do 8 znaków `{ key, kind, until }` (zdarzenie kroniki albo `handoff`), `until` w ms od epoki; brak `cues` w starszym stanie to pusta lista.
- Czynność (`Act`, `stage.ts`) zaczyna się po stójce i wraca do niej wejściem wstecz; nic nie pojawia się skokiem. Klatka najwyżej 6 × 22, tylko znaki z `PALETTE`, bez fartuchów kumpli, zawsze 'b' i 0 albo 2 piksele 'r' (test). Każdy ork ma co najmniej 3 czynności w każdej swojej scenie (test): Krux we wszystkich, kumpel i bezimienny poza `horn` i `lounge`; `who` zawęża do fachu (`kanarek`: Krux i Młot, `kowadło`: Krux i Grom). Pierwsza w tablicy to pierwotna. Gest (`Gesture`) trzyma zasady klatki na każdej pozie pętli, rusza tylko oczy, głowę i wolne tło. Czynność należy do jednej sceny (test).
- `startedAt` aktywności (`KruxActivity`, `KruxHordeMember`) to początek pojedynczej czynności, nie tury; `bandPlan` daje go jako `ForgeOrc.workAt`, zmiana resetuje zmęczenie. Pot po 67 klatkach (~10 s), ocieranie czoła od 200 (30 s); bez `workAt` zmęczenia nie ma.
- `cues` i `now` w propsach płótna są opcjonalne; `Actor.cue` pamięta identyfikator i klatkę reakcji, żeby render jej nie powtarzał; `Actor.handoff` opóźnia `leftAt` do końca lotu zwoju.
- `withCue` zmienia postawę tylko stojącego orka (szczęka w 3. wierszu, pod nią fartuch, niżej nogi: `standingX`); leżący, siedzący i pochylony dostają same efekty. Ta sama miara rządzi `withCatch`. Przy pełnej klatce kanarka `canaryResult` zastępuje efekty testów; wynik z kroniki, nie z pętli. Reakcja trwa 14 klatek.
- Dymek odsłania 3 znaki co 150 ms, od nowa przy zmianie mówcy lub tekstu; fallback tekstowy od razu w całości. Po 200 tyknięciach bezczynności Krux śpi (runa snu); praca resetuje licznik. Reakcje, marsz i oddanie zwoju kończą się przed zamrożeniem sceny.
- `still` (`prefersReducedMotion`) wyłącza marsz, reakcje, rzut zwoju, zmęczenie i drzemkę; dymek w całości; zmiana sceny pokazuje statyczny rekwizyt; znaki fachu zostają.
- Scena `ask` dotyczy `AskUserQuestion`, nie okna zgody.

### Czat i dziennik

- `czat` jest niezależny od persony, domyślnie off; tryb off zachowuje tabliczki i kreskę. Treści wiadomości i wyniku narzędzia nie przepisujemy: prośba Morry w czacie to `e.props.text` znak w znak, tylko bez tła silnika; komenda i tryb powłoki zostają natywne. Własny tekst nie ma pustego wiersza silnika, więc stoi bez `marginTop: -1`. Odrzucone drzewo silnik zgłasza jako „engine node under a Box with prop "width"” (test drzewa w `tests/chat.test.ts`).
- Godzina w nagłówku: `timestamp` albo `createdAt` z propsów, jeśli host poda; inaczej lokalne `HH:MM` pierwszego rysunku z pamięci modułu (po komponencie i `requestId`), nie data historycznej wiadomości. Resize i redraw jej nie przesuwają (pamięć najnowszych 2000 wiadomości; id narzędzi z grup: 4000, `trimOldest`); start, reload modułu i `clear/resume/fork` zerują pamięć. Kolumny z `bodyColumns`/`columns` albo `viewport.columns`; bez pomiaru natywnie.
- `journal` zaczyna pusty, `shaftTab` od `stan`; tylko `$.state`, bez odtwarzania; `clear/resume/fork` zerują oba, reload modułu zachowuje. Godzina wpisu to koniec narzędzia; `deny` nie dopisuje.
- Raport kumpla wymaga potwierdzenia `task.id` w apelu albo liście agentów; samo `from.name` ani id powiadomienia nie dowodzą agenta. Po utracie apelu i wpisu raport zostaje natywny. `AssistantMessage` nie ma `agentId` ani `view`: główny blok to Krux.
- Zwijanie narzędzi: zegar widoczności nie czyta dziennika i nie zapisuje stanu co tyk. Narzędzie w toku, dawna historia i niekompletna grupa zostają natywne. Nie zmieniamy propsów wyjścia, `isExpanded`, `onScreen` ani danych narzędzia; układ i przewijanie żywego ekranu czekają do W3.
