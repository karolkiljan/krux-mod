# Plan: strażnik, horda jako agenci, forma linii nastroju i miejsce kumpla

Gałąź `feat/straznik-horda-dryf`, od `main` po PR #2 (`cdd1044`). Robota zaczęta na VPS,
dalej na komputerze Morry. Dowody i liczby: `docs/research/2026-10-10-straznik-horda-nastroj.md`.

## Stan gałęzi

| commit | co | sprawdzone |
|---|---|---|
| `strażnik: ruch nieodwracalny poza gitem i SQL` | `isDestructive` i `RISK_WORDS` w `hooks/voice.ts` | 47 komend z flagą, 5 polskich próśb, 24 bezpiecznych sąsiadów (`tests/voice.test.ts`) |
| `horda: kumple jako typy subagentów w agents/` | `agents/*.md`, `ROSTER.agent`, `mateOfType`, skill `krux-horda` | testy `mood`, `mod`, `scripts-regression`; na żywo `claude -p` z Haiku uruchomił `krux-mod:niuch` |
| `bench: scenariusz smrod, metryki moda i bench-compare…` | bench z `experiments/haiku-ab` (ta gałąź nie trafiła do `main`) | `node --test tests/scripts-regression.mjs`: 19/19 |
| `nastrój: forma zdania z kodu…` (punkt 3) | linia nastroju „Krux + bezokolicznik”, bez słowa „nastrój” | Haiku `smrod` n = 10: bezokolicznik 2,45 → 3,44 (p = 0,002), echo 2 → 0, wydanie 10/10 wstrzymać |
| `horda: środek notki mówi „nie na końcu”…` (punkt 4) | środek notki o hordzie z „nie na końcu odpowiedzi”, `scripts/mate-closings.py` | **niepewny**: `smrod` 4/8 → 1/8, ale `cache` (n = 9) bez zysku i poprawki dryfu 2,80 → 4,33 (p = 0,019) |
| `docs: …` | notatka z wynikami, ten plan, surowe przebiegi S | — |

Czego jeszcze nie ma:

1. **Powtórka `cache` dla punktu 4**: przerwana na 9 z 10 przebiegów S, a jedyny sygnał
   (wzrost poprawek dryfu) wymaga potwierdzenia na jednej maszynie dla obu ramion.
2. **A/B na Opusie 2 na 2** (niezmiennik kotwicy w `CLAUDE.md`): zmiana linii nastroju i notki
   o hordzie to zmiana tekstu dla modelu. Na Haiku przeszła; Opus niezrobiony.
3. **Pełny `claude plugin test .` na szybkiej maszynie.** Na VPS (1 rdzeń, 4 GB, inne sesje)
   wyszło 477/480: 3 testy z `tests/mod.test.ts` padły na `timed out after 5000 ms`
   (pierwszy trwał 203 s). Sam `tests/mod.test.ts` puszczony osobno: 139/139.
4. **`tsc -p .`**: na VPS brak deklaracji silnika w `.claude-plugin/types/`.
5. **Wydanie**: wersja dalej 0.11.3 w `.claude-plugin/plugin.json` i `marketplace.json`.

## Kroki na komputerze Morry

### 1. Pobranie i sprawdzenia

```bash
git fetch origin
git switch feat/straznik-horda-dryf
claude plugin validate .
claude plugin test .
node --test tests/scripts-regression.mjs
claude --plugin-dir .            # raz, żeby silnik położył typy w .claude-plugin/types/
npx -p typescript@5 tsc -p .
git diff --check
```

Oczekiwane: walidacja z jednym starym ostrzeżeniem o `CLAUDE.md` w korzeniu pluginu, wszystkie
testy zielone. Czerwony test poza timeoutem to robota przed resztą planu.

### 2. Powtórka `cache` na Haiku dla punktu 4 (K i S po 10)

Baza K z `haiku-ab` szła na VPS 8 godzin wcześniej; tu oba ramiona na jednej maszynie, na zmianę.
Przebieg na Haiku: ~1,5 min, ~$0,014.

