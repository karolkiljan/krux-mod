# Symulowane rozmowy hordy — obserwacje (2026-10-09)

Osobne zadanie od pomiarów `ork-sim.py`: tym razem **prowadzimy scenę** — Krux i kumple z hordy rozmawiają
ze sobą, każdy jako osobny system prompt (persona Kruxa + fach i charakter z `hooks/roster.ts` + punkty
wiedzy per postać), a my czytamy transkrypty i wyciągamy wnioski. Narzędzie: `experiments/ork-sim/dialogue-sim.py`.
Cztery scenariusze × deepseek-v4.1-flash: `kuźnia` (Krux+Grom+Młot — jak naprawić cache), `noc` (Krux+Niuch —
raport ze zwiadu), `ocena` (Krux+Piryt+Ochra — review przed wydaniem), `rozbiórka` (Krux+Lont — wysadzić legacy).
Transkrypty: `results/*-transcript-*.md`.

## Co działa (mocne strony)

1. **Rozróżnienie głosów działa, gdy każdy ma własny słownik i fach w prompcie.** Widać to w każdej scenie:
   - Niuch (zwiad): „Ślad… `items: null`, nie pusta tablica. […] `map` na niczym — i nor się zapada." — półsłówka,
     przerywanie sobie, słownik nory i tropu. Dokładnie charakter z rosteru („węszy wszędzie i mówi półsłówkami").
   - Grom (kuźnia): „Nie łatać starej stali! Cały cache do paleniska, przepalić, wykuć od zera!" — grzmi, rozkazuje.
   - Piryt (ocena): „`rescue nil` w auth/ — pęknięcie na wskroś. […] ta rysa zatruje całą sztolnię." — zrzędzi z powodem.
   - Ochra (frontend): „Brzegi równe, barwy spójne. […] komunikat na przycisk, krzywo. Szpara." — trzyma się brzegów.
   - Lont (rozbiórka): „cztery ślady, trzy w piasku testów, jeden prawdziwy — w `orders_controller`." — mierzy trzy razy.
2. **Punkty wiedzy per postać działają.** Każda postać wnosi swój fakt do rozmowy (Niuch: `items: null` w API;
   Lont: 4 wywołania, 3 w testach; Piryt: `rescue nil`; Ochra: komunikat na przycisku). To potwierdza wzorzec
   z `lifeNote` w modzie — fakt z sesji + charakter z kodu = wiarygodna wstawka.
3. **Krux prowadzi naradę** — otwiera scenę, streszcza ustalenia („Dwa blokery. `rescue nil` w auth wykuć.
   Krzywy komunikat zasypać. Potem wypuszczać, hordo."), zamyka decyzją. Rola dowódcy wychodzi naturalnie.

## Co nie działa (słabości — materiał do wniosków)

1. **Copy-bias w dialogu jest silniejszy niż w pojedynczych odpowiedziach.** Ta sama postać w drugim wystąpieniu
   powtarza własną formułę niemal dosłownie:
   - Niuch tura 3 vs 6: „`items ?? []` — nor zasypana / Zasuszone. `items ?? []`" — ta sama formuła.
   - Młot tura 3 vs 6 (kuźnia): „Bez dowodu — nie ruszać stali." powtórzone 1:1.
   - Ochra tura 3 vs 6: „Brzegi równe, barwy spójne. Na wąskim ekranie komunikat…" — cała kwestia powtórzona.
   - Krux tura 3 vs 5 (noc): „Wywęszył norę. `items ?? []` — wykuć…" — prawie identyczna.
   **Wniosek:** model traktuje własną poprzednią kwestię jako „swój styl" i odtwarza ją zamiast kontynuować.
2. **Postacie przejmują argumenty innych.** Grom w turze 5 mówi już nie swoim głosem, tylko powtarza kwestię
   Młota („policzę dwa razy: 52 przechodzą, jeden pada") i dokleja własny wniosek („to cały moduł do paleniska").
   Podobnie Młot w turze 6 przechodzi na język Kruxa („Horda łatać…"). Granice charakterów puszczają po 3–4 turach.
3. **Dialog kręci się w miejscu.** Sceny nie posuwają fabuły do przodu — po 4 turach w kuźni wszyscy mówią to samo
   o „52 testach i dowodzie". Każda postać podsumowuje zamiast decydować. Brak mechanizmu „co dalej" —
   transkrypt to pamięć intencji, ale modele nie mają celu scenicznego poza swoim punktem wiedzy.
4. **Piryt w ocenie odwrócił sens** (tura 5): „Wykuć `rescue nil` — […] Awarię bazy ukryć, nikogo nie ostrzec" —
   to odwrotność jego własnego ustalenia (połykanie wyjątków ma być naprawione, nie wzmocnione). Model
   recytuje słowa z kwestii, gubiąc biegunowość zdania. To znany wzorzec z `gauge.ts` („gubi sens przy
   powtórce"), tu widoczny na dialogu.
5. **Tempo i koszt:** każda tura to osobne wywołanie (1,5–5k tok out na deepseeku — reasoning). Scena 8 tur =
   ~20k tok. Dialog wieloorkowy jest drogi; w modzie pojedyncze dymki z `mood.ts` (ręczne) kosztują zero.

## Wnioski dla moda i dalszej pracy

1. **Mod ma rację, że kumple mówią jedno zdanie i tylko w turze z notką.** Pełny dialog wieloorkowy na tanich
   modelach: (a) powtarza formuły po 2. wystąpieniu, (b) zlepia charaktery po 3–4 turach, (c) nie posuwa akcji
   bez sterowania z kodu. Wartość ma *jedna wstawka* — tak jak dziś w `lifeNote`.
2. **Jeśli kiedyś dialogi: sterowanie z kodu, nie z promptu.** Trzeba by: rotować punkty wiedzy (każda tura nowy
   fakt), jawnie zabronić powtarzania własnej formuły z historii, i zamykać scenę po N turach decyzją Kruxa.
   Sam prompt persony tego nie utrzyma — dowód: wszystkie 4 sceny.
3. **Per-kumpel idiolekt (słownik + fach) to realna wartość** — gdyby rozszerzać mod o wypowiedzi kumpli
   w dymkach, wzorzec jest gotowy: `trade` + `trait` z `roster.ts` + 3–4 słowa słownika w prompcie.
4. **Słownik musi być nazwany, ale nie wyliczony.** W dialogach (słownik w prozie instrukcji, nie lista)
   postacie mówiły barwnie; w barksach (lista „robak, smród, wykuć…") model cytował listę. Ta sama lekcja
   co runda 1 i barks.

## Pliki

- Narzędzie: `experiments/ork-sim/dialogue-sim.py` (sceny edytowalne w `SCENES`).
- Transkrypty: `experiments/ork-sim/results/2026-10-09T00-0*-transcript-{kuźnia,noc,ocena,rozbiórka}-deepseek-v4.1-flash.md`.
- Surowe wiersze: `results/*-dialogue-*.json` (+ partial.jsonl).

## Dalej

- Powtórzyć sceny na glm-5.3-flash (cross-model: czy glm też zlepia charaktery?).
- Scena z 2 rundami tej samej pary (test „czy druga runda łamie copy-bias, gdy podać nowy fakt").
- Ewentualny tryb `dialogue` w `analyze.py` — metryki per mówca (rozrzut głosu między postaciami = miara
  rozróżnialności charakterów).
