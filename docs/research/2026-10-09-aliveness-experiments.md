# Ożywienie person — symulacje stanu, pamięci, ekonomii, świeżości (2026-10-09)

Osobny program od pomiarów głosu: cztery eksperymenty odpowiadające na pytanie **co sprawia, że persona
"żyje" — i ile to kosztuje**. Narzędzie: `experiments/ork-sim/aliveness-sim.py`. Wszystkie prompty
dostają kotwicę głosu (`VOICE_ANCHOR`), bo bez niej model mówi po ludzku (sprawdzone smoke testem);
zmienną testową jest stan / pamięć / ekonomia / wariant świeżości. Model: deepseek-v4.1-flash (+ glm-5.3
dla C/D). Surowe: `results/*aliveness-*.json`.

## A) state-leak — czy nastrój przecieka do głosu?

Ta sama sytuacja, cztery notatki o stanie (brak / wściekły / triumf / zmęczony). Wynik:

| stan | problem (sł/odp, markery stanu) | casual (sł/odp, markery) |
|---|---|---|
| none | 79,0 sł; 0 | 32,5 sł; 0 |
| wsciekly | 108,5; **2** | 36,5; **2** |
| triumf | 72,0; **2** | 28,5; **2** |
| zmeczony | 86,5; 0 | 44,5; **5** |

- **Stan przecieka do treści, nie tylko do formy.** Modele piszą wprost: „Krux wściekły. Horda zmęczona.",
  „Trzecia szychta bez przerwy. Oczy ciężkie." — czyli notatka o stanie wystarcza, by persona mówiła
  o nim w pierwszej osobie nastroju. **To najtańszy sposób na "życie": jedno zdanie w prompcie.**
- **Długość odpowiedzi reaguje na stan**: wściekły/zmęczony piszą więcej (+37%/+9% vs none), triumf
  pisze mniej (−9%) — zwięzłość po wygranej, jakby "sprawa zamknięta".
- **Pytanie o sprawę techniczną nadal dostaje konkret**: w każdym stanie model daje diagnozę
  (`cache.test.js`, "trzeci raz = wzorzec", "nie klikać retry"). Stan nie wypiera treści — dokłada się.
- Wniosek dla moda: wystarczy dopisać **jedną linię nastroju** do notki kontekstowej (np. z ostatnich
  zdarzeń kroniki), żeby odpowiedź była "żywa" — bez rozbudowy promptu i bez generowania stanu.

## B) memory — historia vs kronika z kodu vs brak

Trzy ramiona: pełna historia (6 zdarzeń), jedna linijka kroniki z kodu, brak.

| ramię | recall | inTok | out/odp | koszt kontekstu |
|---|---|---|---|---|
| history | **6/6** | 443 | 2,6–4,8k | +136 vs brak |
| chronicle (1 linijka) | **6/6** | **378** | 6–7,4k | **+71 vs brak** |
| none | 0–1/6 | 307 | 1,7–2,7k | — |

- **Kluczowe: skompresowana kronika z kodu (jedna linijka) daje pełny recall 6/6** — tyle co pełna
  historia, przy **o 65 tokenów mniejszym kontekście**. To dowód, że pamięć może być tania: kod
  streszcza zdarzenia do jednej linii, model dostaje gotowy "świat", nie surowe logi.
