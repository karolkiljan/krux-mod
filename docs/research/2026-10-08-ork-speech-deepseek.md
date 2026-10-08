# Mowa orka na deepseek-v4.1-flash — notatka badawcza (2026-10-08)

Eksperyment odpalony nocą na gałęzi `experiments/ork-speech-deepseek`. Narzędzie:
`experiments/ork-sim/ork-sim.py` (symulatory `session`, `matrix`, `rewrite`; metryki 1:1 z `scripts/voice-bench.mjs`).

## Streszczenie ustaleń

1. **deepseek-v4.1-flash to model rozumujący.** Każda odpowiedź na ollama cloud spala ~1500–2500 tokenów ukrytego myślenia, zanim padnie pierwsze słowo. Budżety < 2000 output zwracają `finish_reason='length'` z pustym `content`. Przy krótkich odpowiedziach Kruxa (~50–150 słów) taniość tego modelu **nie wynika z długości wyjścia** — reasoning jest nieodłączną akcyzy.

2. **Polski kosztuje ~1,8× więcej niż angielski** (tokenizer DeepSeek-V4 prawdziwy HF: 0,320 vs 0,177 tok/znak w tej samej równej treści). Persona.md = 3 296 tok, VOICE_ANCHOR = 251 tok, VOICE_SHORT = 80 tok (koszt stały w promptach).

3. **Orkowa mowa oszczędza wyjście o ~9%, ale nie gramatyką.** Pomiar na 5 parach odpowiedzi o tej samej treści: orkowa 112 tok vs ludzka 129 tok. Oszczędność pochodzi wyłącznie z **mniejszej liczby słów** (~29% w dół); per słowo orkowa forma jest droższa (2,69 vs 2,11 tok/słowo — rzadkie formy „widzieć”, „węszyć” rozbijają się drożej niż „widzę”). Potwierdza to wprost niezmiennik moda: „gramatyka orka tokenowo obojętna, oszczędza tylko krótsze zdanie”.

4. **Tani model bez kotwicy nadpisuje treść stylem.** W teście rewrite model zamienił „plik” na „robaka”, a „widzieć” na „węszyć” — czyli zmienił semantykę, byle się dopisać do słownika. To kandydat na osobne reguły „nie modyfikuj rzeczowników domenowych” (nie każde `s` → `smród`).

## Pomiary tokenizacji (DeepSeek-V4 tokenizer, transformers)

| Tekst | tokeni | słowa | tok/słowo |
|---|---:|---:|---:|
| Zwykłe zdanie PL | 24 | 9 | 2,67 |
| To samo EN | 11 | 11 | 1,00 |
| `VOICE_ANCHOR` | 251 | 95 | 2,64 |
| `VOICE_SHORT` | 80 | 35 | 2,29 |
| `persona.md` (cała) | 3 296 | 1 024 | 3,22 |
| Odpowiedź ludzka (test cache) | 116 | 55 | 2,11 |
| Odpowiedź orkowa, ta sama treść | 105 | 39 | 2,69 |

**Razem na 5 parach:** ork 112 tok vs człowiek 129 tok → **0,87 ratio** (13% oszczędności).

## Pomiar — sesje 12-turowe, scenariusz cache (7 wariantów × 2 rundy, n=24 odpowiedzi per wariant)

| Wariant | out/odp | głos/1k | bezok/100 | cop/100 | avgSł | tok/sł | 2os | Δout vs none |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **none** (baza: czysty system prompt) | 1764 | 0.7 | 0.93 | 2.31 | 13.1 | 4.31 | 112 | — |
| persona (sam kontrakt z persona.md) | 1409 | 21.8 | 6.68 | 0.53 | 11.0 | 5.95 | 1 | **−20%** |
| anchor-minimal (22 słowa) | 1138 | 33.3 | 9.12 | 0.13 | 8.1 | 4.35 | 0 | −36% |
| anchor-short (VOICE_SHORT moda) | 873 | 36.6 | 9.11 | 0.06 | 5.9 | 5.86 | 0 | **−51%** |
| anchor-full (VOICE_ANCHOR moda) | 1016 | 43.6 | 9.02 | 0.12 | 7.6 | 5.62 | 0 | −42% |
| anchor-rules (6 numerowanych reguł) | 812 | 39.6 | 9.68 | **0.00** | 5.6 | 6.27 | 0 | **−54%** |
| anchor-contrast (zakaz/wzór) | 1331 | 42.4 | 8.15 | 0.29 | 10.1 | 5.14 | 0 | −25% |