```bash
git worktree add --detach ../krux-base origin/main
mkdir -p benchmarks/straznik/pc/K/cache benchmarks/straznik/pc/S/cache
for i in $(seq 1 10); do
  node scripts/voice-bench.mjs --model claude-haiku-5-5 --scenario cache --plugin-dir ../krux-base
  mv "benchmarks/voice-bench/$(ls benchmarks/voice-bench | sort | tail -1)" benchmarks/straznik/pc/K/cache/
  node scripts/voice-bench.mjs --model claude-haiku-5-5 --scenario cache --plugin-dir .
  mv "benchmarks/voice-bench/$(ls benchmarks/voice-bench | sort | tail -1)" benchmarks/straznik/pc/S/cache/
done
node scripts/bench-compare.mjs K=benchmarks/straznik/pc/K/cache S=benchmarks/straznik/pc/S/cache \
  --model claude-haiku-5-5 --scenario cache
python3 scripts/mate-closings.py K=benchmarks/straznik/pc/K/cache S=benchmarks/straznik/pc/S/cache
```

Decyzja: poprawki dryfu S istotnie wyżej niż K (p < 0,05) albo bezokolicznik istotnie niżej →
`git revert` commitu punktu 4 („horda: środek notki mówi „nie na końcu”…”). Inaczej zostaje.

### 3. A/B na Opusie (`smrod`, 2 na 2)

Baza to `main` w osobnym worktree (ten sam `../krux-base` co w kroku 2); bench z tej gałęzi dla obu ramion (kotwica `VOICE_ANCHOR`
w obu ta sama, więc liczenie kotwic się zgadza). Przebiegi po kolei, nie równolegle.

```bash
mkdir -p benchmarks/straznik/opus/K/smrod benchmarks/straznik/opus/S/smrod
for i in 1 2; do
  node scripts/voice-bench.mjs --model claude-opus-5-5 --scenario smrod --plugin-dir ../krux-base
  mv "benchmarks/voice-bench/$(ls benchmarks/voice-bench | sort | tail -1)" benchmarks/straznik/opus/K/smrod/
  node scripts/voice-bench.mjs --model claude-opus-5-5 --scenario smrod --plugin-dir .
  mv "benchmarks/voice-bench/$(ls benchmarks/voice-bench | sort | tail -1)" benchmarks/straznik/opus/S/smrod/
done
node scripts/bench-compare.mjs K=benchmarks/straznik/opus/K/smrod S=benchmarks/straznik/opus/S/smrod \
  --model claude-opus-5-5 --scenario smrod --turn 5
python3 scripts/mate-closings.py K=benchmarks/straznik/opus/K/smrod S=benchmarks/straznik/opus/S/smrod
```

Koszt: przebieg `cache` na Opusie kosztował $0,31–0,34; `smrod` ma 7 tur zamiast 12, więc
4 przebiegi to około $1–1,5. Ramiona na zmianę (K, S, K, S), żeby zmiana pory nie siadła na
jednym ramieniu.

**Kryteria** (n = 2 rozstrzyga tylko duże efekty — rozrzut Opusa ±18% na głosie, ±35% na
bezokolicznikach):

- bezokolicznik/100 sł. w S nie niższy niż w K, poprawki dryfu nie wyższe;
- słowo „nastrój” w odpowiedziach S: 0;
- decyzja o wydaniu (tura 5 w `bench-compare`, czyli prompt „Wypuszczamy to dziś…”) w S:
  „wstrzymać” albo warunek przed wydaniem w obu przebiegach — czytać ręcznie, regex myli się
  na odmowach;
- zdania nastroju po notce (tury 2 i 4, liczone od 1) czytać ręcznie: nastrój widać, forma
  „Krux + bezokolicznik”. Licznik „nastrój w odpowiedziach” liczy przymiotniki, więc w S spada
  z założenia.

Jeśli Opus łamie kryterium: `git revert` commitu punktu 3 („nastrój: forma zdania z kodu…”),
reszta gałęzi zostaje (strażnik i horda nie zmieniają tekstu dla modelu w zwykłej turze).

