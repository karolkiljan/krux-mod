# Nocny przegląd 2: metoda fachu kumpli i życie pasa

Przegląd z nocy 4–5 listopada 2026: review metody fachu z 0.24.0 (PR #49) z poprawkami oraz nowe animacje pasa. Wszystko leży na gałęzi `feat/nocny-przeglad-metody-i-pas` od `a1e2334` (0.24.0), wersja bez zmian, bez PR.

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

## Otwarte, do decyzji Morry

- **Tablica Sztolni bierze ostatni przebieg testów, także zawężoną powtórkę** (`hooks/board.ts:193-196`). Po czerwonym pełnym przebiegu Młota powtórka niestabilnego testu, która przejdzie, zazieleni tablicę i linię gotowości do commita. To semantyka „ostatni przebieg” z kontraktu, nie regresja 0.24.0, ale nowa metoda Młota robi z tego zwykły przebieg roboty. Możliwa poprawka: przebieg z filtrem po plikach albo nazwach nie nadpisuje szerszego czerwonego.
- **Próba kumpli na żywo**: eval `horda-szeroki-zwiad` (`claude plugin eval . --scaffold --trust-plugin --no-publish --runs 1 --ablation none --model sonnet`) i ogląd transkryptu Niucha: Grep zamiast `rg`, raport przed limitem tur.

## Weryfikacja

Na `feat/nocny-przeglad-metody-i-pas`, w korzeniu repo:

- `claude plugin validate --strict .`: przechodzi.
- `claude plugin test .`: przed przeglądem 677 z 682 zielonych; 5 czerwonych to wyczerpujące testy klatek ponad limitem 5 s na tej maszynie (1 rdzeń, pliki testów równolegle), nie asercje. Po przeglądzie 692 zielone, 0 czerwonych (10 nowych testów płótna i nakładek).
- `node --test tests/scripts-regression.mjs`: 38 zielonych, 8 pominiętych (tui-shot bez Pythona z `pyte`).
- Fuzzer płótna: 60 ziaren po 1200 kroków (kumple wchodzą i wychodzą, rzucają zwoje, reakcje, dymki, szerokości, palenisko, bezruch, spoczynek, niski pas): bez wyjątków, po ustaleniu rysunku 0 zapisów stanu.
- Klatki obejrzane jako PNG: mowa, kibicowanie, mrużenie, słuchanie, opowieść.
- `npx -p typescript@5 tsc -p .`: nie puszczone. Typy silnika (`.claude-plugin/types/`) kładzie dopiero sesja TUI z `--plugin-dir`, a ta pyta o zaufanie do folderu nowego worktree. Tej zgody przegląd nie dał za Morrę; typy nowych funkcji pilnowane ręcznie.
- `git push`: odrzucony, token `gh` w `/root/.config/gh/hosts.yml` nieważny. Gałąź czeka lokalnie w `/root/projects/krux-mod-straznik`.
