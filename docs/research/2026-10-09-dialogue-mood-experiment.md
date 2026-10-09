# Rozmowy hordy z nastrojem z kodu — czy stan "przeżywa" w dialogu wieloturzym? (2026-10-09)

Rozszerzenie osobnego zadania "symulowane rozmowy" (patrz `2026-10-09-dialogue-observations.md`):
dodaliśmy wariant `mood` — każda postać dostaje na starcie **linię nastroju wyprowadzoną z kodu**
(deterministyczna funkcja sytuacja→stan, jak w eksperymencie E z `aliveness-sim.py`) i sprawdzamy,
czy stan przecieka do wypowiedzi w rozmowie wielu orków.

## Setup

- 4 sceny (`kuźnia`, `noc`, `ocena`, `rozbiórka`) × 2 warianty (`flat` = bez linii nastroju,
  `mood` = linia stanu per postać) × 2 modele (deepseek-v4.1-flash, glm-5.3).
- 16 przebiegów, łącznie 108 tur dialogu. Linia nastroju dodawana w prompcie **każdej tury**
  (nie tylko pierwszej).
- Pomiar: **czyste markery nastroju** — słowa z linii stanu, po odjęciu słów obecnych w "wiedzy"
  postaci (inaczej mierzymy konfundent: linie nastroju celowo powtarzają fakty z wiedzy,
  np. "52 testy przechodzą").

## Wyniki liczbowe

Czyste markery nastroju w wypowiedzi (słowa/odp):

| wariant | deepseek-v4.1-flash | glm-5.3 | razem |
|---|---:|---:|---:|
| flat (baseline) | 0,37 | 0,27 | 0,33 |
| **mood** | **0,68** | **0,58** | **0,63** |

Czyli w dialogu linia nastroju **podwaja** obecność czystych markerów stanu (×2,0–2,2) — ale to
wzrost z bardzo niskiego poziomu (0,3–0,7 słowa na odpowiedź).

## Dlaczego w dialogu jest słabiej niż w izolacji (E: ×5–12)

1. **Historia rozmowy dominuje w prompcie.** W turze 5+ prompt zawiera 4–7 poprzednich kwestii —
   model bardziej naśladuje ton wymiany niż trzyma linię stanu z nagłówka.
2. **Postacie już niosą stan same z siebie.** "Wiedza" postaci + charakter (Młot sceptyczny,
   Grom zapalony, Niuch czujny) to de facto ręcznie napisane linie nastroju. Linia z kodu
   dodaje drugą warstwę tego samego — stąd przyrost mały, ale spójny.
3. **Copy-bias w dialogu.** Widać zapożyczenia między mówcami ("Dowód na stół", "miara w ręku"),
   które rozmywają indywidualny stan.

## Co widać jakościowo (transkrypty)

- **Rozbiórka/Lont (deepseek, mood)**: linia "podekscytowany — miara w ręku, lont gotowy"
  przełożyła się na *treść* wypowiedzi: "Mierzyć trzy razy... miara w ręku, trzy razy mierzyć,
  potem lont" — nastrój steruje zachowaniem (Lont mierzy), nie tylko słowem.
- **Kuźnia/Młot (deepseek, mood)**: "sceptyczny — 52 testy przechodzą, żaden nie łapie robaka"
  → "52 testy przechodzą — liczyć dwa razy: żaden nie łapać robaka... Bez dowodu `delete` to
  wiara, nie stal". Stan wzmacnia argumentację.
- **Noc (deepseek)**: w mood Krux mówi "Nie zgaduję. Pokaż ślad" (czujny), w flat — "Nie zgadywać.
  Wykuć fakt, albo smród i zawał" (agresywniej). Subtelna różnica tonalna, nie zmiana treści.

## Wnioski dla moda

1. **W dialogach wieloturzych nie warto dopychać nastroju linią z kodu** — postacie żyją już przez
   charakter + wiedzę + dynamikę wymiany. Efekt ×2 na czystych markerach nie jest wart tokenów.
2. **Nastrój z kodu jest mechanizmem do odpowiedzi SAMOTNYCH** (barks, komentarze zdarzeń, reakcje
   hordy) — tam działa silnie (E: ×5–12) i tam go używać.
3. **W dialogach ważniejsza jest różnorodność formuł** (żeby postacie nie gadały jak jeden ork) —
   copy-bias między mówcami to realne ryzyko (widać zapożyczenia). To kandydat na osobną kotwicę:
   "nie powtarzać sformułowań, które padły w tej rozmowie".
4. **Kod może sterować zachowaniem, nie tylko słowem** — linia Lonta zmieniła to, CO robi
   (mierzy trzy razy), nie tylko jak mówi. To ciekawe: stan z kodu = wektor zachowania.

## Pliki

- 16 przebiegów: `results/*dialogue-{scena}-{flat|mood}-{model}.json` + transkrypty `.md`
- Narzędzie: `experiments/ork-sim/dialogue-sim.py` (`--variant flat|mood`)
- Analiza: `python3 experiments/ork-sim/analyze.py dialogue` (sekcja "Porównanie wariantów")
