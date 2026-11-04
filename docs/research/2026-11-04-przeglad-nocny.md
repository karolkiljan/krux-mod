# Nocny przegląd moda: kod i animacje

Przegląd merytoryczny moda i stylistyczny animacji z 3–4 listopada 2026, z wdrożeniem poprawek. Wszystko leży na gałęzi `feat/przeglad-poprawki` (od `d763a5e`, wersja 0.22.0 bez zmian, bez PR).

## Metoda

1. **Przegląd kodu**: 7 obszarów (register, ryzyko i rodzaj roboty w `voice.ts`, głos i miernik, tablica i panele, fuzzer płótna, logika klatek, dokumentacja i narzędzia). Finder pisał reprodukcję w bun.
2. **Przegląd wizualny**: 5 obszarów. Arkusze wszystkich czynności i 13 scenariuszy pasa (spoczynek, przejścia, kumpel z kwater, nora, reakcje, horda, odwiedziny, dymki, wąski i niski pas, panel, bezruch, pory dnia) wyrenderowane do PNG przez `Forge` na powierzchni `headless` → `svgOf` → Chromium.
3. **Weryfikacja**: każde znalezisko dostało sceptyka, który próbował je obalić niezależną reprodukcją i sprawdzał kontrakt.
4. **Wdrożenie TDD** w osobnych worktree: test, który pada przed poprawką. Implementer pomijał to, czego nie odtworzył albo co łamało niezmiennik. Gałęzie `fix/*` scalane do integracji z pełnymi testami po każdej turze.
5. **Dwa końcowe przeglądy regresji** na zamrożonej kopii, z porównaniem do `d763a5e`: A (głos, repo, lore i miernik) i B (płótno: ponowny fuzzer, skrypty ciągłości klatek, ogląd renderów).
6. **Zrzuty prawdziwego TUI** (`scripts/tui-shot.py`, haiku) na 80 i 120 kolumnach.

## Liczby

- Pierwszy przegląd: 98 znalezisk. Weryfikacja: 66 potwierdzonych, 26 częściowo, 6 obalonych.
- Przegląd regresji A: 20 znalezisk, 17 potwierdzonych lub częściowo, wszystkie poprawione (z dwóch częściowych zostały drobne resztki, opisane w commicie).
- Przegląd regresji B: 11 znalezisk; 6 potwierdzonych, 3 częściowo, 2 obalone.
- Testy `claude plugin test`: 586 → 700.

## Co się zmieniło

### Ryzyko, rodzaj prośby i robota powłoki (`voice.ts`, `outcome.ts`)

- `RISK_WORDS`: bezokolicznik, 1. os. l. mn., pisownia bez ogonków, „commit”. Zakaz z „nie” („nie usuwaj bazy”) nie daje linii ryzyka (regresja A).
- `isDestructive`: rozdzielone, długie i sklejone flagi (`rm -r -f`, `git clean -d -f`, `push -uf`, `branch -d -f`, `checkout -f`), chmura (`gcloud`, `az`, `aws … delete-/terminate-`, `tofu`, `terragrunt`, `cdk`, `eksctl`), Mongo (`drop`, `deleteMany`), `UPDATE` z aliasem i `WHERE` w literale, `ALTER TABLE … DROP`. Bez katastrofalnego cofania regexów (regresja A: 4–8 s na długim tokenie → ms, test wydajności).
- `workOf`: samotne `&` puszcza w tło cały potok i listę, a `wait` za nim daje pełny wynik. Zdejmowane są opakowania `timeout`/`nice`/`xvfb-run` i opcje globalne gita. Doszły runnery testów monorepo i innych ekosystemów. Odczyty z kodem 1 (`diff`, `test`, `git rev-parse`…) nie są zawałem.
- `promptKind`: grzeczne „możesz wyjaśnić…” i „ok, wyjaśnij…” to `explain`. „Dzięki za pomoc!” zostaje pogawędką (regresja A). `asksRelease`: „wdróż”, „zmerguj”, „zdeployuj”, `publish` tylko całym słowem.

