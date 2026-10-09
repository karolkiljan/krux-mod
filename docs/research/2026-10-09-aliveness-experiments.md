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

| zadanie | full out | terse out | pełne fakty (braki) |
|---|---|---|---|
| bug | 5596 | 98 | 0 / 0 |
| wybór | 4129 | 519 | 0 / **1** (zgubiony "redis") |
| ryzyko | 4836 | 865 | 0 / 0 |
| plan | 6391 | 1114 | 0 / 0 |
| pochwała | 3974 | 2211 | 0 / 0 |
| pogaduszka | 3316 | 3191 | 0 / 0 |

- **Suche fakty oszczędzają 72% tokenów wyjścia** (4707 → 1333 na odpowiedź), przy zachowaniu faktów
  (jedno zgubione słowo na 6 zadań).
- **Ale terse zabija życie**: głos 54 → 2, i w "pogaduszce" pełny tryb kosztuje tyle samo (3316 vs 3191),
  bo suchy model nie wie, co powiedzieć — wypełnia pustkę.
- **Wniosek: kolor ≠ koszt, treść = koszt.** Najdroższe są zadania z dużą treścią (plan, ryzyko — 5–6k),
  nie te z dużą barwą. Oszczędność bierze się z tego, ile model ma do *powiedzenia*, nie z tego,
  jak ozdobnie. To potwierdza niezmiennik moda: optymalizować liczbę słów/treści.

## D) variety — świeżość tanim kosztem

Ten sam prompt 6× (temp 0.85): czy odpowiedzi zaczynają się tak samo? Plus wariant z dopiskiem
"nie zaczynać tak samo".

| wariant | unikalne otwarcia |
|---|---|
| plain | **4/6** |
| norepeat | **6/6** |

- Bez dopisku model **powtarza otwarcie** („Morra słuchać. Młot..." ×2, „Krux mówić Morrze:" ×2).
- **Jedno zdanie w prompcie ("nie zaczynać tak samo") daje 6/6 unikalnych otwarć** — najtańszy
  mechanizm świeżości, 0 dodatkowych tokenów (dopisujemy do istniejącej kotwicy/notki).
- Uwaga: to nie to samo co kotwica moda (ta mówi "nie kończ tą samą formułą"). Tu chodzi o *otwarcia* —
  warto rozważyć dopisanie "nie zaczynać od 'Morra…' drugi raz" do `VOICE_SHORT`/notki.

## Synteza: co ożywia personę tanio (i czego mod już używa)

1. **Stan/nastrój — jedna linia notatki** → persona mówi o sobie nastrojem, długość odpowiedzi faluje.
   Koszt: ~30 tokenów kontekstu. Mod ma zalążek (humor w `mood.ts`), ale nie przekazuje go modelowi —
   **to jest brakujący element "życia"**.
2. **Pamięć — skompresowana kronika z kodu** → recall 6/6 za 71 tokenów. Mod robi to (`lifeNote`,
   kronika). Tanio i skutecznie.
3. **Ekonomia — kolor jest darmowy, treść kosztuje**; suche fakty oszczędzają 72% wyjścia, ale
   zabijają życie. Punkt optimum: pełny głos na **krótkich** odpowiedziach (treść mała), sucho na długich.
4. **Świeżość — jedno zdanie "nie zaczynać tak samo"** → 6/6 unikalnych otwarć. Mod karze powtórki
   zamknięć; warto rozszerzyć na otwarcia.

**Propozycja eksperymentu domykającego (kolejny krok):** "stan z kroniki" — niech kod wyprowadza
nastrój (np. z ostatniego zdarzenia: smród→wściekły, zielone→triumf, długa sesja→zmęczony) i dokłada
jedną linię do notki. Zmierzyć A/B: notka bez stanu vs ze stanem — czy odpowiedzi różnią się jak
w eksperymencie A (różnią się) i czy to nie psuje konkretu (nie psuje). To byłby najtańszy sposób,
by mod "żył".
