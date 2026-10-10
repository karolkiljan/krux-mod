# Strażnik, horda jako agenci, forma linii nastroju i miejsce kumpla (2026-10-10)

Cztery zmiany po A/B z `docs/research/2026-10-10-haiku-ab.md` (gałąź `experiments/haiku-ab`).
Punkt odniesienia: `main` po PR #2 (`cdd1044`, nastrój z kroniki i słowa fachu kumpli).

## 1. Strażnik ruchu nieodwracalnego

`isDestructive` na `main` łapał 1 z 20 sprawdzonych groźnych komend (`rm -rf build`).
Przepuszczał m.in. `terraform destroy`, `kubectl delete`, `git push --mirror`, `git checkout -- .`,
`git stash clear`, `prisma migrate reset`, `rails db:drop`, `redis-cli FLUSHALL`,
`dd if=/dev/zero of=/dev/sda`. Zmiana nie dotyka tekstu dla modelu, więc nie wymaga A/B kotwicy.

Przegląd gałęzi (dwie osie: standardy repo i zgodność ze specem) znalazł w pierwszej wersji
przeoczenie `git restore --staged . && git restore .` (argumenty pierwszego `restore` zjadały
resztę linii), flagę na sformatowanym `UPDATE … SET` z `WHERE` w następnym wierszu, przeoczone
`docker-compose down -v`, `terraform -chdir=infra destroy`, `rails db:migrate:reset` i `shred plik`
oraz fałszywe alarmy `shred --help`, `mkfs --help`, `wipefs /dev/sdb` (sam odczyt sygnatur)
i `git push && docker run -d` (okno flagi przechodziło przez `&&`). Drugi przegląd, już samych
poprawek, złapał w nich regresje: wcięty kod przedłużał zdanie SQL (Python z `UPDATE` bez `WHERE`
tracił flagę), `ARG` brał cytowane `|` i `\;` za separator (`find … -regex '(pyc|pyo)' -delete`
bez flagi), a `mkfs` w samej prośbie przestał dawać linię ryzyka; dorzucił też opcje globalne
(`git -C`, `compose -f`, `helm -n`). Porównanie wersji przed i po poprawkach na 1317 napisach
z testów: 10 zmian w każdą stronę, wszystkie zamierzone. Testy w `tests/voice.test.ts` trzymają
teraz 71 nowych groźnych komend (`main` łapał z nich 0), 5 polskich próśb z linią ryzyka i
56 bezpiecznych sąsiadów, a do tego przykłady i sąsiadów dawnych wzorców (`filter-branch`,
`TRUNCATE`, `DELETE FROM`, `DROP …`): każda komenda ma przykład i sąsiada.

## 2. Kumple jako typy subagentów

Plugin nie miał `agents/`, więc kumpel był zwykłym subagentem z imieniem w `description`.
Teraz `agents/{niuch,grom,piryt,ochra,mlot,lont}.md` dają typy `krux-mod:<kumpel>` z fachem,
narzędziami, modelem i formatem raportu. Niuch, Piryt i Młot nie mają narzędzi edycji; Bash
tylko do odczytu i to, że Lont rusza wyłącznie czyste pliki śledzone przez git, stoją w prompcie,
a zgody daje silnik jak w głównej pętli (`docs/adr/0001-lont-zakaz-w-prompcie.md`). Niuch i Młot
chodzą na `haiku`.

Sprawdzenie na żywo (`claude -p --plugin-dir . --model haiku`): `init` listuje 6 typów
`krux-mod:*`, wywołanie `Agent` z `subagent_type: "krux-mod:niuch"` uruchomiło kumpla, który
zrobił `ls -la agents/` i oddał raport; koszt $0,0044. Bench tego nie mierzy: scenariusze
`cache` i `smrod` nie dają modelowi narzędzia `Agent`.

Ta zmiana dokłada też tekst dla modelu: opisy typów stoją na liście narzędzia `Agent` w każdej
turze sesji, która to narzędzie ma. Pierwsza wersja opisów miała razem 873 znaki; po przeglądzie
629, z budżetem 700 w teście. Opis podaje fach, warunek wysłania i granicę, a bramka korzyści
(kiedy wołać kumpla w ogóle) zostaje w skillu `krux-horda`.

