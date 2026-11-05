# Nocny przegląd 2: metoda fachu kumpli i życie pasa

Przegląd z nocy 4–5 listopada 2026: review metody fachu z 0.24.0 (PR #49) z poprawkami, nowe animacje pasa i, w drugiej rundzie, wspólne scenki i dyskusje hordy. Wszystko leży na gałęzi `feat/nocny-przeglad-metody-i-pas` od `a1e2334` (0.24.0), wersja bez zmian, bez PR.

## Metoda

1. **Przegląd metody fachu**: prompty kumpli (`agents/*.md`), skill `krux-horda`, test metody i dokumentacja z PR #49, czytane wobec silnika 2.1.295. Opis narzędzia Grep, pola frontmattera agentów (`effort`, `omitClaudeMd`, `maxTurns`) i to, co rodzic dostaje po limicie tur kumpla, wzięte prosto z binarki `claude.exe`, bo dokumentacja tego ostatniego nie podaje.
2. **Próba na żywo** (`claude -p --plugin-dir` z kumplem testowym na Haiku) odrzucona przez klasyfikator trybu auto („Create Unsafe Agents”). Zostaje do puszczenia ręcznie (niżej).
3. **Animacje**: pomysł, wdrożenie przez testy, klatki z `Forge` na powierzchni `headless` przez `svgOf` do PNG własnym rasteryzatorem (na tej maszynie nie ma Chromium ani Playwrighta), na koniec fuzzer płótna.

## Znaleziska w metodzie fachu i poprawki

Od najpoważniejszego. Wszystkie poprawione w `e9bbdf2`.

1. **Lont usuwał kod żywy w nowych plikach** (`agents/lont.md`). Dowód martwego kodu stał na `git grep -n`, a `git grep` bez `--untracked` przeszukuje tylko pliki śledzone. Scenariusz: Grom w równoległej jednostce dodaje `src/api/export.ts` z importem `formatRow`; Lont, który rozbiera `src/util/`, nie widzi odwołania i usuwa funkcję jako martwą. Teraz szukanie narzędziem Grep po całym drzewie roboczym, a sprawdzenie, które na starcie przechodziło i po zmianie pada, cofa zmianę (`git restore <plik>`) i idzie do luki.
2. **Niuch dostawał sprzeczne instrukcje** (`agents/niuch.md`). Prompt kazał szukać `rg -n` w Bash, a opis narzędzia Grep w silniku mówi „ALWAYS use Grep for search tasks. NEVER invoke `grep` or `rg` as a Bash command”. `rg` bywa poza PATH, a argument rozwijany przez powłokę (gwiazdka) idzie przez zgodę. Teraz Grep, a `git grep` tylko do starszych rewizji.
3. **Młot mógł zjeść limit tur przed raportem** (`agents/mlot.md`). Każdy padły test szedł do powtórki osobno przy `maxTurns: 30`. Ucięty kumpel wraca z dopiskiem silnika „It was still calling tools and had produced no report”. Teraz jedna powtórka samych padłych, Niuch i Młot znają swój limit tur z promptu, a skill każe dokończyć ucięty meldunek przez `SendMessage` do tego samego kumpla.
4. **Raport Młota nie mieścił się w swoim limicie**. „Do 150 słów” obok „pełny opis pierwszych 10 padłych”: dziesięć opisów z nazwą, `plik:linia`, rodzajem i pierwszą linią błędu to więcej niż 150 słów. Lista padłych nie liczy się już do limitu, jak lista miejsc Niucha.
5. **Grom i Ochra w równoległych jednostkach** puszczają na końcu pełne testy, które łapią robotę kumpla obok. Test padły w plikach spoza zakresu idzie do luki, bez naprawy.
6. **Niuch i Piryt „tylko patrzą”**, a runner bez trybu CI dopisuje brakujące migawki. Testy puszczają z `CI=1`.
7. **Test metody** sprawdzał, że raport ma punkt `Luka:`, a nie, że go zamyka, choć commit i kontrakt mówią o luce na końcu. Teraz luka to ostatni punkt.

Nowe testy skryptów: luka zamyka raport, kumple szukają narzędziem Grep (Lont i Niuch wprost), kumpel z `maxTurns` zna swój limit, lista padłych Młota poza limitem słów. Każdy pada na wersji z 0.24.0.

Pola z 0.24.0 sprawdzone w binarce i w porządku: `effort` i `omitClaudeMd` są w liście pól agenta, a pola ignorowane w agencie pluginu (`hooks`, `permissionMode`, `mcpServers`) silnik zgłasza ostrzeżeniem, jak notuje ADR 0001.

## Animacje: horda się widzi i gada

Każdy ork grał swoją czynność, jakby był w kuźni sam: mówca stał z zamkniętymi ustami, a fajerwerki u kumpla nikogo nie obchodziły. Wdrożone (`d1b599c`, `d5d9a2b`, `6794957`, `7192aec`):

1. **Gadanie**: mówca rusza szczęką, póki dymek odsłania tekst (paszcza, szpara, zamknięte usta), także w marszu i w scence.
2. **Spojrzenia**: ork w reakcji na zdarzenie przyciąga wzrok reszty na całą reakcję; słuchacz zerka na mówcę nowej linii przez 1,5 s, przy co drugiej linii; Krux śledzi kumpla, który rzuca mu zwój. Wzrok idzie do brzegu oka.
3. **Kibicowanie**: po zielonych, udanym budowaniu i commicie widz błyska złotymi oczami dumy i unosi pięść, gdy ma wolną rękę; po smrodzie, nieudanym budowaniu, zawale i wybuchu mruży oczy.
4. **Scenka opowieści**: gość mówi i gestykuluje, przy „taka ruda!” rozkłada ręce, gospodarzowi opada szczęka, a na koniec obaj rechoczą i klepią się po udzie. Para kumpli bez sporu losuje szermierkę, podanie stali albo opowieść; gość u Kruxa przy ogniu opowiada zamiast części toastów.

Zasady: wszystko liczy rysunek z bieżącej klatki, bez zapisu stanu; w bezruchu (`prefersReducedMotion`) nic z tego nie gra; nakładki trzymają zasady klatki jak gesty (test na każdej pozie każdej czynności).

### Decyzje po obejrzeniu klatek

- **Pięść prawie nigdy nie stawała.** Orkowie trzymają narzędzia po prawej i stoją od lewej krawędzi swojej klatki, więc wolnego tła na rękę zwykle brak. Doszły złote oczy dumy, ten sam język co humor `proud`, widoczne w każdej pozie, i lewa pięść, gdy prawa strona zajęta.
- **Pierwsze spojrzenie ruszało źrenice o piksel.** Krux czytający tablicę po prawej kończył z oczami na środku, co wyglądało jak oderwanie wzroku od roboty, a nie spojrzenie na Groma po lewej. Teraz wzrok idzie do brzegu oka.
- **Słuchacz przy każdej linii gapiłby się na mówcę bez przerwy**, bo dymek zmienia się przy każdym narzędziu. Stąd co druga linia (los z linii i klucza widza) i tylko 1,5 s, a na zamarłym płótnie nikt nie zostaje z zezem.
- **Lewa pięść nie sięga wiersza czubka**: przy przechylonej głowie `dress` wziąłby ją za czubek i przesunął hełm Groma.
- **Opowieść przy odwiedzinach tylko przy ogniu**: przy robocie toasty zostają, bo testy kufli liczą na toast w swoich klatkach. Odwiedziny przy ogniu są rzadkie (w spoczynku zegar stoi), więc opowieść widać głównie między kumplami przy robocie.

### Pomysły odłożone

- **Krux czyta meldunek po złapaniu zwoju.** Kumpel znika w drzwiach po kilku klatkach, więc czytanie potrzebuje stanu po stronie Kruxa, a jego ciało w pozie czytania zostawiałoby rekwizyt bieżącej czynności w powietrzu dłużej niż dzisiejszy chwyt.
- **Pożegnanie machaniem z progu kwater**: zmienia plan odejścia (`leftAt`, drzwi), czyli najdelikatniejszą część niezmienników kwater.
- **Kurz spod stóp w marszu**: pokój jest świadomie bez tła i drobnicy, a pył już znaczy zawał i rozbiórkę.

## Druga runda: wspólne scenki i dyskusje

Prośba Morry: więcej wspólnych interakcji przy robocie i więcej dyskusji. Wdrożone (`9f61e48`, `9fc1c3f`):

1. **Riposta w dymkach**: co czwarte zdarzenie mówca fachu, gdy stoi na scenie, odpowiada na odszczekanie pary trzecią kwestią (Młot: „Kanarek nie kłamać.” na „Trop czuć. Dowód?”). Krux nie opowiada sporu dwóch nieobecnych, a mówca, który zszedł przed swoją kolejką, mówi przez Kruxa jak para.
2. **Odpowiedź na wynik kumpla**: dotąd wynik własnej roboty kumpla zostawał bez echa. Teraz co drugi dostaje odszczekanie pary na scenie, gdy to zdarzenie fachu kumpla, a inaczej krótkie słowo Kruxa („Robak nie uciec.”). Linie pary mówią jej głosem, więc testy Groma nie dostają nosa Niucha w ustach Piryta.
3. **Dyskusja** (`debate`): mówią na zmianę, nigdy naraz, słuchacz trzyma dłoń przy brodzie, na zgodę uścisk dłoni, który trzęsie się nad środkiem.
4. **Narada nad mapą** (`council`): zwój spod fartucha rozwija się po kawałku, pokazują palcem na zmianę, gość dostaje „aha!”, mapa zwija się z powrotem.
5. **Pokaz sztabki** (`show`): sztabka spod fartucha gościa błyska w górze, gospodarz waży ją z dłonią przy brodzie i uznaje.
6. **Scenka według roboty**: przy stole narada, dyskusja albo opowieść; para ze sporu szermierka, kłótnia albo dyskusja; reszta stal, szermierka, opowieść, dyskusja albo pokaz.

Odłożone: **wspólne kucie** (jeden trzyma stal w szczypcach, drugi wali młotem). Bez kowadła między orkami to kucie w powietrzu, a kowadło, które pojawia się na środku, łamie zasadę, że nic nie wyskakuje skokiem. Kowadło gospodarza stoi w jego czynności, a każda czynność ma je gdzie indziej, więc gość musiałby znać geometrię każdej klatki. To robota na osobną gałąź.

## Otwarte, do decyzji Morry

- **Tablica Sztolni bierze ostatni przebieg testów, także zawężoną powtórkę** (`hooks/board.ts:193-196`). Po czerwonym pełnym przebiegu Młota powtórka niestabilnego testu, która przejdzie, zazieleni tablicę i linię gotowości do commita. To semantyka „ostatni przebieg” z kontraktu, nie regresja 0.24.0, ale nowa metoda Młota robi z tego zwykły przebieg roboty. Możliwa poprawka: przebieg z filtrem po plikach albo nazwach nie nadpisuje szerszego czerwonego.
- **Próba kumpli na żywo**: eval `horda-szeroki-zwiad` (`claude plugin eval . --scaffold --trust-plugin --no-publish --runs 1 --ablation none --model sonnet`) i ogląd transkryptu Niucha: Grep zamiast `rg`, raport przed limitem tur.

## Weryfikacja

Na `feat/nocny-przeglad-metody-i-pas`, w korzeniu repo:

- `claude plugin validate --strict .`: przechodzi.
- `claude plugin test .`: przed przeglądem 677 z 682 zielonych; 5 czerwonych to wyczerpujące testy klatek ponad limitem 5 s na tej maszynie (1 rdzeń, pliki testów równolegle), nie asercje. Po pierwszej rundzie 692 zielone, 0 czerwonych. Po drugiej 697 z 698: jedyny czerwony to znowu `test-fail effects preserve eyes and apron in every distinct act pose` (5541 ms przy limicie 5000), w izolacji zielony (3782 ms); `withCue` przegląd nie ruszał.
- `node --test tests/scripts-regression.mjs`: 38 zielonych, 8 pominiętych (tui-shot bez Pythona z `pyte`).
- Fuzzer płótna: 60 ziaren po 1200 kroków (kumple wchodzą i wychodzą, rzucają zwoje, reakcje, dymki, szerokości, palenisko, bezruch, spoczynek, niski pas), po każdej rundzie: bez wyjątków, po ustaleniu rysunku 0 zapisów stanu. W drugiej zagrały narada, dyskusja, pokaz, opowieść, piątka, toast, szermierka i podanie stali.
- Klatki obejrzane jako PNG: mowa, kibicowanie, mrużenie, słuchanie, opowieść, dyskusja, narada, pokaz.
- `npx -p typescript@5 tsc -p .`: nie puszczone. Typy silnika (`.claude-plugin/types/`) kładzie dopiero sesja TUI z `--plugin-dir`, a ta pyta o zaufanie do folderu nowego worktree. Tej zgody przegląd nie dał za Morrę; typy nowych funkcji pilnowane ręcznie.
- `git push`: odrzucony, token `gh` w `/root/.config/gh/hosts.yml` nieważny. Gałąź czeka lokalnie w `/root/projects/krux-mod-straznik`.

## Weryfikacja przed scaleniem

Gałąź sprowadzona z `/root/projects/krux-mod-straznik` i sprawdzona 5 listopada na silniku 2.1.318. W binarce stoją twierdzenia z metody fachu: opis narzędzia Grep („NEVER invoke `grep` or `rg` as a … command”) i oba dopiski silnika o limicie tur. Ocena świeżym okiem animacji i dymków znalazła trzy błędy, każdy odtworzony przed poprawką:

1. **Odpowiedź na wynik kumpla „co drugi raz” działała jak „zawsze albo nigdy”.** Ziarno brało `sessionStrikes`, a ten licznik stoi, póki główna pętla czeka na `Agent`: cztery wyniki Młota dostawały cztery razy tę samą kwestię albo cztery razy ciszę. Teraz ziarno dolicza zdarzenia kumpli (`mateEvents`).
2. **W dyskusji dwie paszcze naraz.** Szczęka z dymka szła na pozę scenki, która sama prowadzi usta, więc przy nowej linii gościa obaj mówili jednocześnie (klatki 3, 6, 9 dyskusji). Scenki z rozmową (`TALKING_DUETS`) prowadzą usta same.
3. **Pot przed spojrzeniem.** Kropla potu spływa w kolumnie prawej pięści widza, więc na gołej stójce pięść przeskakiwała z lewej na prawą albo pojawiała się nagle czterema pikselami. W prawdziwych scenach pasa prawą rękę zwykle zajmuje narzędzie i przeskoku nie widać, ale kolejność jest teraz pewna: najpierw spojrzenie, potem pot na wolnym tle.

Do tego kontrakt: odpowiedź na wynik kumpla nie zaczyna się „z chodnika”, ale para, która zejdzie przed swoją kolejką, mówi przez Kruxa, jak w kodzie. `tsc` przechodzi, `claude plugin test .` daje 721 zielonych, skrypty 46 zielonych bez pominiętych. Niesprawdzone: czy gesty wiercenia z dłonią w kolumnie prawej pięści przerzucają ją jak pot.
