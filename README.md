# Krux — mod Claude Code

Krux jako [mod Claude Code](https://code.claude.com/docs/en/plugins/mods/overview): ta sama persona technicznego orka co w pluginie [Krux](https://github.com/karolkiljan/krux) 3.8.0 (ten sam autor; persona przeniesiona stamtąd), ale wpięta od środka. Persona siedzi w prompcie systemowym, kotwica głosu jedzie z każdą turą, a nad promptem kowal wali młotem, póki Claude pracuje.

Tylko Claude Code (CLI i zakładka Code w aplikacji Desktop), od wersji 2.1.287. Codex nie ma modów — tam dalej działa plugin Krux.

## Co daje mod, czego plugin nie dawał

| | Plugin Krux | Mod Krux |
|---|---|---|
| Persona | kontekst hooka `SessionStart`, limit 10 000 znaków | sekcja promptu systemowego, bez tego limitu |
| Po `/compact` | wstrzykiwana od nowa | nie znika, bo prompt systemowy zostaje |
| Kotwica głosu | co turę, pełna | pełna na starcie, co 6 tur i po dryfie (z cytatem i własnymi zdaniami modelu przepisanymi po orkowemu); w pozostałych turach krótka, ~200 znaków |
| Pomiar głosu | tylko benchmark offline | miernik po każdej odpowiedzi: druga osoba, gładka pierwsza osoba, brak bezokolicznika, długie zdania; ostrzeżenia przed ruchem nieodwracalnym i tekstu do wklejenia w cytacie `>` nie sądzi |
| Życie hordy | model wymyśla sam | fakty z sesji (testy, budowanie, commity, rozbiórka, edycje interfejsu), każdy kumpel z własnym charakterem; turę, kumpla, formę i miejsce wstawki wybiera kod, nie model; przy prośbie o ruch nieodwracalny horda milczy |
| Kompakcja | streszczenie jak leci | neutralne streszczenie z faktami dosłownie, potem pełna kotwica |
| Format odpowiedzi | brak | jedna linia formatu według rodzaju prośby (debug, review, plan, wyjaśnienie, pogawędka), rozpoznanej regexem bez wywołania modelu, z limitem słów; bez rozpoznania sam budżet: do 150 słów; prośba o ruch nieodwracalny (`DROP TABLE`, force push, `git checkout -- .`, `terraform destroy`, `kubectl delete`, „usuń tabelę”) dostaje linię: skutek i droga odwrotu pełnymi zdaniami |
| Tabliczki | brak | `⚒ Krux` nad odpowiedzią, `Morra` nad promptem; sam rysunek, 0 tokenów |
| Przełączniki | frazy `włącz krux` itd. | frazy dalej działają, do tego `/krux` bez tury modelu |
| Interfejs | brak | panel kuźni, kowal nad promptem, słowa spinnera, etykiety w stopce |

## Instalacja

Na stałe, z GitHuba:

```bash
claude plugin marketplace add karolkiljan/krux-mod
claude plugin install krux-mod@krux-mod-marketplace
```

Na jedną sesję, z lokalnego klonu (zmiany w plikach przeładowują się same):

```bash
git clone https://github.com/karolkiljan/krux-mod.git
claude --plugin-dir ./krux-mod
```

Odinstalowanie:

```bash
claude plugin uninstall krux-mod@krux-mod-marketplace
```

Nie odpalaj moda razem z pluginem Krux — oba wstrzykną personę i kotwicę, więc model dostanie wszystko podwójnie. Mod wykrywa aktywny plugin i ostrzega toastem. Wyłączenie pluginu:

```bash
claude plugin disable krux@krux-marketplace
```

## Użycie

| Komenda | Skutek |
|---|---|
| `/krux` | panel kuźni: tryby pod klawiszami 1–7, horda, palenisko |
| `/krux on` / `/krux off` | głos orka / tryb neutralny |
| `/krux konkret [on\|off]` | precyzja zakresu: tylko to, o co proszono |
| `/krux flow [on\|off]` | jeden ruch na raz, zgoda przed każdym |
| `/krux animacje [on\|off]` | kowal nad promptem |
| `/krux kowal [on\|off]` | kowal zostaje nad promptem także w spoczynku |
| `/krux sztolnia [on\|off]` | panel ze stanem roboty obok transkryptu |
| `/krux czat [on\|off]` | ramki rozmowy i awatary w terminalu |
| `/krux dziennik` | otwarcie karty Dziennik w Sztolni |
| `/krux zapisz <tekst>` | zapis otwartego wątku w tablicy sesji |
| `/krux raport` | raport sesji do skopiowania |
| `/krux status` | stan trybów |

Bez `on`/`off` komenda przełącza tryb na przeciwny. `/krux` działa także w trakcie tury i nie kosztuje wywołania modelu. Stare frazy z pluginu (`włącz krux`, `wyłącz konkret`, …) dalej działają, gdy stanowią całą wiadomość. Stan trybów jest trwały i przeżywa restart sesji.

Mapa hordy ładuje się na żądanie: `/krux-mod:krux-horda`. Kumple to typy subagentów z `agents/`: `krux-mod:niuch`, `krux-mod:grom`, `krux-mod:piryt`, `krux-mod:ochra`, `krux-mod:mlot`, `krux-mod:lont`. Każdy ma fach, narzędzia, model i format raportu: Niuch, Piryt i Młot nie mają narzędzi edycji, a Bash dostają do odczytu i testów; Lont rusza tylko czyste pliki śledzone przez git. Te granice stoją w prompcie kumpla, a zgody na każde wywołanie daje silnik, jak w głównej pętli (`docs/adr/0001-lont-zakaz-w-prompcie.md`). Niuch i Młot chodzą na Haiku. Wysłany typem kumpel wbiega na scenę we własnym fartuchu, także gdy opis zadania nie ma jego imienia.

## Animacje

- **Kowal nad promptem.** Póki Claude pracuje, pasek pokazuje pikselowego orka i opis bieżącej czynności. Przy `Edit` i `Write` ork kuje stal, przy `Grep` świeci pochodnią, przy `Glob` wypatruje z krzaka, przy `Read` sięga po zwój, przy planie kreśli mapę, przy sieci i zewnętrznych narzędziach MCP wysyła kruka, przy `AskUserQuestion` drapie się pod znakiem zapytania, przy `Agent` dmie w róg. Własne narzędzie `mcp__krux-mod__watki` zachowuje scenę planowania. Przy `Bash` scena i podpis wynikają z rodzaju komendy, tej samej co w kronice: testy mają próbę stali (także `make test`, `uv run pytest`, `pnpm vitest`), commit i push pieczęć, budowanie piec, rozbiórka dynamit, odczyty i ślady gita pochodnię, instalowanie i pozostałe komendy kilof; odczyt na przedzie łańcucha (`ls && ./deploy.sh`) nie udaje zaglądania. Strumień odpowiedzi zmienia scenę także pomiędzy narzędziami: myślenie uruchamia dumanie, tekst pisanie, a początek wywołania narzędzia jego scenę; przy `Bash` scena czeka na komendę, zamiast zgadywać kilof. Narzędzia silnika też mają swoje sceny: lista zadań mapę, wiadomość do agenta kruka, czytanie wyników z tła zwój. Każda scena ma co najmniej 3 różne czynności. Scena pozostaje przez co najmniej 1,5 s; przy zmianie rekwizyt schodzi 2× szybciej, nadal przez odwrócone wejście. Narzędzie zawsze robi Krux; kumpel pojawia się tylko przy prawdziwym subagencie.
- **Horda na scenie i humory.** Kumpel wbiega z prawej w swoim fartuchu i wykonuje czynności wynikające z własnych narzędzi oraz strumienia myślenia i odpowiedzi. Grom nosi hełm, Niuch ma wydłużony nos, Ochra pędzel, Lont tlący się lont. Po zakończeniu kumpel zwija meldunek, odkłada rekwizyt, rzuca Kruxowi zwój, potem maszeruje w prawo. Stojący Krux łapie zwój dłonią i chowa pod fartuch; zwój leci za głowami, nigdy przez oczy. Zniknięcie z listy aktywnych agentów bez zdarzenia zakończenia nie uruchamia rzutu. Gdy Krux czeka na wyniki hordy, leży na szezlongu z kuflem i nie wraca do rogu, kiedy kumpel oddaje zwój. Pas ma stałą wysokość i szerokość. Dymek nad ostatnim mówiącym orkiem odsłania po 3 znaki co 150 ms. Humory zmieniają oczy i brwi, a wynik roboty wywołuje też reakcję na płótnie: zielone testy złote iskry, czerwone robaka, udane budowanie błysk stali, nieudane sadzę, commit pieczęć, rozbiórka wybuch, zawał spadające kamienie. Krux i kumpel zmieniają też postawę: przysiad, uniesiona ręka, przydeptanie robaka albo osłona przed zawałem. Pozy leżące, siedzące i pochylone zachowują dotychczasowy ruch oraz rekwizyty: Krux na szezlongu czy w fotelu nie zrywa się na reakcję. W czynności z kanarkiem faktyczny wynik testów wywołuje śpiew i ruch skrzydeł albo opadnięcie ptaka na żerdź. Kumpel reaguje na własną robotę.
- **Dłuższa praca i spoczynek.** Po 10 s pojedynczej aktywności pojawia się pot, po 30 s ork okresowo ociera czoło. Kolejne narzędzie lub faza odpowiedzi zaczyna odliczanie od nowa. Gdy Claude skończy, ork stoi przy kowadle, a podpis pokazuje stan spoczynku. Po 30 s bezczynności Krux zamyka oczy i pokazuje runę snu. `/krux kowal off` pozostawia pasek tylko na czas pracy.
- **Panel `/krux`.** Większa kuźnia z paleniskiem, w którym płonie ogień, przełączniki trybów i horda.
- **Sztolnia.** Panel obok transkryptu (w pełnym ekranie dokuje się z prawej) ze stanem roboty: plan z listy zadań (`✓` zrobione, `▸` w toku, `·` czeka), ostatni ukończony przebieg testów z liczbami i nazwami padających, gotowość do commita, otwarte wątki, stan repo i commity, orkowie, którzy jeszcze biegają (zadanie, czas, ostatnie narzędzie), oraz zapełnienie kontekstu, okna limitów i koszt sesji. Diffu i drzewa zmian nie dubluje: te daje `/diff` Claude Code. Krzyżyk zamyka panel na stałe, wraca przez `/krux sztolnia`.
- **Spinner.** Zamiast angielskich słówek: „Dumać”, „Skrobać runy”; przy pracy narzędzia słowo idzie za sceną, także rodzajem komendy `Bash` („Kopać” przy kopaniu, „Węszyć” przy szukaniu).
- **Stopka.** Etykiety `krux`, `konkret`, `flow` obok trybów Claude Code.

Animacja chodzi na zegarze klatek interfejsu (moduł `Client`), więc nie budzi modelu i nie zjada tokenów. `/krux animacje off` zdejmuje kowala. Ustawienie `prefersReducedMotion: true` w Claude Code zatrzymuje orków w miejscu, wyłącza reakcje, rzut zwoju, pot, ocieranie czoła i drzemkę oraz pokazuje od razu pełny dymek. Grafika rysuje się tylko w terminalu; w Desktop, VS Code i na telefonie zostaje sam tekst, a persona i komendy działają wszędzie.

Nowe sceny paska:

| Scena | Kiedy | Czynności |
|---|---|---|
| `test` | testy | kanarek, próba obciążeniowa, fiolki |
| `seal` | commit i push | wosk, prasa, zwój ze sznurem |
| `build` | budowanie | piec, hartowanie, miech |
| `tear` | rozbiórka | dynamit, gruz, mur |
| `think` | strumień myślenia | ważenie rudy, liczenie kamyków, rozważanie mapy |
| `write` | strumień tekstu odpowiedzi | skrobanie run, cięcie zbędnych liter, zwijanie zwoju |

Okna zgody na narzędzia obsługuje silnik Claude Code. Mod nie podłącza `tool.check` ani nie animuje oczekiwania na zgodę.

## Granice

Poprawność, bezpieczeństwo i wymagany format wyprzedzają głos. Liczby, wersje, ścieżki, komendy i komunikaty błędów idą dosłownie. Kod, JSON, commit messages i opisy PR pozostają neutralne. Przed ruchem nieodwracalnym Krux przechodzi na pełne zdania: warunek, skutek, droga odwrotu.

Mod to kod uruchamiany z uprawnieniami użytkownika. Ten czyta trzy pliki z `voice/`, ustawienia (`prefersReducedMotion`), listę komend, historię sesji (`$.session.messages`, do odtworzenia kroniki i tablicy po wznowieniu), zużycie kontekstu i limitów (`$.session.usage`) oraz listę agentów (`$.agent.list`). Uruchamia do pięciu komend, wszystkich tylko do odczytu: `git status` (stan repo), `git log -n 10` (ostatnie commity), `git diff --check` i `git diff --cached --check` (białe znaki w drzewie roboczym i indeksie) oraz `git rev-list @{upstream}..HEAD` (niewypchnięte commity, gdy repo ma upstream). Rejestruje jedno narzędzie dla modelu, `mcp__krux-mod__watki`: otwarte wątki tablicy, trzymane w stanie sesji. Dostarcza 6 typów subagentów (`agents/*.md`); uruchamia je model, gdy wyśle kumpla, z narzędziami z ich definicji i zgodami silnika, a ich opisy (razem do 700 znaków) stoją na liście typów narzędzia `Agent`. Pisze wyłącznie do własnego magazynu `$.store` (tryby) i stanu sesji. Nie wysyła niczego poza sesję. Persona i kotwica głosu trafiają do promptu modelu, tak jak reszta sesji, więc każda tura kosztuje trochę więcej tokenów. Pełna lista: `claude plugin validate .`.

## Rozwój

```bash
claude plugin validate .
claude plugin test .
node --test tests/scripts-regression.mjs
tsc -p .
git diff --check
```

Sprawdzone na Claude Code 2.1.296. API modów jest we wczesnym dostępie i może się zmienić między wersjami.

## Pomiar głosu

```bash
node scripts/voice-bench.mjs --model claude-opus-5-5 [--scenario cache|smrod] [--mode stream|resume] [--plugin-dir <katalog>]
node scripts/bench-compare.mjs baza=<katalog> wariant=<katalog> [--model <id>] [--scenario cache|smrod] [--turn N]
```

Jeden przebieg to jedna sesja. Scenariusz `cache` (domyślny, 12 tur, sam odczyt plików) pochodzi z pluginu Krux 3.8.0: te same prompty, fixture i metryki co `scripts/context-smoke.js`, więc liczby stają obok serii pluginu. Scenariusz `smrod` (7 tur) daje modelowi `Bash` do testów i `Edit`: model puszcza testy, naprawia robaka i odpowiada na pytanie o wydanie, więc kronika dostaje smród i zielone, a model linię nastroju. `--mode stream` (domyślnie) prowadzi rozmowę w jednym procesie `claude -p --input-format stream-json`, tak jak sesja interaktywna, więc mierzy krótką kotwicę i życie hordy. `--mode resume` odpala osobny proces na turę z `--resume` i sprawdza, czy mod odtwarza stan z historii. Ustawienia użytkownika, jego pluginy, hooki i MCP są odcięte (`--setting-sources local`, `--strict-mcp-config`); mod wchodzi wyłącznie przez `--plugin-dir`. Raport i surowe odpowiedzi lądują w `benchmarks/voice-bench/<czas>/`.

Poza metrykami pluginu raport liczy kotwice z transkryptu: pełne (`fullAnchors`, w tym `driftFixes` z poprawką), krótkie (`shortAnchors`), notki o hordzie i o nastroju (`hordeNotes`, `moodNotes`) i łączną długość kontekstu hooka (`hookContextChars`), a do tego szablony: powtórzone zamknięcia i otwarcia odpowiedzi (`repeatedClosings`, `repeatedOpenings`), prośby o zgodę na końcu (`consentClosings`), powtórzone otwarcia wstawek o hordzie (`repeatedHordeOpenings`), wstawki w ostatnim akapicie (`hordeClosings`), kumpla w ostatnim zdaniu tury, w której notka kazała „w środku” (`middleClosings`; tury notek bench odtwarza z odpowiedzi regułą moda) i słowo „nastrój” powtórzone za linią nastroju (`moodWordEcho`). `bench-compare.mjs` liczy metryki od nowa z `responses.json` każdej serii, więc stare przebiegi liczą się tak samo jak nowe, i podaje różnicę z testem permutacyjnym; `--turn N` wypisuje odpowiedzi z tury N do czytania oczami. Notatki z wynikami A/B: `docs/research/`. Wymaga Node ≥ 22.18 (wczytuje `hooks/voice.ts` bez budowania). Przebieg `cache` to 12 płatnych tur: około $0,45 na Opusie i $0,014 na Haiku; `smrod` na Opusie kosztuje około $0,25.

## Licencja

MIT. Projekt nie jest powiązany z produktami innych autorów o nazwie Krux.