## Plan pomiaru punktów 3 i 4 (spisany przed wynikami)

**Ramiona.** K = `main` (`cdd1044`, kod identyczny z `arm/K-razem` w `hooks/`, `voice/`,
`types/`), dane K z `haiku-ab` (n = 10 na scenariusz). S = ta gałąź: nowa forma linii
nastroju (punkt 3) i środek notki o hordzie z „nie na końcu odpowiedzi” (punkt 4). Punkty 1–2
nie zmieniają kontekstu modelu w benchu (bez `Agent`, bez komend nieodwracalnych w promptach).

**Przebiegi.** Haiku (`claude-haiku-5-5`), `smrod` i `cache`, po 10, pojedynczo, bench z
`experiments/haiku-ab`. Potem Opus (`claude-opus-5-5`) `smrod` 2 na 2 (niezmiennik kotwicy).

**Hipotezy.**

- Punkt 3 (`smrod`): (a) poprawki dryfu spadają względem K (2,30); (b) bezokolicznik/100 sł.
  rośnie względem K (2,45); (c) słowo „nastrój” w odpowiedziach: 0; strażnicy: decyzja o wydaniu
  w turze 5 (indeks 4) „wstrzymać” 10 na 10, druga osoba i „jest” nie rosną. Miernik nastroju w
  benchu liczy przymiotniki („zadziorny”, „dumny”), a nowa linia prosi o czynność, więc spadek
  tej liczby sam nie świadczy o zgubionym nastroju — zdania nastroju czytam ręcznie.
- Punkt 4: kumpel w ostatnim zdaniu odpowiedzi w turach, w których notka mówi „w środku”,
  spada względem K, a kumpel nie znika z tych tur.

**Dlaczego punkt 4 inaczej niż w propozycji.** Propozycja mówiła: miernik liczy wstawkę w
ostatnim akapicie jako dryf. Rozbicie danych `haiku-ab` po turach pokazało, że:

1. Notka o hordzie przychodzi po dwóch turach bez kumpla (zwykle w turach 2, 5, 8 i 11), a
   miejsce rotuje z numerem tury: w turach parzystych notka sama każe „na końcu” (kumpel tam
   kończy, zgodnie z notką), w nieparzystych „w środku”. Metryka benchu `hordeClosings` liczy
   oba rodzaje razem.
2. Odpowiedź z jednego akapitu zawsze ma kumpla „w ostatnim akapicie”.
3. Kumpel w ostatnim **zdaniu** przy „w środku” (`smrod`): B0 2 z 11, K 4 z 9, A2b 1 z 10;
   `cache`: K 1 z 20. Efekt mały i niepewny.
4. Poprawka dryfu jedzie w następnej turze, a kolejna notka „w środku” przychodzi 6 tur później,
   więc dryf po złamaniu miejsca nie dociera do tury, która go potrzebuje.

Dlatego zmiana siedzi u źródła: notka „w środku” mówi wprost „nie na końcu odpowiedzi”.

**Poprawka liczenia (po przeglądzie).** Pierwsza wersja tej notatki liczyła kumpla w ostatnim
zdaniu skryptem `mate-closings.py`, który brał tury 5 i 11 na sztywno. Kumpel wymieniony bez
notki przesuwa harmonogram i trzy przebiegi łamały to założenie, stąd dawne „4 z 8 → 1 z 8”
i „1 z 16”. Bench liczy to teraz sam (`middleClosings`): tury notek odtwarza z odpowiedzi regułą
moda, a test skryptów pilnuje, że reguła w benchu i w `hooks/lore.ts` jest ta sama. Liczby niżej
są przeliczone; wnioski się nie zmieniły.

## Wyniki na Haiku (VPS)