### Tablica, git, raport, register

- Kolor testów z linii podsumowania, nie z logu ani nazwy testu. Uwzględnia ANSI, błąd kolekcji pytest, kompilację cargo, dotnet/phpunit, nazwy deno/cargo/nextest, lint i `todo` (nie czerwienią), prefiksy turbo/pnpm/compose (regresja A), gradle i XCTest.
- Git: zniknięty upstream (`[gone]`) to „zniknął”, nie „równo”. Na gałęzi bez upstreamu commity już obecne na origin nie mają „↑” (`GIT_LOCAL`). Odczyt gita idzie zegarem, więc wynik narzędzia nie czeka na `git status`.
- Raport dnia bierze tylko commity sesji, a po `/resume` czyta gita, zanim go wypisze.
- Tabliczki `⚒ Krux`: przerysowanie historii ich nie gubi, a dawny blok nie zabiera tabliczki ani echa bieżącej tury. `/clear`, `/resume` i fork czytają limity od nowa, bez drugiego toastu. Przełącznik trybu liczy się ze stanu sesji. Zegar Desktopu staje przy bezruchu.

### Głos i miernik (`gauge.ts`, `lore.ts`, `mood.ts`, `voice/`)

- Linia nastroju idzie raz na zdarzenie, a edycja jej nie wznawia. Lint z samymi ostrzeżeniami to zielone budowanie, a `--max-warnings` za `| tail` czerwone.
- Kumpel notki nie jest sprzężony z formą (`mixed(seed)`), a `lastMate` to kumpel notki.
- `orcish` nie psuje rzeczowników („oryginałem”, „kowadłem”). Druga osoba łapie rozkaźniki, `-łeś/-łaś` i „twój”, ale nie etykiety `**Dodaj**` ani cytaty ASCII.
- Nazwa padłego testu mieści się w dymku. Przy planie notka o hordzie idzie „w środku”, bo koniec należy do pytania o zgodę. W `persona.md` kumpel jest bez rodzaju.

### Klatki (`hooks/acts/*`, `fidget.ts`, `palette.ts`)

- Rekwizyty stoją na ziemi (zwój Niucha bez dłoni, pochodnia, lupa, róg), a ramiona mają najwyżej 6 px za tułowiem (liczydło, wosk, pomiar, dzwon, kamerton, rysa, tablica).
- Ruch bez skoków: patyk, świeca, szlifierka, korba, nogi przy kęsie i gruzie, mur osiada w ziemię, ognisko, miarka Lonta.
- Pipeta ma stałe 3 px i krople trafiają do fiolek, a pilnik, stal i imadło mają trzy kolory.
- Oczy i dłonie: koc nie zakrywa oka, fajka i wędka są przy dłoni, łopatka nie znika, przeciąganie nie wygląda jak uszy, łuk ma kształt D.
- Gest strzepywania nie przesuwa hełmu Groma. Fartuch Młota jest stalowoniebieski (`#4f7aa3`), odróżnia się od bezimiennego i Lonta.

### Pokój i ruch (`sprites.ts`, `stage.ts`, `forge.ts`)

- Meble nie nachodzą na siebie przy żadnej szerokości. Pokój stoi od płótna 44 (terminal 79+ kolumn): na wąskim płótnie sztolnia wychodzi za prawą krawędź kadru, a sprzęt, nora i Skarbnik zostają w kadrze.
- Przerwana czynność domyka pętlę krótszą drogą (bez teleportu), a gest gra na bieżącej pozie.
- Rekwizyt w głębi nie puchnie, kumpel staje na progu drzwi, a okienko pokazuje porę dnia według miesiąca.
- Dymek ma ciemne wnętrze i jasny tekst (kontrast ≥ 4,5:1), a ogonek celuje w głowę mówcy. Przy piątce dłonie się stykają, a idący ork patrzy w kierunku marszu.
- Marsz idzie najwyżej 4 kolumny na klatkę. Przypięty ork jest przeszkodą dla domów sąsiadów, a reakcja czeka na dojście do stanowiska.
- Gość scenki staje za rekwizytem gospodarza, a zwój leci od razu ze scenki.
- Zmiana podłogi przy odejściu kieruje do nowych drzwi. Po zwężeniu ork odnosi rekwizyt, zamiast zgubić go skokiem.
- Bez paleniska Krux nie grzeje dłoni do pustej krawędzi, a kumpel z kwater idzie po sprzęt wzdłuż ściany, bez jo-jo.