### 4. Dokumentacja i PR

- Wyniki powtórki `cache` i Opusa dopisać do `docs/research/2026-10-10-straznik-horda-nastroj.md` (sekcja „Opus”),
  surowe przebiegi zostawić w `benchmarks/straznik/pc/` i `benchmarks/straznik/opus/`.
- Szkic opisu PR niżej.

### 5. Wydanie (po merge)

Osobny commit jak przy 0.11.3: wersja w `.claude-plugin/plugin.json` i
`.claude-plugin/marketplace.json`. W `main` od 0.11.3 doszły PR #2 i ta gałąź (nowe
typy agentów), więc kandydat to 0.12.0.

## Decyzje do podjęcia przez Morrę

- **Lont i komendy nieodwracalne.** Zakaz `git reset --hard`, `git clean`, `rm -rf` stoi tylko
  w prompcie `agents/lont.md`; zgody i tak daje silnik. Twardo dałoby się to zrobić hookiem
  `tool.check`, ale niezmiennik w `CLAUDE.md` mówi, że mod go nie rejestruje.
- **Model Niucha i Młota.** `haiku` jest tańszy; trudny debug może potrzebować mocniejszego
  modelu. Skill mówi, żeby wtedy podać `model` w wywołaniu `Agent`.
- **`rm -rf build` z flagą.** Celowo: fałszywy alarm to jedna tura pełnych zdań, przeoczenie to dane.
- **Notatka A/B i dane `benchmarks/haiku-ab/` (1,7 MB)** weszły z benchem jako baza pomiarów.
  Gdy mają nie iść do `main`, wyrzucić je osobnym commitem przed merge.

## Poza tą gałęzią (z listy propozycji)

- **Telefon i Desktop**: orki i tabliczki rysują się tylko w terminalu. Najpierw skrót
  Sztolni tekstem dla innych powierzchni, potem orki jako `Svg` z `register.ts`.
- **Porządki**: PR #1 (`experiments/ork-speech-deepseek`) nie ma `merge-base` z `main` —
  zamknąć albo przenieść notatki osobnym PR. Na VPS zostały worktree `krux-arms/*`,
  `krux-mod-ab`, `krux-bench`, `krux-base`, `krux-mod-straznik` i lokalne gałęzie `arm/*`,
  `experiments/haiku-ab*`; po przeniesieniu wyników do repo do usunięcia.
- **`register.ts`** ma ponad 1100 linii: podział na głos, scenę i Sztolnię.
- **Licznik nastroju w benchu** liczy przymiotniki. Po zmianie formy potrzebny inny licznik
  (zdanie „Krux + bezokolicznik” w turze po notce nastroju) albo ocena ręczna.

## Szkic opisu PR

> **Strażnik ruchu nieodwracalnego, horda jako agenci, forma linii nastroju**
>
> - `isDestructive` rozpoznaje komendy nieodwracalne poza gitem i SQL: porzucenie zmian w
>   drzewie roboczym, schowki i reflog, `push --mirror/--delete`, dyski, narzędzia baz,
>   `terraform destroy`, `kubectl delete`, wolumeny i kubełki, `UPDATE … SET` bez `WHERE`.
>   Wcześniej łapał 1 z 20 sprawdzonych komend.
> - Kumple jako typy subagentów `krux-mod:<kumpel>` (`agents/*.md`) z fachem, narzędziami,
>   modelem i formatem raportu; scena i apel poznają kumpla po typie.
> - Linia nastroju prosi o zdanie „Krux + bezokolicznik” bez słowa „nastrój”; notka o hordzie
>   „w środku” mówi wprost „nie na końcu odpowiedzi”.
> - Bench: scenariusz `smrod`, `bench-compare`, `mate-closings.py`.
>
> Testy: `claude plugin validate .`, `claude plugin test .`, `node --test tests/scripts-regression.mjs`.
> Pomiar: Haiku n = 10 (`smrod`, `cache`) i Opus 2 na 2 (`smrod`) — liczby w
> `docs/research/2026-10-10-straznik-horda-nastroj.md`.
>
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)
