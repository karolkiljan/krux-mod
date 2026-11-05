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

## Wymuszenie hookiem

Prośba: odpowiedzi osadzone w faktach, bez przeprosin po „na pewno?”. Pełnej gwarancji hook nie da: mod nie wie, co jest prawdą o kodzie, którego nikt nie przeczytał. Wie jednak, co pokazały narzędzia, i to wystarcza na najczęstsze zmyślenia: stan testów i repo.

1. **Bramka faktów w `classic.Stop`** (`hooks/grounding.ts`). Silnik daje hookowi tekst ostatniej odpowiedzi (`last_assistant_message`), a mod porównuje go z tablicą Sztolni i odczytem gita. Pod lupą są zielone testy bez świeżego zielonego przebiegu (brak przebiegu, czerwony, nieświeży po edycji), liczba przeszłych inna niż w ostatnim przebiegu, wypchnięcie przy niewypchniętych commitach i czyste drzewo przy zmianach. Taka odpowiedź wraca do modelu przed końcem tury, polem `block` z powodem. Silnik robi z niego `blockingError`, jak exit 2 w hooku powłoki, więc model w tej samej turze sprawdza narzędziem albo dopisuje krótką poprawkę. Morra nie musi dopytywać. Raz na turę: drugie zatrzymanie (`stop_hook_active`) przechodzi. Zdania miękkie („powinny przejść”, „jeśli”, pytania), mieszane z porażką, cytaty i kod się nie liczą, żeby bramka nie strzelała do uczciwych zdań.
2. **Linia stanu z narzędzi** w każdej turze prośby Morry: ostatni przebieg testów (komenda, kolor, liczby, nieświeży) i repo (gałąź, zmienione, nowe, niewypchnięte commity). Model mówi z niej albo z nowego wyjścia narzędzia, nie z pamięci rozmowy.

Mod zwraca `block`, nie `decision: "block"`: w wyniku hooka moda `decision` to obiekt zgody na narzędzie, a tekst silnik odrzuca („returned a decision that is not an object”, zestaw testów silnika 2.1.295).

Granica: bramka nie sprawdzi zdań o treści kodu („funkcja zwraca null”) ani o zachowaniu programu. Na to jest tryb `audyt` (niżej) i triki z promptu.

3. **Audyt małym modelem** (`/krux audyt on`, domyślnie off). Po bramce odpowiedź, w której padają słowa o sprawdzaniu, czytaniu i wynikach, idzie do Haiku (`$.model.complete`, alias `haiku`, limit 20 s). Dostaje dowody: linię stanu i ostatnie wywołania narzędzi z wynikami, najnowsze pierwsze, razem do 8000 znaków. Zdania podane jako zobaczone, których dowody nie pokazują, wracają do modelu tym samym `block`. Zmyślony przez audytora cytat nie zatrzyma tury: zostają tylko zdania, które naprawdę stoją w odpowiedzi. Awaria albo milczenie modelu nic nie blokuje. Koszt: jedno wywołanie Haiku na odpowiedź ze słowami o sprawdzaniu. `$.model.complete` wymaga pola `model`; alias rozwiązuje silnik i sprawdza listę dozwolonych modeli organizacji, czego zestaw testów nie widzi.

## Weryfikacja przed scaleniem

Gałąź sprawdzona 5 listopada na silniku 2.1.318: `last_assistant_message` i `stop_hook_active` stoją w wejściu hooka `Stop`, `block` w wyniku hooka moda to `decision: "block"` z powodem, a `$.model.complete` bierze `model`, `system`, `maxTokens` i `timeoutMs` (typy silnika). `tsc` nie był puszczony w nocy i padał na czterech błędach typów w testach (wynik `model.complete` bez `usage`, wpis historii bez `tool_use_id`, tryby bez `audyt`); poprawione.

Próba bramki na 19 zwykłych zdaniach z rozmowy o kodzie zatrzymała turę 14 razy bez powodu, między innymi przy „Krux dodać 2 zielone przyciski”, „Pętla kończyć po 1 przejściu”, „Wersja 2 przechodzi na fetch”, „Test przechodzi przez wszystkie gałęzie”, „Do wypchnięcia: 3 commity” i „Wypchnąć teraz czy po review — Morra wybiera”. Ostatnie dwa padają właśnie wtedy, gdy commity czekają, czyli pod koniec prawie każdej roboty. Poprawki: podmiot testów tylko jako rzeczownik, „zielone” tylko na końcu członu, przejście zamiast ruchu, liczba przy rzeczowniku testu albo proporcji (goła tylko przed przestankiem w zdaniu o testach), wypchnięcie tylko jako fakt. Po nich próba na 42 zdaniach zgadza się z oczekiwaniem w każdym, a testy pilnują obu stron.

Do tego: powód i linia stanu mówią, że mod nie widział przebiegu, a nie, że testów nie było (przebieg w tle zna tylko model); blokada hooka `Stop` z ustawień Morry zostaje, a powód moda idzie za nią; pogawędka idzie bez linii stanu; audytor widzi koniec długiego wyniku, gdzie stoi podsumowanie.

## Czego nie zmierzono

Bench (`scripts/voice-bench.mjs`) liczy głos, nie prawdę, a próbę na modelu blokuje w tej sesji klasyfikator trybu auto. Do zrobienia przy następnym pomiarze: tura „Na pewno?” po każdym scenariuszu i licznik twierdzeń o testach i plikach bez wyjścia narzędzia w tej samej turze, ramię przed i po tych zmianach. Bench liczy kotwice po prefiksie, więc nowe teksty mierzy bez zmian w przyrządzie.
