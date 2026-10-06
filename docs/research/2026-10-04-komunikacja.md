# Komunikacja moda w świetle badań — 2026-10-04

Notatka do zmian w `voice/persona.md`, `hooks/voice.ts` i `scripts/voice-bench.mjs`. Każda zmiana ma źródło i pomiar A/B na scenariuszu `cache` (`node scripts/voice-bench.mjs --model claude-opus-5-5`, 2 przebiegi na wariant).

## Źródła i co z nich wynika dla moda

| Źródło | Wynik | Wniosek dla moda |
|---|---|---|
| Li i in. 2024, *Measuring and Controlling Persona Drift in Language Model Dialogs* ([arXiv:2402.10962](https://arxiv.org/abs/2402.10962)) | Persona z promptu systemowego wyraźnie dryfuje w ciągu 8 rund; przyczyną jest zanik uwagi na odległe tokeny. | Potwierdza kotwicę w turze użytkownika i pełne odświeżenie co `REFRESH_TURNS = 6` (< 8). Bez zmian. |
| Jaroslawicz i in. 2025, *How Many Instructions Can LLMs Follow at Once?* (IFScale, [arXiv:2507.11538](https://arxiv.org/abs/2507.11538)) | Zgodność spada wraz z liczbą jednoczesnych instrukcji; modele faworyzują instrukcje wcześniejsze. | Kotwica ma mieć mało reguł, najważniejsze na początku. Reguła o hordzie wypada z kotwicy (zob. niżej), gramatyka zostaje z przodu. |
| Van Koevering, Kleinberg 2024, *How Random is Random?* ([arXiv:2406.00092](https://arxiv.org/abs/2406.00092)) | Modele nie umieją zachowywać się losowo; powielają ludzkie skrzywienia. | „Co kilka odpowiedzi” to instrukcja częstotliwości, której model nie wykona. Częstotliwość wstawki o hordzie ustala kod (`lifeNote`, `QUIET_TURNS`), model dostaje decyzję, nie prawdopodobieństwo. |
| Xu i in. 2022, *Learning to Break the Loop* ([arXiv:2206.02369](https://arxiv.org/abs/2206.02369)) | Powtórzenia zdań same się wzmacniają: im częściej zdanie stoi w kontekście, tym większa szansa na kolejne. | Szablonowe zamknięcie („Morra powie „zgoda””) rośnie z turą. Persona zakazuje zamykania tą samą formułą co poprzednio; bench liczy `repeatedClosings`. |
| Ali, Wolf, Titov 2024, *Mitigating Copy Bias in In-Context Learning* ([arXiv:2410.01288](https://arxiv.org/abs/2410.01288)) | Model kopiuje powierzchnię przykładów zamiast wzorca. | Pary „Ludzie/Krux” uczą też zamknięć („Zgoda?”, „Morra powie…”). Reguła wprost: o zgodę tylko, gdy krok czeka na decyzję. |
| Zheng i in. 2024, *When “A Helpful Assistant” Is Not Really Helpful* ([arXiv:2311.10054](https://arxiv.org/abs/2311.10054)) | Persona w prompcie systemowym nie poprawia trafności odpowiedzi. | Persona to wyłącznie powierzchnia. Merytoryka nie może na niej cierpieć. |
| Tam i in. 2024, *Let Me Speak Freely?* ([arXiv:2408.02442](https://arxiv.org/abs/2408.02442)) | Ograniczenia formy wyjścia obniżają jakość rozumowania; pomaga podejście „najpierw naturalnie, potem forma”. | Nowa reguła kontraktu: myśleć i planować zwykłą polszczyzną, głos nakładać dopiero na odpowiedź. |
| Han i in. 2024, *Token-Budget-Aware LLM Reasoning* ([arXiv:2412.18547](https://arxiv.org/abs/2412.18547)) | Budżet w prompcie skraca wyjście; za mały budżet bywa przekraczany („token elasticity”). | Limity słów w `FORMAT_HINT` zostają umiarkowane (100–200), nie schodzimy niżej. |
| Kim i in. 2025, *One ruler to measure them all* (OneRuler, [arXiv:2503.01996](https://arxiv.org/abs/2503.01996)) | Polski wypadł najlepiej z 26 języków w zadaniach długiego kontekstu; język instrukcji zmienia wynik nawet o 20%. | Instrukcje po polsku, w tym samym języku co odpowiedź — zostaje. |
| *The Tokenizer Tax Across 25 European Languages* ([arXiv:2605.24718](https://arxiv.org/abs/2605.24718)); Bielik v3 ([arXiv:2604.10799](https://arxiv.org/abs/2604.10799)) | Polski kosztuje 2,2–3,3 tokena na słowo w uniwersalnych tokenizerach; płodność słabo przewiduje trafność. | Zgodne z pomiarem moda (gramatyka orka tokenowo obojętna). Oszczędza tylko krótsza odpowiedź, więc budżety długości zostają. |

## Zmiany

1. `VOICE_ANCHOR` bez zdania o życiu hordy. Kotwica niesie tylko gramatykę i dane dosłowne, a decyzję o wstawce podejmuje `lifeNote`.
2. `voice/persona.md`: kumpel odzywa się tylko w turze z notką „Życie hordy”, gdy Krux naprawdę go wysyła albo gdy Morra pyta o życie Kruxa. Dwie nowe reguły kontraktu: rozumowanie bez głosu; bez powtarzanego zamknięcia, zgoda tylko przy decyzji.
3. Przykłady persony bez trzykrotnego „Morra powie…” na końcu.
4. `hooks/lore.ts`: `lifeNote` podaje formę wstawki (cytat kumpla, jego robota, docinek do Kruxa, scenka) wybraną z numeru tury. Bez tego wszystkie wstawki brzmiały „<Imię> dziś …”.
5. `scripts/voice-bench.mjs`: metryki `repeatedClosings` (tury, których ostatnie zdanie zaczyna się jak zamknięcie którejś wcześniejszej), `consentClosings` (tury kończące się prośbą o zgodę) i `repeatedHordeOpenings` (wstawki o hordzie zaczynające się jak wcześniejsza).

## Pomiar

Scenariusz `cache`, `claude-opus-5-5`, 12 tur. Raporty w `benchmarks/voice-bench/2026-10-04*` (pole `anchorNote`).

| Wariant | Przebiegi | Bezokoliczniki / 100 słów | Powtórzone zamknięcia | Powtórzone otwarcia hordy | Tury z hordą | Widoczne tokeny | Koszt |
|---|---|---|---|---|---|---|---|
| Baza (8d1579a) | 2 | 6,88 / 7,26 | 2 / 3 | 3 / 2 | 4 / 4 | 4936 / 5089 | $0,31 |
| A: kotwica bez hordy, reguły persony | 2 | 6,62 / 7,58 | 2 / 3 | 2 / 2 | 4 / 4 | 4965 / 5011 | $0,31 |
| B: A + przykłady bez „Morra powie” | 2 | 7,97 / 7,81 | 0 / 0 | 3 / 3 | 4 / 4 | 4784 / 5180 | $0,31 |
| C: B + forma wstawki z kodu | 4 | 7,75 / 4,56 / 7,06 / 8,21 | 0 / 0 / 0 / 0 | 0 / 0 / 2 / 0 | 4 we wszystkich | 4767–5071 | $0,30–0,32 |
| D: C + para kontrastowa w `VOICE_SHORT` | 2 | 9,08 / 7,37 | 0 / 1 | 1 / 0 | 4 / 4 | 4941 / 4915 | $0,31 |

Wniosek: sama reguła w kontrakcie (A) nie zmienia zamknięć; zmienia je dopiero usunięcie wzorca z przykładów (B) — zgodnie z copy bias. Bezokoliczniki wahają się między przebiegami od 4,6 do 8,5 także przy tej samej kotwicy; spadek w jednym przebiegu C to dryf przy `VOICE_SHORT` w turach 5–7, nie wstawka o hordzie (ta siedzi w turach 3, 6, 9, 12).

Wariant D: krótka kotwica dostała parę „Robak siedzieć w pętli”, nie „Robak siedzi” — tę samą, która w pełnej kotwicy trzyma bezokoliczniki. W środku sesji (tury 4–9) 62 / 44 trafień bezokolicznika wobec 56 / 22 / 47 / 52 w C, poprawek dryfu 0 / 0 wobec 2 / 2 / 0 / 0.

## Dalej do sprawdzenia

- Więcej przebiegów na wariant: rozrzut bezokoliczników między przebiegami (4,6–9,1) jest tego samego rzędu co różnice między wariantami; 2 na 2 wykrywa tylko duże efekty.
- Scenariusz z edycją i testami (bench ma tylko `Read`, `Glob`, `Grep`), żeby zmierzyć notki z kroniki (smród, commit) i dymki.

## 2026-10-06: przegląd głosu i hordy

Przegląd warstwy głosu na danych: 575 odpowiedzi z historii sesji tego repo (194 dość długie, by miernik je sądził), 8 benchów z 2026-10-04 i 2026-10-05 oraz sonda na kodzie moda. Zmiany:

1. Miernik (`hooks/gauge.ts`) nie sądzi ostrzeżenia przed ruchem nieodwracalnym ani cytatu `>`. Sonda pokazała, że poprawne ostrzeżenie przed `git push --force` dawało w następnej turze „Ciąć do 8 słów” i przepis „Morra nie mieć lokalnie”, a neutralny opis PR wracał jako „Krux dodać obsługę…”. Punkt listy i nagłówek kończą zdanie. Rzeczowniki na „-łem” nie liczą się jako pierwsza osoba: „zawałem” wracało w kotwicy jako „Krux zawać”. Rzeczowniki na „-ość” nie liczą się jako bezokolicznik. Pierwsza osoba czasu teraźniejszego („Widzę”, „Polecam”) liczy się jak „-łem”. Na 194 odpowiedziach historii flag było 69, teraz 52; samych `long-sentences` 57, teraz 36.
2. Linia ryzyka (`riskHint`, `RISK_HINT`): prośba o skasowanie danych albo historii dostaje przypomnienie kontraktu zamiast notki o hordzie. Kotwica co turę przypominała gramatykę, a wyjątek bezpieczeństwa żył tylko w prompcie systemowym.
3. Notka o hordzie: charakter kumpla (`trait` w `ROSTER`), miejsce wstawki z kodu (w środku albo na końcu) i bez „jeśli pasuje”, bo model wykonał 32 z 32 notek i 31 z nich postawił w ostatnim akapicie. Fakt ma każdy fach (budowanie Grom, pliki interfejsu Ochra, rozbiórka Lont), a spośród kumpli z faktem wybiera seed. W historii 4 z 7 wstawek mówił Piryt, dwa razy tym samym żartem o liczbie commitów.
4. Persona: Morra bez rodzaju („Morra wybrać”, w historii były „Morra przyszedł”, „wybrał… i sam”), przykład bez dopisanej granicy „Krux nie umie chrome”, teksty do wklejenia w bloku kodu albo w cytacie `>`.
5. Dymki i notki: liczba przy bezokoliczniku albo w etykiecie („2 na 2 padać”, „padłe: 2”) zamiast „po 1 smrodach” i „padły 1 razy”. Kumpel na scenie reaguje na wynik własnej roboty.
6. Bench: metryka `hordeClosings`, czyli tury, w których wstawka o hordzie stoi w ostatnim akapicie.

### Pomiar

Scenariusz `cache`, `claude-opus-5-5`, 12 tur, przebiegi równolegle. Baza to HEAD `dfe619a` z `git archive`, wariant to drzewo robocze ze zmianami powyżej. Raporty w `benchmarks/voice-bench/2026-10-06*`.

| Wariant | Przebiegi | Bezokoliczniki / 100 słów | Wstawka w ostatnim akapicie | Powtórzone zamknięcia | Powtórzone otwarcia hordy | Zgoda na końcu | Druga osoba | Widoczne tokeny | Koszt |
|---|---|---|---|---|---|---|---|---|---|
| Baza | 2 | 9,81 / 6,98 | 4 z 4 / 4 z 4 | 0 / 0 | 0 / 0 | 1 / 2 | 0 / 0 | 5238 / 5246 | $0,35 / $0,33 |
| Wariant | 4 | 7,07 / 6,41 / 7,59 / 6,42 | 2 z 4 w każdym | 0 we wszystkich | 0 we wszystkich | 1 / 4 / 1 / 3 | 0 we wszystkich | 5112–5395 | $0,32–0,33 |

Wniosek: miejsce z kodu działa zgodnie z planem. Wstawka kończy 8 z 16 odpowiedzi zamiast 8 z 8, a w benchach z 2026-10-04 i 2026-10-05 — 31 z 32. Charakter widać w samych wstawkach: Niuch mówi półsłówkami („tam… szpara”), Młot liczy „sam, dwa razy”, Piryt pyta o pęknięcie w kilofie. Druga osoba, powtórzone zamknięcia i koszt bez zmian. Bezokoliczników średnio mniej: 6,87 wobec 8,40 w bazie z dziś i 7,80 razem z dwoma przebiegami `repo` z 2026-10-05 (7,49 / 6,91), które mają te same teksty dla modelu. Rozrzut mieści się jednak w historycznym (4,6–9,8), a test Manna–Whitneya przy 4 na 4 przebiegi daje U = 5, czyli bez istotności. Więcej zgód na końcu (średnio 2,25 wobec 1,5) pasuje do tego, że wstawka zwolniła ostatni akapit w połowie tur.

### Rozdzielenie

Po commicie `b3751fb` dwa warianty po 2 przebiegi, każdy z jedną zmianą cofniętą: nowa wersja ze starą personą (`dfe619a:voice/persona.md`) i nowa wersja ze starą notką o hordzie (z „jeśli pasuje”, bez charakteru i miejsca). Raporty `benchmarks/voice-bench/2026-10-06T10-1*`, razem $1,29.

| Wariant | Przebiegi | Bezokoliczniki / 100 słów | Średnio | Wstawka w ostatnim akapicie | Zgoda na końcu |
|---|---|---|---|---|---|
| Baza (`dfe619a`) | 2 | 9,81 / 6,98 | 8,39 | 4 z 4 / 4 z 4 | 1 / 2 |
| Nowa wersja | 4 | 7,07 / 6,41 / 7,59 / 6,42 | 6,87 | 2 z 4 w każdym | 1 / 4 / 1 / 3 |
| Nowa, stara persona | 2 | 6,96 / 6,07 | 6,52 | 2 z 4 / 2 z 4 | 2 / 3 |
| Nowa, stara notka | 2 | 7,46 / 7,20 | 7,33 | 4 z 4 / 4 z 4 | 2 / 2 |

Wniosek: persona odpada jako przyczyna, bo jej cofnięcie nie podnosi bezokoliczników. Cofnięcie notki daje 7,33, czyli między nową wersją a bazą. Wszystkie przebiegi z nową notką (6) wobec wszystkich ze starą (4): U Manna–Whitneya = 4, próg istotności przy jednym ogonie to 3, więc dalej szum, choć blisko. Bez odstającego 9,81 baza ma 6,98, a dwa przebiegi `repo` z 2026-10-05 — 7,49 i 6,91; razem średnio 7,13, mniej więcej tyle, co nowa wersja z cofniętą notką (7,33).

### Dalej do sprawdzenia

- Notka o hordzie: charakter kumpla stoi w niej czasem teraźniejszym („węszy wszędzie”). Bezokolicznik („węszyć wszędzie”) też nie ma rodzaju, a nie podsuwa modelowi formy osobowej. Sprawdzić 2 na 2 przeciw obecnej notce.
- Zgody na końcu po zwolnieniu ostatniego akapitu: czy `consentClosings` rośnie także poza turami 10 i 11, w których scenariusz o zgodę sam prosi.
