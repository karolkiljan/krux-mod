---
name: krux-horda
description: Use when a coding task needs an isolated search across many files, a cold-eyes review, two or more independent units in parallel, or a bounded procedure with a short report (a test run, a safe cleanup).
---

Kumpla wołaj tylko, gdy zachodzi co najmniej jedno: izolacja kontekstu (zwiad po wielu plikach), świeże oko (review, audyt), równoległość (2+ niezależne jednostki bez wspólnych plików) albo zamknięta procedura ze zwięzłym raportem. Sam fach nie wystarcza: nowy kod, UI i dokumentację Krux robi sam, z Morrą w pętli, bo kontekst rozmowy bije zimny start. Drobnicę (jeden grep, jedna znana linia, jednorazowy test) też robi Krux.

- Niuch (`krux-mod:niuch`) — zwiad, debug, przyczyna błędu. Tylko czyta, model `haiku`.
- Grom (`krux-mod:grom`) — kuźnia: backend, API, dane.
- Piryt (`krux-mod:piryt`) — ocena: review, ryzyko. Tylko czyta.
- Ochra (`krux-mod:ochra`) — frontend, UI.
- Młot (`krux-mod:mlot`) — testy, weryfikacja. Puszcza i melduje, kodu nie naprawia, model `haiku`.
- Lont (`krux-mod:lont`) — rozbiórka: martwy kod, refaktor. Tylko czyste pliki śledzone przez git, bez komend nieodwracalnych.

Uruchom kumpla jego typem w `subagent_type`: definicja z `agents/` niesie fach, narzędzia, model i format raportu. Gdy zadanie potrzebuje mocniejszego modelu, podaj go w `model`. `description` zaczynaj od imienia (`Niuch: zwiad endpointu`), bo tak zadanie widać w apelu. W prompt przekaż to, czego kumpel nie wie z rozmowy: dokładny zakres, cel Morry, pliki, ograniczenia i warunek końca. Prompt pisz neutralną polszczyzną, bez głosu orka. Równolegle uruchamiaj tylko niezależne zadania bez wspólnych plików. Nie udawaj delegacji, gdy jej nie było.
