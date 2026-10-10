# Strażnik, horda jako agenci, forma linii nastroju i miejsce kumpla (2026-10-10)

Cztery zmiany po A/B z `docs/research/2026-10-10-haiku-ab.md` (gałąź `experiments/haiku-ab`).
Punkt odniesienia: `main` po PR #2 (`cdd1044`, nastrój z kroniki i słowa fachu kumpli).

## 1. Strażnik ruchu nieodwracalnego

`isDestructive` na `main` łapał 1 z 20 sprawdzonych groźnych komend (`rm -rf build`).
Przepuszczał m.in. `terraform destroy`, `kubectl delete`, `git push --mirror`, `git checkout -- .`,
`git stash clear`, `prisma migrate reset`, `rails db:drop`, `redis-cli FLUSHALL`,
`dd if=/dev/zero of=/dev/sda`. Po zmianie test w `tests/voice.test.ts` trzyma 47 komend z flagą,
5 polskich próśb z linią ryzyka i 24 bezpiecznych sąsiadów bez flagi (`git checkout main`,
`git restore --staged`, `terraform plan`, `docker compose down` bez `-v`, `UPDATE … WHERE`).
Zmiana nie dotyka tekstu dla modelu, więc nie wymaga A/B kotwicy.

## 2. Kumple jako typy subagentów

Plugin nie miał `agents/`, więc kumpel był zwykłym subagentem z imieniem w `description`.
Teraz `agents/{niuch,grom,piryt,ochra,mlot,lont}.md` dają typy `krux-mod:<kumpel>` z fachem,
narzędziami, modelem i formatem raportu. Niuch i Piryt nie mają narzędzi edycji, Młot puszcza
testy bez edycji, Lont rusza tylko pliki śledzone przez git. Niuch i Młot chodzą na `haiku`.

Sprawdzenie na żywo (`claude -p --plugin-dir . --model haiku`): `init` listuje 6 typów
`krux-mod:*`, wywołanie `Agent` z `subagent_type: "krux-mod:niuch"` uruchomiło kumpla, który
zrobił `ls -la agents/` i oddał raport; koszt $0,0044. Bench tego nie mierzy: scenariusze
`cache` i `smrod` nie dają modelowi narzędzia `Agent`.

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
- Punkt 4: kumpel w ostatnim zdaniu odpowiedzi w turach, w których notka mówi „w środku”
  (indeksy 5 i 11), spada względem K (`smrod` t5: 4 z 8; `cache` t5: 0 z 10, t11: 1 z 10),
  a kumpel nie znika z tych tur.

**Dlaczego punkt 4 inaczej niż w propozycji.** Propozycja mówiła: miernik liczy wstawkę w
ostatnim akapicie jako dryf. Rozbicie danych `haiku-ab` po turach pokazało, że:

1. Notka o hordzie przychodzi w turach 2, 5, 8 i 11, a miejsce rotuje: w turach 2 i 8 notka
   sama każe „na końcu” (kumpel tam kończy 9/9 i 10/10 — zgodnie z notką), w turach 5 i 11
   „w środku”. Metryka benchu `hordeClosings` liczy oba rodzaje razem.
2. Odpowiedź z jednego akapitu zawsze ma kumpla „w ostatnim akapicie” (K `smrod` t5: 3 z 8).
3. Kumpel w ostatnim **zdaniu** przy „w środku”: B0 2 z 9, K 4 z 8, A2b 1 z 10 (`smrod` t5);
   `cache` t5 1 vs 0, t11 1 vs 1. Efekt mały i niepewny.
4. Poprawka dryfu jedzie w następnej turze, a kolejna notka „w środku” przychodzi 6 tur później,
   więc dryf po złamaniu miejsca nie dociera do tury, która go potrzebuje.

Dlatego zmiana siedzi u źródła: notka „w środku” mówi wprost „nie na końcu odpowiedzi”.

## Wyniki na Haiku

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
| echo słowa „nastrój” (`mate-closings.py`) | 2 | 0 | — |
| kumpel w ostatnim zdaniu, tura „w środku” | 4 z 8 | 1 z 8 | — |
| decyzja o wydaniu: wstrzymać (ręcznie) | 10 z 10 | 10 z 10 | — |

Hipotezy punktu 3: (a) poprawki dryfu w dół — kierunek tak, p = 0,16; (b) bezokolicznik w górę —
tak, p = 0,002, ponad bazę bez linii nastroju (B0 3,13); (c) echo 0 — tak. Strażnicy trzymają.
Licznik przymiotników spadł zgodnie z zapowiedzią: nastrój idzie czynnością („Krux wykuć to
porządnie”, „Krux cieszyć się zielonym”, „Krux dumny, ale nie wiedzieć reszty”). Czy czytelnik
go widzi, oceniam na oko — osobnego licznika nie ma.

### `cache` (sam punkt 4: w `cache` kronika nie ma zdarzeń, więc linii nastroju nie ma)

| metryka | K (n=10) | S (n=9) | p |
|---|---:|---:|---:|
| kumpel w ostatnim zdaniu, tury „w środku” (5 i 11) | 1 z 20 | 1 z 16 | — |
| poprawki dryfu | 2,80 | 4,33 | 0,019 |
| bezokolicznik/100 sł. | 2,73 | 2,45 | 0,402 |
| zdania o kumplu | 4,30 | 3,89 | 0,123 |

Punkt 4 w `cache` nie ma czego poprawiać (baza już 1 z 20), a poprawki dryfu wzrosły. Jedna
metryka z 23 przy p = 0,019 może być przypadkiem (B0 i A3 miały tu 3,09 i 3,70), ale to strażnik,
więc punkt 4 zostaje niepewny: osobny commit, do powtórki przed merge (plan w `docs/plans/`).

### Wniosek

- Punkt 3 (forma linii nastroju): na Haiku poprawa gramatyki bez strat w decyzji. Do Opusa 2 na 2.
- Punkt 4 (środek „nie na końcu odpowiedzi”): w `smrod` 4 z 8 → 1 z 8, w `cache` bez zysku i ze
  wzrostem poprawek dryfu. Powtórzyć `cache` K i S po 10 na jednej maszynie; gdy wzrost dryfu
  wróci, cofnąć commit punktu 4.