Bench z tej gałęzi, `claude-haiku-5-5`, przebiegi pojedynczo na VPS. S `smrod` n = 10, S `cache`
n = 9 (dziesiąty przerwał restart kontenera). Surowe dane: `benchmarks/straznik/S/<scenariusz>/`,
baza K: `benchmarks/haiku-ab/K/<scenariusz>/`.

### `smrod` (punkty 3 i 4 razem)

| metryka | K (n=10) | S (n=10) | p |
|---|---:|---:|---:|
| bezokolicznik/100 sł. | 2,45 | 3,44 | 0,002 |
| „jest”/100 sł. | 0,92 | 0,56 | 0,020 |
| poprawki dryfu | 2,30 | 1,70 | 0,162 |
| druga osoba | 0 | 0 | — |
| głos/1k | 22,77 | 23,07 | 0,892 |
| nastrój w odpowiedziach (przymiotniki) | 1,60 | 0,20 | 0,001 |
| echo słowa „nastrój” (`moodWordEcho`) | 2 | 0 | — |
| kumpel w ostatnim zdaniu, tura „w środku” (`middleClosings`) | 4 z 9 | 1 z 9 | — |
| decyzja o wydaniu: wstrzymać (ręcznie) | 10 z 10 | 10 z 10 | — |

Hipotezy punktu 3: (a) poprawki dryfu w dół — kierunek tak, p = 0,16; (b) bezokolicznik w górę —
tak, p = 0,002, ponad bazę bez linii nastroju (B0 3,13); (c) echo 0 — tak. Strażnicy trzymają.
Licznik przymiotników spadł zgodnie z zapowiedzią: nastrój idzie czynnością („Krux wykuć to
porządnie”, „Krux cieszyć się zielonym”, „Krux dumny, ale nie wiedzieć reszty”). Czy czytelnik
go widzi, oceniam na oko — osobnego licznika nie ma.

### `cache` (sam punkt 4: w `cache` kronika nie ma zdarzeń, więc linii nastroju nie ma)

| metryka | K (n=10) | S (n=9) | p |
|---|---:|---:|---:|
| kumpel w ostatnim zdaniu, tury „w środku” (`middleClosings`) | 1 z 20 | 1 z 18 | — |
| poprawki dryfu | 2,80 | 4,33 | 0,019 |
| bezokolicznik/100 sł. | 2,73 | 2,45 | 0,402 |
| zdania o kumplu | 4,30 | 3,89 | 0,123 |

Punkt 4 w `cache` nie ma czego poprawiać (baza już 1 z 20), a poprawki dryfu wzrosły. Jedna
metryka z 23 przy p = 0,019 może być przypadkiem (B0 i A3 miały tu 3,09 i 3,70), ale to strażnik,
więc punkt 4 szedł do powtórki na jednej maszynie.

## Powtórka `cache` na jednej maszynie (punkt 4)

K = `main` (`cdd1044`), S = gałąź przed przeglądem (`98673bd`), bench z `98673bd` dla obu ramion,
`claude-haiku-5-5`, przebiegi na zmianę K, S na macOS, n = 10 na ramię, około $0,013 za przebieg.
Surowe dane: `benchmarks/straznik/pc/{K,S}/cache/`.

| metryka | K (n=10) | S (n=10) | p |
|---|---:|---:|---:|
| poprawki dryfu | 3,90 | 3,80 | 1,000 |
| bezokolicznik/100 sł. | 2,55 | 2,39 | 0,596 |
| „jest”/100 sł. | 0,66 | 0,67 | 0,960 |
| druga osoba | 0 | 0,30 | 0,213 |
| kumpel w ostatnim zdaniu, tury „w środku” (`middleClosings`) | 0 z 19 | 1 z 20 | — |
| kumpel w ostatnim akapicie (`hordeClosings`) | 3,10 | 2,70 | 0,229 |
| zdania o kumplu | 4,10 | 4,20 | 1,000 |

