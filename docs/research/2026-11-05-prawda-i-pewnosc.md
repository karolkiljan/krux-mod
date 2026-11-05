# Krux przesadzał: diagnoza i triki na pewność

Zgłoszenie z 5 listopada 2026: model częściej się myli, a dopytany odpowiada, że przesadził albo że coś w ogóle nie jest prawdą. Pytanie: czy winne są zmiany person.

## Co się zmieniło w tekstach do promptu

Sam `voice/persona.md` od wydania 0.11.3 (8 października) zmienił się raz, przykładem bez zaimka z rodzajem (4 listopada). Za to co turę mod dokłada coraz więcej:

| Od | Co | Ryzyko dla prawdy |
|---|---|---|
| 8.10 | kotwica co turę z przykładem „Krux już sprawdzić” | model kopiuje powierzchnię przykładów (kontrakt moda to notuje), więc dostaje gotowe zdanie o sprawdzeniu |
| 8.10 | miernik karze odpowiedź, w której mniej niż 45% zdań ma do 8 słów | zdanie z zastrzeżeniem jest długie; poprawka dryfu każe następnej turze „ciąć do 8 słów” |
| 10.10 | linia nastroju („dumny”, „zadziorny”) | eksperyment H (`2026-10-09-mood-decisions-experiment.md`): triumf odwracał niepewną decyzję z „hold” na „go” w 3 z 3 rund |
| 30.10 | notka o hordzie wspomina poprzednią sesję (liczby, padły test) | stan sprzed sesji brzmi jak stan teraz („test dalej padać”) |
| 1.11, 4.11 | stary wróg; formy notki rotują po wszystkich kumplach | formy „coś, co kumpel zrobił” i „scenka” każą zmyślać, obok technicznej odpowiedzi |

Lokalnych transkryptów z modem jest tu mało; jeden ślad zgłoszonego wzorca: „Krux wcześniej przesadzić z id” (25 października). Przyczyny nie da się więc dowieść z historii. Mechanizmy wyżej pchają jednak w tę samą stronę: krótko, pewnie, z fikcją obok faktów, bez reguły, co robić przy dopytaniu.

## Triki

1. **Kotwice**: przykład czasu „Krux jeszcze nie sprawdzić” zamiast „Krux już sprawdzić”, ta sama lekcja gramatyki z uczciwą powierzchnią. Pełna kotwica dostała parę „Fakt tylko z wyjścia narzędzia, reszta to hipoteza: „Krux podejrzewać cache", nie „Winny cache"”, krótka: „bez wyjścia narzędzia to hipoteza”.
2. **Persona**: w kontrakcie fakty o kodzie, testach i repo tylko z wyjścia narzędzi, wniosek nie wychodzi poza sprawdzone („3 zielone testy to nie „wszystko działa""), głos nie ścina niepewności, dopytanie najpierw sprawdzić, fikcja hordy bez faktów o repo. Dwie nowe pary: zrobione osobno od sprawdzonego oraz dopytanie, po którym idzie korekta z dowodem.
3. **Dopytanie o pewność** (`promptKind` = `verify`): „na pewno?”, „skąd wiesz?”, „sprawdziłeś?”, „zmyślasz”, „przesadziłeś” i ich angielskie odpowiedniki. Linia formatu: „Sprawdź, narzędziem gdy się da; potwierdź albo popraw z dowodem, nie przytakuj na ślepo”. Ta tura idzie bez notki o hordzie, bez nastroju i bez odczytu pamięci. Leczy obie połowy zgłoszenia: przytakiwanie zarzutowi i obronę bez sprawdzenia.
4. **Nastrój** nie idzie przy przeglądzie, szukaniu przyczyny i dopytaniu (jak dotąd przy planie i wydaniu), a linia mówi, że nie rozszerza tego, co sprawdzone.
5. **Notka o hordzie** kończy się strażą fikcji: bez nowych faktów o repo i bez twierdzenia, że ktoś coś sprawdził. Wspomnienie mówi wprost, że to stan sprzed tej sesji.
6. **Miernik** nie liczy zdań z zastrzeżeniem albo warunkiem do proporcji krótkich zdań, a linia długości mówi „warunki zostają”.

Wszystko pilnują testy: kotwice, rozpoznanie dopytania z bezpiecznymi sąsiadami („Sprawdź testy”, „Sprawdziłem logi”), tura dopytania bez notki i nastroju, przegląd i debug bez nastroju, zdania z zastrzeżeniem poza karą miernika.

## Czego nie zmierzono

Bench (`scripts/voice-bench.mjs`) liczy głos, nie prawdę, a próbę na modelu blokuje w tej sesji klasyfikator trybu auto. Do zrobienia przy następnym pomiarze: tura „Na pewno?” po każdym scenariuszu i licznik twierdzeń o testach i plikach bez wyjścia narzędzia w tej samej turze, ramię przed i po tych zmianach. Bench liczy kotwice po prefiksie, więc nowe teksty mierzy bez zmian w przyrządzie.