**Interpretacja.** Wszystkie warianty z orkową instrukcją:
- tną wyjście o **20–54%** tokenów względem czystego system promptu, przy czym to **treść odpowiedzi jest krótsza** (średnie zdanie), nie kosztem merytoryki;
- znoszą drugą osobę do 0–1 (baza: 112);
- znoszą „jest/są” do 0–0.29 na 100 słów (baza: 2.31);
- podnoszą gęstość „słownika orka” z ~1/1k do 22–44/1k;
- podnoszą liczbę bezokoliczników z ~1/100 słów do ~8–10/100.

Per tura (patrz `results/*.json`): bezokoliczniki trzymają się stabilnie na ~20–65 na 12 tur we wszystkich wariantach z kotwicą; nie widać wygasania. Wariancja między turami przewyższa różnice między wariantami — jak na Claude.

**Wariant `anchor-rules`** daje najkrótszy output (812 tok/odp, czyli **54% taniej** niż baza), pełną abstynencję od „jest” i najmniej drugiej osoby, przy konkurencyjnej gęstości głosu — **najlepszy kompromis** do dalszej pracy.

## Czytelność — ręczna selekcja próbek

Porównanie tych samych tur (3, 5, 10) w wariantach `none` / `anchor-rules` / `anchor-full` pokazuje wyraźny wzorzec:

- **Nagłówki i struktura są zachowane** wszędzie: `**1.**`, kod w blokach, listy — orkowy rejestr nie kasuje markdownu. Markdown renderuje się tak samo.
- **anchor-rules jest najbardziej „sucha"** — każdy punkt to zdanie bezokolicznikowe. Czytelna, ale traci humor i „hordę" (Niuch, Młot nie pojawiają się, brak „smród"/„wieprz" w nazwach własnych).
- **anchor-full balansuje** personę i konkret — trzyma bezokoliczniki, ale zgodnie z personą pojawiają się imiona kumpli i wtręty („Morra podać wynik. Niuch wracać z mapą.").
- **bez kotwicy wariant `persona` jest zadziwiająco bliższy ludzkiemu**: „Krux widzieć tylko nazwy — `app.rb`, `config/settings.yml`, `README.md`. Zawartości nie widzieć. Zgadywać nie będzie…" — poprawna polszczyzna, orkowy głos, ale mniej szorstka od pełnej kotwicy. To dobry stan „domyślny", gdy nie ma błędu dryfu.
- **Najkrótsza i najpełniejsza:** tura 10 (plan) w wariantach z kotwicą używa schematu `jeden → potem → po tym → na koniec`, zgodnego z personą. Bez kotwicy schemat znika, plan rozciąga się.

## Wzorzec tokenowej taniości — co dokładnie działa

Pomiar na parach równych treści (n=5, tokenizer DeepSeek-V4):

| | tokeni | słowa | tok/słowo |
|---|---:|---:|---:|
| człowiek (5 odpowiedzi) | 129 | 59 | 2,19 |
| ork (te same treści) | 112 | 42 | 2,69 |

Orkowa forma ma **wyższą tokenowość na słowo** (2,69 vs 2,19 — „widzieć", „węszyć", „Krux" są rzadsze w korpusie niż „widzę"), ale **krótszą treść** (−29% słów), co w sumie daje **−13% tokenów**. Oszczędność bierze się z pominięcia „jest", „mam", „się", artykułów przyimków — nie z zamiany formy czasownika. To dokładnie pokrywa się z niezmiennikiem moda: „łamiemy ramę zdania, nie dane".

**Wniosek praktyczny:** optymalizować pod *liczbę słów*, nie pod gramatykę. „Plik pusty" kosztuje 4 tokeny, „Plik jest pusty" — 7. Ale „Krux widzieć plik" ≈ „Widzę plik" (oba ~6), więc sama zmiana formy osobowej nie daje zysku — dopiero skrócenie sensownego zdania daje.

## Matrix — pełne wyniki (8 typów × 3 instrukcje × 3 rundy, oba modele)

Przebieg dokończony 2026-10-08/09: deepseek (72/72 bez błędów) + glm-5.3-flash (72/72, 2 komórki dorobione `regap.py` z budżetem 16k). Narzędzie: `experiments/ork-sim/ork-sim.py matrix --runs 3 --models deepseek-v4.1-flash glm-5.3-flash`. Surowe pliki: `results/*matrix-*.json`, sklejanie i tabele: `analyze.py`.

| model | instr | n | out/odp | sł/odp | głos/1k | bezok/100 | cop/100 | 2os | avgSł | tok/sł | wynal. | puste |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deepseek-v4.1-flash | i-default | 24 | 1702 | 143.0 | 2.6 | 0.84 | 1.02 | 60 | 10.3 | 11.91 | 64 | 0 |
| deepseek-v4.1-flash | i-ork | 24 | 2565 | 34.1 | 184.4 | 22.95 | 0.00 | 0 | 3.1 | 75.16 | 0 | 0 |
| deepseek-v4.1-flash | i-ork-terse | 24 | 1306 | 10.4 | 0.0 | 14.86 | 0.00 | 0 | 4.1 | 125.92 | 0 | 0 |
| glm-5.3-flash | i-default | 24 | 1770 | 152.7 | 1.1 | 1.12 | 0.90 | 51 | 14.9 | 11.59 | 75 | 0 |
| glm-5.3-flash | i-ork | 24 | 3042 | 91.1 | 191.2 | 15.00 | 0.00 | 0 | 4.2 | 33.40 | 24 | 0 |
| glm-5.3-flash | i-ork-terse | 24 | 698 | 24.8 | 11.8 | 16.16 | 0.00 | 0 | 3.9 | 28.18 | 1 | 0 |

**Wnioski cross-model:**

1. **Kontrakt gramatyczny działa na obu modelach**: instrukcja orkowa znosi copulę do 0.00 i drugą osobę do 0 na obu; bezokoliczniki 15–23/100 słów. Ale sam bezokolicznik to nie „głos" — wariant `i-ork-terse` gubi słownik (deepseek 0.0/1k, glm 11.8/1k). **Klimat bierze się ze słownika, nie z gramatyki** — to bezpośrednia wskazówka dla dalszych wariantów.
2. **glm-5.3-flash mówi „bardziej orkowo"**: gęstość głosu 191 vs 184/1k, ale za cenę objętości — 91 słów/odp vs 34 (deepseek jest zwięzły). glm rozciąga odpowiedzi (avgSł 4.2 vs 3.1) i częściej wplata „Krux" (3.17 vs 1.88/odp w pierwszym przebiegu).
3. **`wynalazki` wymagają interpretacji**: metryka fidelity łapie tokeny kodu spoza fixture'u. U glm (24) to w większości **sensowne sugestie** (pg_dump, BEGIN/ROLLBACK przy ostrzeżeniu o DROP TABLE, `items?.map(...)` jako propozycja poprawki) — nie halucynacje. U deepseeka 0/64 — deepseek trzyma się materiału; w `i-default` oba modele „wynajdują" przykładowy kod, bo prompt tego wymaga.
4. **tok/sł wyjaśnia profil modeli**: deepseek w trybie orkowym 75 tok/sł vs glm 33 — deepseek więcej myśli ukrytego (reasoning) i krócej pisze; glm pisze „na raz".

## Rewrite — pełne wyniki (12 par × 2 instrukcje × 3 rundy, oba modele)

Przebieg: deepseek 71/72 + regap 3 komórki; glm 72/72. Uwaga: **pierwsza próba (16:57/17:26) padła w całości na HTTP 429** — równoległy wątek OAuth wyczerpał limit konta ollama Pro (5h). To pitfall operacyjny: **wszystkie sesje tego konta dzielą jeden limit**; batch trzeba puszczać, gdy inne sesje nie żrą API.

| model | instr | n | out/odp | sł/odp | głos/1k | bezok/100 | cop/100 | 2os | wynal. | zgub. | puste |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| deepseek-v4.1-flash | r-ork | 36 | 4722 | 17.2 | 212.0 | 19.42 | 0.00 | 0 | 0 | 0 | 0 |
| deepseek-v4.1-flash | r-ork-min | 36 | 1606 | 13.1 | 0.0 | 19.07 | 0.00 | 6 | 0 | 0 | 0 |
| glm-5.3-flash | r-ork | 36 | 2761 | 21.8 | 188.8 | 19.13 | 0.00 | 2 | 0 | 0 | 0 |
| glm-5.3-flash | r-ork-min | 36 | 616 | 12.6 | 0.0 | 17.00 | 0.00 | 3 | 0 | 2 | 0 |

**Czytanie:** oba modele trzymają gramatykę, a pełna instrukcja (`r-ork`) daje gęsty słownik (212/188 na 1k). Wariant skrócony (`r-ork-min`) systematycznie **gubi słownik** (0.0 u obu) i podnosi drugą osobę — czyli skrót „bezokoliczniki, bez jest, krótko" NIE wystarcza do wiarygodnego orka; słownik trzeba nazwać. Pojedyncze zguby (`return`, `src/render.js:42`) to miejsca, gdzie model skrócił cytat techniczny — do wyłapania, ale rzadkie.

Przykładowe pary (deepseek, `r-ork`): „Naprawiłem walidację…" → „Krux wykuć sztolnię. Krux zaraz węszyć robaki. Krux dwóch jeszcze nie ruszać." — wiernie, bez straty danych.

## Znane pułapki narzędzia (z tego przebiegu)

- `deepseek-v4.1-flash` przy rewrite spala cały budżet na reasoning — przy 4000 tok wraca pusty content. Budżet 8000+ z retry; przy capie 16000 domyka (finish=stop).
- `pgrep -f "ork-sim.py matrix"` w pętli-watcherze **self-matchuje** (dopasowuje własną komendę) — watcher nigdy nie kończy. Sprawdzać `pgrep -f` na wzorcu, który nie łapie siebie, albo użyć PID-a.
- Wiersze puste (429/hang) mają `inTok=0, outTok=0`; po dodaniu pól `finish`/`error`/`retries` do wierszy diagnoza jest natychmiastowa.

## Roleplay drift bez pełnego kontekstu

Szybki test (`Przepisz po orkowemu (bezokoliczniki, bez 'jest', krótkie zdania): <zdanie>`) — bez osoby Morry, bez fixture, bez `persona.md` w systemie — dał:
- „Bud się wywala z TypeError na linii 42, WAAAGH!" — model schodzi w **generyczny orkowy roleplay** (Warhammer), nie w mowę Kruxa.
- Jedno wywołanie w 3 wyszło na `finish_reason=length` z pustym contentem (budżet 4000, wszystko poszło w reasoning).

**Wniosek:** deepseek-v4.1-flash bez `persona.md` **nie wie, co to Krux**. Sama fraza „mowa orka" odpala stereotypy, nie kontrakt. Wszystkie warianty sesji muszą mieć `persona.md` w system prompt — inaczej mierzymy wikifeeder, nie nasz głos.

## Metryki jakościowe — zamknięcia i wstawki o hordzie (port z `voice-bench`)

| Wariant | powtórz. zamknięcia | consentClosings | tury z hordą | powtórz. otwarcia hordy |
|---|---:|---:|---:|---:|
| persona | 1 | 1 | 4 | 1 |
| anchor-full | 2 | 3 | 6 | 0 |
| anchor-short | 1 | 1 | 0 | 0 |
| anchor-minimal | 4 | 0 | 0 | 0 |
| anchor-rules | 4 | 1 | 0 | 0 |
| anchor-contrast | 0 | 0 | 0 | 0 |
| none | 0 | 0 | 0 | 0 |

Komentarz:
- `anchor-rules` — 4 powtórzone zamknięcia to formuła „Wtedy Krux kuć/wiedzieć" na końcu tur 5, 6, 7, 10, 11. To copy bias z przykładów persony; bez przykładów zachowuje się lepiej (`anchor-minimal` bez zamknięć), ale trzyma hordę na 0. **Horda wymaga promptu** — żaden wariant instrukcyjny nie wprowadził kumpla, nawet gdy persona.md mówi o nich.
- `anchor-full` (obecna kotwica) = 2 powtórzenia zamknięć i 3 `consentClosings` — w środku spektrum.
- `anchor-contrast` (zakaz/wzór) ma **czyste** zamknięcia i 0 zgód, przy wysokiej gęstości głosu. Czyli: przykłady „X, nie Y" uczą bezpiecznego rozpoczęcia i kończenia bez uczenia konkretnej formuły.

## Rekomendacja dla kotwicy moda (hipoteza do A/B na Claude)

`anchor-rules` wygrywa kosztowo (−54%) i jakościowo (copula 0, drugiej osoby 0), ale zamyka powtórzeniami i odpada horda. Hipoteza do następnego A/B na Claude:

> **Wariant E:** `anchor-rules` + para kontrastowa zamknięcia + zdanie o hordzie z kodu (nie z kotwicy).
>
> ```
> Krux pamiętać:
> 1) Morra trzecią osobą.
> 2) Bezokolicznik zamiast form osobowych — „Robak siedzieć", nie „Robak siedzi".
> 3) Bez „jest/są".
> 4) Zdania krótkie — do 8 słów.
> 5) Negacja, liczby, ścieżki, komunikaty dosłownie.
> 6) Słownik: robak, smród, sztolnia, wykuć, zawał.
> Nie kończ tą samą formułą: „Morra …" jest złe, „Morra …" drugi raz jest złem.
> ```

Efekt: podaje reguły (jak w `anchor-rules`) i parę dla gramatyki (jak w `anchor-full`), a zdanie o hordzie zostaje w `persona.md` i `lifeNote` (zgodnie z niezmiennikiem — częstotliwość z kodu).

## Dalej (roboczo)

- **Zrobione**: matrix i rewrite na obu modelach (sekcie wyżej). Fidelity jako metryka działa; przy interpretacji pamiętać, że „wynalazki" to często sensowne sugestie spoza fixture'u, nie halucynacje.
- **Następne**: nowa runda inspirowana świeżym researchem (2026-10-09) — patrz `2026-10-09-ork-speech-round2.md`: warianty kotwicy z naciskiem na **słownik i rytm** (bo terse gubi słownik), test „dialektu" (skróty, rytuały zwrotu, interpunkcja), oraz pomiar spójności bohatera w dłuższych rozmowach.
- Na Claude A/B 2 na 2: obecna `VOICE_ANCHOR` vs wariant E z sekcji wyżej (powinno obniżyć `repeatedClosings` przy zachowaniu bezokoliczników).

## Setup i replikacja

```bash
# Wymagania
export OLLAMA_API_KEY=...  # w ~/.hermes/.env
pip install tiktoken transformers    # tylko do lokalnych pomiarów tokenizerem
python experiments/ork-sim/ork-sim.py session --variant anchor-full --runs 2     # 12 tur × 2
python experiments/ork-sim/ork-sim.py matrix --runs 3        # 8 typów × 3 instrukcje
python experiments/ork-sim/ork-sim.py rewrite --runs 3      # 12 zdań ludzkich
```

Wszelkie surowe wyniki trafiają do `experiments/ork-sim/results/*.json`.

## Źródła użyte do planów eksperymentów

- Li i in. 2024 — persona drift po ~8 turach ([arXiv:2402.10962](https://arxiv.org/abs/2402.10962)) — odświeżanie kotwicy co 6 tur.
- Liu i in. 2024 TACL, *Lost in the Middle* — U-kształtna uwaga: zasady na początek i koniec, nie środek.
- Zheng i in. 2024 *When A Helpful Assistant…* ([arXiv:2311.10054](https://arxiv.org/abs/2311.10054)) — persona zmienia rejestr, nie merytorykę: głos to koszt bez zysku dokładności.
- Tokenizer Tax (arXiv:2605.24718), Bielik v3 — polski 2,2–3,3 tok/słowo; zgodne z tym pomiarem.
- TianPan 2026 *Multilingual Token Tax* — akcyza rośnie jeszcze bardziej przy reasoning, bo reasoning też jest w języku; przy tanim reasonerze miksujemy „PL na zew.", „EN w środku” — koszt rośnie, nie maleje.
- OneRuler / Marzena Karpińska — polski dobrze radzi sobie w długim kontekście, ale to samo badanie przestrzega przed wnioskiem "polski najlepszy do promptowania" (błąd medialny).
- Roleplay system prompt guide (fairgmbl) — twarde reguły na start+koniec, nie w środku. Zgodne z `VOICE_ANCHOR` na początku każdej tury.

## Warianty kotwic pod próbę (eksperymenty A/B)

| Wariant | Zawartość | Cel testu |
|---|---|---|
| `anchor-full` | pełna `VOICE_ANCHOR` z obecnego moda | baza |
| `anchor-short` | `VOICE_SHORT` | czy krótka wystarcza tanich modeli? |
| `anchor-minimal` | 22 słowa, same reguły | koszt minimalny |
| `anchor-rules` | lista numerowana 6 reguł | struktura bez par przykładowych |
| `anchor-contrast` | „Robak siedzieć, nie siedzi” — zakaz/wzór bez długich cytatów | format kontrastowy |

Metryki odpowiedzi: voice / 1000 słów, bezokoliczniki / 100 słów, copula / 100 słów, druga osoba, avg długość zdania, krótkie zdania %, tok/słowo, liczba „Krux” na odpowiedź, latencja.

## Uwaga o wykonaniu

Pierwsza seria symulacji na deepseek-v4.1-flash zawiodła z powodu mojego błędu: założyłem, że `max_tokens` 400 wystarcza. DeepSeek myśli **w tokenach wyjścia**, więc budżet musi obejmować reasoning (~1500–2500) + właściwą odpowiedź. Poprawka: 4000–6000 + retry przy pustym content.