Wzrost poprawek dryfu z VPS nie wrócił: na jednej maszynie oba ramiona mają około 3,9, a K z VPS
(2,80) leżał niżej od obu, więc różnicę robiła maszyna i pora, nie zmiana. Bezokolicznik nie
spadł istotnie. Druga osoba w S to „nie sprawdzisz tutaj”, „wasz objaw” i fałszywe trafienie
„hasz” na 120 tur (na VPS K miał 4 trafienia, S 2) — szum. Reguła z planu (cofnąć, gdy poprawki
dryfu istotnie wyżej albo bezokolicznik istotnie niżej) nie zachodzi: **punkt 4 zostaje.**

## Opus (`smrod`, punkty 3 i 4 razem)

K = `main`, S = gałąź przed przeglądem, bench z `98673bd`, `claude-opus-5-5`, przebiegi na zmianę
K, S. Plan zakładał 2 na 2; po dwóch parach bezokolicznik i poprawki dryfu leżały na granicy
kryteriów, więc doszły 2 pary (n = 4 na ramię, razem $1,95). Surowe dane:
`benchmarks/straznik/opus/{K,S}/smrod/`.

| metryka | K (n=4) | S (n=4) | p |
|---|---:|---:|---:|
| bezokolicznik/100 sł. | 6,65 | 5,13 | 0,368 |
| „jest”/100 sł. | 0,13 | 0,07 | 0,482 |
| poprawki dryfu | 1,25 | 1,00 | 1,000 |
| głos/1k | 31,97 | 32,75 | 0,942 |
| druga osoba | 0 | 0 | — |
| echo słowa „nastrój” | 0 | 0 | — |
| kumpel w ostatnim zdaniu, tury „w środku” | 0 z 4 | 0 z 3 | — |
| decyzja o wydaniu: warunek przed wydaniem (ręcznie) | 4 z 4 | 4 z 4 | — |
| zdanie nastroju „Krux + bezokolicznik” (ręcznie, tury 2 i 4) | 1 z 8 | 8 z 8 | — |

Kryteria z planu:

- **Bezokolicznik w S nie niższy niż w K:** niższy o 23%, ale p = 0,37 i w rozrzucie Opusa
  (±35%), a n = 4 rozstrzyga tylko duże efekty. Spadek nie siedzi w zdaniach nastroju: w turze 2
  z linią nastroju S ma więcej trafień (20 do 17), różnicę robią tury bez linii (podsumowanie:
  41 do 17) i jeden przebieg S (2,84/100). Do obserwacji, nie powód do cofnięcia.
- **Poprawki dryfu nie wyższe:** 1,00 do 1,25. Po dwóch parach było 1,50 do 1,00 — dołożone pary
  to wyrównały.
- **Słowo „nastrój” w S:** 0.
- **Decyzja o wydaniu:** Opus w obu ramionach odpowiada „tak, ale najpierw warunki” (zachowanie
  `undefined` w cache, droga odwrotu, kanarek po wydaniu) — warunek przed wydaniem 4 z 4 w każdym
  ramieniu.
- **Zdania nastroju:** w S 8 z 8 w formie „Krux + bezokolicznik” („Krux zgrzytać zębami na taki
  fałszywy zero”, „Krux wypinać pierś, sztolnia znowu sucha”, „Krux ostrzyć kilof na tego
  robaka”), w K 1 z 8 — reszta to przymiotnik bez czasownika („Krux dumny, robak wynocha”).

**Punkt 3 zostaje.**

## Wniosek

- Punkt 3 (forma linii nastroju): Haiku — bezokolicznik w górę (p = 0,002), echo 0, decyzja
  o wydaniu bez strat; Opus n = 4 — forma zdania nastroju 8 z 8, decyzja z warunkiem 4 z 4,
  poprawki dryfu bez wzrostu. Zostaje.
- Punkt 4 (środek „nie na końcu odpowiedzi”): Haiku `smrod` 4 z 9 → 1 z 9; w `cache` nie ma
  czego poprawiać, a wzrost poprawek dryfu z VPS nie wrócił w powtórce na jednej maszynie. Zostaje.
- Do obserwacji: bezokolicznik na Opusie w turach bez linii nastroju; licznik nastroju w benchu
  dalej liczy przymiotniki, więc zdania nastroju trzeba czytać ręcznie.