### Narzędzia i dokumentacja

- `tsconfig.json` ma `noEmit`: `tsc -p .` bez typów silnika nie wysypuje już 62 plików `.js`.
- `scripts/act-sheet.ts` zapisuje PNG przez `node:zlib`, więc działa poza macOS.
- Skill `przed-wydaniem`: próba instalacji z marketplace w osobnym `CLAUDE_CONFIG_DIR`, bo `marketplace add ./` przepinał prawdziwą instalację na drzewo robocze.
- Testy tui-shot nie padają fałszywie na Linuksie. README i kontrakt są zgodne z kodem (`watch` przy palenisku, bez martwego `RoomFeel`). Podpis spoczynku „przy ogniu” zamiast „przy kowadle”.

## Decyzje wbrew znaleziskom i cofnięcia

- **Róg** zostaje kościany (`acts-mind-6` obalone): brąz `h` zlewał się z fartuchem w jeden pas, a kość z czarą czyta się jako róg. Róg leży za to na ziemi.
- **Snop pochodni** dalej jeździ po ścianie (`acts-mind-8` obalone): to opisany zamysł czynności, a światło od płomienia zamieniało go w pasek postępu.
- **Grader evali** `finds-startswith` bez zmian (`eval-1` obalone): zmiana przesuwałaby punkt odniesienia pomiaru.
- **`anim-4`** (obalone): została tylko minimalna, nieszkodliwa wersja (długi rekwizyt wysuwa się o krok wcześniej).
- **`register-7`** (obalone jako bez szkody) i **`tooling-3`** (obalone jako zamierzone) zostały: anulowanie zegara planu i act-sheet bez `sips` nic nie kosztują, a usuwają kłopot.
- **Pokój na 80 kolumnach**: pierwsza poprawka nachodzenia mebli (`room-1`) zdejmowała pokój poniżej 52 kolumn płótna. Prawdziwy TUI pokazał, że silnik daje pasowi na terminalu 80 kolumn tylko 75 kolumn (przycisk `[-]`), więc płótno ma 45 i pokój znikał. Druga poprawka (`wall80`, próg 50) też nie wystarczyła. Trzecia (`wall76`) przycina sztolnię na krawędzi kadru i trzyma pokój od płótna 44. Sprawdzone zrzutem TUI na 79, 80 i 81 kolumnach.

## Otwarte, świadomie nieruszone

- **`threads-1`**: notatka z `/krux zapisz` ginie po `--resume`, bo nie zostawia śladu w transkrypcie. Poprawka to albo ukryty kontekst dla modelu (komenda dziś milczy wobec modelu), albo `$.store` (dziś tylko tryby i pamięć hordy). To decyzja produktowa.
- **`board-6`**: `sed -i`, `git stash pop` i `git checkout --` nie postarzają testów. Kontrakt wiąże `editedAt` z narzędziami edycji, więc to rozszerzenie kontraktu, nie błąd.
- **`prompt-1` (a)** („jedno zdanie” obok „wymiany zdań” w notce) i **`lore-2`** (rotacja miejsc przy dwóch kumplach z faktem): bez pomiaru szkody. Zmiana rotacji wymaga zmiany przyrządu benchu.
- **Fiolki**: ręka sięgająca do zielonej fiolki przechodzi przed niebieską. Przy widoku z boku 6 × 22 trudno tego uniknąć, a to już nie 12-pikselowy drąg.
- **Na terminalu 80 kolumn** mieści się tylko Krux. Kumple pojawiają się od 81 kolumn.
- **Odczyt gita** to do 6 komend (doszedł `GIT_LOCAL`). Cichy odczyt limitów po `/clear` może przemilczeć przekroczenie, które zbiegnie się z pomiarem w locie.

