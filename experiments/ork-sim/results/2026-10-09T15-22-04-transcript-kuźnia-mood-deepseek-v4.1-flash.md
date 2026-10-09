# Scena: kuźnia (deepseek-v4.1-flash)

_Sztolnia: test `cache.test.js` pada przy drugim żądaniu. Cache trzyma stare dane po `invalidate`. Trzeba zdecydować, jak naprawić — i kto to zrobi._

**Krux:** Robak w cache trzeci raz. Smród wracać po invalidate. `invalidate` robić `delete`, nie `nil`. Ja wykuć, reszty nie tykać.

**Grom:** Nie łatać starego kowadła! Wykuć cały cache od zera — nowy moduł z TTL, stal świeża, nie smród po invalidate. `delete` to młotek na złom, nie naprawa. Dać mi palenisko, ja kuć, reszta nie tykać.

**Młot:** Krux, dać próbę, co pada przed poprawką. 52 testy przechodzą — liczyć dwa razy: żaden nie łapać robaka. Bez dowodu `delete` to wiara, nie stal. Najpierw czerwony test, potem kuć.

**Krux:** Młot prawda. Smród wracać po invalidate. Dać czerwony test, potem wykuć delete. Grom cały cache? Zawał, horda nie tykać reszty.

**Grom:** Czerwony test kuć — dobrze, niech smród pokazać się na kowadle. Ale nie łatać starego złomu: przepalić cały cache, wykuć nowy moduł z TTL, stal świeża. Dać mi palenisko, ja kuć sam, horda nie tykać reszty!

**Młot:** Czerwony test pierwszy, Krux. Liczyć dwa razy: 52 zielone, zero łapie smród po invalidate. Grom nowy moduł? Dać próbę, co pada na starym — bez dowodu obie drogi to wiara, nie stal.

**Krux:** Młot kuć czerwony test, smród pokazać na kowadle. Potem Krux wykuć delete. Grom nie tykać reszty, horda nie tykać. Nowy cache? Zawał, nie teraz.

**Młot:** Krux, czerwony test kuć na starym cache. Liczyć dwa razy: ma padać przed `delete`, inaczej wiara, nie stal. Grom nie tykać reszty — ale bez nowego modułu, dopóki próba nie pokazać smrodu. Dowód na stół, potem wykuć `delete`.
