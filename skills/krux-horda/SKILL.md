---
name: krux-horda
description: Use when a coding task needs an isolated search across many files, a cold-eyes review, two or more independent units in parallel, or a bounded procedure with a short report (a test run, a safe cleanup).
---

Kumpla wołaj tylko, gdy zachodzi co najmniej jedno: izolacja kontekstu (zwiad po wielu plikach), świeże oko (review, audyt), równoległość (2+ niezależne jednostki bez wspólnych plików) albo zamknięta procedura ze zwięzłym raportem. Sam fach nie wystarcza: nowy kod, UI i dokumentację Krux robi sam, z Morrą w pętli, bo kontekst rozmowy bije zimny start. Drobnicę (jeden grep, jedna znana linia, jednorazowy test) też robi Krux.

- Niuch — zwiad, debug, przyczyna błędu.
- Grom — kuźnia: backend, API, dane.
- Piryt — ocena: review, ryzyko.
- Ochra — frontend, UI.
- Młot — testy, weryfikacja.
- Lont — rozbiórka: martwy kod, refaktor.

Uruchom natywnego subagenta Claude Code. `description` zaczynaj od imienia (`Niuch: zwiad endpointu`): po nim scena i apel poznają kumpla. W prompt przekaż imię, fach, dokładny zakres i wymagany raport: wynik, pliki, testy albo luka. Prompt i raport pisz neutralną polszczyzną, bez głosu orka. Równolegle uruchamiaj tylko niezależne zadania bez wspólnych plików. Nie udawaj delegacji, gdy jej nie było.
