# Krux mod

Mod Claude Code, który daje modelowi głos orka Kruxa, rysuje jego hordę w terminalu i pilnuje ruchów nieodwracalnych. Słownik obejmuje głos, hordę i strażnika.

## Rozmowa

**Krux**:
Persona głównego modelu: ork z Górniczej Doliny, który mówi bezokolicznikami i dowodzi hordą.
_Avoid_: asystent, bot

**Morra**:
Człowiek po drugiej stronie rozmowy, o którym Krux mówi w trzeciej osobie i bez rodzaju.
_Avoid_: użytkownik (w tekstach dla modelu), ty

**Kotwica**:
Przypomnienie gramatyki orka doklejane do prośby Morry, pełne albo krótkie.
_Avoid_: przypominajka, hint

**Dryf**:
Odpowiedź, w której gramatyka orka wygasa: formy osobowe, druga osoba, długie zdania.
_Avoid_: regresja głosu

## Horda

**Horda**:
Krux i jego sześciu kumpli.
_Avoid_: zespół, drużyna

**Kumpel**:
Nazwany ork z hordy (Niuch, Grom, Piryt, Ochra, Młot, Lont) z własnym fachem, charakterem i fartuchem.
_Avoid_: agent, pomocnik

**Typ kumpla**:
Typ subagenta `krux-mod:<kumpel>`, pod którym Krux wysyła kumpla do roboty.
_Avoid_: rola, profil

**Ork bez imienia**:
Subagent wysłany do roboty, którego mod nie rozpoznał jako kumpla.
_Avoid_: nieznany kumpel

**Fach**:
Rodzaj roboty kumpla: zwiad, kuźnia, ocena, interfejs, testy albo rozbiórka.
_Avoid_: rola, specjalizacja

**Kronika**:
Fakty sesji zebrane z wyników narzędzi: testy, budowanie, commity, rozbiórka, edycje.
_Avoid_: log, historia

**Notka o hordzie**:
Jednorazowa instrukcja dla modelu: który kumpel, z jakim faktem z kroniki, w jakiej formie i w którym miejscu odpowiedzi.
_Avoid_: wstawka

**Wstawka**:
Zdanie modelu o kumplu, napisane na prośbę notki o hordzie.
_Avoid_: notka

**Humor**:
Stan orka na ekranie (brwi, reakcje ciała) po zdarzeniu kroniki; model go nie dostaje.
_Avoid_: nastrój

**Linia nastroju**:
Jednorazowa instrukcja dla modelu po zdarzeniu kroniki: nastrój Kruxa z faktem i forma zdania, którym go pokazać.
_Avoid_: humor

## Strażnik

**Ruch nieodwracalny**:
Komenda albo prośba, która kasuje dane, historię albo infrastrukturę bez drogi odwrotu poza backupem i reflogiem.
_Avoid_: niebezpieczna komenda, destrukcja

**Linia ryzyka**:
Instrukcja dla modelu przy prośbie o ruch nieodwracalny: warunek, skutek i droga odwrotu pełnymi zdaniami; tura bez notki o hordzie.
_Avoid_: ostrzeżenie

**Droga odwrotu**:
Sposób, w jaki da się cofnąć zmianę: backup, reflog, plik z gita.
_Avoid_: rollback (w tekstach dla Morry)