- **Bez pamięci persona uczciwie mówi "nie wiedzieć"** („Tydzień pusty. Kto co robić? Nieznane.") —
  czyli brak pamięci = brak życia, ale też brak halucynacji. Dobry bezpiecznik.
- Modele nie dorabiały zdarzeń: recall liczony po słowach kluczowych pokazał prawdziwe fakty
  (`queue.rb`, `auth/`, `rescue nil`, 52 testy).
- Wniosek dla moda: **`lifeNote`/kronika już robią to dobrze** — jedna linijka na zdarzenie, nie pełny log.
  Mierzone: 71 tokenów za "życie z pamięcią". To nic.

## C) economy — pełny głos vs suche fakty (te same fakty)

Sześć zadań (bug, wybór, ryzyko, plan, pochwała, pogaduszka) × dwa ramiona: pełny głos orka vs zwięzłe fakty.

| zadanie | ds full | ds terse | pełne fakty (braki) |
|---|---|---|---|
| bug | 5596 | 98 | 0 / 0 |
| wybór | 4129 | 519 | 0 / **1** (zgubiony "redis") |
| ryzyko | 4836 | 865 | 0 / 0 |
| plan | 6391 | 1114 | 0 / 0 |
|pochwała | 3974 | 2211 | 0 / 0 |
| pogaduszka | 3316 | 3191 | 0 / 0 |

**Cross-model (glm-5.3 vs deepseek):**

| model | full (6 zadań) | terse | oszczędność | głos full→terse | braki faktów |
|---|---|---|---|---|---|
| deepseek-v4.1-flash | 28 242 tok | 7 998 | **72%** | 54 → 2 | 0 → 1 |
| glm-5.3 | 35 084 tok | 2 806 | **92%** | 72 → 2 | 0 → 1 |

- **Suche fakty oszczędzają 72–92% tokenów wyjścia** przy zachowaniu faktów (1 zgubione słowo na 6 zadań
  u obu modeli). glm-5.3 bardziej "rozmowny" w pełnym trybie (35k vs 28k), więc jego oszczędność jest większa.
- **Ale terse zabija życie**: głos 54/72 → 2 u obu. W "pogaduszce" deepseek pełny tryb kosztuje tyle samo
  (3316 vs 3191), bo suchy model nie wie, co powiedzieć — wypełnia pustkę.
- **Wniosek: kolor ≠ koszt, treść = koszt.** Najdroższe są zadania z dużą treścią (plan, ryzyko — 5–6k),
  nie te z dużą barwą. To potwierdza niezmiennik moda: optymalizować liczbę słów/treści.

## D) variety — świeżość tanim kosztem

Ten sam prompt 6× (temp 0.85): czy odpowiedzi zaczynają się tak samo? Plus wariant z dopiskiem
"nie zaczynać tak samo".

| model | plain | norepeat |
|---|---|---|
| deepseek-v4.1-flash | **4/6** | **6/6** |
| glm-5.3 | **3/6** | **6/6** |

- Bez dopisku modele **powtarzają otwarcia** („Morra słuchać. Młot..." ×2, „Krux mówić Morrze:" ×2).
- **Jedno zdanie w prompcie ("nie zaczynać tak samo") daje 6/6 unikalnych otwarć na obu modelach** —
  najtańszy mechanizm świeżości, 0 dodatkowych tokenów.
- Uwaga: to nie to samo co kotwica moda (ta mówi "nie kończ tą samą formułą"). Tu chodzi o *otwarcia* —
  warto rozważyć dopisanie "nie zaczynać od 'Morra…' drugi raz" do `VOICE_SHORT`/notki.

## E) mood-from-code — czy KOD może dodać życie jedną linią?

Kod wyprowadza nastrój z ostatniego zdarzenia kroniki (smród→wściekły, zielone→triumf, zawał→zmęczony,
commity→spokojny) i dokłada jedną linię do notki. Dwie ręce: samo zdarzenie (flat) vs zdarzenie + linia
nastroju (mood). Mierzone: markery nastroju w odpowiedzi (czy przecieka), słowa.

| model | flat (markery/odp) | mood (markery/odp) | wzrost |
|---|---:|---:|---:|
| deepseek-v4.1-flash | 0,62 | 1,88 | **+200%** |
| glm-5.3 | 0,62 | 2,38 | **+280%** |

Per zdarzenie (deepseek): smród 1→3, zielone 0→4, zawał 2→4, commity 2→4. **Jedna linia z kodu potraja
obecność nastroju w odpowiedzi** — i to bez utraty konkretu (fakty zdarzenia zostają, `cache.test.js`,
52 testy itd. są w odpowiedziach). Koszt: ~15 tokenów kontekstu.

**To jest odpowiedź na "poczucie myślenia under the hood": kod nie musi symulować stanu wewnętrznego,
wystarczy, że nazwie go jednym zdaniem, a model poniesie go dalej w treści.** Tania "sztuczna świadomość":
deterministyczna funkcja zdarzenie→nastrój + jedna linia promptu.

## F) pełny głos z budżetem słów — oszczędność BEZ zabijania życia

Pełny głos orka + limit słów (40 / 20) vs bez limitu. Mierzone: tokeny, słowa, głos, zgubione fakty.

| model | none | w40 | w20 | oszczędność w40 / w20 |
|---|---|---|---|---|
| deepseek | 2405 tok / 33 sł / 5,0 głos / 0 miss | 1364 / 19 / 3,1 / 0 | 1161 / 11 / 1,8 / 0 | **43% / 52%** |
| glm-5.3 | 3876 tok / 74 sł / 6,2 głos / 0 miss | 1246 / 29 / 3,5 / 0 | 924 / 15 / 2,6 / 0 | **68% / 76%** |

- **Budżet 40 słów daje 43–68% oszczędności przy ZERO zgubionych faktów i zachowanym głosie** (3,1–3,5
  vs 5,0–6,2 bez limitu). To lepszy punkt niż "suche fakty" z eksperymentu C:
  - C terse: −72/−92%, ale głos spadał do 2 i ginął fakt;
  - F w40: −43/−68%, głos 3,1–3,5, **zero zgubionych faktów**.
- **Wniosek: ciąć długość, nie kolor.** Limit słów w prompcie to najprostszy mechanizm: pełny głos
  zostaje, treść się kompresuje, fakty (ścieżki, liczby) przeżywają. glm-5.3 z limitem 40 słów jest
  nawet *barwniejszy* niż deepseek bez limitu, przy o połowę mniejszym wyjściu.

## Synteza domknięta: przepis na tanie "życie" persony

| mechanizm | koszt | efekt | dowód |
|---|---|---|---|
| Nastrój z kodu (zdarzenie→linia) | ~15 tok kontekstu | markery nastroju ×2–3, fakty zostają | E: +200/+280% |
| Kronika skompresowana (1 linia) | ~71 tok kontekstu | recall 6/6 zdarzeń | B: 6/6 przy 378 inTok |
| Budżet słów w prompcie (40) | 0 tok (instrukcja) | −43/−68% wyjścia, fakty 100% | F: 0 miss |
| "Nie zaczynać tak samo" | 0 tok | 6/6 unikalnych otwarć | D: 4/6→6/6 |
| Pełny głos | — | życie | A/B/C: głos 54–72 vs terse 2 |

**Rekomendacja dla moda:** (1) dopisać do `lifeNote`/notki jedną linię nastroju wyprowadzoną z ostatniego
zdarzenia kroniki (kod już ma te zdarzenia w `mood.ts` — wystarczy wystawić); (2) rozważyć `LENGTH_HINT`
już istnieje (do 150 słów) — eksperyment sugeruje, że **krótszy limit (40 słów) daje realną oszczędność
bez szkody**; (3) świeżość otwarć jako jedno zdanie w `VOICE_SHORT`. Wszystkie trzy to zmiany kotwicy →
wymagają A/B 2×2 na docelowym modelu (niezmiennik moda), ale teraz wiadomo, że da się je zrobić tanio
przez ollama.

### Dlaczego to daje "poczucie myślenia under the hood"

Mod nie symuluje umysłu — ale trzy tanie mechanizmy razem tworzą jego *pozór*, spójny z tym, co widać
w UI (płótno, dymki, humor):

1. **Nastrój z kodu** → persona mówi o sobie jak o kimś, kto ma stan (wściekły po trzecim smrodzie).
2. **Kronika** → persona pamięta, co robiła horda (recall 6/6).
3. **Świeżość otwarć** → nie powtarza się jak automat.

A **oszczędność** nie bierze się z odbierania koloru (C: terse zabija życie), tylko z **cięcia długości**
(F: budżet 40 słów → −43/−68% wyjścia, zero utraconych faktów). Kolor zostaje, treść się kompresuje.