## Przegląd regresji B (płótno)

Ponowny fuzzer płótna (300 ziaren × 3000 kroków), skrypty ciągłości klatek i ogląd renderów na migawce po scaleniu wszystkich poprawek, z porównaniem do `d763a5e`. Poprawione:

- **Zejście z czuwania bez paleniska** (wysoka): `cold` nie trafiał do osi zejścia, więc Krux w pierwszej klatce zejścia kucał do nieistniejącego ognia, ze skokiem do 27 px. Teraz zejście idzie tą samą trasą, a pojawienie się albo zniknięcie paleniska w spoczynku sprowadza Kruxa zejściem.
- **Kumple wezwani w jednej klatce** (wysoka) szli wzdłuż ściany jedną zlepioną sylwetką. Teraz wychodzą z drzwi po kolei (`Actor.queued`).
- **Gest na bieżącej pozie migał**, gdy poza nie miała na niego miejsca. Gest, który nie mieści się na całym obiegu, ustępuje następnemu.
- **Wyprawa w głąb** miała stałą długość, więc daleki sprzęt dawał do 35 kolumn na klatkę. Teraz idzie tempem marszu (`errandLegs`).
- **Kumpel z drzwi kończący w drodze ze zwojem** stawał w domu skokiem i rzucał w biegu. Teraz staje tam, gdzie zszedł.
- **Kufle gościa** rysowały się na framudze drzwi. **Zwężenie płaskiego pasa**: ork za nową krawędzią wchodzi od niej.
- **Zejście w pośpiechu** (R4) wdrożone mimo werdyktu „zamierzone”: pośpiech zostaje (wejście wstecz co drugą klatkę), ale pętla domyka się krok po kroku, zgodnie z niezmiennikiem „żaden krok zejścia nie jest większy od kroku czynności”.

Pominięte: zniknięcie kumpla na 2–3 klatki za nową krawędzią przy zwężeniu w trakcie wyprawy (B2-3). Jest identyczne jak w `d763a5e`, a przycięcie w locie zamieniłoby je w widoczny skok. Obalone: gospodarz scenki idący przez własny rekwizyt (B2-5).

Fuzzer po poprawkach: bez wyjątków, najwyżej 2 zapisy stanu bez tyknięcia, drzewo `Client` do 22,4 tys. znaków, SVG do 5,6 tys., bez utknięć i bez wiecznego zegara. Ziarna z teleportem: 14 (przed przeglądem B 60), z rzutem zwoju w marszu: 0. Orkowie stojący na sobie zostają tylko na zatłoczonej, wąskiej podłodze (38 ziaren na 300, wobec 34 w `d763a5e`).

## Weryfikacja

Na `feat/przeglad-poprawki`, w korzeniu repo:

- `claude plugin validate --strict .`: przechodzi.
- `claude plugin test .`: 700 zielonych, 0 czerwonych. Na 4 rdzeniach pod obciążeniem pojedyncze wyczerpujące testy klatek potrafią przekroczyć limit 5 s; na spokojnej maszynie przechodzą.
- `node --test tests/scripts-regression.mjs`: 35 zielonych, 8 pominiętych (tui-shot bez Pythona z `pyte` w PATH).
- `npx -p typescript@5 tsc -p .`: kod 0 (z typami silnika).
- `git diff --check`: czysto.
- Instalacja z marketplace w osobnym `CLAUDE_CONFIG_DIR`: `Read from:` z katalogiem repo, status enabled.
- Zrzuty TUI na 80 i 120 kolumnach: pokój, palenisko, dymek i skrót kontekstu rysują się poprawnie; na 80 kolumnach cała ściana jest w kadrze, a sztolnia ucięta krawędzią.
