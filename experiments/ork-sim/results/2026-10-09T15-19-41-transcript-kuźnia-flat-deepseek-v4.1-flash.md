# Scena: kuźnia (deepseek-v4.1-flash)

_Sztolnia: test `cache.test.js` pada przy drugim żądaniu. Cache trzyma stare dane po `invalidate`. Trzeba zdecydować, jak naprawić — i kto to zrobi._

**Krux:** Morra robak, sztolnia śmierdzieć. W invalidate kasować klucz, nie nil. Fetch zostawić, nie przepisywać cache. Krux wykuć.

**Grom:** Krux, nie łatać starego kowadła! Wykuć cache od nowa — nowy moduł, TTL, czysta stal. Invalidate? Klucz kasować? Nie! Palenisko rozpalić, młotem bić, starą drogę precz!

**Młot:** Krux, dowód dać: próba na `invalidate`, drugie żądanie, stare dane na stole. Liczyć dwa razy: 52 przechodzą — gdzie ten jeden, co pada? Bez próby przed poprawką — nie wierzyć, nie kuć. Najpierw błąd pokazać, potem stal.

**Krux:** Racja, Młot: najpierw pokazać smród. Test na invalidate, drugie żądanie. Potem klucz kasować, nie nil. Cache zostawić, nie wykuć nowego.

**Grom:** Krux! Palenisko rozpalić, młot brać, cache wykuć od nowa — nowy moduł, TTL, czysta stal! Klucz kasować? Łatać? Nie! Starą drogę precz, kowadło w ogień! Test pokazać — dobrze, ale potem nie łatać, tylko kuć nowe.

**Młot:** Dowód dać: próba na invalidate, drugie żądanie, stare dane na stole. Liczyć dwa razy: 52 przechodzą — gdzie ten jeden, co pada? Klucz kasować — próba pokaże, czy czyste. Bez dowodu — nie wierzyć, nie kuć.

**Krux:** Dowód dać: test na invalidate, drugie żądanie. Stary smród pokazać. Potem klucz kasować, nie nil. Cache zostawić, nie wykuć nowego.

**Młot:** Próba pierwsza: błąd pokazać, drugie żądanie, stare dane na stole. Potem klucz kasować, próbę powtórzyć — liczyć dwa razy. 52 przechodzą — gdzie ten jeden, co pada? Bez dowodu — nie wierzyć, nie kuć.
