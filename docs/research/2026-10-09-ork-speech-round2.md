# Mowa orka — runda 2: research i plan (2026-10-09)

Kontynuacja `2026-10-08-ork-speech-deepseek.md`. Ta runda bierze wyniki pierwszej (matrix + rewrite na deepseek
i glm) i dokłada **świeży research** o tym, co czyni mowę postaci wiarygodną — oraz nowe warianty, które to testują.

## Co powiedział research (źródła na końcu)

### 1. Dialekt to gramatyka i słownik, nie fonetyka (iWrity, Masterclass)

Rozróżnienie kluczowe dla naszego kontraktu:

- **Akcent** = fonetyka (jak brzmią dźwięki) — w prozie prawie nie do oddania bez zapisu fonetycznego. Zapis
  fonetyczny („eye dialect") czyta się jako wyśmiewanie postaci i męczy czytelnika; „readability ceiling is real".
- **Dialekt** = gramatyka i leksyka (jakie słowa społeczność zna i jak buduje zdania). To jest to, co robimy:
  bezokoliczniki zamiast form osobowych, brak copuli, słownik kopalni.

**Wniosek dla Kruxa:** nie sylabizować ani nie dodawać „WAAAGH" w środku zdania (to akcent zapisany fonetycznie —
sygnał taniości). Klimat ma iść z **gramatyki i słownika**, brzmienie tylko jako przyprawa. To potwierdza
istniejący niezmiennik moda („łamiemy ramę zdania, nie dane") i tłumaczy, czemu `anchor-rules` działał lepiej
niż kotwice z długimi cytatami.

### 2. Tolkien: orkowie to *pidżyn* rozkładu, nie jeden język (Wikipedia, funtranslations, David Salo)

- Sauron zaprojektował Black Speech jako narzędzie jedności; **języki należą do mówiących, nie do projektanta** —
  orkowie ją połamali i wymieszali z Westronem. „Imposed-language decay".
- Orkowa mowa wg Tolkiena to: **obelgi, powtórzenia, prostackie słownictwo**, mieszanie rejestrów.
- David Salo (lingwista filmów): Black Speech to język **praktyczny, spójny, bez estetyki** — morfemy zderzają się
  bez wygładzania, stąd chropowate zbitki spółgłosek.

**Wniosek dla Kruxa:** (a) rejestr mieszany jest kanoniczny — Krux może w jednej odpowiedzi zestawić techniczny
żargon z prostym słowem kopalni, to nie błąd, to cecha; (b) powtórzenie jako figura („Robak. Robak w pętli.")
to kanon, nie defekt — warto je mierzyć jako osobną metrykę, nie mylić z copy biasem; (c) chropowatość
oszczędnie: jedna zbitka/okrzyk na odpowiedź, bo nadmiar to znowu eye dialect.

### 3. Barks — jak gry budują głos postaci (sarah-beaulieu.com, theopriestley.net, indiegamewriting.com)

„Bark" to kontekstowa jedna linia NPC (na trigger: wejście do pokoju, trafienie, śmierć). Zasady:

- **Jedna emocja + jeden fakt na linię.** Bark ma zmieścić się w jednym oddechu i jednym momencie uwagi gracza.
- **Kontekst jest triggerem, nie treścią** — bark nie tłumaczy sytuacji, tylko na nią reaguje.
- Pisze się ich **masowo i szybko**, ale z zachowaniem „każda frakcja brzmi jak ona sama".

**Wniosek dla Kruxa:** mod ma już dymki (kronika zdarzeń: smród, commit, zawał) — to dokładnie barki. Warto je
testować osobno od długich odpowiedzi: **czy jedna linia trzyma głos i niesie fakt** w 24 typowych sytuacjach
sesji? Do tego powstał tryb `barks` w `ork-sim.py`.

### 4. Spójność persony u tanich modeli (arXiv 2503.17662, OpenRouter roleplay ranking)

- PCL (Persona-Aware Contrastive Learning): spójność rośnie, gdy model **sam się odpyta o cechy roli** w kontekście
  dialogu — mechanizm działa bez etykiet. Dla nas: notka o hordzie i pytanie „co dziś kopać" pełnią rolę
  takiego self-questioning, ale tylko gdy faktycznie są w prompcie.
- Co ciekawe: w rankingu roleplay OpenRouter (real usage) **deepseek-v4.1-flash i glm-5.3-flash są w top 3**
  tygodnia — czyli nasze tanie modele to dokładnie modele, które społeczność wybiera do person.

**Wniosek:** nie trzeba droższego modelu do głosu; trzeba lepszego promptu. Priorytet: kotwica + notka + słownik.

## Nowe warianty kotwic (do A/B w tej rundzie)

Zbudowane z researchu, każdy testuje jedną hipotezę:

| wariant | hipoteza | źródło |
|---|---|---|
| `anchor-ritual` | rytuały mowy („Hrrr.", „Da.", emfaza przez powtórzenie) podnoszą wiarygodność bez kosztu czytelności | Tolkien: obelgi i powtórzenia to kanon; gry: bark = jedna emocja |
| `anchor-rhythm` | jawny nakaz rytmu („siekać zdania 3–5 słów, akapit tylko na głęboki temat") wygładza zmienność długości zdań | dialekt = gramatyka; Salo: praktyczność bez estetyki |
| `anchor-mine` | rozszerzony słownik górniczy (fedrunek, szychta, przodek, brygada) zwiększa gęstość głosu bez rozdmuchania | Gothic: Krux z Górniczej Doliny; gwara górnicza to jego naturalny rejestr |
| `anchor-combo` | rytuał + rytm + słownik razem — kandydat na następcę `VOICE_ANCHOR` | suma powyższych |

Wszystkie poniżej 1000 znaków (ograniczenie moda). Mierzone nowymi metrykami: `ritualHits`, `repetitionHits`,
`mineHits` — obok dotychczasowych (głos/1k, bezok/100, cop/100, 2os, fidelity).

## Nowy tryb: `barks`

24 sytuacje z życia sesji (testy zielone/czerwone, commit, build, rollback, drop table, deadline, rano, noc,
weekend, podziękowanie, krytyka, urlop, nowy projekt…) × 2 instrukcje (orkowa vs ludzka) × 3 rundy.
Cel: sprawdzić, czy **jedna linia** trzyma głos i niesie sens — czyli czy dymki moda mogą być krótsze i mocniejsze.

Użycie:

```bash
python experiments/ork-sim/ork-sim.py session --variant anchor-combo --runs 2 --models deepseek-v4.1-flash
python experiments/ork-sim/ork-sim.py barks --runs 3 --models deepseek-v4.1-flash glm-5.3-flash
```

## Stan poprzedniej rundy (kontekst dla tej)

- Matrix i rewrite: pełne wyniki na obu modelach (sekcje w `2026-10-08-ork-speech-deepseek.md`).
- Kluczowe ustalenie: **terse gubi słownik** (0.0/1k u obu modeli) — gramatyka bez leksyki nie daje „orka".
  Stąd warianty rundy 2 wszystkie nazywają słownik wprost.
- Pitfall operacyjny: limit konta ollama Pro jest wspólny dla wszystkich sesji; batch puszczać, gdy inne
  sesje nie żrą API (pierwsza próba rewrite padła w 100% na 429).

## Źródła

- iWrity, *Writing Dialect and Regional Speech in Fiction: A Craft Guide* — dialekt vs akcent, sufit czytelności.
- Masterclass, *How to Write Character Accents* — fonetyczny zapis rozprasza czytelnika.
- Wikipedia, *Black Speech*; funtranslations, *Orcish vs Black Speech* — orkowie jako pidżyn rozkładu;
  obelgi, powtórzenia, prostackie słownictwo jako kanon.
- theonering.net, *David Salo on Black Speech, orc dialects and the mind of Sauron* — język praktyczny,
  morfemy bez wygładzania.
- sarah-beaulieu.com, *How a character says hello: writing "barks"*; theopriestley.net, *NPC Barks*;
  indiegamewriting.com, *World Building With Barks* — jedna emocja + jeden fakt na linię.
- arXiv:2503.17662, *Enhancing Persona Consistency… Persona-Aware Contrastive Learning* — self-questioning
  o cechy roli wzmacnia spójność bez etykiet.
- OpenRouter roleplay collection (usage) — deepseek-v4.1-flash i glm-5.3-flash w top 3 roleplay tygodnia.
- Gothicpedia / Gothic 1 Remake wiki — język orków w uniwersum Gothica (kontekst Kruxa).
